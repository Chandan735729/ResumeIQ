/**
 * Job Description & ATS Analysis Integration Tests
 *
 * Tests the complete JD ingestion, structured extraction, deterministic matching,
 * explainable ATS scoring, persistence, and authorization layer.
 */

import request from 'supertest';
import type { Application } from 'express';
import { prisma } from '../../src/services/prisma.service';

describe('Phase 4: Job Description & ATS Analysis Integration', () => {
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
      .send({
        email,
        name: `${prefix} User`,
        password,
      });

    expect(registerResponse.status).toBe(201);

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email,
        password,
      });

    expect(loginResponse.status).toBe(200);

    return {
      email,
      userId: registerResponse.body.data.id as string,
      accessToken: loginResponse.body.data.accessToken as string,
    };
  }

  async function createParsedResume(userId: string, skills: string[], experienceYears: number) {
    const extractedLayout = JSON.stringify({
      skills,
      experience: [
        {
          title: 'Software Engineer',
          company: 'Tech Corp',
          startDate: `${2024 - experienceYears}`,
          endDate: 'Present',
          isCurrent: true,
          bullets: [`Developed backend services using ${skills.join(', ')}.`],
          summary: 'Experienced engineer',
        },
      ],
      education: [
        {
          institution: 'University of Engineering',
          degree: 'Bachelor of Science in Computer Science',
          fieldOfStudy: 'Computer Science',
        },
      ],
      certifications: [
        {
          name: 'AWS Certified Solutions Architect',
          authority: 'Amazon Web Services',
        },
      ],
      projects: [],
      languages: [],
      sections: [],
      metadata: { pageCount: 1, hasMultipleColumns: false, hasTables: false, fonts: [], colors: [], layoutNotes: [] },
      warnings: [],
      parseConfidence: 0.95,
      resumeType: 'technical',
    });

    const resume = await prisma.resume.create({
      data: {
        userId,
        fileName: 'resume.pdf',
        fileSize: 1024,
        fileType: 'pdf',
        parseStatus: 'COMPLETED',
        extractedText: skills.join(' ') + ' Bachelor of Science in Computer Science AWS Certified Solutions Architect',
        extractedLayout,
      },
    });

    return resume;
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://resumeiq_user:resumeiq_pass@localhost:5432/resumeiq';
    process.env.JWT_SECRET = jwtSecret;
    process.env.FRONTEND_URL = 'http://localhost:3001';

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
    it('rejects unauthenticated JD creation', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .send({
          jobTitle: 'Backend Engineer',
          rawText: 'We need Python and AWS skills with 5+ years experience.',
        });

      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated JD listing', async () => {
      const res = await request(app).get('/api/jobs');
      expect(res.status).toBe(401);
    });

    it('prevents cross-user access to job descriptions', async () => {
      const userA = await registerAndLogin('userA');
      const userB = await registerAndLogin('userB');

      // User A creates JD
      const createRes = await request(app)
        .post('/api/jobs')
        .set(authHeader(userA.accessToken))
        .send({
          jobTitle: 'Senior Cloud Engineer',
          companyName: 'Cloud Inc',
          rawText: 'Looking for a Senior Cloud Engineer with AWS, Terraform, and Kubernetes experience. 5+ years required.',
        });

      expect(createRes.status).toBe(201);
      const jdId = createRes.body.data.id;

      // User B tries to view User A's JD
      const getRes = await request(app)
        .get(`/api/jobs/${jdId}`)
        .set(authHeader(userB.accessToken));

      expect(getRes.status).toBe(403);

      // User B tries to delete User A's JD
      const deleteRes = await request(app)
        .delete(`/api/jobs/${jdId}`)
        .set(authHeader(userB.accessToken));

      expect(deleteRes.status).toBe(403);
    });
  });

  describe('Job Description Ingestion & Validation', () => {
    it('validates required fields and length constraints', async () => {
      const user = await registerAndLogin('validator');

      // Missing title
      const resNoTitle = await request(app)
        .post('/api/jobs')
        .set(authHeader(user.accessToken))
        .send({
          jobTitle: '',
          rawText: 'Valid length text but missing a title for this test case here.',
        });
      expect(resNoTitle.status).toBe(400);

      // Text too short (< 50 chars)
      const resTooShort = await request(app)
        .post('/api/jobs')
        .set(authHeader(user.accessToken))
        .send({
          jobTitle: 'DevOps Lead',
          rawText: 'Short JD.',
        });
      expect(resTooShort.status).toBe(400);
    });

    it('creates and extracts structured requirements for a software engineer role', async () => {
      const user = await registerAndLogin('se_user');

      const jdText = `
Senior Software Engineer

Requirements:
- 5+ years of software development experience
- Proficiency in Python, TypeScript, and Node.js
- Experience with AWS and Docker
- Knowledge of PostgreSQL

Preferred Qualifications:
- Familiarity with Kubernetes and GraphQL

Education:
- Bachelor's degree in Computer Science required
      `;

      const res = await request(app)
        .post('/api/jobs')
        .set(authHeader(user.accessToken))
        .send({
          jobTitle: 'Senior Software Engineer',
          companyName: 'Acme Software',
          rawText: jdText,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.analysisStatus).toBe('completed');

      const structure = res.body.data.extractedStructure;
      expect(structure).not.toBeNull();
      expect(structure.seniorityLevel).toBe('senior');
      expect(structure.experience.minYears).toBe(5);
      expect(structure.education.degreeLevel).toBe('bachelor');

      const reqValues = structure.requirements.map((r: any) => r.value);
      expect(reqValues).toContain('python');
      expect(reqValues).toContain('typescript');
      expect(reqValues).toContain('aws');
      expect(reqValues).toContain('docker');
      expect(reqValues).toContain('postgresql');
    });

    it('lists user job descriptions with pagination', async () => {
      const user = await registerAndLogin('list_user');

      for (let i = 1; i <= 3; i++) {
        await request(app)
          .post('/api/jobs')
          .set(authHeader(user.accessToken))
          .send({
            jobTitle: `Role ${i}`,
            rawText: `This is a test job description for role number ${i} with enough text to pass validation.`,
          });
      }

      const listRes = await request(app)
        .get('/api/jobs?limit=2&offset=0')
        .set(authHeader(user.accessToken));

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.jobDescriptions.length).toBe(2);
      expect(listRes.body.data.pagination.total).toBe(3);
      expect(listRes.body.data.pagination.hasMore).toBe(true);
    });

    it('deletes job description successfully', async () => {
      const user = await registerAndLogin('del_user');

      const createRes = await request(app)
        .post('/api/jobs')
        .set(authHeader(user.accessToken))
        .send({
          jobTitle: 'Temporary Role',
          rawText: 'This is a test job description that will be deleted shortly after creation.',
        });

      const jdId = createRes.body.data.id;

      const delRes = await request(app)
        .delete(`/api/jobs/${jdId}`)
        .set(authHeader(user.accessToken));

      expect(delRes.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/jobs/${jdId}`)
        .set(authHeader(user.accessToken));

      expect(getRes.status).toBe(404);
    });
  });

  describe('ATS Analysis Pipeline & Explainable Scoring', () => {
    it('performs deterministic ATS match and score for a well-matched candidate', async () => {
      const user = await registerAndLogin('ats_candidate');

      // Create parsed resume with high alignment
      const resume = await createParsedResume(
        user.userId,
        ['Python', 'TypeScript', 'AWS', 'Docker', 'Kubernetes', 'PostgreSQL'],
        6,
      );

      // Create JD
      const jdRes = await request(app)
        .post('/api/jobs')
        .set(authHeader(user.accessToken))
        .send({
          jobTitle: 'Senior Full Stack Engineer',
          companyName: 'TechCorp',
          rawText: `
Senior Full Stack Engineer
Requirements:
- 5+ years of experience
- Python and TypeScript
- AWS and Docker
- PostgreSQL
Education: Bachelor's degree in Computer Science required
          `,
        });

      const jdId = jdRes.body.data.id;

      // Run ATS Analysis
      const analyzeRes = await request(app)
        .post(`/api/jobs/${jdId}/analyze`)
        .set(authHeader(user.accessToken))
        .send({ resumeId: resume.id });

      expect(analyzeRes.status).toBe(200);
      expect(analyzeRes.body.success).toBe(true);

      const data = analyzeRes.body.data;
      expect(data.overallScore).toBeGreaterThanOrEqual(75);
      expect(['strong', 'good']).toContain(data.interpretation);
      expect(data.scoreBreakdown).toHaveProperty('skills');
      expect(data.scoreBreakdown).toHaveProperty('technology');
      expect(data.scoreBreakdown).toHaveProperty('experience');
      expect(data.scoreBreakdown).toHaveProperty('education');

      // Check matched evidence
      expect(data.matched.length).toBeGreaterThan(0);
      const pythonMatch = data.matched.find((m: any) => m.requirement === 'python');
      expect(pythonMatch).toBeDefined();
      expect(pythonMatch.evidence).not.toBeNull();

      // Retrieve saved result via GET
      const getResultRes = await request(app)
        .get(`/api/jobs/${jdId}/results/${resume.id}`)
        .set(authHeader(user.accessToken));

      expect(getResultRes.status).toBe(200);
      expect(getResultRes.body.data.overallScore).toBe(data.overallScore);
    });

    it('identifies missing skills and produces actionable recommendations', async () => {
      const user = await registerAndLogin('gaps_candidate');

      // Resume with gaps
      const resume = await createParsedResume(user.userId, ['HTML', 'CSS', 'JavaScript'], 2);

      // JD with advanced requirements
      const jdRes = await request(app)
        .post('/api/jobs')
        .set(authHeader(user.accessToken))
        .send({
          jobTitle: 'Cloud Architect',
          companyName: 'Enterprise Cloud',
          rawText: `
Cloud Architect
Requirements:
- 8+ years of cloud architecture experience
- Kubernetes and Terraform required
- Python and Golang required
- AWS and Azure
          `,
        });

      const jdId = jdRes.body.data.id;

      const analyzeRes = await request(app)
        .post(`/api/jobs/${jdId}/analyze`)
        .set(authHeader(user.accessToken))
        .send({ resumeId: resume.id });

      expect(analyzeRes.status).toBe(200);
      const data = analyzeRes.body.data;

      // Lower score due to missing skills
      expect(data.overallScore).toBeLessThan(65);
      expect(data.missing.length).toBeGreaterThan(0);

      const missingNames = data.missing.map((m: any) => m.requirement);
      expect(missingNames).toContain('kubernetes');
      expect(missingNames).toContain('terraform');

      // Recommendations should advise adding missing skills
      expect(data.recommendations.length).toBeGreaterThan(0);
    });

    it('rejects analysis if resume belongs to another user', async () => {
      const userA = await registerAndLogin('ownerA');
      const userB = await registerAndLogin('ownerB');

      const resumeA = await createParsedResume(userA.userId, ['Python'], 3);

      const jdResB = await request(app)
        .post('/api/jobs')
        .set(authHeader(userB.accessToken))
        .send({
          jobTitle: 'Software Engineer',
          rawText: 'We need Python and JavaScript developers for our backend platform.',
        });

      // User B attempts to analyze using User A's resume
      const analyzeRes = await request(app)
        .post(`/api/jobs/${jdResB.body.data.id}/analyze`)
        .set(authHeader(userB.accessToken))
        .send({ resumeId: resumeA.id });

      expect(analyzeRes.status).toBe(403);
    });
  });
});
