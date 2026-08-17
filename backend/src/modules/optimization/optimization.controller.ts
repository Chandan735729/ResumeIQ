/**
 * Optimization Controller
 */

import { Request, Response } from 'express';
import { optimizeResume } from './optimization.service';
import { isOptimizationError } from './optimization.validation';
import { OptimizationErrorCode } from './optimization.types';
import { sendSuccess, sendError, sendValidationError } from '../auth/response.utils';
import { logger } from '../../services/logger.service';

function getUserId(req: Request): string {
  return (req as Request & { user: { id: string } }).user.id;
}

function handleOptimizationError(res: Response, err: unknown): Response {
  if (isOptimizationError(err)) {
    switch (err.code) {
      case OptimizationErrorCode.RESUME_NOT_FOUND:
      case OptimizationErrorCode.JD_NOT_FOUND:
        return sendError(res, err.message, 404);
      case OptimizationErrorCode.ACCESS_DENIED:
        return sendError(res, err.message, 403);
      case OptimizationErrorCode.QUOTA_EXCEEDED:
        return sendError(res, err.message, 402);
      case OptimizationErrorCode.RESUME_NOT_PARSED:
      case OptimizationErrorCode.INPUT_TOO_LARGE:
      case OptimizationErrorCode.SCHEMA_VALIDATION_FAILED:
        return sendError(res, err.message, 422);
      case OptimizationErrorCode.AI_TIMEOUT:
        return sendError(res, 'AI service timed out. Please try again.', 504);
      case OptimizationErrorCode.AI_RATE_LIMITED:
      case OptimizationErrorCode.AI_PROVIDER_ERROR:
        return sendError(res, 'AI optimization service temporarily unavailable. Please try again later.', 503);
      default:
        return sendValidationError(
          res,
          [{ field: err.field ?? 'unknown', code: err.code, message: err.message }],
          'Validation failed',
          400
        );
    }
  }

  // User-facing message stays generic (no internals leaked to the client),
  // but the developer log must capture the real error -- without this, a
  // genuine bug (DB failure, unhandled exception in rendering/scoring/etc.)
  // is undiagnosable from logs alone.
  logger.error('Unexpected optimization controller error', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return sendError(res, 'An unexpected error occurred during optimization.', 500);
}

/**
 * POST /api/optimization/optimize
 * Request safe AI resume optimization against a target job description.
 */
export async function optimizeResumeHandler(req: Request, res: Response): Promise<Response> {
  try {
    const userId = getUserId(req);
    const dto = {
      resumeId: req.body.resumeId,
      jobDescriptionId: req.body.jobDescriptionId,
      optimizationType: req.body.optimizationType,
    };

    const result = await optimizeResume(userId, dto);
    return sendSuccess(res, result, 'Resume optimized and rescored successfully.', 200);
  } catch (err) {
    return handleOptimizationError(res, err);
  }
}
