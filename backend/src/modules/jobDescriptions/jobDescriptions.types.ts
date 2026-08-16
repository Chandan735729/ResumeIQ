/**
 * Job Description Module Types
 */

// ─────────────────────────────────────────────────────────────────────────────
// Request DTOs
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateJobDescriptionDTO {
  jobTitle: string;
  companyName?: string;
  rawText: string;
}

export interface AnalyzeJobDescriptionDTO {
  jobDescriptionId: string;
  resumeId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Error Codes
// ─────────────────────────────────────────────────────────────────────────────

export enum JDValidationErrorCode {
  TITLE_REQUIRED = 'TITLE_REQUIRED',
  TITLE_TOO_LONG = 'TITLE_TOO_LONG',
  TEXT_REQUIRED = 'TEXT_REQUIRED',
  TEXT_TOO_SHORT = 'TEXT_TOO_SHORT',
  TEXT_TOO_LONG = 'TEXT_TOO_LONG',
  COMPANY_TOO_LONG = 'COMPANY_TOO_LONG',
  JD_NOT_FOUND = 'JD_NOT_FOUND',
  RESUME_NOT_FOUND = 'RESUME_NOT_FOUND',
  RESUME_NOT_PARSED = 'RESUME_NOT_PARSED',
  ACCESS_DENIED = 'ACCESS_DENIED',
  ANALYSIS_FAILED = 'ANALYSIS_FAILED',
}

export interface JDValidationError {
  code: JDValidationErrorCode;
  message: string;
  field?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence Shape (what's stored in DB as JSON)
// ─────────────────────────────────────────────────────────────────────────────

/** Stored in job_descriptions.extracted_structure (JSON string) */
export interface PersistedStructure {
  normalizedTitle: string;
  seniorityLevel: string | null;
  industry: string | null;
  requirements: PersistedRequirement[];
  experience: {
    minYears: number | null;
    maxYears: number | null;
    seniorityLevel: string | null;
    sourceSnippet: string;
  } | null;
  education: {
    degreeLevel: string | null;
    fieldOfStudy: string | null;
    required: boolean;
    sourceSnippet: string;
  } | null;
  responsibilities: string[];
  keywords: string[];
}

export interface PersistedRequirement {
  value: string;
  label: string;
  category: string;
  status: string;
  sourceSnippet: string;
}

/** Stored in match_results.match_data (JSON string) */
export interface PersistedMatchResult {
  requirementMatches: Array<{
    requirementValue: string;
    requirementLabel: string;
    category: string;
    status: string;
    evidence: string | null;
    evidenceSource: string | null;
  }>;
  matched: string[];
  partial: string[];
  missing: string[];
  unknown: string[];
  experienceMatch: {
    status: string;
    requiredMinYears: number | null;
    estimatedYears: number | null;
    evidence: string | null;
  };
  educationMatch: {
    status: string;
    requiredLevel: string | null;
    resumeLevel: string | null;
    evidence: string | null;
  };
  keywordMatch: {
    matched: string[];
    missing: string[];
    matchRate: number;
  };
}

/** Stored in match_results.score_data (JSON string) */
export interface PersistedScoreData {
  overallScore: number;
  skillsScore: number;
  technologyScore: number;
  keywordsScore: number;
  experienceScore: number;
  educationScore: number;
  certificationScore: number;
  responsibilityScore: number;
  interpretation: string;
  weightsUsed: Record<string, number>;
  scoringVersion: string;
  recommendations: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// API Response Types
// ─────────────────────────────────────────────────────────────────────────────

export interface JobDescriptionResponse {
  id: string;
  userId: string;
  jobTitle: string;
  companyName: string | null;
  rawText: string;
  extractedStructure: PersistedStructure | null;
  analysisStatus: 'pending' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export interface JobDescriptionListResponse {
  jobDescriptions: JobDescriptionSummary[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface JobDescriptionSummary {
  id: string;
  jobTitle: string;
  companyName: string | null;
  analysisStatus: 'pending' | 'completed' | 'failed';
  createdAt: Date;
}

export interface ATSAnalysisResponse {
  analysisId: string;
  resumeId: string;
  jobDescriptionId: string;
  overallScore: number;
  interpretation: 'strong' | 'good' | 'fair' | 'weak';
  scoreBreakdown: {
    skills: { earned: number; max: number; weight: number; explanation: string };
    technology: { earned: number; max: number; weight: number; explanation: string };
    keywords: { earned: number; max: number; weight: number; explanation: string };
    experience: { earned: number; max: number; weight: number; explanation: string };
    education: { earned: number; max: number; weight: number; explanation: string };
    certification: { earned: number; max: number; weight: number; explanation: string };
    responsibility: { earned: number; max: number; weight: number; explanation: string };
  };
  matched: MatchedRequirementDTO[];
  partial: MatchedRequirementDTO[];
  missing: MatchedRequirementDTO[];
  keywordMatch: {
    matched: string[];
    missing: string[];
    matchRate: number;
  };
  experienceMatch: {
    status: string;
    requiredMinYears: number | null;
    estimatedYears: number | null;
    evidence: string | null;
  };
  educationMatch: {
    status: string;
    requiredLevel: string | null;
    resumeLevel: string | null;
    evidence: string | null;
  };
  recommendations: string[];
  scoringVersion: string;
  analyzedAt: Date;
}

export interface MatchedRequirementDTO {
  requirement: string;
  label: string;
  category: string;
  status: string;
  evidence: string | null;
  evidenceSource: string | null;
}
