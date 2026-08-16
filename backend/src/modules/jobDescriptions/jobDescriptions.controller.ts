/**
 * Job Description Controller
 */

import { Request, Response } from 'express';
import {
  createJobDescription,
  getJobDescription,
  listJobDescriptions,
  deleteJobDescription,
  analyzeJobDescription,
  getMatchResult,
} from './jobDescriptions.service';
import { isJDValidationError } from './jobDescriptions.validation';
import { JDValidationErrorCode } from './jobDescriptions.types';
import {
  sendSuccess,
  sendError,
  sendValidationError,
} from '../auth/response.utils';
import { logger } from '../../services/logger.service';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getUserId(req: Request): string {
  return (req as Request & { user: { id: string } }).user.id;
}


function handleError(res: Response, err: unknown): Response {
  if (isJDValidationError(err)) {
    switch (err.code) {
      case JDValidationErrorCode.JD_NOT_FOUND:
      case JDValidationErrorCode.RESUME_NOT_FOUND:
        return sendError(res, err.message, 404);
      case JDValidationErrorCode.ACCESS_DENIED:
        return sendError(res, 'Forbidden', 403);
      case JDValidationErrorCode.RESUME_NOT_PARSED:
        return sendError(res, err.message, 422);
      default:
        return sendValidationError(
          res,
          [{ field: err.field ?? 'unknown', code: err.code, message: err.message }],
          'Validation failed',
          400,
        );
    }
  }
  logger.error('Unexpected JD controller error');
  return sendError(res, 'An unexpected error occurred.', 500);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/jobs
 * Create a new job description and extract requirements.
 */
export async function createJobDescriptionHandler(req: Request, res: Response): Promise<Response> {
  try {
    const userId = getUserId(req);
    const dto = {
      jobTitle: req.body.jobTitle,
      companyName: req.body.companyName,
      rawText: req.body.rawText,
    };
    const result = await createJobDescription(userId, dto);
    return sendSuccess(res, result, 'Job description created successfully.', 201);
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * GET /api/jobs
 * List all job descriptions for the authenticated user.
 */
export async function listJobDescriptionsHandler(req: Request, res: Response): Promise<Response> {
  try {
    const userId = getUserId(req);
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);
    const result = await listJobDescriptions(userId, limit, offset);
    return sendSuccess(res, result, 'Job descriptions retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * GET /api/jobs/:jobId
 * Get a specific job description.
 */
export async function getJobDescriptionHandler(req: Request, res: Response): Promise<Response> {
  try {
    const userId = getUserId(req);
    const { jobId } = req.params;
    const result = await getJobDescription(userId, jobId);
    return sendSuccess(res, result, 'Job description retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * DELETE /api/jobs/:jobId
 * Delete a job description (cascades match results).
 */
export async function deleteJobDescriptionHandler(req: Request, res: Response): Promise<Response> {
  try {
    const userId = getUserId(req);
    const { jobId } = req.params;
    await deleteJobDescription(userId, jobId);
    return sendSuccess(res, null, 'Job description deleted successfully.');
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * POST /api/jobs/:jobId/analyze
 * Run ATS analysis: match a resume against this job description.
 * Body: { resumeId: string }
 */
export async function analyzeJobDescriptionHandler(req: Request, res: Response): Promise<Response> {
  try {
    const userId = getUserId(req);
    const { jobId } = req.params;
    const resumeId = req.body.resumeId;

    if (!resumeId || typeof resumeId !== 'string' || resumeId.trim().length === 0) {
      return sendValidationError(
        res,
        [{ field: 'resumeId', code: 'REQUIRED', message: 'resumeId is required.' }],
        'Validation failed',
        400,
      );
    }

    const result = await analyzeJobDescription(userId, jobId, resumeId.trim());
    return sendSuccess(res, result, 'ATS analysis completed successfully.');
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * GET /api/jobs/:jobId/results/:resumeId
 * Retrieve a previously computed match result without re-running analysis.
 */
export async function getMatchResultHandler(req: Request, res: Response): Promise<Response> {
  try {
    const userId = getUserId(req);
    const { jobId, resumeId } = req.params;
    const result = await getMatchResult(userId, jobId, resumeId);

    if (!result) {
      return sendError(res, 'No analysis result found for this resume and job description.', 404);
    }

    return sendSuccess(res, result, 'Match result retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
}
