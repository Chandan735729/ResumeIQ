/**
 * Proves the production auth rate limits are actually enforced when
 * RATE_LIMIT_TEST_BYPASS is not set. Runs in its own file so the dynamically
 * imported middleware module (and its internal request counters) starts fresh,
 * independent of any other suite that sets the bypass flag.
 */
import express from 'express';
import request from 'supertest';

describe('Auth rate limiter — production default (no bypass)', () => {
  it('rejects the 11th registration attempt within the window with 429', async () => {
    delete process.env.RATE_LIMIT_TEST_BYPASS;

    const { registerRateLimiter } = await import('@middleware/authRateLimiter');
    const app = express();
    app.get('/test', registerRateLimiter, (_req, res) => res.status(200).json({ ok: true }));

    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get('/test');
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 10)).toEqual(new Array(10).fill(200));
    expect(statuses[10]).toBe(429);
  });
});
