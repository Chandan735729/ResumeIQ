/**
 * Proves the bypass requires the exact literal string "true" and cannot be
 * triggered accidentally by a truthy-looking value — a stray RATE_LIMIT_TEST_BYPASS=1
 * or a wrong-case value in a real environment must not silently disable the
 * production rate limit. Separate file so the imported middleware module (and
 * its counters) starts fresh.
 */
import express from 'express';
import request from 'supertest';

describe('Auth rate limiter — bypass requires an exact match', () => {
  it('stays enforced for near-miss values like "1" or "TRUE"', async () => {
    process.env.RATE_LIMIT_TEST_BYPASS = '1';

    const { registerRateLimiter } = await import('@middleware/authRateLimiter');
    const app = express();
    app.get('/test', registerRateLimiter, (_req, res) => res.status(200).json({ ok: true }));

    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get('/test');
      statuses.push(res.status);
    }

    expect(statuses[10]).toBe(429);
  });
});
