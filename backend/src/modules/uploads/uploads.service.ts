/**
 * Upload Service
 * Business logic for resume uploads
 */

import { ResumeParseStatus } from '@prisma/client'
import { prisma } from '../../services/prisma.service'
import { fileStorage } from '../../services/file-storage.service'
import { parseResume } from '../../services/resumeParser.service'
import {
  validateFile,
  sanitizeFilename,
  getFileType,
} from './uploads.validation'
import { UploadResumeDTO, UploadResponse, ResumeListResponse, ResumeListItem, FileValidationErrorCode } from './uploads.types'
import { logger } from '../../services/logger.service'

export class UploadService {
  /**
   * Upload a resume file
   */
  async uploadResume(userId: string, dto: UploadResumeDTO): Promise<UploadResponse> {
    let resumeId: string | null = null
    let fileKey: string | null = null
    try {
      // 1. Validate file
      validateFile(dto.fileName, dto.fileSize, dto.mimeType, dto.buffer)

      // 2. Check quota
      let subscription = await prisma.subscription.findUnique({
        where: { userId },
      })

      if (!subscription) {
        subscription = await prisma.subscription.create({
          data: {
            userId,
            plan: 'free',
            monthlyQuota: 50,
          },
        }).catch(() => null)
      }

      const isDev = process.env.NODE_ENV !== 'production'
      const monthlyQuota = subscription ? (isDev ? Math.max(subscription.monthlyQuota, 50) : subscription.monthlyQuota) : 50

      const uploadedThisMonth = await this.countUploadsThisMonth(userId)
      if (uploadedThisMonth >= monthlyQuota) {
        throw {
          code: FileValidationErrorCode.QUOTA_EXCEEDED,
          message: `Monthly upload limit (${monthlyQuota}) reached. Resets ${this.getNextMonthStart()}.`,
          details: {
            quotaUsed: uploadedThisMonth,
            quotaLimit: monthlyQuota,
            quotaReset: this.getNextMonthStart(),
          },
        }
      }


      // 3. Sanitize filename
      const sanitizedFileName = sanitizeFilename(dto.fileName)
      const fileType = getFileType(dto.fileName)

      // 4. Store file in filesystem
      fileKey = await fileStorage.upload(userId, dto.buffer, sanitizedFileName)

      // 5. Create Resume record in database
      const resume = await prisma.resume.create({
        data: {
          userId,
          fileName: sanitizedFileName,
          fileSize: dto.fileSize,
          fileType: fileType,
          parseStatus: ResumeParseStatus.PROCESSING,
          parseStartedAt: new Date(),
        },
      })
      resumeId = resume.id

      // 6. Create OriginalFile record
      await prisma.originalFile.create({
        data: {
          resumeId: resume.id,
          s3Key: fileKey,
          s3Url: `file:///${fileKey}`, // Local file URL
        },
      })

      // 7. Parse and persist extracted resume content
      const parsedResume = await parseResume(dto.buffer, sanitizedFileName)
      const extractedLayout = JSON.stringify({
        contact: parsedResume.contact,
        summary: parsedResume.summary ?? null,
        skills: parsedResume.skills,
        experience: parsedResume.experience,
        education: parsedResume.education,
        projects: parsedResume.projects,
        certifications: parsedResume.certifications,
        languages: parsedResume.languages,
        sections: parsedResume.sections,
        metadata: parsedResume.metadata,
        warnings: parsedResume.warnings,
        parseConfidence: parsedResume.parseConfidence,
        resumeType: parsedResume.resumeType,
      })

      await prisma.resume.update({
        where: { id: resume.id },
        data: {
          parseStatus: ResumeParseStatus.COMPLETED,
          parsedAt: new Date(),
          parseError: null,
          extractedText: parsedResume.rawText,
          extractedLayout,
        },
      })

      // 8. Create audit log
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'RESUME_UPLOAD',
          status: 'SUCCESS',
          resource: 'resume',
          resourceId: resume.id,
        },
      })

      logger.info(`Resume uploaded: ${resume.id} by user ${userId}`, {
        resumeId: resume.id,
        userId,
        fileSize: dto.fileSize,
        fileType,
      })

      // 9. Calculate remaining quota
      const quotaRemaining = Math.max(0, monthlyQuota - uploadedThisMonth - 1)


      return {
        resumeId: resume.id,
        fileName: sanitizedFileName,
        fileSize: dto.fileSize,
        fileType: fileType,
        uploadedAt: resume.createdAt,
        quotaRemaining,
        quotaReset: this.getNextMonthStart(),
        parseStatus: 'completed',
        parseProgress: 100,
      }
    } catch (error) {
      const normalizedError = this.normalizeUploadError(error)

      if (resumeId) {
        await prisma.resume.update({
          where: { id: resumeId },
          data: {
            parseStatus: ResumeParseStatus.FAILED,
            parsedAt: new Date(),
            parseError: normalizedError.message,
            extractedText: null,
            extractedLayout: null,
          },
        }).catch(() => {})

        await prisma.originalFile.deleteMany({
          where: { resumeId },
        }).catch(() => {})
      }

      if (fileKey) {
        await this.cleanupStoredFile(userId, fileKey)
      }

      // Audit log for failed upload
      if (error && typeof error === 'object' && 'code' in error) {
        await prisma.auditLog.create({
          data: {
            userId,
            action: 'RESUME_UPLOAD',
            status: 'FAILURE',
            reason: normalizedError.message,
            resource: 'resume',
            resourceId: resumeId ?? undefined,
          },
        }).catch(() => {}) // Ignore audit log failures
      }

      throw normalizedError
    }
  }

  /**
   * Get list of user's resumes
   */
  async listResumes(
    userId: string,
    limit: number = 10,
    offset: number = 0,
    sortBy: 'recent' | 'oldest' | 'name' = 'recent'
  ): Promise<ResumeListResponse> {
    try {
      // Validate limits
      const validLimit = Math.min(Math.max(1, limit), 100)
      const validOffset = Math.max(0, offset)

      // Determine sort order
      let orderBy: any = { createdAt: 'desc' }
      if (sortBy === 'oldest') {
        orderBy = { createdAt: 'asc' }
      } else if (sortBy === 'name') {
        orderBy = { fileName: 'asc' }
      }

      // Get total count
      const total = await prisma.resume.count({
        where: { userId },
      })

      // Get resumes
      const resumes = await prisma.resume.findMany({
        where: { userId },
        orderBy,
        take: validLimit,
        skip: validOffset,
        include: {
          originalFile: true,
        },
      })

      // Format response
      const items: ResumeListItem[] = resumes.map((resume) => ({
        resumeId: resume.id,
        fileName: resume.fileName,
        fileSize: resume.fileSize,
        fileType: resume.fileType as 'pdf' | 'docx',
        uploadedAt: resume.createdAt,
        parseStatus: this.mapParseStatus(resume.parseStatus),
        parseProgress: this.getParseProgress(resume.parseStatus),
        extractedText: resume.extractedText || undefined,
        metadata: {
          hasError: resume.parseStatus === 'FAILED',
          errorMessage: resume.parseError ?? undefined,
        },
      }))

      return {
        resumes: items,
        pagination: {
          total,
          limit: validLimit,
          offset: validOffset,
          hasMore: validOffset + validLimit < total,
        },
      }
    } catch (error) {
      logger.error('Failed to list resumes', error, { userId })
      throw error
    }
  }

  /**
   * Delete a resume.
   *
   * Order: DB record first → physical file second.
   *
   * Why DB first?
   *   If the physical delete succeeds but the DB delete fails, a ghost DB record
   *   pointing to a missing file is left behind, causing confusing errors on every
   *   subsequent access. Reversing the order means that if the file delete fails
   *   after the DB delete, we have an orphaned file on disk (auditable, cleanable)
   *   but no confusing DB record. We log a warning so operators can identify orphans.
   */
  async deleteResume(userId: string, resumeId: string): Promise<{ deletedAt: Date }> {
    try {
      // Verify ownership
      const resume = await prisma.resume.findUnique({
        where: { id: resumeId },
        include: { originalFile: true },
      })

      if (!resume) {
        throw new Error('Resume not found')
      }

      if (resume.userId !== userId) {
        throw new Error('Access denied: Resume does not belong to user')
      }

      // Capture the file key before deleting the DB record.
      const fileKey = resume.originalFile?.s3Key ?? null

      // Step 1: Delete the DB record first (cascade removes OriginalFile and related rows).
      await prisma.resume.delete({
        where: { id: resumeId },
      })

      // Step 2: Delete physical file. If this fails, the DB record is already gone.
      // Log the orphan so it can be cleaned up by an operator or a future reconciliation job.
      if (fileKey) {
        try {
          await fileStorage.delete(userId, fileKey)
        } catch (fileError) {
          logger.warn('Orphaned file after DB delete — manual cleanup required', {
            userId,
            resumeId,
            fileKey,
            error: fileError instanceof Error ? fileError.message : fileError,
          })
        }
      }

      // Log the deletion
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'RESUME_DELETE',
          status: 'SUCCESS',
          resource: 'resume',
          resourceId: resumeId,
        },
      })

      logger.info(`Resume deleted: ${resumeId} by user ${userId}`)

      return {
        deletedAt: new Date(),
      }
    } catch (error) {
      logger.error('Failed to delete resume', { userId, resumeId })
      throw error
    }
  }

  private mapParseStatus(status: string): 'pending' | 'in_progress' | 'completed' | 'failed' {
    switch (status) {
      case ResumeParseStatus.PROCESSING:
        return 'in_progress'
      case ResumeParseStatus.COMPLETED:
        return 'completed'
      case ResumeParseStatus.FAILED:
        return 'failed'
      case ResumeParseStatus.PENDING:
      default:
        return 'pending'
    }
  }

  private getParseProgress(status: string): number {
    switch (status) {
      case ResumeParseStatus.PROCESSING:
        return 50
      case ResumeParseStatus.COMPLETED:
        return 100
      case ResumeParseStatus.FAILED:
        return 0
      case ResumeParseStatus.PENDING:
      default:
        return 0
    }
  }

  private normalizeUploadError(error: unknown): { code: FileValidationErrorCode; message: string } {
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      const typedError = error as { code: string; message: string }

      if (typedError.code === FileValidationErrorCode.PARSER_FAILED || typedError.code === FileValidationErrorCode.EMPTY_DOCUMENT || typedError.code === FileValidationErrorCode.SCANNED_PDF_NOT_SUPPORTED) {
        return {
          code: typedError.code as FileValidationErrorCode,
          message: typedError.message,
        }
      }

      return {
        code: typedError.code as FileValidationErrorCode,
        message: typedError.message,
      }
    }

    if (error instanceof Error) {
      // Do NOT propagate raw error.message here — it may contain parser worker stderr,
      // temp file paths, or stdout snippets which should never reach the client.
      return {
        code: FileValidationErrorCode.PARSER_FAILED,
        message: 'Unable to process resume file. Please ensure it is a valid, uncorrupted PDF or DOCX.',
      }
    }

    return {
      code: FileValidationErrorCode.PARSER_FAILED,
      message: 'Upload processing failed',
    }
  }

  private async cleanupStoredFile(userId: string, fileKey: string): Promise<void> {
    try {
      await fileStorage.delete(userId, fileKey)
    } catch (error) {
      logger.warn('Failed to clean up stored file after partial upload failure', {
        userId,
        fileKey,
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  /**
   * Get resume details
   */
  async getResume(userId: string, resumeId: string) {
    try {
      const resume = await prisma.resume.findUnique({
        where: { id: resumeId },
        include: {
          originalFile: true,
          versions: {
            select: {
              id: true,
              versionNumber: true,
              optimizationType: true,
              createdAt: true,
            },
          },
        },
      })

      if (!resume) {
        throw new Error('Resume not found')
      }

      if (resume.userId !== userId) {
        throw new Error('Access denied')
      }

      return resume
    } catch (error) {
      logger.error('Failed to get resume', error, { userId, resumeId })
      throw error
    }
  }

  /**
   * Get upload quota info
   */
  async getQuotaInfo(userId: string) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      })

      if (!subscription) {
        throw new Error('Subscription not found')
      }

      const uploadedThisMonth = await this.countUploadsThisMonth(userId)
      const quotaRemaining = subscription.monthlyQuota - uploadedThisMonth

      return {
        plan: subscription.plan,
        quotaLimit: subscription.monthlyQuota,
        quotaUsed: uploadedThisMonth,
        quotaRemaining,
        quotaReset: this.getNextMonthStart(),
      }
    } catch (error) {
      logger.error('Failed to get quota info', error, { userId })
      throw error
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  private async countUploadsThisMonth(userId: string): Promise<number> {
    const monthStart = this.getMonthStart(new Date())

    return await prisma.resume.count({
      where: {
        userId,
        createdAt: {
          gte: monthStart,
        },
      },
    })
  }

  private getMonthStart(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1)
  }

  private getNextMonthStart(): Date {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth() + 1, 1)
  }
}

export const uploadService = new UploadService()
