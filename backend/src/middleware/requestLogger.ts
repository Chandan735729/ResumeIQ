import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../services/logger.service';

/**
 * Request Logger Middleware with Request ID Correlation
 */
export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const start = Date.now();
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`, {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
    });
  });

  next();
};

