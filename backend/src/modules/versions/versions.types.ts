/**
 * Resume Versions Types & DTOs
 */

import type { ChangeDiffItem } from '../../services/ai/changeTracker';
import type { DocumentFormat } from '../../services/documents/document.interface';

export enum VersionErrorCode {
  RESUME_NOT_FOUND = 'RESUME_NOT_FOUND',
  VERSION_NOT_FOUND = 'VERSION_NOT_FOUND',
  ACCESS_DENIED = 'ACCESS_DENIED',
  INVALID_FORMAT = 'INVALID_FORMAT',
  GENERATION_FAILED = 'GENERATION_FAILED',
}

export interface VersionError {
  code: VersionErrorCode;
  message: string;
  field?: string;
}

export interface ResumeVersionSummaryDTO {
  id: string;
  resumeId: string;
  versionNumber: number;
  optimizationType: string;
  /** The original resume's deterministic ATS score, captured at optimization time. Null for versions created before this field existed. */
  beforeScore: number | null;
  overallScore: number;
  atsScore: number;
  matchScore: number;
  recruiterScore: number;
  pdfAvailable: boolean;
  docxAvailable: boolean;
  createdAt: Date;
}

export interface ResumeVersionDetailDTO extends ResumeVersionSummaryDTO {
  optimizedText: string;
  aiChanges: ChangeDiffItem[];
  pdfFileKey?: string | null;
  docxFileKey?: string | null;
  validationErrors?: string | null;
  metrics?: {
    originalKeywordCount: number;
    optimizedKeywordCount: number;
    addedKeywords: string[];
    removedKeywords: string[];
    avgReadabilityScore: number;
    sentenceVariety: number;
    atsCompatibilityScore: number;
  } | null;
}

export interface VersionComparisonDTO {
  versionId: string;
  resumeId: string;
  versionNumber: number;
  originalText: string;
  optimizedText: string;
  beforeScore: number;
  afterScore: number;
  scoreDelta: number;
  isImproved: boolean;
  changes: ChangeDiffItem[];
  addedKeywords: string[];
  preservedFacts: string[];
  createdAt: Date;
}

export interface VersionDownloadResult {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  format: DocumentFormat;
  fileSizeBytes: number;
}
