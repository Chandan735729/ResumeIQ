/**
 * Optimization Routes
 * Mount at: /api/optimization
 */

import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth.middleware';
import { aiOptimizationRateLimiter } from '../../middleware/aiRateLimiter';
import { optimizeResumeHandler } from './optimization.controller';

const router = Router();

// All optimization routes require JWT authentication
router.use(authenticateJWT);

// POST /api/optimization/optimize
router.post('/optimize', aiOptimizationRateLimiter, optimizeResumeHandler);

export { router as optimizationRoutes };
