/**
 * Authentication Routes
 * 
 * Defines all authentication endpoints
 * - POST /api/auth/register - Register new user
 * - POST /api/auth/login - Login with email/password
 * - POST /api/auth/refresh-token - Refresh access token
 * - POST /api/auth/logout - Logout and revoke token
 * - GET /api/auth/profile - Get authenticated user's profile
 */

import { Router } from 'express';
import * as authController from './auth.controller';
import { authenticateJWT } from '../../middleware/auth.middleware';
import { loginRateLimiter, registerRateLimiter, tokenRefreshRateLimiter } from '../../middleware/authRateLimiter';

const router = Router();

/**
 * Public Routes
 */

/**
 * POST /api/auth/register
 * Register new user account
 */
router.post('/register', registerRateLimiter, authController.register);

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', loginRateLimiter, authController.login);

/**
 * POST /api/auth/refresh-token
 * Generate new access token
 */
router.post('/refresh-token', tokenRefreshRateLimiter, authController.refreshToken);


/**
 * POST /api/auth/logout
 * Logout and revoke refresh token
 */
router.post('/logout', authenticateJWT, authController.logout);

/**
 * Protected Routes
 */

/**
 * GET /api/auth/profile
 * Get authenticated user's profile
 */
router.get('/profile', authenticateJWT, authController.getProfile);

export default router;
