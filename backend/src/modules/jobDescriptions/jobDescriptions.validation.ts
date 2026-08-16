/**
 * Job Description Validation
 */

import { JDValidationError, JDValidationErrorCode, CreateJobDescriptionDTO } from './jobDescriptions.types';

const MAX_TITLE_LEN = 200;
const MAX_COMPANY_LEN = 200;
const MIN_TEXT_LEN = 50;
const MAX_TEXT_LEN = 50_000; // ~50 KB — reasonable cap for a JD

/**
 * Validate a CreateJobDescriptionDTO.
 * Throws a JDValidationError (object, not Error instance) on failure.
 */
export function validateCreateJobDescription(dto: Partial<CreateJobDescriptionDTO>): void {
  if (!dto.jobTitle || dto.jobTitle.trim().length === 0) {
    throw {
      code: JDValidationErrorCode.TITLE_REQUIRED,
      message: 'Job title is required.',
      field: 'jobTitle',
    } as JDValidationError;
  }

  if (dto.jobTitle.trim().length > MAX_TITLE_LEN) {
    throw {
      code: JDValidationErrorCode.TITLE_TOO_LONG,
      message: `Job title must not exceed ${MAX_TITLE_LEN} characters.`,
      field: 'jobTitle',
    } as JDValidationError;
  }

  if (dto.companyName && dto.companyName.trim().length > MAX_COMPANY_LEN) {
    throw {
      code: JDValidationErrorCode.COMPANY_TOO_LONG,
      message: `Company name must not exceed ${MAX_COMPANY_LEN} characters.`,
      field: 'companyName',
    } as JDValidationError;
  }

  if (!dto.rawText || dto.rawText.trim().length === 0) {
    throw {
      code: JDValidationErrorCode.TEXT_REQUIRED,
      message: 'Job description text is required.',
      field: 'rawText',
    } as JDValidationError;
  }

  if (dto.rawText.trim().length < MIN_TEXT_LEN) {
    throw {
      code: JDValidationErrorCode.TEXT_TOO_SHORT,
      message: `Job description text must be at least ${MIN_TEXT_LEN} characters. Provided text is too short to extract meaningful requirements.`,
      field: 'rawText',
    } as JDValidationError;
  }

  if (dto.rawText.length > MAX_TEXT_LEN) {
    throw {
      code: JDValidationErrorCode.TEXT_TOO_LONG,
      message: `Job description text must not exceed ${MAX_TEXT_LEN.toLocaleString()} characters.`,
      field: 'rawText',
    } as JDValidationError;
  }
}

/**
 * Normalize raw JD text before storage and extraction.
 * Preserves original meaning; only collapses excessive whitespace.
 */
export function normalizeJDText(rawText: string): string {
  return rawText
    .replace(/\r\n/g, '\n')           // Normalize line endings
    .replace(/\r/g, '\n')             // Remaining CR
    .replace(/[ \t]+/g, ' ')          // Collapse horizontal whitespace
    .replace(/\n{3,}/g, '\n\n')       // Max 2 consecutive blank lines
    .trim();
}

/** Check if an error is a JDValidationError */
export function isJDValidationError(err: unknown): err is JDValidationError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    Object.values(JDValidationErrorCode).includes((err as JDValidationError).code)
  );
}
