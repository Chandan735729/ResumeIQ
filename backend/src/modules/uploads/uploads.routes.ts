/**
 * Upload Routes
 * RESTful API endpoints for resume uploads
 */

import { Router } from 'express'
import multer from 'multer'
import { uploadController } from './uploads.controller'
import { authenticateJWT } from '../../middleware/auth.middleware'

// Configure multer for file uploads
const storage = multer.memoryStorage()  // Keep file in memory for validation
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
  fileFilter: (_req, file, cb) => {
    // Quick MIME type check at multer level
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only PDF and DOCX files are allowed'))
    }
  },
})

const router = Router()

// ============================================
// Upload Endpoints (All require authentication)
// ============================================

/**
 * POST /api/resumes/upload
 * Upload a new resume
 * 
 * @param file: Form data file (multipart/form-data)
 * @returns {UploadResponse}
 */
router.post('/upload', authenticateJWT, upload.single('file'), (req, res, next) =>
  uploadController.uploadResume(req, res, next)
)

/**
 * GET /api/resumes
 * List user's resumes
 * 
 * @query limit: Max results (default 10, max 100)
 * @query offset: Pagination offset (default 0)
 * @query sortBy: Sort order - "recent" | "oldest" | "name" (default "recent")
 * @returns {ResumeListResponse}
 */
router.get('/', authenticateJWT, (req, res, next) =>
  uploadController.listResumes(req, res, next)
)

/**
 * GET /api/resumes/quota/info
 * Get upload quota information
 *
 * @returns {QuotaInfo}
 */
router.get('/quota/info', authenticateJWT, (req, res, next) =>
  uploadController.getQuotaInfo(req, res, next)
)

/**
 * GET /api/resumes/:resumeId
 * Get resume details
 * 
 * @param resumeId: Resume ID
 * @returns {Resume}
 */
router.get('/:resumeId', authenticateJWT, (req, res, next) =>
  uploadController.getResume(req, res, next)
)

/**
 * DELETE /api/resumes/:resumeId
 * Delete a resume (soft delete)
 * 
 * @param resumeId: Resume ID
 * @returns {DeleteResponse}
 */
router.delete('/:resumeId', authenticateJWT, (req, res, next) =>
  uploadController.deleteResume(req, res, next)
)

// Error handler for multer
router.use((err: any, _req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds maximum (10 MB)',
        errors: [
          {
            field: 'file',
            code: 'FILE_SIZE_EXCEEDED',
            message: 'File must not exceed 10 MB',
          },
        ],
      })
    }
  }

  if (err && err.message === 'Only PDF and DOCX files are allowed') {
    return res.status(400).json({
      success: false,
      message: 'Unsupported file type',
      errors: [
        {
          field: 'file',
          code: 'UNSUPPORTED_MIME_TYPE',
          message: 'Only PDF and DOCX files are allowed',
        },
      ],
    })
  }

  next(err)
})

export const uploadRoutes = router
