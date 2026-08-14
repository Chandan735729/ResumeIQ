/**
 * Authentication Controller
 * 
 * HTTP request handlers for authentication endpoints
 * Validates input, calls service layer, formats responses
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../services/logger.service';
import * as authService from './auth.service';
import {
  RegisterSchema,
  LoginSchema,
  RefreshTokenSchema,
  LogoutSchema,
  validateInput,
} from './auth.validation';
import {
  sendSuccess,
  sendValidationError,
  sendError,
  parseValidationError,
} from './response.utils';
import { RegisterDTO, LoginDTO, RefreshTokenDTO, LogoutDTO } from './auth.types';

/**
 * POST /api/auth/register
 * Register new user
 */
export async function register(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    // Validate input
    let input: RegisterDTO;
    try {
      input = validateInput<RegisterDTO>(RegisterSchema, req.body);
    } catch (validationError: any) {
      const errors = parseValidationError(validationError);
      sendValidationError(res, errors, 'Validation failed', 400);
      return;
    }

    // Get IP and user agent for audit logging
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    // Register user
    const user = await authService.register({
      email: input.email,
      name: input.name,
      password: input.password,
      ipAddress,
      userAgent,
    });

    logger.info(`User registered: ${user.id}`);
    sendSuccess(
      res,
      {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      'Account created successfully. Please log in.',
      201
    );
  } catch (error: any) {
    logger.error('Registration error:', error);

    if (error.message === 'Email already registered') {
      sendError(res, 'Email already registered', 409);
      return;
    }

    if (error.message.includes('validation')) {
      sendError(res, error.message, 400);
      return;
    }

    sendError(res, 'Registration failed', 500);
  }
}

/**
 * POST /api/auth/login
 * Authenticate user and return tokens
 */
export async function login(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    // Validate input
    let input: LoginDTO;
    try {
      input = validateInput<LoginDTO>(LoginSchema, req.body);
    } catch (validationError: any) {
      const errors = parseValidationError(validationError);
      sendValidationError(res, errors, 'Validation failed', 400);
      return;
    }

    // Get IP and user agent for audit logging
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    // Attempt login
    const result = await authService.login(
      input.email,
      input.password,
      ipAddress,
      userAgent
    );

    logger.info('User logged in');
    sendSuccess(res, result, 'Login successful', 200);
  } catch (error: any) {
    logger.error('Login error:', error);

    if (
      error.message === 'Invalid credentials' ||
      error.message === 'Account inactive'
    ) {
      sendError(res, 'Invalid credentials', 401);
      return;
    }

    sendError(res, 'Login failed', 500);
  }
}

/**
 * POST /api/auth/refresh-token
 * Generate new access token using refresh token
 */
export async function refreshToken(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    // Validate input
    let input: RefreshTokenDTO;
    try {
      input = validateInput<RefreshTokenDTO>(RefreshTokenSchema, req.body);
    } catch (validationError: any) {
      const errors = parseValidationError(validationError);
      sendValidationError(res, errors, 'Validation failed', 400);
      return;
    }

    // Get IP and user agent for audit logging
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    // Refresh token
    const result = await authService.refreshAccessToken(
      input.refreshToken,
      ipAddress,
      userAgent
    );

    logger.debug('Access token refreshed');
    sendSuccess(res, result, 'Token refreshed successfully', 200);
  } catch (error: any) {
    logger.error('Token refresh error:', error);

    if (
      error.message.includes('not found') ||
      error.message.includes('revoked') ||
      error.message.includes('expired') ||
      error.message.includes('inactive')
    ) {
      sendError(res, 'Invalid or expired refresh token', 400);
      return;
    }

    sendError(res, 'Token refresh failed', 500);
  }
}

/**
 * POST /api/auth/logout
 * Revoke refresh token and end session
 */
export async function logout(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    // Validate input
    let input: LogoutDTO;
    try {
      input = validateInput<LogoutDTO>(LogoutSchema, req.body);
    } catch (validationError: any) {
      const errors = parseValidationError(validationError);
      sendValidationError(res, errors, 'Validation failed', 400);
      return;
    }

    // Get user from authenticated request
    const userId = (req as any).user?.id;

    if (!userId) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    // Get IP and user agent for audit logging
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    // Logout
    await authService.logout(input.refreshToken, userId, ipAddress, userAgent);

    logger.debug(`User logged out: ${userId}`);
    sendSuccess(res, null, 'Logged out successfully', 200);
  } catch (error: any) {
    logger.error('Logout error:', error);

    if (error.message === 'Access denied') {
      sendError(res, 'Access denied', 403);
      return;
    }

    // Always return success on logout for safe no-op/idempotent behavior
    sendSuccess(res, null, 'Logged out successfully', 200);
  }
}

/**
 * GET /api/auth/profile
 * Get authenticated user's profile
 * Requires valid JWT in Authorization header
 */
export async function getProfile(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    // Get user ID from JWT middleware
    const userId = (req as any).user?.id;

    if (!userId) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    // Get profile
    const profile = await authService.getProfile(userId);

    sendSuccess(res, profile, 'Profile retrieved', 200);
  } catch (error: any) {
    logger.error('Get profile error:', error);

    if (error.message === 'User not found') {
      sendError(res, 'User not found', 404);
      return;
    }

    sendError(res, 'Failed to retrieve profile', 500);
  }
}

export default {
  register,
  login,
  refreshToken,
  logout,
  getProfile,
};
