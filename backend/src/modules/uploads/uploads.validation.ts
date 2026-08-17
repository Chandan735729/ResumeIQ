/**
 * File Upload Validation
 */

import { FileValidationError, FileValidationErrorCode } from './uploads.types'
export { FileValidationErrorCode } from './uploads.types'

// ============================================
// Constants
// ============================================

const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10 MB
const MIN_FILE_SIZE = 1 * 1024           // 1 KB

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const ALLOWED_EXTENSIONS = ['.pdf', '.docx']

// Magic bytes for file type verification
const MAGIC_BYTES = {
  pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]),  // %PDF
  docx: Buffer.from([0x50, 0x4B, 0x03, 0x04]),  // ZIP header
}

// ============================================
// Validation Functions
// ============================================

/**
 * Validate file size
 */
export function validateFileSize(fileSize: number): void {
  if (fileSize < MIN_FILE_SIZE) {
    throw {
      code: FileValidationErrorCode.FILE_SIZE_TOO_SMALL,
      message: `File size must be at least 1 KB. Got: ${formatBytes(fileSize)}`,
      details: {
        fileSize,
        minFileSize: MIN_FILE_SIZE,
      },
    } as FileValidationError
  }

  if (fileSize > MAX_FILE_SIZE) {
    throw {
      code: FileValidationErrorCode.FILE_SIZE_EXCEEDED,
      message: `File size must not exceed 10 MB. Got: ${formatBytes(fileSize)}`,
      details: {
        fileSize,
        maxFileSize: MAX_FILE_SIZE,
      },
    } as FileValidationError
  }
}

/**
 * Validate MIME type
 */
export function validateMimeType(mimeType: string): void {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw {
      code: FileValidationErrorCode.UNSUPPORTED_MIME_TYPE,
      message: `Unsupported file type: ${mimeType}. Only PDF and DOCX are allowed.`,
      details: {
        mimeType,
      },
    } as FileValidationError
  }
}

/**
 * Validate file extension
 */
export function validateFileExtension(fileName: string): void {
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'))
  
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw {
      code: FileValidationErrorCode.UNSUPPORTED_EXTENSION,
      message: `Unsupported file extension: ${ext}. Only .pdf and .docx are allowed.`,
      details: {
        extension: ext,
      },
    } as FileValidationError
  }
}

export function detectFileSignatureType(buffer: Buffer): 'pdf' | 'docx' | null {
  if (buffer.length < 4) {
    return null
  }

  const header = buffer.slice(0, 4)

  if (header.equals(MAGIC_BYTES.pdf)) {
    return 'pdf'
  }

  if (header.equals(MAGIC_BYTES.docx)) {
    return 'docx'
  }

  return null
}

/**
 * Validate magic bytes (file header)
 * Detects if file is actually PDF/DOCX or a malicious file with changed extension
 */
export function validateMagicBytes(buffer: Buffer): void {
  const detectedType = detectFileSignatureType(buffer)

  if (!detectedType) {
    throw {
      code: FileValidationErrorCode.CORRUPTED_FILE,
      message: 'File appears to be corrupted or too small to validate',
    } as FileValidationError
  }
}

/**
 * Sanitize filename to prevent path traversal and special characters
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\0/g, '')                    // Null bytes
    .replace(/\.\./g, '')                  // Path traversal
    .replace(/^\.+/, '')                   // Leading dots
    .split('/').join('')                     // Path separators
    .split('\\').join('')
    .replace(/[^a-zA-Z0-9._-]/g, '_')     // Special characters → underscore
    .slice(0, 255)                         // Max filename length
}

/**
 * Validate filename (after sanitization)
 */
export function validateFilename(filename: string): void {
  if (!filename || filename.length === 0) {
    throw {
      code: FileValidationErrorCode.INVALID_FILENAME,
      message: 'Filename cannot be empty',
    } as FileValidationError
  }

  if (filename.length > 255) {
    throw {
      code: FileValidationErrorCode.INVALID_FILENAME,
      message: 'Filename cannot exceed 255 characters',
    } as FileValidationError
  }

  // After sanitization, should only have safe characters
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    throw {
      code: FileValidationErrorCode.INVALID_FILENAME,
      message: 'Filename contains invalid characters',
    } as FileValidationError
  }
}

// ============================================
// Helper Functions
// ============================================

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/**
 * Validate all file requirements at once
 */
export function validateFile(
  fileName: string,
  fileSize: number,
  mimeType: string,
  buffer: Buffer
): void {
  // 1. Size
  validateFileSize(fileSize)

  // 2. MIME type
  validateMimeType(mimeType)

  // 3. Extension
  validateFileExtension(fileName)

  const detectedType = detectFileSignatureType(buffer)
  if (!detectedType) {
    throw {
      code: FileValidationErrorCode.INVALID_FILE_HEADER,
      message: 'File header does not match expected PDF or DOCX format.',
    } as FileValidationError
  }

  const normalizedExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'))
  const expectedType = normalizedExtension === '.pdf' ? 'pdf' : 'docx'
  if (detectedType !== expectedType) {
    throw {
      code: FileValidationErrorCode.FILE_TYPE_MISMATCH,
      message: 'File extension does not match the file contents.',
      details: {
        extension: normalizedExtension,
      },
    } as FileValidationError
  }

  // 4. Magic bytes (actual file type)
  validateMagicBytes(buffer)

  // 5. Filename safety
  const sanitized = sanitizeFilename(fileName)
  validateFilename(sanitized)
}

/**
 * Get file type from extension
 */
export function getFileType(fileName: string): 'pdf' | 'docx' {
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'))
  if (ext === '.pdf') return 'pdf'
  if (ext === '.docx') return 'docx'
  throw new Error(`Unsupported file extension: ${ext}`)
}
