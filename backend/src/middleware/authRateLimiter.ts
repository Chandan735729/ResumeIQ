/**
 * Dedicated Authentication Rate Limiters
 *
 * Prevents brute-force credential stuffing and registration spam.
 */

import rateLimit from 'express-rate-limit';

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Max 15 login attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again in 15 minutes.',
    data: null,
    errors: [
      {
        field: 'auth',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many login attempts. Please try again later.',
      },
    ],
  },
});

export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 account creations per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many accounts created from this IP. Please try again later.',
    data: null,
    errors: [
      {
        field: 'register',
        code: 'REGISTRATION_RATE_LIMIT_EXCEEDED',
        message: 'Account creation rate limit exceeded.',
      },
    ],
  },
});

export const tokenRefreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 45, // Max 45 token refresh requests per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many token refresh requests.',
    data: null,
  },
});
