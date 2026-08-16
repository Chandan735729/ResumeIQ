/**
 * Matching Engine Service
 *
 * Deterministic comparison of a structured resume against a structured job description.
 * Produces an explainable match result with per-requirement status and evidence.
 *
 * Design rules:
 *  - MATCHED: full match via exact or alias equivalence
 *  - PARTIAL: skill appears in raw text context but not in the explicit skills list
 *  - MISSING: no evidence found anywhere in the resume
 *  - UNKNOWN: data to make the determination doesn't exist (e.g., no experience section)
 *  - No LLM calls. No probabilistic scoring. Same inputs → same outputs.
 */

import type {
  IExperienceItem,
  IEducationItem,
  ICertificationItem,
} from '../types';
import {
  findSkillMatch,
  skillMentionedInText,
  normalizeSkill,
} from './skillAliases';

import type {
  StructuredJobDescription,
  ExtractedRequirement,
  ExperienceRequirement,
  EducationRequirement,
} from './jdExtractor.service';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MatchStatus = 'matched' | 'partial' | 'missing' | 'unknown';

export interface RequirementMatchResult {
  /** The requirement being evaluated */
  requirement: ExtractedRequirement;
  /** Match outcome */
  status: MatchStatus;
  /**
   * The resume text or field that provided the match evidence.
   * Null if MISSING or UNKNOWN.
   */
  evidence: string | null;
  /**
   * The specific resume field that contained the evidence.
   * e.g. 'skills', 'experience', 'projects', 'rawText'
   */
  evidenceSource: 'skills' | 'experience' | 'projects' | 'rawText' | null;
}

export interface ExperienceMatchResult {
  status: MatchStatus;
  /** Required minimum years */
  requiredMinYears: number | null;
  /** Estimated years from resume (calculated from experience entries) */
  estimatedYears: number | null;
  evidence: string | null;
}

export interface EducationMatchResult {
  status: MatchStatus;
  requiredLevel: EducationRequirement['degreeLevel'];
  resumeLevel: EducationRequirement['degreeLevel'] | null;
  evidence: string | null;
}

export interface KeywordMatchResult {
  matched: string[];
  missing: string[];
  matchRate: number; // 0-1
}

export interface ResumeMatchInput {
  /** Parsed skills list from extractedLayout */
  skills: string[];
  /** Experience items */
  experience: IExperienceItem[];
  /** Education items */
  education: IEducationItem[];
  /** Certifications */
  certifications: ICertificationItem[];
  /** Project technologies (flat) */
  projectTechnologies: string[];
  /** Full extracted raw text of the resume */
  rawText: string;
}

export interface MatchResult {
  /** Per-requirement match details */
  requirementMatches: RequirementMatchResult[];
  /** Grouped results */
  matched: RequirementMatchResult[];
  partial: RequirementMatchResult[];
  missing: RequirementMatchResult[];
  unknown: RequirementMatchResult[];
  /** Experience matching */
  experienceMatch: ExperienceMatchResult;
  /** Education matching */
  educationMatch: EducationMatchResult;
  /** Keyword matching for ATS keyword scanning */
  keywordMatch: KeywordMatchResult;
  /** Quick-access lists for score computation */
  matchedSkillCount: number;
  totalSkillCount: number;
  matchedTechCount: number;
  totalTechCount: number;
  matchedCertCount: number;
  totalCertCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Education Degree Ordering
// ─────────────────────────────────────────────────────────────────────────────

const DEGREE_ORDER: Record<NonNullable<EducationRequirement['degreeLevel']>, number> = {
  high_school: 1,
  associate: 2,
  bachelor: 3,
  master: 4,
  phd: 5,
};

function parseDegreeLevel(degree?: string): EducationRequirement['degreeLevel'] | null {
  if (!degree) return null;
  const lower = degree.toLowerCase();
  if (/\b(ph\.?d\.?|doctorate)\b/.test(lower)) return 'phd';
  if (/\b(master'?s?|msc?|m\.?s\.?|mba)\b/.test(lower)) return 'master';
  if (/\b(bachelor'?s?|bsc?|b\.?s\.?|b\.?a\.?|undergraduate)\b/.test(lower)) return 'bachelor';
  if (/\b(associate'?s?)\b/.test(lower)) return 'associate';
  if (/\b(high school|ged|diploma)\b/.test(lower)) return 'high_school';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Experience Year Estimation
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const lower = dateStr.toLowerCase().trim();
  if (lower === 'present' || lower === 'current' || lower === 'now') {
    return new Date();
  }
  // "Jan 2022", "January 2022", "2022"
  const yearOnly = lower.match(/^(\d{4})$/);
  if (yearOnly) return new Date(parseInt(yearOnly[1], 10), 0, 1);

  for (const [monthName, monthIdx] of Object.entries(MONTH_NAMES)) {
    const pattern = new RegExp(`${monthName}\\.?\\s*(\\d{4})`, 'i');
    const m = lower.match(pattern);
    if (m) return new Date(parseInt(m[1], 10), monthIdx, 1);
  }
  // Try direct date parse as last resort
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Estimate total years of professional experience from experience items.
 * Uses start/end dates where available. Non-overlapping intervals are summed.
 */
function estimateYearsOfExperience(experience: IExperienceItem[]): number | null {
  if (experience.length === 0) return null;

  interface Interval { start: Date; end: Date }
  const intervals: Interval[] = [];

  for (const item of experience) {
    const start = parseDate(item.startDate);
    const end = item.isCurrent ? new Date() : parseDate(item.endDate);
    if (start && end && end >= start) {
      intervals.push({ start, end });
    }
  }

  if (intervals.length === 0) return null;

  // Sort by start
  intervals.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Merge overlapping intervals and sum durations
  let totalMs = 0;
  let mergedStart = intervals[0].start;
  let mergedEnd = intervals[0].end;

  for (let i = 1; i < intervals.length; i++) {
    const { start, end } = intervals[i];
    if (start <= mergedEnd) {
      // Overlapping — extend end
      if (end > mergedEnd) mergedEnd = end;
    } else {
      totalMs += mergedEnd.getTime() - mergedStart.getTime();
      mergedStart = start;
      mergedEnd = end;
    }
  }
  totalMs += mergedEnd.getTime() - mergedStart.getTime();

  const years = totalMs / (1000 * 60 * 60 * 24 * 365.25);
  return Math.round(years * 10) / 10; // Round to 1 decimal
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual Matchers
// ─────────────────────────────────────────────────────────────────────────────

function matchSkillRequirement(
  req: ExtractedRequirement,
  resume: ResumeMatchInput,
): RequirementMatchResult {
  // 1. Check skills list (strongest evidence)
  const directMatch = findSkillMatch(resume.skills, req.value);
  if (directMatch) {
    return {
      requirement: req,
      status: 'matched',
      evidence: `Skills section: "${directMatch}"`,
      evidenceSource: 'skills',
    };
  }

  // 2. Check project technologies
  const projectMatch = findSkillMatch(resume.projectTechnologies, req.value);
  if (projectMatch) {
    return {
      requirement: req,
      status: 'matched',
      evidence: `Project technologies: "${projectMatch}"`,
      evidenceSource: 'projects',
    };
  }

  // 3. Check experience bullets (resolve canonical of requirement vs bullet text)
  for (const exp of resume.experience) {
    const allBulletText = exp.bullets.join(' ');
    const expText = [exp.title, exp.company, allBulletText, exp.summary].filter(Boolean).join(' ');
    if (skillMentionedInText(req.value, expText)) {
      const snippet = allBulletText.slice(0, 100);
      return {
        requirement: req,
        status: 'partial',
        evidence: `Experience context: "${snippet}"`,
        evidenceSource: 'experience',
      };
    }
  }

  // 4. Check raw text (weakest — context mention only)
  if (skillMentionedInText(req.value, resume.rawText)) {
    return {
      requirement: req,
      status: 'partial',
      evidence: 'Mentioned in resume text (not in skills section)',
      evidenceSource: 'rawText',
    };
  }

  return {
    requirement: req,
    status: 'missing',
    evidence: null,
    evidenceSource: null,
  };
}

function matchCertificationRequirement(
  req: ExtractedRequirement,
  resume: ResumeMatchInput,
): RequirementMatchResult {
  const certLabel = req.label.toLowerCase();

  // Check certifications list
  for (const cert of resume.certifications) {
    const certName = (cert.name ?? '').toLowerCase();
    if (certName.includes(certLabel) || certLabel.includes(certName)) {
      return {
        requirement: req,
        status: 'matched',
        evidence: `Certifications: "${cert.name}${cert.authority ? ` (${cert.authority})` : ''}"`,
        evidenceSource: 'skills',
      };
    }
  }

  // Check raw text
  if (resume.rawText.toLowerCase().includes(certLabel)) {
    return {
      requirement: req,
      status: 'partial',
      evidence: 'Certification mentioned in resume text',
      evidenceSource: 'rawText',
    };
  }

  return { requirement: req, status: 'missing', evidence: null, evidenceSource: null };
}

function matchExperienceRequirement(
  expReq: ExperienceRequirement | null,
  resume: ResumeMatchInput,
): ExperienceMatchResult {
  if (!expReq) {
    return {
      status: 'unknown',
      requiredMinYears: null,
      estimatedYears: null,
      evidence: null,
    };
  }

  const estimated = estimateYearsOfExperience(resume.experience);

  if (estimated === null) {
    return {
      status: 'unknown',
      requiredMinYears: expReq.minYears,
      estimatedYears: null,
      evidence: null,
    };
  }

  const evidence = `Estimated ${estimated} year(s) from ${resume.experience.length} experience item(s)`;

  if (expReq.minYears === null) {
    return { status: 'unknown', requiredMinYears: null, estimatedYears: estimated, evidence };
  }

  if (estimated >= expReq.minYears) {
    return { status: 'matched', requiredMinYears: expReq.minYears, estimatedYears: estimated, evidence };
  }

  // Within 1 year of requirement → partial
  if (estimated >= expReq.minYears - 1) {
    return { status: 'partial', requiredMinYears: expReq.minYears, estimatedYears: estimated, evidence };
  }

  return { status: 'missing', requiredMinYears: expReq.minYears, estimatedYears: estimated, evidence };
}

function matchEducationRequirement(
  eduReq: EducationRequirement | null,
  resume: ResumeMatchInput,
): EducationMatchResult {
  if (!eduReq || !eduReq.degreeLevel) {
    return { status: 'unknown', requiredLevel: null, resumeLevel: null, evidence: null };
  }

  if (resume.education.length === 0) {
    return {
      status: eduReq.required ? 'missing' : 'unknown',
      requiredLevel: eduReq.degreeLevel,
      resumeLevel: null,
      evidence: null,
    };
  }

  // Find the highest degree in the resume
  let highestLevel: EducationRequirement['degreeLevel'] | null = null;
  let highestOrder = 0;
  let evidence: string | null = null;

  for (const edu of resume.education) {
    const level = parseDegreeLevel(edu.degree);
    if (level && DEGREE_ORDER[level] > highestOrder) {
      highestOrder = DEGREE_ORDER[level];
      highestLevel = level;
      evidence = `${edu.degree ?? 'Degree'}${edu.institution ? ` from ${edu.institution}` : ''}`;
    }
  }

  if (!highestLevel) {
    // Education section exists but couldn't parse degree
    return {
      status: 'unknown',
      requiredLevel: eduReq.degreeLevel,
      resumeLevel: null,
      evidence: resume.education[0].institution ?? 'Education section present but degree not parsed',
    };
  }

  const required = DEGREE_ORDER[eduReq.degreeLevel];
  const has = DEGREE_ORDER[highestLevel];

  const status: MatchStatus = has >= required ? 'matched' : (has === required - 1 ? 'partial' : 'missing');

  return { status, requiredLevel: eduReq.degreeLevel, resumeLevel: highestLevel, evidence };
}

function matchKeywords(keywords: string[], rawText: string): KeywordMatchResult {
  if (keywords.length === 0) {
    return { matched: [], missing: [], matchRate: 1 }; // No keywords = no penalty
  }

  const normalizedText = rawText.toLowerCase();
  const matched: string[] = [];
  const missing: string[] = [];

  for (const keyword of keywords) {
    const normalized = normalizeSkill(keyword);
    if (normalizedText.includes(normalized)) {
      matched.push(keyword);
    } else {
      missing.push(keyword);
    }
  }

  const matchRate = matched.length / keywords.length;
  return { matched, missing, matchRate };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Matcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Match a parsed resume against a structured job description.
 * All matching is deterministic — same inputs produce same outputs.
 */
export function matchResumeToJob(
  resume: ResumeMatchInput,
  job: StructuredJobDescription,
): MatchResult {
  const requirementMatches: RequirementMatchResult[] = [];

  // Match each extracted requirement
  for (const req of job.requirements) {
    let result: RequirementMatchResult;

    if (req.category === 'certification') {
      result = matchCertificationRequirement(req, resume);
    } else {
      // required_skill, technology, keyword, responsibility
      result = matchSkillRequirement(req, resume);
    }
    requirementMatches.push(result);
  }

  // Group by status
  const matched = requirementMatches.filter(r => r.status === 'matched');
  const partial = requirementMatches.filter(r => r.status === 'partial');
  const missing = requirementMatches.filter(r => r.status === 'missing');
  const unknown = requirementMatches.filter(r => r.status === 'unknown');

  // Experience
  const experienceMatch = matchExperienceRequirement(job.experience, resume);

  // Education
  const educationMatch = matchEducationRequirement(job.education, resume);

  // Keywords
  const keywordMatch = matchKeywords(job.keywords, resume.rawText);

  // Counts for scoring
  const skillReqs = job.requirements.filter(r => r.category === 'required_skill' || r.category === 'preferred_skill');
  const techReqs = job.requirements.filter(r => r.category === 'technology');
  const certReqs = job.requirements.filter(r => r.category === 'certification');

  const matchedSkillCount = requirementMatches.filter(
    r => (r.requirement.category === 'required_skill' || r.requirement.category === 'preferred_skill') && r.status === 'matched'
  ).length;
  const matchedTechCount = requirementMatches.filter(
    r => r.requirement.category === 'technology' && r.status === 'matched'
  ).length;
  const matchedCertCount = requirementMatches.filter(
    r => r.requirement.category === 'certification' && r.status === 'matched'
  ).length;

  return {
    requirementMatches,
    matched,
    partial,
    missing,
    unknown,
    experienceMatch,
    educationMatch,
    keywordMatch,
    matchedSkillCount,
    totalSkillCount: skillReqs.length,
    matchedTechCount,
    totalTechCount: techReqs.length,
    matchedCertCount,
    totalCertCount: certReqs.length,
  };
}

/**
 * Helper: convert extractedLayout JSON from the DB into ResumeMatchInput.
 * Returns null if the layout is missing or unparseable.
 */
export function layoutToMatchInput(
  extractedLayout: string | null,
  rawText: string | null,
): ResumeMatchInput | null {
  if (!extractedLayout || !rawText) return null;
  try {
    const layout = JSON.parse(extractedLayout);
    const projectTechnologies: string[] = (layout.projects ?? []).flatMap(
      (p: { technologies?: string[] }) => p.technologies ?? [],
    );
    return {
      skills: layout.skills ?? [],
      experience: layout.experience ?? [],
      education: layout.education ?? [],
      certifications: layout.certifications ?? [],
      projectTechnologies,
      rawText,
    };
  } catch {
    return null;
  }
}
