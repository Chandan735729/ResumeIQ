/**
 * Optimization Input Validation
 */

import {
  OptimizeResumeDTO,
  OptimizationError,
  OptimizationErrorCode,
  OptimizationType,
} from './optimization.types';

const ALLOWED_TYPES: Set<OptimizationType> = new Set([
  'conservative',
  'ats_focused',
  'recruiter_focused',
]);

export function validateOptimizeResumeInput(dto: Partial<OptimizeResumeDTO>): void {
  if (!dto.resumeId || typeof dto.resumeId !== 'string' || dto.resumeId.trim().length === 0) {
    throw {
      code: OptimizationErrorCode.RESUME_REQUIRED,
      message: 'resumeId is required.',
      field: 'resumeId',
    } as OptimizationError;
  }

  if (!dto.jobDescriptionId || typeof dto.jobDescriptionId !== 'string' || dto.jobDescriptionId.trim().length === 0) {
    throw {
      code: OptimizationErrorCode.JD_REQUIRED,
      message: 'jobDescriptionId is required.',
      field: 'jobDescriptionId',
    } as OptimizationError;
  }

  if (dto.optimizationType && !ALLOWED_TYPES.has(dto.optimizationType)) {
    throw {
      code: OptimizationErrorCode.RESUME_REQUIRED,
      message: `Invalid optimizationType. Must be one of: ${Array.from(ALLOWED_TYPES).join(', ')}`,
      field: 'optimizationType',
    } as OptimizationError;
  }
}

export function isOptimizationError(err: unknown): err is OptimizationError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    Object.values(OptimizationErrorCode).includes((err as OptimizationError).code)
  );
}
