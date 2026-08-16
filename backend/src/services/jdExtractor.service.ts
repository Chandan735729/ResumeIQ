/**
 * Job Description Extractor Service
 *
 * Deterministic extraction of structured requirements from raw job description text.
 * NO LLM. NO AI. All extraction is pattern-based and dictionary-driven.
 *
 * Design Principles:
 *  - Prefer precision over recall. Never fabricate requirements.
 *  - If evidence is ambiguous, return UNKNOWN rather than a guess.
 *  - Every extracted requirement is traceable to a source text span.
 *  - Extraction is idempotent: same input always produces same output.
 */

import { resolveCanonical, SKILL_ALIAS_MAP } from './skillAliases';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RequirementCategory =
  | 'required_skill'
  | 'preferred_skill'
  | 'technology'
  | 'experience'
  | 'education'
  | 'certification'
  | 'responsibility'
  | 'keyword';

export type RequirementStatus = 'required' | 'preferred' | 'unknown';

export interface ExtractedRequirement {
  /** The canonical/normalized form of the requirement */
  value: string;
  /** Display label (original casing preserved where possible) */
  label: string;
  /** Category classification */
  category: RequirementCategory;
  /** Whether this was in a required or preferred context */
  status: RequirementStatus;
  /** The sentence or phrase where this was found */
  sourceSnippet: string;
}

export interface ExperienceRequirement {
  /** Minimum years requested (null if not determinable) */
  minYears: number | null;
  /** Maximum years requested (null if not specified) */
  maxYears: number | null;
  /** Raw text snippet where this was detected */
  sourceSnippet: string;
  /** Seniority level inferred from title/text */
  seniorityLevel: 'entry' | 'mid' | 'senior' | 'lead' | 'executive' | null;
}

export interface EducationRequirement {
  degreeLevel: 'high_school' | 'associate' | 'bachelor' | 'master' | 'phd' | null;
  fieldOfStudy: string | null;
  required: boolean;
  sourceSnippet: string;
}

export interface StructuredJobDescription {
  /** Normalized job title */
  normalizedTitle: string;
  /** Detected company name (from input, not extracted from JD body) */
  companyName: string | null;
  /** Seniority level inferred from title and body */
  seniorityLevel: 'entry' | 'mid' | 'senior' | 'lead' | 'executive' | null;
  /** Detected industry (if determinable) */
  industry: string | null;
  /** All extracted requirements */
  requirements: ExtractedRequirement[];
  /** Experience requirements */
  experience: ExperienceRequirement | null;
  /** Education requirements */
  education: EducationRequirement | null;
  /** Responsibilities extracted from the JD */
  responsibilities: string[];
  /** High-frequency keywords for ATS keyword matching */
  keywords: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Words that signal "required" context in surrounding text */
const REQUIRED_SIGNALS = [
  'required', 'must have', 'must-have', 'essential', 'necessary',
  'mandatory', 'require', 'need', 'needs', 'expected', 'minimum',
];

/** Words that signal "preferred" / optional context */
const PREFERRED_SIGNALS = [
  'preferred', 'nice to have', 'nice-to-have', 'bonus', 'plus',
  'advantageous', 'ideal', 'optional', 'desired', 'ideally', 'an advantage',
  'would be a plus', 'familiarity with',
];

/** Known certification names (lowercase for matching) */
const KNOWN_CERTIFICATIONS = [
  'aws certified', 'aws certifications', 'aws certification', 'aws solutions architect', 'aws developer', 'aws sysops',
  'google cloud certified', 'gcp certified', 'gcp certification', 'azure certified', 'azure certification', 'microsoft certified',
  'pmp', 'project management professional',
  'cpa', 'cfa', 'cissp', 'cism', 'ceh',
  'kubernetes administrator', 'cka', 'ckad',
  'comptia security+', 'comptia network+',
  'certified scrum master', 'csm',
  'safe agilist', 'safe certified',
  'oracle certified', 'ocp', 'ocjp',
  'rhcsa', 'rhce', 'red hat certified',
];

/** Seniority level keywords */
const SENIORITY_MAP: Array<[RegExp, 'entry' | 'mid' | 'senior' | 'lead' | 'executive']> = [
  [/\b(entry[\s-]?level|junior|jr\.?|graduate|associate|intern)\b/i, 'entry'],
  [/\b(mid[\s-]?level|intermediate|ii|2)\b/i, 'mid'],
  [/\b(senior|sr\.?|iii|3)\b/i, 'senior'],
  [/\b(lead|staff|principal|tech lead|team lead)\b/i, 'lead'],
  [/\b(director|vp|vice president|chief|cto|ceo|c[\s-]?suite|executive)\b/i, 'executive'],
];

/** Education degree patterns */
const DEGREE_PATTERNS: Array<[RegExp, EducationRequirement['degreeLevel']]> = [
  [/\b(ph\.?d\.?|doctorate|doctoral)\b/i, 'phd'],
  [/\b(master'?s?|msc?|m\.?s\.?|m\.?eng?\.?|mba|m\.?b\.?a\.?)\b/i, 'master'],
  [/\b(bachelor'?s?|bsc?|b\.?s\.?|b\.?e\.?|b\.?eng?\.?|b\.?a\.?|undergraduate|four[\s-]?year degree)\b/i, 'bachelor'],
  [/\b(associate'?s?|a\.?s\.?|a\.?a\.?|two[\s-]?year degree|community college)\b/i, 'associate'],
  [/\b(high school|ged|secondary school|diploma)\b/i, 'high_school'],
];

/** Field of study patterns */
const FIELD_OF_STUDY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(computer science|cs|compsci)\b/i, 'Computer Science'],
  [/\b(software engineering|software development)\b/i, 'Software Engineering'],
  [/\b(information technology|information systems|it)\b/i, 'Information Technology'],
  [/\b(electrical engineering|ee)\b/i, 'Electrical Engineering'],
  [/\b(mathematics?|math|maths)\b/i, 'Mathematics'],
  [/\b(data science)\b/i, 'Data Science'],
  [/\b(machine learning|ml engineering)\b/i, 'Machine Learning'],
  [/\b(physics)\b/i, 'Physics'],
  [/\b(statistics?)\b/i, 'Statistics'],
  [/\b(business administration|business)\b/i, 'Business Administration'],
  [/\b(finance)\b/i, 'Finance'],
  [/\b(related field)\b/i, 'Related Field'],
];

/** Industry keyword patterns */
const INDUSTRY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(fintech|financial technology|banking|finance|payments)\b/i, 'FinTech'],
  [/\b(healthcare|medtech|health tech|medical|pharma)\b/i, 'Healthcare'],
  [/\b(e[\s-]?commerce|retail|marketplace)\b/i, 'E-Commerce'],
  [/\b(saas|software as a service|cloud software)\b/i, 'SaaS'],
  [/\b(cybersecurity|security|infosec)\b/i, 'Cybersecurity'],
  [/\b(data analytics|analytics|big data)\b/i, 'Data & Analytics'],
  [/\b(gaming|game development)\b/i, 'Gaming'],
  [/\b(logistics|supply chain)\b/i, 'Logistics'],
  [/\b(education|edtech|e-learning)\b/i, 'EdTech'],
  [/\b(real estate|proptech)\b/i, 'Real Estate'],
  [/\b(telecom|telecommunications)\b/i, 'Telecom'],
];

// ─────────────────────────────────────────────────────────────────────────────
// Text Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Split raw JD text into cleaned lines */
function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Check if a line is likely a bullet list item */
function isBulletLine(line: string): boolean {
  return /^[\u2022\u2023\u25E6\u2043\u2219\-*+•►▸▶●○]\s/.test(line) ||
         /^\d+[.)]\s/.test(line);
}

/** Remove bullet prefix from a line */
function stripBullet(line: string): string {
  return line.replace(/^[\u2022\u2023\u25E6\u2043\u2219\-*+•►▸▶●○]\s+/, '')
             .replace(/^\d+[.)]\s+/, '')
             .trim();
}


/** Determine if surrounding context signals "required" or "preferred" */
function detectRequirementStatus(context: string): RequirementStatus {
  const lower = context.toLowerCase();
  if (PREFERRED_SIGNALS.some(s => lower.includes(s))) return 'preferred';
  if (REQUIRED_SIGNALS.some(s => lower.includes(s))) return 'required';
  return 'required'; // default assumption for unqualified requirements
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a flat set of all known skill tokens for matching.
 * We match against all aliases (not just canonicals) since JDs use varied forms.
 */
const ALL_SKILL_TOKENS = new Set<string>();
for (const aliases of Object.values(SKILL_ALIAS_MAP)) {
  for (const alias of aliases) {
    ALL_SKILL_TOKENS.add(alias.toLowerCase());
  }
}

/**
 * Extract skills/technologies from a line of text.
 * Returns pairs of [matched_label, canonical_key].
 */
function extractSkillsFromLine(line: string): Array<{ label: string; canonical: string }> {
  const lower = line.toLowerCase();
  const found = new Map<string, string>(); // canonical → original label

  // Multi-word skills must be checked first (longest match first)
  const sortedTokens = Array.from(ALL_SKILL_TOKENS).sort((a, b) => b.length - a.length);

  for (const token of sortedTokens) {
    if (token.length < 2) continue;
    // Word-boundary check
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[\\s,;:(\\[{/"'])${escaped}(?:$|[\\s,;:)\\]}\\/."'!?])`, 'i');
    if (regex.test(lower) && !found.has(resolveCanonical(token))) {
      const canonical = resolveCanonical(token);
      // Find the original casing in the line
      const caseRegex = new RegExp(escaped, 'i');
      const match = line.match(caseRegex);
      found.set(canonical, match ? match[0] : token);
    }
  }

  return Array.from(found.entries()).map(([canonical, label]) => ({ label, canonical }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Detection
// ─────────────────────────────────────────────────────────────────────────────

type JDSectionType =
  | 'requirements'
  | 'preferred'
  | 'responsibilities'
  | 'qualifications'
  | 'about'
  | 'benefits'
  | 'unknown';

const SECTION_HEADERS: Array<[RegExp, JDSectionType]> = [
  [/^(?:requirements?|required qualifications?|minimum qualifications?|required skills?|what you(?:'ll| will) need|must have|what we(?:'re| are) looking for):?$/i, 'requirements'],
  [/^(?:preferred qualifications?|nice to have|preferred skills?|desired qualifications?|bonus|what(?:'s| is) a plus|preferred experience):?$/i, 'preferred'],
  [/^(?:responsibilities?|what you(?:'ll| will) do|duties|day[\s-]to[\s-]day|key responsibilities):?$/i, 'responsibilities'],
  [/^(?:qualifications?|technical skills?|technology stack|tech stack|tools?):?$/i, 'qualifications'],
  [/^(?:about us|about the company|about the role|who we are|the company|company overview):?$/i, 'about'],
  [/^(?:benefits?|perks?|what we offer|compensation|salary):?$/i, 'benefits'],
];

function detectSectionType(line: string): JDSectionType | null {
  if (isBulletLine(line)) return null;
  const clean = line.trim().replace(/:$/, '').trim();
  if (clean.length > 80 || clean.endsWith('.')) return null;
  for (const [pattern, type] of SECTION_HEADERS) {
    if (pattern.test(clean) || pattern.test(line.trim())) return type;
  }
  return null;
}

interface JDSection {
  type: JDSectionType;
  lines: string[];
}

function segmentIntoSections(lines: string[]): JDSection[] {
  const sections: JDSection[] = [];
  let currentType: JDSectionType = 'unknown';
  let currentLines: string[] = [];

  for (const line of lines) {
    const detected = detectSectionType(line);
    if (detected !== null) {
      if (currentLines.length > 0) {
        sections.push({ type: currentType, lines: currentLines });
      }
      currentType = detected;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    sections.push({ type: currentType, lines: currentLines });
  }
  return sections;
}

// ─────────────────────────────────────────────────────────────────────────────
// Experience Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractExperienceRequirement(text: string): ExperienceRequirement | null {
  const patterns = [
    /(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:[a-zA-Z\s]{0,40})?\s*experience/i,
    /(\d+)\s*[-–to]+\s*(\d+)\s*(?:years?|yrs?)\s*(?:of\s+)?(?:[a-zA-Z\s]{0,40})?\s*experience/i,
    /(?:at\s+least|minimum|min\.?)\s*(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:[a-zA-Z\s]{0,40})?\s*experience/i,
    /experience\s*(?:of\s+)?(?:at\s+least\s+)?(\d+)\+?\s*(?:years?|yrs?)/i,
    /\((\d+)\+?\s*(?:years?|yrs?)\)/i,
    /(\d+)\+\s*(?:years?|yrs?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const minYears = parseInt(match[1], 10);
      const maxYears = match[2] && !isNaN(parseInt(match[2], 10)) ? parseInt(match[2], 10) : null;
      return {
        minYears,
        maxYears,
        sourceSnippet: match[0].trim(),
        seniorityLevel: null, // Will be filled from title
      };
    }
  }
  return null;
}


// ─────────────────────────────────────────────────────────────────────────────
// Education Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractEducationRequirement(lines: string[]): EducationRequirement | null {
  const text = lines.join(' ');

  for (const [pattern, level] of DEGREE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      let fieldOfStudy: string | null = null;
      for (const [fieldPattern, field] of FIELD_OF_STUDY_PATTERNS) {
        if (fieldPattern.test(text)) {
          fieldOfStudy = field;
          break;
        }
      }

      const required = !PREFERRED_SIGNALS.some(s => text.toLowerCase().includes(s));
      return {
        degreeLevel: level,
        fieldOfStudy,
        required,
        sourceSnippet: match[0].trim(),
      };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Certification Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractCertificationsFromLine(line: string): string[] {
  const lower = line.toLowerCase();
  const found: string[] = [];
  for (const cert of KNOWN_CERTIFICATIONS) {
    if (lower.includes(cert)) {
      found.push(cert);
    }
  }
  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyword Extraction
// ─────────────────────────────────────────────────────────────────────────────

/** Extract high-value keywords for ATS keyword matching */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'can', 'our', 'we', 'you', 'your', 'their', 'this', 'that', 'these',
    'those', 'it', 'its', 'as', 'if', 'not', 'what', 'which', 'who', 'when',
    'where', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
    'other', 'some', 'such', 'than', 'too', 'very', 'just', 'because',
    'while', 'work', 'team', 'role', 'position', 'join', 'company', 'looking',
    'seek', 'need', 'help', 'new', 'use', 'including', 'within', 'across',
    'ensure', 'support', 'provide', 'create', 'build', 'develop', 'able',
    'strong', 'good', 'great', 'excellent', 'passion', 'experience',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-+#.]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Count frequency
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  // Return top keywords (frequency >= 2, or known technical terms)
  return Array.from(freq.entries())
    .filter(([word, count]) => count >= 2 || ALL_SKILL_TOKENS.has(word))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 30)
    .map(([word]) => word);
}

// ─────────────────────────────────────────────────────────────────────────────
// Title Normalization
// ─────────────────────────────────────────────────────────────────────────────

function normalizeTitleAndSeniority(
  rawTitle: string,
  bodyText: string,
): { normalizedTitle: string; seniorityLevel: StructuredJobDescription['seniorityLevel'] } {
  let seniorityLevel: StructuredJobDescription['seniorityLevel'] = null;
  const combined = `${rawTitle} ${bodyText.slice(0, 500)}`;

  for (const [pattern, level] of SENIORITY_MAP) {
    if (pattern.test(combined)) {
      seniorityLevel = level;
      break;
    }
  }

  const normalizedTitle = rawTitle
    .replace(/\s+/g, ' ')
    .trim();

  return { normalizedTitle, seniorityLevel };
}

// ─────────────────────────────────────────────────────────────────────────────
// Industry Detection
// ─────────────────────────────────────────────────────────────────────────────

function detectIndustry(text: string): string | null {
  for (const [pattern, industry] of INDUSTRY_PATTERNS) {
    if (pattern.test(text)) return industry;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Responsibility Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractResponsibilities(sections: JDSection[]): string[] {
  const respSections = sections.filter(s => s.type === 'responsibilities');
  const results: string[] = [];

  for (const section of respSections) {
    for (const line of section.lines) {
      const clean = isBulletLine(line) ? stripBullet(line) : line;
      if (clean.length > 15 && clean.length < 300) {
        results.push(clean);
      }
    }
  }
  return results.slice(0, 20); // Cap at 20 responsibilities
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Extractor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract a StructuredJobDescription from a raw job description string.
 * All extraction is deterministic and pattern-based.
 */
export function extractJobDescription(
  rawText: string,
  jobTitle: string,
  companyName: string | null = null,
): StructuredJobDescription {
  const lines = splitLines(rawText);
  const sections = segmentIntoSections(lines);
  const fullText = lines.join(' ');

  // ── Title & Seniority ────────────────────────────────────────────────────
  const { normalizedTitle, seniorityLevel } = normalizeTitleAndSeniority(jobTitle, fullText);

  // ── Industry ─────────────────────────────────────────────────────────────
  const industry = detectIndustry(fullText);

  // ── Experience ───────────────────────────────────────────────────────────
  const experience = extractExperienceRequirement(fullText);
  if (experience) {
    experience.seniorityLevel = seniorityLevel;
  }

  // ── Education ────────────────────────────────────────────────────────────
  const education = extractEducationRequirement(lines);

  // ── Responsibilities ──────────────────────────────────────────────────────
  const responsibilities = extractResponsibilities(sections);

  // ── Skill & Tech Requirements ─────────────────────────────────────────────
  const requirements: ExtractedRequirement[] = [];
  const seenCanonicals = new Set<string>();

  // Process each section
  for (const section of sections) {
    if (section.type === 'about' || section.type === 'benefits') continue;

    const status: RequirementStatus = section.type === 'preferred' ? 'preferred' : 'required';
    const contextText = section.lines.join(' ');

    for (const line of section.lines) {
      // Check for certification first
      const certs = extractCertificationsFromLine(line);
      for (const cert of certs) {
        const certCanonical = `cert:${cert}`;
        if (!seenCanonicals.has(certCanonical)) {
          seenCanonicals.add(certCanonical);
          const lineStatus = detectRequirementStatus(line + ' ' + contextText);
          requirements.push({
            value: certCanonical,
            label: cert,
            category: 'certification',
            status: lineStatus,
            sourceSnippet: line.slice(0, 120),
          });
        }
      }

      // Extract skills/technologies
      const skills = extractSkillsFromLine(line);
      for (const { label, canonical } of skills) {
        if (!seenCanonicals.has(canonical)) {
          seenCanonicals.add(canonical);
          const lineStatus = section.type !== 'unknown'
            ? status
            : detectRequirementStatus(line + ' ' + contextText);

          requirements.push({
            value: canonical,
            label,
            category: isLikelyTechnology(canonical) ? 'technology' : 'required_skill',
            status: lineStatus,
            sourceSnippet: line.slice(0, 120),
          });
        }
      }
    }
  }

  // Also scan the full text for skills not caught in sectioned context
  // (for JDs with no clear sections)
  if (requirements.length < 3) {
    const globalSkills = extractSkillsFromLine(fullText);
    for (const { label, canonical } of globalSkills) {
      if (!seenCanonicals.has(canonical)) {
        seenCanonicals.add(canonical);
        requirements.push({
          value: canonical,
          label,
          category: isLikelyTechnology(canonical) ? 'technology' : 'required_skill',
          status: 'required',
          sourceSnippet: fullText.slice(0, 120),
        });
      }
    }
  }

  // ── Keywords ─────────────────────────────────────────────────────────────
  const keywords = extractKeywords(fullText);

  return {
    normalizedTitle,
    companyName,
    seniorityLevel,
    industry,
    requirements,
    experience,
    education,
    responsibilities,
    keywords,
  };
}

/** Heuristic: is this canonical likely a technology rather than a soft skill? */
function isLikelyTechnology(canonical: string): boolean {
  const techCanonicals = new Set([
    'javascript', 'typescript', 'python', 'java', 'golang', 'rust', 'csharp', 'cplusplus',
    'ruby', 'php', 'swift', 'kotlin', 'scala', 'sql', 'shell',
    'react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt', 'gatsby', 'redux',
    'nodejs', 'express', 'fastapi', 'django', 'flask', 'spring', 'laravel', 'nestjs',
    'aws', 'gcp', 'azure', 'digitalocean', 'heroku', 'vercel',
    'aws lambda', 's3', 'ec2', 'rds', 'dynamodb',
    'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'cassandra',
    'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'github actions',
    'cicd', 'rest api', 'graphql', 'grpc', 'websocket',
    'tensorflow', 'pytorch', 'pandas', 'numpy', 'spark', 'hadoop',
    'git', 'github', 'gitlab', 'bitbucket',
    'jest', 'mocha', 'pytest', 'cypress', 'playwright',
    'linux', 'nginx', 'helm',
  ]);
  return techCanonicals.has(canonical);
}
