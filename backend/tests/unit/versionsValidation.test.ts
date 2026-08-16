/**
 * Unit Tests: Resume Version Validation & Error Guards
 */

import {
  validateFormatParam,
  isVersionError,
} from '@modules/versions/versions.validation';
import { VersionErrorCode } from '@modules/versions/versions.types';

describe('Resume Version Validation', () => {
  it('accepts pdf and docx format strings case-insensitively', () => {
    expect(validateFormatParam('pdf')).toBe('pdf');
    expect(validateFormatParam('PDF')).toBe('pdf');
    expect(validateFormatParam('docx')).toBe('docx');
    expect(validateFormatParam('DOCX')).toBe('docx');
    expect(validateFormatParam(undefined)).toBe('pdf'); // default
  });

  it('rejects unsupported format strings', () => {
    expect(() => validateFormatParam('exe')).toThrow();
    expect(() => validateFormatParam('html')).toThrow();
    expect(() => validateFormatParam('txt')).toThrow();
  });

  it('identifies VersionError correctly with type guard', () => {
    const err = { code: VersionErrorCode.VERSION_NOT_FOUND, message: 'Not found' };
    expect(isVersionError(err)).toBe(true);
    expect(isVersionError(new Error('general error'))).toBe(false);
  });
});
