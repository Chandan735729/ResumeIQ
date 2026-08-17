/**
 * Stale-Score Prevention Regression Test (real-parser-driven)
 *
 * Root cause this guards against: `compareVersion()` (versions.service.ts)
 * used to read `OptimizationMetrics.atsCompatibilityScore` -- which is
 * populated with the AFTER-optimization score, not the before score -- as
 * the "original" score for its before/after comparison. Since both sides of
 * that comparison were therefore the same value, EVERY version's "Changelog
 * & ATS Score Impact" page showed a 0.0 delta regardless of what
 * optimization actually changed. Fixed by persisting a real `beforeScore` on
 * `ResumeVersion` at optimization time and reading that field instead.
 *
 * This test proves, against a real fixture resume processed through the
 * actual public API (upload -> optimize -> compare), that:
 *  1. The /compare endpoint reports the SAME beforeScore as the original
 *     optimize response (not a stale/wrong substitute).
 *  2. Calling /compare repeatedly returns a stable, non-zero delta when the
 *     optimization actually changed evaluated content (ats_focused mode,
 *     which promotes an evidenced-but-unlisted skill -- see mockAIProvider.ts).
 *  3. Mode differentiation is real: ats_focused's score delta is >=
 *     conservative's on the same resume/JD pairing.
 */

import fs from 'fs';
import path from 'path';
import request from 'supertest';
import type { Application } from 'express';
import { prisma } from '../../src/services/prisma.service';
import { setAIProvider } from '../../src/modules/optimization/optimization.service';
import { MockAIProvider } from '../../src/services/ai/mockAIProvider';

describe('Stale-Score Prevention (real-parser-driven)', () => {
  const password = 'ValidPass123!';
  const jwtSecret = 'integration-test-secret-value-that-is-long-enough-1234567890';
  let app: Application;

  const uniqueEmail = (prefix: string) =>
    `${prefix}.${Date.now()}.${Math.random().toString(16).slice(2)}@resumeiq.dev`;
  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function resetDatabase() {
    await prisma.auditLog.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.originalFile.deleteMany();
    await prisma.optimizationMetrics.deleteMany();
    await prisma.matchResult.deleteMany();
    await prisma.jobDescription.deleteMany();
    await prisma.resumeVersion.deleteMany();
    await prisma.resume.deleteMany();
    await prisma.apiUsageLog.deleteMany();
    await prisma.user.deleteMany();
  }

  async function registerAndLogin(prefix: string) {
    const email = uniqueEmail(prefix);
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({ email, name: `${prefix} User`, password });
    expect(registerResponse.status).toBe(201);
    const loginResponse = await request(app).post('/api/auth/login').send({ email, password });
    expect(loginResponse.status).toBe(200);
    return { accessToken: loginResponse.body.data.accessToken as string };
  }

  // Same JD text used by the manual real-data QA sweep (tests/scripts/exportRealDataQA.ts),
  // which reliably produces a real ats_focused score delta on this specific fixture.
  const JD_TEXT = `We are hiring a Software Engineer. Required skills: Python, JavaScript, SQL, Git, communication,
problem solving, project management, data analysis, teamwork, leadership. 3+ years of experience preferred.
Bachelor's degree in Computer Science or related field.`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT_TEST_BYPASS = 'true';
    process.env.DATABASE_URL = 'postgresql://resumeiq_user:resumeiq_pass@localhost:5432/resumeiq';
    process.env.JWT_SECRET = jwtSecret;
    process.env.FRONTEND_URL = 'http://localhost:3001';
    process.env.STORAGE_BASE_DIR = './storage_test';

    setAIProvider(new MockAIProvider('success_standard'));
    app = (await import('../../src/app')).default;
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  async function uploadFixtureAndCreateJD(userId_token: string) {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'real-world-resumes', 'fau-engineering-resume.pdf');
    const uploadRes = await request(app)
      .post('/api/resumes/upload')
      .set(authHeader(userId_token))
      .attach('file', fs.readFileSync(fixturePath), 'fau-engineering-resume.pdf');
    expect(uploadRes.status).toBe(201);

    const jdRes = await request(app)
      .post('/api/jobs')
      .set(authHeader(userId_token))
      .send({ jobTitle: 'Software Engineer', companyName: 'Acme Inc', rawText: JD_TEXT });
    expect(jdRes.status).toBe(201);

    return { resumeId: uploadRes.body.data.resumeId as string, jdId: jdRes.body.data.id as string };
  }

  it('compare endpoint reports the same non-zero beforeScore as the optimize response, not a stale substitute', async () => {
    const user = await registerAndLogin('stale_score_qa');
    const { resumeId, jdId } = await uploadFixtureAndCreateJD(user.accessToken);

    const optRes = await request(app)
      .post('/api/optimization/optimize')
      .set(authHeader(user.accessToken))
      .send({ resumeId, jobDescriptionId: jdId, optimizationType: 'ats_focused' });
    expect(optRes.status).toBe(200);
    const versionId = optRes.body.data.versionId as string;

    // This specific fixture/JD pairing is known (from the manual QA sweep) to
    // produce a real ats_focused score improvement via evidenced-skill promotion.
    expect(optRes.body.data.scoreDelta).toBeGreaterThan(0);
    const optimizeBeforeScore = optRes.body.data.beforeScore;
    const optimizeAfterScore = optRes.body.data.afterScore;

    const compareRes1 = await request(app)
      .get(`/api/resumes/${resumeId}/versions/${versionId}/compare`)
      .set(authHeader(user.accessToken));
    expect(compareRes1.status).toBe(200);

    // The regression this guards against: compare() used to report
    // beforeScore === afterScore (both equal to the after-optimization
    // score), making scoreDelta always 0 regardless of what changed.
    expect(compareRes1.body.data.beforeScore).toBe(optimizeBeforeScore);
    expect(compareRes1.body.data.afterScore).toBe(optimizeAfterScore);
    expect(compareRes1.body.data.scoreDelta).toBeGreaterThan(0);
    expect(compareRes1.body.data.beforeScore).not.toBe(compareRes1.body.data.afterScore);

    // Calling compare again must be stable (not recomputed differently each time).
    const compareRes2 = await request(app)
      .get(`/api/resumes/${resumeId}/versions/${versionId}/compare`)
      .set(authHeader(user.accessToken));
    expect(compareRes2.body.data.beforeScore).toBe(compareRes1.body.data.beforeScore);
    expect(compareRes2.body.data.afterScore).toBe(compareRes1.body.data.afterScore);
    expect(compareRes2.body.data.scoreDelta).toBe(compareRes1.body.data.scoreDelta);
  }, 30000);

  it('mode differentiation is real: ats_focused score delta >= conservative score delta on the same resume/JD', async () => {
    const user = await registerAndLogin('mode_diff_qa');

    const { resumeId: resumeIdConservative, jdId: jdIdConservative } = await uploadFixtureAndCreateJD(user.accessToken);
    const conservativeRes = await request(app)
      .post('/api/optimization/optimize')
      .set(authHeader(user.accessToken))
      .send({ resumeId: resumeIdConservative, jobDescriptionId: jdIdConservative, optimizationType: 'conservative' });
    expect(conservativeRes.status).toBe(200);

    const { resumeId: resumeIdAts, jdId: jdIdAts } = await uploadFixtureAndCreateJD(user.accessToken);
    const atsRes = await request(app)
      .post('/api/optimization/optimize')
      .set(authHeader(user.accessToken))
      .send({ resumeId: resumeIdAts, jobDescriptionId: jdIdAts, optimizationType: 'ats_focused' });
    expect(atsRes.status).toBe(200);

    expect(atsRes.body.data.scoreDelta).toBeGreaterThanOrEqual(conservativeRes.body.data.scoreDelta);
    expect(conservativeRes.body.data.scoreDelta).toBe(0);
    expect(atsRes.body.data.scoreDelta).toBeGreaterThan(0);
  }, 30000);
});
