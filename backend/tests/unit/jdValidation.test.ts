/**
 * Unit Tests: JD Validation
 */

import {
  validateCreateJobDescription,
  normalizeJDText,
  isJDValidationError,
} from '@modules/jobDescriptions/jobDescriptions.validation';
import { JDValidationErrorCode } from '@modules/jobDescriptions/jobDescriptions.types';

const VALID_DTO = {
  jobTitle: 'Senior Software Engineer',
  companyName: 'Acme Corp',
  rawText: 'We are looking for a Senior Software Engineer with 5+ years of Python experience. ' +
    'Must know AWS, Docker, and Kubernetes. Strong TypeScript skills required.',
};

describe('JD Validation', () => {
  describe('validateCreateJobDescription', () => {
    it('accepts a valid DTO without throwing', () => {
      expect(() => validateCreateJobDescription(VALID_DTO)).not.toThrow();
    });

    it('throws TITLE_REQUIRED when jobTitle is empty', () => {
      try {
        validateCreateJobDescription({ ...VALID_DTO, jobTitle: '' });
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe(JDValidationErrorCode.TITLE_REQUIRED);
        expect(err.field).toBe('jobTitle');
      }
    });

    it('throws TITLE_REQUIRED when jobTitle is missing', () => {
      try {
        validateCreateJobDescription({ rawText: VALID_DTO.rawText } as any);
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe(JDValidationErrorCode.TITLE_REQUIRED);
      }
    });

    it('throws TITLE_TOO_LONG when jobTitle exceeds 200 chars', () => {
      try {
        validateCreateJobDescription({ ...VALID_DTO, jobTitle: 'A'.repeat(201) });
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe(JDValidationErrorCode.TITLE_TOO_LONG);
      }
    });

    it('throws COMPANY_TOO_LONG when companyName exceeds 200 chars', () => {
      try {
        validateCreateJobDescription({ ...VALID_DTO, companyName: 'B'.repeat(201) });
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe(JDValidationErrorCode.COMPANY_TOO_LONG);
      }
    });

    it('throws TEXT_REQUIRED when rawText is empty', () => {
      try {
        validateCreateJobDescription({ ...VALID_DTO, rawText: '' });
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe(JDValidationErrorCode.TEXT_REQUIRED);
      }
    });

    it('throws TEXT_TOO_SHORT when rawText is under 50 chars', () => {
      try {
        validateCreateJobDescription({ ...VALID_DTO, rawText: 'Short.' });
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe(JDValidationErrorCode.TEXT_TOO_SHORT);
      }
    });

    it('throws TEXT_TOO_LONG when rawText exceeds 50000 chars', () => {
      try {
        validateCreateJobDescription({ ...VALID_DTO, rawText: 'A'.repeat(50_001) });
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe(JDValidationErrorCode.TEXT_TOO_LONG);
      }
    });

    it('accepts DTO without companyName', () => {
      expect(() =>
        validateCreateJobDescription({ jobTitle: 'Engineer', rawText: VALID_DTO.rawText }),
      ).not.toThrow();
    });

    it('accepts exactly 50 char rawText', () => {
      const text = 'A'.repeat(50);
      expect(() =>
        validateCreateJobDescription({ jobTitle: 'Engineer', rawText: text }),
      ).not.toThrow();
    });
  });

  describe('normalizeJDText', () => {
    it('converts CRLF to LF', () => {
      expect(normalizeJDText('line1\r\nline2')).toBe('line1\nline2');
    });

    it('collapses multiple spaces', () => {
      expect(normalizeJDText('too   many   spaces')).toBe('too many spaces');
    });

    it('limits consecutive blank lines to 2', () => {
      const result = normalizeJDText('a\n\n\n\n\nb');
      expect(result).toBe('a\n\nb');
    });

    it('trims leading and trailing whitespace', () => {
      expect(normalizeJDText('   hello   ')).toBe('hello');
    });

    it('preserves meaningful newlines', () => {
      const result = normalizeJDText('line1\nline2\nline3');
      expect(result).toContain('line1');
      expect(result).toContain('line2');
      expect(result).toContain('line3');
    });
  });

  describe('isJDValidationError', () => {
    it('returns true for thrown validation error', () => {
      try {
        validateCreateJobDescription({ ...VALID_DTO, jobTitle: '' });
      } catch (err) {
        expect(isJDValidationError(err)).toBe(true);
      }
    });

    it('returns false for regular Error', () => {
      expect(isJDValidationError(new Error('some error'))).toBe(false);
    });

    it('returns false for null', () => {
      expect(isJDValidationError(null)).toBe(false);
    });

    it('returns false for unknown object', () => {
      expect(isJDValidationError({ code: 'UNKNOWN_CODE' })).toBe(false);
    });
  });
});
