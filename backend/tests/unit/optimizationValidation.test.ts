/**
 * Unit Tests: Optimization Input Validation
 */

import {
  validateOptimizeResumeInput,
  isOptimizationError,
} from '@modules/optimization/optimization.validation';
import { OptimizationErrorCode } from '@modules/optimization/optimization.types';

describe('Optimization Input Validation', () => {
  it('accepts valid optimize input DTO', () => {
    expect(() =>
      validateOptimizeResumeInput({
        resumeId: 'res-123',
        jobDescriptionId: 'jd-456',
        optimizationType: 'conservative',
      })
    ).not.toThrow();
  });

  it('throws RESUME_REQUIRED if resumeId is missing', () => {
    try {
      validateOptimizeResumeInput({ jobDescriptionId: 'jd-456' });
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.code).toBe(OptimizationErrorCode.RESUME_REQUIRED);
    }
  });

  it('throws JD_REQUIRED if jobDescriptionId is missing', () => {
    try {
      validateOptimizeResumeInput({ resumeId: 'res-123' });
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.code).toBe(OptimizationErrorCode.JD_REQUIRED);
    }
  });

  it('identifies optimization error type correctly', () => {
    const customErr = { code: OptimizationErrorCode.QUOTA_EXCEEDED, message: 'Quota exceeded' };
    expect(isOptimizationError(customErr)).toBe(true);
    expect(isOptimizationError(new Error('regular error'))).toBe(false);
  });
});
