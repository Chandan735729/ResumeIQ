/**
 * Resume Versions Routes
 * Mount at: /api/resumes/:resumeId/versions
 */

import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth.middleware';
import {
  listVersionsHandler,
  getVersionHandler,
  compareVersionHandler,
  downloadVersionHandler,
  deleteVersionHandler,
} from './versions.controller';

const router = Router({ mergeParams: true });

// All version routes require JWT authentication
router.use(authenticateJWT);

router.get('/', listVersionsHandler);                           // GET    /api/resumes/:resumeId/versions
router.get('/:versionId', getVersionHandler);                   // GET    /api/resumes/:resumeId/versions/:versionId
router.get('/:versionId/compare', compareVersionHandler);       // GET    /api/resumes/:resumeId/versions/:versionId/compare
router.get('/:versionId/download', downloadVersionHandler);     // GET    /api/resumes/:resumeId/versions/:versionId/download?format=pdf|docx
router.delete('/:versionId', deleteVersionHandler);             // DELETE /api/resumes/:resumeId/versions/:versionId

export { router as versionRoutes };
