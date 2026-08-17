/**
 * Proves the test-only bypass works when explicitly enabled — separate file
 * from authRateLimiter.enforced.test.ts so the dynamically imported middleware
 * module starts fresh and isn't affected by requests fired in other suites.
 */
import express from 'express';
import request from 'supertest';

describe('Auth rate limiter — explicit test bypass', () => {
  it('allows far more than 10 registrations when RATE_LIMIT_TEST_BYPASS="true" is explicitly set', async () => {
    process.env.RATE_LIMIT_TEST_BYPASS = 'true';

    const { registerRateLimiter } = await import('@middleware/authRateLimiter');
    const app = express();
    app.get('/test', registerRateLimiter, (_req, res) => res.status(200).json({ ok: true }));

    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get('/test');
      statuses.push(res.status);
    }

    expect(statuses).toEqual(new Array(25).fill(200));
  });
});
