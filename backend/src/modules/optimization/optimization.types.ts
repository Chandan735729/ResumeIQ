/**
 * Optimization Module Types
 */

import type { ChangeDiffItem } from '../../services/ai/changeTracker';
import type { ScoreComparisonReport } from '../../services/ai/rescorer.service';

export type OptimizationType = 'conservative' | 'ats_focused' | 'recruiter_focused';

export interface OptimizeResumeDTO {
  resumeId: string;
  jobDescriptionId: string;
  optimizationType?: OptimizationType;
}

export enum OptimizationErrorCode {
  RESUME_REQUIRED = 'RESUME_REQUIRED',
  JD_REQUIRED = 'JD_REQUIRED',
  RESUME_NOT_FOUND = 'RESUME_NOT_FOUND',
  JD_NOT_FOUND = 'JD_NOT_FOUND',
  RESUME_NOT_PARSED = 'RESUME_NOT_PARSED',
  ACCESS_DENIED = 'ACCESS_DENIED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  INPUT_TOO_LARGE = 'INPUT_TOO_LARGE',
  AI_PROVIDER_ERROR = 'AI_PROVIDER_ERROR',
  AI_TIMEOUT = 'AI_TIMEOUT',
  AI_RATE_LIMITED = 'AI_RATE_LIMITED',
  SCHEMA_VALIDATION_FAILED = 'SCHEMA_VALIDATION_FAILED',
}

export interface OptimizationError {
  code: OptimizationErrorCode;
  message: string;
  field?: string;
}

export interface OptimizationResponseDTO {
  versionId: string;
  resumeId: string;
  jobDescriptionId: string;
  versionNumber: number;
  optimizationType: OptimizationType;
  promptVersion: string;
  model: string;
  beforeScore: number;
  afterScore: number;
  scoreDelta: number;
  isImproved: boolean;
  scoreComparison: ScoreComparisonReport;
  summarySuggestion?: string;
  changes: ChangeDiffItem[];
  totalChangesApplied: number;
  totalChangesRejected: number;
  preservedFacts: string[];
  warnings: string[];
  optimizedText: string;
  createdAt: Date;
}
