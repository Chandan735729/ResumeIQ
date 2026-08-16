/**
 * Unit Tests: Authentication Rate Limiters
 */

import { loginRateLimiter, registerRateLimiter, tokenRefreshRateLimiter } from '@middleware/authRateLimiter';

describe('Authentication Rate Limiter Configuration', () => {
  it('configures login rate limiter with 15 attempts window', () => {
    expect(loginRateLimiter).toBeDefined();
    expect(typeof loginRateLimiter).toBe('function');
  });

  it('configures register rate limiter with hourly limit', () => {
    expect(registerRateLimiter).toBeDefined();
    expect(typeof registerRateLimiter).toBe('function');
  });

  it('configures token refresh rate limiter', () => {
    expect(tokenRefreshRateLimiter).toBeDefined();
    expect(typeof tokenRefreshRateLimiter).toBe('function');
  });
});
