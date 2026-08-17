/**
 * Dedicated Authentication Rate Limiters
 *
 * Prevents brute-force credential stuffing and registration spam.
 */

import rateLimit from 'express-rate-limit';

// Production limits stay fully enforced by default. A very high ceiling is applied
// ONLY when RATE_LIMIT_TEST_BYPASS is the exact literal string "true", which each
// DB-backed integration test file sets explicitly in beforeAll() before dynamically
// importing the app (see tests/integration/*.integration.test.ts). This is
// deliberately NOT tied to NODE_ENV alone —
// a misconfigured NODE_ENV=test in a real deployment must not silently disable
// this protection. Multiple integration test files each register many fresh
// users per run; without this, the real production limits (10 registrations/hour,
// 15 logins/15min, shared in-memory store) get exhausted mid-suite and tests fail
// for reasons unrelated to what they're testing.
const isTestBypass = process.env.RATE_LIMIT_TEST_BYPASS === 'true';
const TEST_BYPASS_MAX = 100_000;

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestBypass ? TEST_BYPASS_MAX : 15, // Max 15 login attempts per 15 minutes
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
  max: isTestBypass ? TEST_BYPASS_MAX : 10, // Max 10 account creations per hour per IP
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
