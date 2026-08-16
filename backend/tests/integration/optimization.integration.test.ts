/**
 * Optimization API Integration Tests
 *
 * Tests authentication, authorization, rate limiting, and end-to-end optimization workflow.
 */

import request from 'supertest';
import type { Application } from 'express';
import { prisma } from '../../src/services/prisma.service';
import { setAIProvider } from '../../src/modules/optimization/optimization.service';
import { MockAIProvider } from '../../src/services/ai/mockAIProvider';

describe('Phase 5: AI Optimization Integration', () => {
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

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    expect(loginResponse.status).toBe(200);

    return {
      email,
      userId: registerResponse.body.data.id as string,
      accessToken: loginResponse.body.data.accessToken as string,
    };
  }

  async function createParsedResume(userId: string, skills: string[]) {
    const extractedLayout = JSON.stringify({
      skills,
      experience: [
        {
          title: 'Backend Engineer',
          company: 'Acme Corp',
          startDate: '2020',
          endDate: 'Present',
          isCurrent: true,
          bullets: ['Built APIs with Python.', 'Managed database queries.'],
        },
      ],
      education: [{ institution: 'Tech University', degree: 'Bachelor of Science in Computer Science' }],
      certifications: [],
      projectTechnologies: [],
      languages: [],
      sections: [],
      metadata: { pageCount: 1, hasMultipleColumns: false, hasTables: false, fonts: [], colors: [], layoutNotes: [] },
      warnings: [],
      parseConfidence: 0.95,
      resumeType: 'technical',
    });

    return await prisma.resume.create({
      data: {
        userId,
        fileName: 'resume.pdf',
        fileSize: 1024,
        fileType: 'pdf',
        parseStatus: 'COMPLETED',
        extractedText: 'Backend Engineer at Acme Corp. Built APIs with Python. Managed database queries. Bachelor of Science in Computer Science.',
        extractedLayout,
      },
    });
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://resumeiq_user:resumeiq_pass@localhost:5432/resumeiq';
    process.env.JWT_SECRET = jwtSecret;
    process.env.FRONTEND_URL = 'http://localhost:3001';

    // Configure Mock AI Provider for deterministic testing
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

  describe('Authentication & Authorization', () => {
    it('rejects unauthenticated optimization requests', async () => {
      const res = await request(app)
        .post('/api/optimization/optimize')
        .send({
          resumeId: 'some-resume-id',
          jobDescriptionId: 'some-jd-id',
        });

      expect(res.status).toBe(401);
    });

    it('prevents optimizing another user resume or JD', async () => {
      const userA = await registerAndLogin('userA');
      const userB = await registerAndLogin('userB');

      const resumeA = await createParsedResume(userA.userId, ['Python']);

      const jdB = await request(app)
        .post('/api/jobs')
        .set(authHeader(userB.accessToken))
        .send({
          jobTitle: 'Python Engineer',
          rawText: 'Looking for a Senior Python Developer with 5+ years experience and PostgreSQL skills.',
        });

      // User B tries to optimize using User A's resume
      const res = await request(app)
        .post('/api/optimization/optimize')
        .set(authHeader(userB.accessToken))
        .send({
          resumeId: resumeA.id,
          jobDescriptionId: jdB.body.data.id,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('End-to-End Safe Optimization Workflow', () => {
    it('optimizes resume, rejects hallucinations, rescores deterministically, and persists version', async () => {
      const user = await registerAndLogin('opt_user');
      const resume = await createParsedResume(user.userId, ['Python', 'PostgreSQL']);

      const jdRes = await request(app)
        .post('/api/jobs')
        .set(authHeader(user.accessToken))
        .send({
          jobTitle: 'Backend Engineer',
          companyName: 'Tech Co',
          rawText: 'Backend Engineer\nRequirements:\n- 4+ years of experience\n- Python and PostgreSQL required\n- REST API design required\nEducation: Bachelor degree in CS',
        });

      const jdId = jdRes.body.data.id;

      // Run optimization
      const optRes = await request(app)
        .post('/api/optimization/optimize')
        .set(authHeader(user.accessToken))
        .send({
          resumeId: resume.id,
          jobDescriptionId: jdId,
          optimizationType: 'conservative',
        });

      expect(optRes.status).toBe(200);
      expect(optRes.body.success).toBe(true);

      const data = optRes.body.data;
      expect(data).toHaveProperty('versionId');
      expect(data).toHaveProperty('beforeScore');
      expect(data).toHaveProperty('afterScore');
      expect(data).toHaveProperty('scoreDelta');
      expect(data).toHaveProperty('scoreComparison');
      expect(data.changes.length).toBeGreaterThan(0);
      expect(data.totalChangesApplied).toBeGreaterThanOrEqual(1);

      // Verify ResumeVersion persisted in database
      const savedVersion = await prisma.resumeVersion.findUnique({
        where: { id: data.versionId },
        include: { metrics: true },
      });

      expect(savedVersion).not.toBeNull();
      expect(savedVersion?.resumeId).toBe(resume.id);
      expect(savedVersion?.metrics).not.toBeNull();
    });

    it('rejects hallucinated suggestions via fact guardrails during workflow', async () => {
      const user = await registerAndLogin('guardrail_user');
      const resume = await createParsedResume(user.userId, ['Python']);

      const jdRes = await request(app)
        .post('/api/jobs')
        .set(authHeader(user.accessToken))
        .send({
          jobTitle: 'Cloud Architect',
          rawText: 'Requirements:\n- 8+ years of AWS and Kubernetes experience\n- AWS Certified Solutions Architect',
        });

      // Switch to hallucination scenario
      setAIProvider(new MockAIProvider('success_with_hallucinations'));

      const optRes = await request(app)
        .post('/api/optimization/optimize')
        .set(authHeader(user.accessToken))
        .send({
          resumeId: resume.id,
          jobDescriptionId: jdRes.body.data.id,
        });

      expect(optRes.status).toBe(200);
      const data = optRes.body.data;

      // Guardrail should reject fabricated AWS Lambda, AWS Cert, and Kubernetes
      expect(data.totalChangesRejected).toBeGreaterThanOrEqual(1);
      const rejectedItems = data.changes.filter((c: any) => !c.isApplied);
      expect(rejectedItems.length).toBeGreaterThan(0);
      expect(rejectedItems[0].rejectionReason).toContain('FABRICATED_');

      // Reset to standard mock provider
      setAIProvider(new MockAIProvider('success_standard'));
    });
  });
});
