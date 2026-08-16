/**
 * Resume Versions Controller
 */

import { Request, Response } from 'express';
import {
  listVersions,
  getVersion,
  compareVersion,
  downloadVersion,
  deleteVersion,
} from './versions.service';
import { validateFormatParam, isVersionError } from './versions.validation';
import { VersionErrorCode } from './versions.types';
import { sendSuccess, sendError, sendValidationError } from '../auth/response.utils';
import { logger } from '../../services/logger.service';

function getUserId(req: Request): string {
  return (req as Request & { user: { id: string } }).user.id;
}

function handleVersionError(res: Response, err: unknown): Response {
  if (isVersionError(err)) {
    switch (err.code) {
      case VersionErrorCode.RESUME_NOT_FOUND:
      case VersionErrorCode.VERSION_NOT_FOUND:
        return sendError(res, err.message, 404);
      case VersionErrorCode.ACCESS_DENIED:
        return sendError(res, err.message, 403);
      case VersionErrorCode.INVALID_FORMAT:
        return sendValidationError(
          res,
          [{ field: err.field ?? 'format', code: err.code, message: err.message }],
          'Validation failed',
          400
        );
      case VersionErrorCode.GENERATION_FAILED:
        return sendError(res, err.message, 500);
      default:
        return sendError(res, err.message, 400);
    }
  }

  logger.error('Unexpected versions controller error');
  return sendError(res, 'An unexpected error occurred.', 500);
}

export async function listVersionsHandler(req: Request, res: Response): Promise<Response> {
  try {
    const userId = getUserId(req);
    const { resumeId } = req.params;
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

    const result = await listVersions(userId, resumeId, limit, offset);
    return sendSuccess(res, result, 'Resume versions retrieved successfully.');
  } catch (err) {
    return handleVersionError(res, err);
  }
}

export async function getVersionHandler(req: Request, res: Response): Promise<Response> {
  try {
    const userId = getUserId(req);
    const { resumeId, versionId } = req.params;
    const result = await getVersion(userId, resumeId, versionId);
    return sendSuccess(res, result, 'Resume version retrieved successfully.');
  } catch (err) {
    return handleVersionError(res, err);
  }
}

export async function compareVersionHandler(req: Request, res: Response): Promise<Response> {
  try {
    const userId = getUserId(req);
    const { resumeId, versionId } = req.params;
    const result = await compareVersion(userId, resumeId, versionId);
    return sendSuccess(res, result, 'Version comparison generated successfully.');
  } catch (err) {
    return handleVersionError(res, err);
  }
}

export async function downloadVersionHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req);
    const { resumeId, versionId } = req.params;
    const format = validateFormatParam(req.query.format as string | undefined);

    const result = await downloadVersion(userId, resumeId, versionId, format);

    // Set safe Content-Disposition with sanitized filename
    const safeFileName = encodeURIComponent(result.fileName);
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"; filename*=UTF-8''${safeFileName}`);
    res.setHeader('Content-Length', result.fileSizeBytes);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    res.status(200).send(result.buffer);
  } catch (err) {
    handleVersionError(res, err);
  }
}

export async function deleteVersionHandler(req: Request, res: Response): Promise<Response> {
  try {
    const userId = getUserId(req);
    const { resumeId, versionId } = req.params;
    await deleteVersion(userId, resumeId, versionId);
    return sendSuccess(res, null, 'Resume version deleted successfully.');
  } catch (err) {
    return handleVersionError(res, err);
  }
}
