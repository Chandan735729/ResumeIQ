/**
 * Authentication Middleware
 * 
 * JWT validation and authorization middleware
 * Protects routes by verifying access tokens and roles
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger.service';
import * as authService from '../modules/auth/auth.service';
import { sendError } from '../modules/auth/response.utils';

/**
 * Extend Express Request to include user data
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

/**
 * Extract JWT from Authorization header
 * Expected format: "Bearer <token>"
 */
function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * JWT Authentication Middleware
 * Validates access token and extracts user information
 * Sets req.user if authentication succeeds
 */
export function authenticateJWT(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Extract token from Authorization header
    const token = extractTokenFromHeader(req.get('authorization'));

    if (!token) {
      sendError(res, 'Missing authorization token', 401);
      return;
    }

    // Verify token
    let decoded;
    try {
      decoded = authService.verifyAccessToken(token);
    } catch (error: any) {
      logger.warn(`Token verification failed: ${error.message}`);
      sendError(res, 'Invalid or expired token', 401);
      return;
    }

    // Attach user to request
    (req as any).user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };

    logger.debug(`User authenticated: ${decoded.sub}`);
    next();
  } catch (error: any) {
    logger.error('JWT authentication error:', error);
    sendError(res, 'Authentication failed', 401);
  }
}

/**
 * Role-Based Authorization Middleware
 * Checks if user has required role
 *
 * Usage: authorize(['ADMIN', 'PREMIUM'])(req, res, next)
 */
export function authorize(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const userRole = (req as any).user?.role;

      if (!userRole || !allowedRoles.includes(userRole)) {
        logger.warn(
          `Unauthorized access attempt. Required: ${allowedRoles.join(', ')}, Got: ${userRole}`
        );
        sendError(res, 'Insufficient permissions', 403);
        return;
      }

      next();
    } catch (error: any) {
      logger.error('Authorization check error:', error);
      sendError(res, 'Authorization failed', 403);
    }
  };
}

/**
 * Optional JWT Authentication
 * Attempts to authenticate but doesn't fail if token is missing
 * Useful for endpoints that have different behavior for authenticated users
 */
export function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    const token = extractTokenFromHeader(req.get('authorization'));

    if (!token) {
      next();
      return;
    }

    try {
      const decoded = authService.verifyAccessToken(token);
      (req as any).user = {
        id: decoded.sub,
        email: decoded.email,
        role: decoded.role,
      };
    } catch (error) {
      // Token is invalid, but we don't fail
      logger.debug('Invalid optional token, continuing without authentication');
    }

    next();
  } catch (error: any) {
    logger.error('Optional JWT authentication error:', error);
    next();
  }
}

/**
 * Request validation middleware using Zod
 * Validates request body against provided schema
 */
export function validateRequest(schema: any) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.body);
      (req as any).validatedBody = validated;
      next();
    } catch (error: any) {
      logger.warn('Request validation failed:', error);
      if (error.errors) {
        const apiErrors = error.errors.map((err: any) => ({
          field: err.path.join('.'),
          code: err.code,
          message: err.message,
        }));
        sendError(res, 'Validation failed', 400, apiErrors);
        return;
      }
      sendError(res, 'Invalid request', 400);
    }
  };
}

export default {
  authenticateJWT,
  authorize,
  optionalAuthenticate,
  validateRequest,
};
