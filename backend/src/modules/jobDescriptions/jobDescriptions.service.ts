/**
 * Job Description Service
 *
 * Handles CRUD + ATS analysis for job descriptions.
 * Coordinates validation → extraction → matching → scoring → persistence.
 */

import { prisma } from '../../services/prisma.service';
import { logger } from '../../services/logger.service';
import { extractJobDescription } from '../../services/jdExtractor.service';
import { matchResumeToJob, layoutToMatchInput } from '../../services/matchingEngine.service';
import { computeATSScore, SCORING_VERSION } from '../../services/atsScorer.service';
import {
  validateCreateJobDescription,
  normalizeJDText,
} from './jobDescriptions.validation';
import type {
  CreateJobDescriptionDTO,
  JobDescriptionResponse,
  JobDescriptionListResponse,
  ATSAnalysisResponse,
  PersistedStructure,
  PersistedMatchResult,
  PersistedScoreData,
  MatchedRequirementDTO,
} from './jobDescriptions.types';
import { JDValidationErrorCode } from './jobDescriptions.types';
import type { MatchResult } from '../../services/matchingEngine.service';
import type { ATSScoreResult } from '../../services/atsScorer.service';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toResponse(jd: {
  id: string;
  userId: string;
  jobTitle: string;
  companyName: string | null;
  rawText: string;
  analysisStatus: string;
  extractedStructure: string | null;
  createdAt: Date;
  updatedAt: Date;
}): JobDescriptionResponse {
  return {
    id: jd.id,
    userId: jd.userId,
    jobTitle: jd.jobTitle,
    companyName: jd.companyName,
    rawText: jd.rawText,
    extractedStructure: jd.extractedStructure
      ? (JSON.parse(jd.extractedStructure) as PersistedStructure)
      : null,
    analysisStatus: jd.analysisStatus as JobDescriptionResponse['analysisStatus'],
    createdAt: jd.createdAt,
    updatedAt: jd.updatedAt,
  };
}

function buildMatchedDTO(matchResult: MatchResult): {
  matched: MatchedRequirementDTO[];
  partial: MatchedRequirementDTO[];
  missing: MatchedRequirementDTO[];
} {
  const toDTO = (r: MatchResult['requirementMatches'][0]): MatchedRequirementDTO => ({
    requirement: r.requirement.value,
    label: r.requirement.label,
    category: r.requirement.category,
    status: r.status,
    evidence: r.evidence,
    evidenceSource: r.evidenceSource,
  });

  return {
    matched: matchResult.matched.map(toDTO),
    partial: matchResult.partial.map(toDTO),
    missing: matchResult.missing.map(toDTO),
  };
}

function buildPersistedMatchResult(matchResult: MatchResult): PersistedMatchResult {
  return {
    requirementMatches: matchResult.requirementMatches.map((r: MatchResult['requirementMatches'][0]) => ({
      requirementValue: r.requirement.value,
      requirementLabel: r.requirement.label,
      category: r.requirement.category,
      status: r.status,
      evidence: r.evidence,
      evidenceSource: r.evidenceSource,
    })),
    matched: matchResult.matched.map((r: MatchResult['requirementMatches'][0]) => r.requirement.value),
    partial: matchResult.partial.map((r: MatchResult['requirementMatches'][0]) => r.requirement.value),
    missing: matchResult.missing.map((r: MatchResult['requirementMatches'][0]) => r.requirement.value),
    unknown: matchResult.unknown.map((r: MatchResult['requirementMatches'][0]) => r.requirement.value),
    experienceMatch: matchResult.experienceMatch,
    educationMatch: {
      status: matchResult.educationMatch.status,
      requiredLevel: matchResult.educationMatch.requiredLevel,
      resumeLevel: matchResult.educationMatch.resumeLevel,
      evidence: matchResult.educationMatch.evidence,
    },
    keywordMatch: matchResult.keywordMatch,
  };
}

function buildPersistedScoreData(score: ATSScoreResult): PersistedScoreData {
  return {
    overallScore: score.overallScore,
    skillsScore: score.components.skills.earned,
    technologyScore: score.components.technology.earned,
    keywordsScore: score.components.keywords.earned,
    experienceScore: score.components.experience.earned,
    educationScore: score.components.education.earned,
    certificationScore: score.components.certification.earned,
    responsibilityScore: score.components.responsibility.earned,
    interpretation: score.interpretation,
    weightsUsed: score.weightsUsed as unknown as Record<string, number>,
    scoringVersion: score.scoringVersion,
    recommendations: score.recommendations,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Service Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new job description and run synchronous extraction.
 */
export async function createJobDescription(
  userId: string,
  dto: CreateJobDescriptionDTO,
): Promise<JobDescriptionResponse> {
  validateCreateJobDescription(dto);

  const normalizedText = normalizeJDText(dto.rawText);

  // Extract structured requirements
  const structured = extractJobDescription(
    normalizedText,
    dto.jobTitle.trim(),
    dto.companyName?.trim() ?? null,
  );

  const persistedStructure: PersistedStructure = {
    normalizedTitle: structured.normalizedTitle,
    seniorityLevel: structured.seniorityLevel,
    industry: structured.industry,
    requirements: structured.requirements,
    experience: structured.experience
      ? {
          minYears: structured.experience.minYears,
          maxYears: structured.experience.maxYears,
          seniorityLevel: structured.experience.seniorityLevel,
          sourceSnippet: structured.experience.sourceSnippet,
        }
      : null,
    education: structured.education
      ? {
          degreeLevel: structured.education.degreeLevel,
          fieldOfStudy: structured.education.fieldOfStudy,
          required: structured.education.required,
          sourceSnippet: structured.education.sourceSnippet,
        }
      : null,
    responsibilities: structured.responsibilities,
    keywords: structured.keywords,
  };

  // Flat legacy arrays for backward compatibility
  const requiredSkills = structured.requirements
    .filter(r => r.status === 'required' && (r.category === 'required_skill' || r.category === 'technology'))
    .map(r => r.label);

  const niceToHaveSkills = structured.requirements
    .filter(r => r.status === 'preferred')
    .map(r => r.label);

  const certifications = structured.requirements
    .filter(r => r.category === 'certification')
    .map(r => r.label);

  const jd = await prisma.jobDescription.create({
    data: {
      userId,
      jobTitle: dto.jobTitle.trim(),
      companyName: dto.companyName?.trim() ?? null,
      rawText: normalizedText,
      analysisStatus: 'completed',
      extractedStructure: JSON.stringify(persistedStructure),
      requiredSkills: JSON.stringify(requiredSkills),
      niceToHaveSkills: niceToHaveSkills.length > 0 ? JSON.stringify(niceToHaveSkills) : null,
      certifications: certifications.length > 0 ? JSON.stringify(certifications) : null,
      seniorityLevel: structured.seniorityLevel,
      industry: structured.industry,
    },
  });

  logger.info(`Job description created: ${jd.id} for user ${userId}`);
  return toResponse(jd);
}

/**
 * Get a single job description by ID with ownership check.
 */
export async function getJobDescription(
  userId: string,
  jdId: string,
): Promise<JobDescriptionResponse> {
  const jd = await prisma.jobDescription.findUnique({ where: { id: jdId } });

  if (!jd) {
    throw { code: JDValidationErrorCode.JD_NOT_FOUND, message: 'Job description not found.' };
  }
  if (jd.userId !== userId) {
    throw { code: JDValidationErrorCode.ACCESS_DENIED, message: 'Access denied.' };
  }

  return toResponse(jd);
}

/**
 * List all job descriptions for a user with pagination.
 */
export async function listJobDescriptions(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<JobDescriptionListResponse> {
  const [total, items] = await Promise.all([
    prisma.jobDescription.count({ where: { userId } }),
    prisma.jobDescription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      select: {
        id: true,
        jobTitle: true,
        companyName: true,
        analysisStatus: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    jobDescriptions: items.map(item => ({
      id: item.id,
      jobTitle: item.jobTitle,
      companyName: item.companyName,
      analysisStatus: item.analysisStatus as 'pending' | 'completed' | 'failed',
      createdAt: item.createdAt,
    })),
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    },
  };
}

/**
 * Delete a job description (and cascade MatchResults).
 */
export async function deleteJobDescription(
  userId: string,
  jdId: string,
): Promise<void> {
  const jd = await prisma.jobDescription.findUnique({ where: { id: jdId } });
  if (!jd) {
    throw { code: JDValidationErrorCode.JD_NOT_FOUND, message: 'Job description not found.' };
  }
  if (jd.userId !== userId) {
    throw { code: JDValidationErrorCode.ACCESS_DENIED, message: 'Access denied.' };
  }

  await prisma.jobDescription.delete({ where: { id: jdId } });
  logger.info(`Job description deleted: ${jdId} by user ${userId}`);
}

/**
 * Run ATS analysis: match a resume against a job description.
 * Upserts a MatchResult (one per resume×JD pair).
 */
export async function analyzeJobDescription(
  userId: string,
  jdId: string,
  resumeId: string,
): Promise<ATSAnalysisResponse> {
  // Authorization: verify JD ownership
  const jd = await prisma.jobDescription.findUnique({ where: { id: jdId } });
  if (!jd) {
    throw { code: JDValidationErrorCode.JD_NOT_FOUND, message: 'Job description not found.' };
  }
  if (jd.userId !== userId) {
    throw { code: JDValidationErrorCode.ACCESS_DENIED, message: 'Access denied.' };
  }

  // Authorization: verify resume ownership
  const resume = await prisma.resume.findUnique({ where: { id: resumeId } });
  if (!resume) {
    throw { code: JDValidationErrorCode.RESUME_NOT_FOUND, message: 'Resume not found.' };
  }
  if (resume.userId !== userId) {
    throw { code: JDValidationErrorCode.ACCESS_DENIED, message: 'Access denied.' };
  }
  if (resume.parseStatus !== 'COMPLETED') {
    throw {
      code: JDValidationErrorCode.RESUME_NOT_PARSED,
      message: 'Resume has not been parsed yet or parsing failed.',
    };
  }

  // Build resume match input from stored layout
  const resumeInput = layoutToMatchInput(resume.extractedLayout, resume.extractedText);
  if (!resumeInput) {
    throw {
      code: JDValidationErrorCode.RESUME_NOT_PARSED,
      message: 'Resume parsed data is unavailable.',
    };
  }

  // Get structured JD
  let structuredJD = jd.extractedStructure
    ? JSON.parse(jd.extractedStructure)
    : null;

  if (!structuredJD) {
    // Re-extract if not already done (backward compatibility)
    structuredJD = extractJobDescription(
      jd.rawText,
      jd.jobTitle,
      jd.companyName,
    );
  }

  // Run matching engine
  const matchResult = matchResumeToJob(resumeInput, structuredJD);

  // Compute ATS score
  const scoreResult = computeATSScore(matchResult);

  // Persist (upsert)
  const persistedMatch = buildPersistedMatchResult(matchResult);
  const persistedScore = buildPersistedScoreData(scoreResult);

  const saved = await prisma.matchResult.upsert({
    where: {
      resumeId_jobDescriptionId: {
        resumeId,
        jobDescriptionId: jdId,
      },
    },
    update: {
      overallScore: scoreResult.overallScore,
      skillsScore: scoreResult.components.skills.earned,
      technologyScore: scoreResult.components.technology.earned,
      keywordsScore: scoreResult.components.keywords.earned,
      experienceScore: scoreResult.components.experience.earned,
      educationScore: scoreResult.components.education.earned,
      certificationScore: scoreResult.components.certification.earned,
      responsibilityScore: scoreResult.components.responsibility.earned,
      interpretation: scoreResult.interpretation,
      matchData: JSON.stringify(persistedMatch),
      scoreData: JSON.stringify(persistedScore),
      scoringVersion: SCORING_VERSION,
    },
    create: {
      userId,
      resumeId,
      jobDescriptionId: jdId,
      overallScore: scoreResult.overallScore,
      skillsScore: scoreResult.components.skills.earned,
      technologyScore: scoreResult.components.technology.earned,
      keywordsScore: scoreResult.components.keywords.earned,
      experienceScore: scoreResult.components.experience.earned,
      educationScore: scoreResult.components.education.earned,
      certificationScore: scoreResult.components.certification.earned,
      responsibilityScore: scoreResult.components.responsibility.earned,
      interpretation: scoreResult.interpretation,
      matchData: JSON.stringify(persistedMatch),
      scoreData: JSON.stringify(persistedScore),
      scoringVersion: SCORING_VERSION,
    },
  });

  const { matched, partial, missing } = buildMatchedDTO(matchResult);

  return {
    analysisId: saved.id,
    resumeId,
    jobDescriptionId: jdId,
    overallScore: scoreResult.overallScore,
    interpretation: scoreResult.interpretation,
    scoreBreakdown: {
      skills: {
        earned: scoreResult.components.skills.earned,
        max: scoreResult.components.skills.max,
        weight: scoreResult.components.skills.weight,
        explanation: scoreResult.components.skills.explanation,
      },
      technology: {
        earned: scoreResult.components.technology.earned,
        max: scoreResult.components.technology.max,
        weight: scoreResult.components.technology.weight,
        explanation: scoreResult.components.technology.explanation,
      },
      keywords: {
        earned: scoreResult.components.keywords.earned,
        max: scoreResult.components.keywords.max,
        weight: scoreResult.components.keywords.weight,
        explanation: scoreResult.components.keywords.explanation,
      },
      experience: {
        earned: scoreResult.components.experience.earned,
        max: scoreResult.components.experience.max,
        weight: scoreResult.components.experience.weight,
        explanation: scoreResult.components.experience.explanation,
      },
      education: {
        earned: scoreResult.components.education.earned,
        max: scoreResult.components.education.max,
        weight: scoreResult.components.education.weight,
        explanation: scoreResult.components.education.explanation,
      },
      certification: {
        earned: scoreResult.components.certification.earned,
        max: scoreResult.components.certification.max,
        weight: scoreResult.components.certification.weight,
        explanation: scoreResult.components.certification.explanation,
      },
      responsibility: {
        earned: scoreResult.components.responsibility.earned,
        max: scoreResult.components.responsibility.max,
        weight: scoreResult.components.responsibility.weight,
        explanation: scoreResult.components.responsibility.explanation,
      },
    },
    matched,
    partial,
    missing,
    keywordMatch: matchResult.keywordMatch,
    experienceMatch: matchResult.experienceMatch,
    educationMatch: {
      status: matchResult.educationMatch.status,
      requiredLevel: matchResult.educationMatch.requiredLevel,
      resumeLevel: matchResult.educationMatch.resumeLevel,
      evidence: matchResult.educationMatch.evidence,
    },
    recommendations: scoreResult.recommendations,
    scoringVersion: SCORING_VERSION,
    analyzedAt: saved.analyzedAt,
  };
}

/**
 * Get a previously computed match result without re-running analysis.
 */
export async function getMatchResult(
  userId: string,
  jdId: string,
  resumeId: string,
): Promise<ATSAnalysisResponse | null> {
  const saved = await prisma.matchResult.findUnique({
    where: {
      resumeId_jobDescriptionId: {
        resumeId,
        jobDescriptionId: jdId,
      },
    },
  });

  if (!saved) return null;
  if (saved.userId !== userId) {
    throw { code: JDValidationErrorCode.ACCESS_DENIED, message: 'Access denied.' };
  }

  const persistedMatch = JSON.parse(saved.matchData) as PersistedMatchResult;
  const persistedScore = JSON.parse(saved.scoreData) as PersistedScoreData;

  const toMatchedDTO = (status: string): MatchedRequirementDTO[] => {
    return persistedMatch.requirementMatches
      .filter(r => r.status === status)
      .map(r => ({
        requirement: r.requirementValue,
        label: r.requirementLabel,
        category: r.category,
        status: r.status,
        evidence: r.evidence,
        evidenceSource: r.evidenceSource,
      }));
  };

  return {
    analysisId: saved.id,
    resumeId,
    jobDescriptionId: jdId,
    overallScore: saved.overallScore,
    interpretation: saved.interpretation as ATSAnalysisResponse['interpretation'],
    scoreBreakdown: {
      skills: { earned: saved.skillsScore, max: 100, weight: 0.35, explanation: '' },
      technology: { earned: saved.technologyScore, max: 100, weight: 0.25, explanation: '' },
      keywords: { earned: saved.keywordsScore, max: 100, weight: 0.15, explanation: '' },
      experience: { earned: saved.experienceScore, max: 100, weight: 0.10, explanation: '' },
      education: { earned: saved.educationScore, max: 100, weight: 0.08, explanation: '' },
      certification: { earned: saved.certificationScore, max: 100, weight: 0.03, explanation: '' },
      responsibility: { earned: saved.responsibilityScore, max: 100, weight: 0.04, explanation: '' },
    },
    matched: toMatchedDTO('matched'),
    partial: toMatchedDTO('partial'),
    missing: toMatchedDTO('missing'),
    keywordMatch: persistedMatch.keywordMatch,
    experienceMatch: persistedMatch.experienceMatch,
    educationMatch: persistedMatch.educationMatch,
    recommendations: persistedScore.recommendations,
    scoringVersion: saved.scoringVersion,
    analyzedAt: saved.analyzedAt,
  };

}
