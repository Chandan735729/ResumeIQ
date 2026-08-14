import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger.service';

/**
 * Global Error Handler Middleware
 * 
 * Why centralized error handling?
 * - Ensures consistent error responses across API
 * - Prevents exposing internal details to users
 * - Easy to add error tracking (Sentry, etc)
 * - Handles both expected and unexpected errors
 * 
 * Should be the LAST middleware in Express app
 */

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  logger.error(`Error: ${err.message}`);

  // Known application errors (AppError)
  if (err instanceof Error && 'statusCode' in err && 'code' in err) {
    const appErr = err as any;
    return res.status(appErr.statusCode).json({
      success: false,
      error: err.message,
      code: appErr.code,
      timestamp: new Date().toISOString(),
    });
  }

  // Unknown errors - don't expose details to user
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
  });
};
