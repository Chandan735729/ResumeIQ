/**
 * Upload Module Types and Interfaces
 */

import { Request } from 'express'

// ============================================
// File Upload DTOs
// ============================================

export interface UploadResumeDTO {
  fileName: string
  fileSize: number
  fileType: 'pdf' | 'docx'
  mimeType: string
  buffer: Buffer
}

// ============================================
// API Response Types
// ============================================

export interface UploadResponse {
  resumeId: string
  fileName: string
  fileSize: number
  fileType: 'pdf' | 'docx'
  uploadedAt: Date
  quotaRemaining: number
  quotaReset: Date
  parseStatus: 'pending' | 'in_progress' | 'completed' | 'failed'
  parseProgress: number
}

export interface UploadStatusResponse {
  resumeId: string
  uploadStatus: 'completed' | 'failed'
  uploadProgress: number
  uploadedAt: Date
  parseStatus: 'pending' | 'in_progress' | 'completed' | 'failed'
  parseProgress: number
  parseStartedAt?: Date
  estimatedParseComplete?: Date
  errors: string[]
}

export interface ResumeListItem {
  resumeId: string
  fileName: string
  fileSize: number
  fileType: 'pdf' | 'docx'
  uploadedAt: Date
  parseStatus: 'pending' | 'in_progress' | 'completed' | 'failed'
  parseProgress: number
  extractedText?: string
  metadata: {
    hasError: boolean
    errorMessage?: string
  }
}

export interface ResumeListResponse {
  resumes: ResumeListItem[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

// ============================================
// Validation Error Types
// ============================================

export enum FileValidationErrorCode {
  FILE_REQUIRED = 'FILE_REQUIRED',
  FILE_SIZE_EXCEEDED = 'FILE_SIZE_EXCEEDED',
  FILE_SIZE_TOO_SMALL = 'FILE_SIZE_TOO_SMALL',
  UNSUPPORTED_MIME_TYPE = 'UNSUPPORTED_MIME_TYPE',
  UNSUPPORTED_EXTENSION = 'UNSUPPORTED_EXTENSION',
  FILE_TYPE_MISMATCH = 'FILE_TYPE_MISMATCH',
  INVALID_FILE_HEADER = 'INVALID_FILE_HEADER',
  CORRUPTED_FILE = 'CORRUPTED_FILE',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  VIRUS_DETECTED = 'VIRUS_DETECTED',
  INVALID_FILENAME = 'INVALID_FILENAME',
  STORAGE_ERROR = 'STORAGE_ERROR',
  PARSER_FAILED = 'PARSER_FAILED',
  EMPTY_DOCUMENT = 'EMPTY_DOCUMENT',
  /**
   * Reserved for a future OCR-detection path — NOT currently thrown anywhere.
   * A scanned/image-only PDF today extracts near-zero text and surfaces as
   * EMPTY_DOCUMENT (or PARSER_FAILED, if extraction throws), not this code.
   * No scanned-PDF fixture exists in the repo to validate real detection
   * logic against; see docs/PHASE_REPORTS/REAL_WORLD_PARSER_AUDIT.md §OCR.
   * Wire this up only once such logic is implemented and tested against a
   * real scanned document — don't let the client start branching on it first.
   */
  SCANNED_PDF_NOT_SUPPORTED = 'SCANNED_PDF_NOT_SUPPORTED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface FileValidationError {
  code: FileValidationErrorCode
  message: string
  details?: {
    fileSize?: number
    maxFileSize?: number
    mimeType?: string
    extension?: string
    quotaUsed?: number
    quotaLimit?: number
    quotaReset?: Date
  }
}

// ============================================
// Authenticated Request with File
// ============================================

export interface AuthenticatedFileRequest extends Request {
  user: {
    id: string
    email: string
    role: string
  }
}
