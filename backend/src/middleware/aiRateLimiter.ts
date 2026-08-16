/**
 * AI Optimization Dedicated Rate Limiter
 *
 * Enforces strict request throttling on expensive AI generation operations.
 */

import rateLimit from 'express-rate-limit';

export const aiOptimizationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 optimization requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many AI optimization requests. Please try again later.',
    data: null,
    errors: [
      {
        field: 'rateLimit',
        code: 'AI_RATE_LIMIT_EXCEEDED',
        message: 'Rate limit of 20 optimization requests per 15 minutes exceeded.',
      },
    ],
  },
});
