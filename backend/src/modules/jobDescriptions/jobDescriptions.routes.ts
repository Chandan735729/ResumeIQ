/**
 * Job Description Routes
 * Mount at: /api/jobs
 */

import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth.middleware';
import {
  createJobDescriptionHandler,
  listJobDescriptionsHandler,
  getJobDescriptionHandler,
  deleteJobDescriptionHandler,
  analyzeJobDescriptionHandler,
  getMatchResultHandler,
} from './jobDescriptions.controller';

const router = Router();

// All JD routes require authentication
router.use(authenticateJWT);

// CRUD
router.post('/', createJobDescriptionHandler);                          // POST   /api/jobs
router.get('/', listJobDescriptionsHandler);                           // GET    /api/jobs
router.get('/:jobId', getJobDescriptionHandler);                       // GET    /api/jobs/:jobId
router.delete('/:jobId', deleteJobDescriptionHandler);                 // DELETE /api/jobs/:jobId

// Analysis
router.post('/:jobId/analyze', analyzeJobDescriptionHandler);          // POST   /api/jobs/:jobId/analyze
router.get('/:jobId/results/:resumeId', getMatchResultHandler);        // GET    /api/jobs/:jobId/results/:resumeId

export { router as jobDescriptionRoutes };
