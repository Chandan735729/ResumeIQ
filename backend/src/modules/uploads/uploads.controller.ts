/**
 * Upload Controller
 * HTTP request handlers for file uploads
 */

import { Request, Response } from 'express'
import { uploadService } from './uploads.service'
import { sendSuccess, sendError, sendValidationError } from '../auth/response.utils'
import { FileValidationErrorCode } from './uploads.types'
import { logger } from '../../services/logger.service'

// Extend Express Request to include user
interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
    role: string
  }
  file?: Express.Multer.File
}

export class UploadController {
  /**
   * POST /api/resumes/upload
   * Upload a resume file
   */
  async uploadResume(req: AuthenticatedRequest, res: Response, _next: any) {
    try {
      // Check authentication
      if (!req.user?.id) {
        return sendError(res, 'Authentication required', 401)
      }

      // Check file presence
      if (!req.file) {
        return sendValidationError(
          res,
          [
            {
              field: 'file',
              code: 'FILE_REQUIRED',
              message: 'A resume file is required',
            },
          ],
          'File validation failed',
          400
        )
      }

      // Upload file
      const response = await uploadService.uploadResume(req.user.id, {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: req.file.originalname.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx',
        mimeType: req.file.mimetype,
        buffer: req.file.buffer,
      })

      logger.info(`Resume uploaded successfully`, {
        userId: req.user.id,
        resumeId: response.resumeId,
        fileSize: response.fileSize,
      })

      return sendSuccess(res, response, 'Resume uploaded successfully', 201)
    } catch (error) {
      const err = error as any

      // Handle validation errors
      if (err.code && Object.values(FileValidationErrorCode).includes(err.code)) {
        logger.warn('File validation failed', { code: err.code, userId: req.user?.id })

        if (
          err.code === FileValidationErrorCode.PARSER_FAILED ||
          err.code === FileValidationErrorCode.EMPTY_DOCUMENT
        ) {
          return sendError(res, err.message || 'Parsing failed', 422)
        }

        if (err.code === FileValidationErrorCode.STORAGE_ERROR) {
          return sendError(res, 'Upload failed due to storage error', 503)
        }

        if (err.code === FileValidationErrorCode.INTERNAL_ERROR) {
          return sendError(res, 'Upload failed. Please try again.', 500)
        }

        return sendValidationError(
          res,
          [
            {
              field: 'file',
              code: err.code,
              message: err.message,
            },
          ],
          'File validation failed',
          err.code === FileValidationErrorCode.QUOTA_EXCEEDED ? 429 : 400
        )
      }

      // Handle other errors
      logger.error('Upload failed', { code: err.code, message: err.message, userId: req.user?.id })
      return sendError(res, 'Upload failed. Please try again.', 500)
    }
  }

  /**
   * GET /api/resumes
   * List user's resumes
   */
  async listResumes(req: AuthenticatedRequest, res: Response, _next: any) {
    try {
      // Check authentication
      if (!req.user?.id) {
        return sendError(res, 'Authentication required', 401)
      }

      // Parse query parameters
      const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 10), 100)
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0)
      const sortBy = (req.query.sortBy as 'recent' | 'oldest' | 'name') || 'recent'

      // Get resumes
      const response = await uploadService.listResumes(
        req.user.id,
        limit,
        offset,
        sortBy
      )

      return sendSuccess(res, response, 'Resumes retrieved', 200)
    } catch (error) {
      logger.error('Failed to list resumes', error, { userId: req.user?.id })
      return sendError(res, 'Failed to retrieve resumes', 500)
    }
  }

  /**
   * GET /api/resumes/:resumeId
   * Get resume details
   */
  async getResume(req: AuthenticatedRequest, res: Response, _next: any) {
    try {
      // Check authentication
      if (!req.user?.id) {
        return sendError(res, 'Authentication required', 401)
      }

      const { resumeId } = req.params

      // Get resume
      const resume = await uploadService.getResume(req.user.id, resumeId)

      return sendSuccess(res, resume, 'Resume retrieved', 200)
    } catch (error) {
      const err = error as any

      if (err.message === 'Resume not found') {
        return sendError(res, 'Resume not found', 404)
      }

      if (err.message === 'Access denied') {
        return sendError(res, 'Access denied', 403)
      }

      logger.error('Failed to get resume', err, { userId: req.user?.id })
      return sendError(res, 'Failed to retrieve resume', 500)
    }
  }

  /**
   * DELETE /api/resumes/:resumeId
   * Delete a resume
   */
  async deleteResume(req: AuthenticatedRequest, res: Response, _next: any) {
    try {
      // Check authentication
      if (!req.user?.id) {
        return sendError(res, 'Authentication required', 401)
      }

      const { resumeId } = req.params

      // Delete resume
      const response = await uploadService.deleteResume(req.user.id, resumeId)

      logger.info(`Resume deleted successfully`, {
        userId: req.user.id,
        resumeId,
      })

      return sendSuccess(res, response, 'Resume deleted successfully', 200)
    } catch (error) {
      const err = error as any

      if (err.message === 'Resume not found') {
        return sendError(res, 'Resume not found', 404)
      }

      if (err.message === 'Access denied: Resume does not belong to user') {
        return sendError(res, 'Access denied', 403)
      }

      logger.error('Failed to delete resume', err, { userId: req.user?.id })
      return sendError(res, 'Failed to delete resume', 500)
    }
  }

  /**
   * GET /api/resumes/quota/info
   * Get upload quota information
   */
  async getQuotaInfo(req: AuthenticatedRequest, res: Response, _next: any) {
    try {
      // Check authentication
      if (!req.user?.id) {
        return sendError(res, 'Authentication required', 401)
      }

      // Get quota info
      const quotaInfo = await uploadService.getQuotaInfo(req.user.id)

      return sendSuccess(res, quotaInfo, 'Quota info retrieved', 200)
    } catch (error) {
      logger.error('Failed to get quota info', error, { userId: req.user?.id })
      return sendError(res, 'Failed to retrieve quota info', 500)
    }
  }
}

export const uploadController = new UploadController()
