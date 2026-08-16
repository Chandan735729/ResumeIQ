/**
 * Resume Versions & Document Generation Integration Tests
 *
 * Tests the complete product workflow:
 * Resume -> Optimization -> Version Creation -> Listing -> Detail -> Comparison -> PDF Download -> DOCX Download -> Deletion -> Cross-User Isolation
 */

import request from 'supertest';
import type { Application } from 'express';
import { prisma } from '../../src/services/prisma.service';
import { setAIProvider } from '../../src/modules/optimization/optimization.service';
import { MockAIProvider } from '../../src/services/ai/mockAIProvider';

describe('Phase 6: Resume Versions & Document Generation Integration', () => {
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
          company: 'Tech Innovators',
          startDate: '2021',
          endDate: 'Present',
          isCurrent: true,
          bullets: [
            'Architected microservices using Python and PostgreSQL.',
            'Improved query performance by 30% through index optimization.',
          ],
        },
      ],
      education: [
        {
          institution: 'State University',
          degree: 'Bachelor of Science in Computer Science',
        },
      ],
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
        fileName: 'alex_rivera_resume.pdf',
        fileSize: 2048,
        fileType: 'pdf',
        parseStatus: 'COMPLETED',
        extractedText: 'Backend Engineer at Tech Innovators. Architected microservices using Python and PostgreSQL. Improved query performance by 30%. Bachelor of Science in Computer Science.',
        extractedLayout,
      },
    });
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
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

  describe('End-to-End Product Workflow', () => {
    it('executes complete workflow: optimization -> version listing -> comparison -> download PDF/DOCX -> deletion', async () => {
      const user = await registerAndLogin('product_workflow');
      const resume = await createParsedResume(user.userId, ['Python', 'PostgreSQL']);

      // 1. Create Job Description
      const jdRes = await request(app)
        .post('/api/jobs')
        .set(authHeader(user.accessToken))
        .send({
          jobTitle: 'Senior Python Engineer',
          companyName: 'Cloud Solutions Inc',
          rawText: 'Looking for a Senior Python Engineer with 4+ years experience in Python, PostgreSQL, and REST API development.',
        });

      expect(jdRes.status).toBe(201);
      const jdId = jdRes.body.data.id;

      // 2. Run Safe AI Optimization
      const optRes = await request(app)
        .post('/api/optimization/optimize')
        .set(authHeader(user.accessToken))
        .send({
          resumeId: resume.id,
          jobDescriptionId: jdId,
          optimizationType: 'ats_focused',
        });

      expect(optRes.status).toBe(200);
      const versionId = optRes.body.data.versionId;
      expect(versionId).toBeDefined();

      // 3. List Versions
      const listRes = await request(app)
        .get(`/api/resumes/${resume.id}/versions`)
        .set(authHeader(user.accessToken));

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.versions.length).toBe(1);
      expect(listRes.body.data.versions[0].id).toBe(versionId);
      expect(listRes.body.data.versions[0].versionNumber).toBe(1);

      // 4. Get Version Detail
      const detailRes = await request(app)
        .get(`/api/resumes/${resume.id}/versions/${versionId}`)
        .set(authHeader(user.accessToken));

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.id).toBe(versionId);
      expect(detailRes.body.data.optimizedText).toBeDefined();
      expect(detailRes.body.data.aiChanges.length).toBeGreaterThan(0);

      // 5. Compare Version Against Original
      const compRes = await request(app)
        .get(`/api/resumes/${resume.id}/versions/${versionId}/compare`)
        .set(authHeader(user.accessToken));

      expect(compRes.status).toBe(200);
      expect(compRes.body.data.versionId).toBe(versionId);
      expect(compRes.body.data.originalText).toContain('Tech Innovators');
      expect(compRes.body.data.optimizedText).toContain('Tech Innovators');
      expect(compRes.body.data).toHaveProperty('beforeScore');
      expect(compRes.body.data).toHaveProperty('afterScore');
      expect(compRes.body.data).toHaveProperty('scoreDelta');

      // 6. Download PDF Version
      const pdfRes = await request(app)
        .get(`/api/resumes/${resume.id}/versions/${versionId}/download?format=pdf`)
        .set(authHeader(user.accessToken));

      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers['content-type']).toBe('application/pdf');
      expect(pdfRes.headers['content-disposition']).toContain('attachment');
      expect(pdfRes.body.length).toBeGreaterThan(500);

      // 7. Download DOCX Version
      const docxRes = await request(app)
        .get(`/api/resumes/${resume.id}/versions/${versionId}/download?format=docx`)
        .set(authHeader(user.accessToken));

      expect(docxRes.status).toBe(200);
      expect(docxRes.headers['content-type']).toContain('wordprocessingml.document');
      expect(docxRes.headers['content-disposition']).toContain('attachment');
      expect(docxRes.body.length).toBeGreaterThan(500);

      // 8. Delete Version
      const delRes = await request(app)
        .delete(`/api/resumes/${resume.id}/versions/${versionId}`)
        .set(authHeader(user.accessToken));

      expect(delRes.status).toBe(200);

      // Verify deletion in DB
      const checkRes = await request(app)
        .get(`/api/resumes/${resume.id}/versions/${versionId}`)
        .set(authHeader(user.accessToken));

      expect(checkRes.status).toBe(404);
    });
  });

  describe('Security & User Isolation (IDOR Protection)', () => {
    it('prevents User B from accessing, comparing, or downloading User A resume versions', async () => {
      const userA = await registerAndLogin('user_a');
      const userB = await registerAndLogin('user_b');

      const resumeA = await createParsedResume(userA.userId, ['Python']);

      const versionA = await prisma.resumeVersion.create({
        data: {
          resumeId: resumeA.id,
          versionNumber: 1,
          optimizationType: 'conservative',
          optimizedText: 'Optimized text for user A',
          aiChanges: '[]',
          isValid: true,
          matchScore: 80,
          atsScore: 80,
          recruiterScore: 80,
          overallScore: 80,
        },
      });

      // User B tries to list User A's versions
      const listRes = await request(app)
        .get(`/api/resumes/${resumeA.id}/versions`)
        .set(authHeader(userB.accessToken));
      expect(listRes.status).toBe(403);

      // User B tries to get User A's version detail
      const detailRes = await request(app)
        .get(`/api/resumes/${resumeA.id}/versions/${versionA.id}`)
        .set(authHeader(userB.accessToken));
      expect(detailRes.status).toBe(403);

      // User B tries to compare User A's version
      const compRes = await request(app)
        .get(`/api/resumes/${resumeA.id}/versions/${versionA.id}/compare`)
        .set(authHeader(userB.accessToken));
      expect(compRes.status).toBe(403);

      // User B tries to download User A's version
      const dlRes = await request(app)
        .get(`/api/resumes/${resumeA.id}/versions/${versionA.id}/download?format=pdf`)
        .set(authHeader(userB.accessToken));
      expect(dlRes.status).toBe(403);

      // User B tries to delete User A's version
      const delRes = await request(app)
        .delete(`/api/resumes/${resumeA.id}/versions/${versionA.id}`)
        .set(authHeader(userB.accessToken));
      expect(delRes.status).toBe(403);
    });
  });
});
