/**
 * Versions Validation
 */

import { VersionError, VersionErrorCode } from './versions.types';
import type { DocumentFormat } from '../../services/documents/document.interface';

export function validateFormatParam(format?: string): DocumentFormat {
  const clean = (format || 'pdf').toLowerCase().trim();
  if (clean !== 'pdf' && clean !== 'docx') {
    throw {
      code: VersionErrorCode.INVALID_FORMAT,
      message: 'Invalid document format. Allowed formats are "pdf" and "docx".',
      field: 'format',
    } as VersionError;
  }
  return clean as DocumentFormat;
}

export function isVersionError(err: unknown): err is VersionError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    Object.values(VersionErrorCode).includes((err as VersionError).code)
  );
}
