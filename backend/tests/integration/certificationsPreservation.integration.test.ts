/**
 * Certifications Preservation Regression Test (SYNTHETIC fixture)
 *
 * IMPORTANT: none of the repo's 11 real-world fixture resumes contain a
 * certifications section (confirmed: cert count = 0 across all of them in
 * the real-data QA sweep). This test therefore uses a hand-built, clearly
 * synthetic extractedLayout -- the same pattern versions.integration.test.ts
 * already uses for its DB fixtures -- to prove certifications survive
 * parse -> optimize (all 3 modes) -> PDF -> DOCX -> reparse.
 *
 * Certification fields covered: name, authority, date -- the only fields the
 * current parser data model (ICertificationItem) captures. `credentialId`
 * and a certification URL do NOT exist anywhere in the parser/type system
 * today; that is a data-model gap, documented in the final report, not
 * something this test can exercise.
 */

import request from 'supertest';
import type { Application } from 'express';
import { prisma } from '../../src/services/prisma.service';
import { extractPdfText } from '../../src/services/resumeParser.service';
import mammoth from 'mammoth';
import { setAIProvider } from '../../src/modules/optimization/optimization.service';
import { MockAIProvider } from '../../src/services/ai/mockAIProvider';
import type { OptimizationType } from '../../src/modules/optimization/optimization.types';

describe('Certifications Preservation (synthetic fixture)', () => {
  const password = 'ValidPass123!';
  const jwtSecret = 'integration-test-secret-value-that-is-long-enough-1234567890';

  let app: Application;

  const uniqueEmail = (prefix: string) =>
    `${prefix}.${Date.now()}.${Math.random().toString(16).slice(2)}@resumeiq.dev`;
  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  function binaryParser(res: any, callback: (err: Error | null, body: Buffer) => void) {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  }

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
    return {
      userId: registerResponse.body.data.id as string,
      accessToken: loginResponse.body.data.accessToken as string,
    };
  }

  const CERTIFICATIONS = [
    { name: 'AWS Certified Solutions Architect', authority: 'Amazon Web Services', date: 'Jun 2022' },
    { name: 'Certified Kubernetes Administrator', authority: 'CNCF', date: 'Jan 2023' },
  ];

  async function createParsedResumeWithCertifications(userId: string) {
    const extractedLayout = JSON.stringify({
      contact: { fullName: 'Certified Candidate', email: 'certified.candidate@example.com', otherLinks: [] },
      skills: ['Java', 'Kubernetes', 'AWS'],
      experience: [
        {
          title: 'Cloud Engineer',
          company: 'CloudWorks',
          startDate: '2021',
          endDate: 'Present',
          isCurrent: true,
          bullets: ['Managed AWS infrastructure for production workloads.'],
        },
      ],
      education: [{ institution: 'State University', degree: 'Bachelor of Science in Computer Science' }],
      certifications: CERTIFICATIONS,
      projectTechnologies: [],
      languages: [],
      sections: [
        { name: 'Skills', type: 'skills' },
        { name: 'Experience', type: 'experience' },
        { name: 'Education', type: 'education' },
        { name: 'Certifications', type: 'certifications' },
      ],
      metadata: { pageCount: 1, hasMultipleColumns: false, hasTables: false, fonts: [], colors: [], layoutNotes: [] },
      warnings: [],
      parseConfidence: 0.95,
      resumeType: 'technical',
    });

    return prisma.resume.create({
      data: {
        userId,
        fileName: 'certified_candidate_resume.pdf',
        fileSize: 2048,
        fileType: 'pdf',
        parseStatus: 'COMPLETED',
        extractedText:
          'Certified Candidate. Cloud Engineer at CloudWorks. Managed AWS infrastructure for production workloads. ' +
          'AWS Certified Solutions Architect - Amazon Web Services. Certified Kubernetes Administrator - CNCF.',
        extractedLayout,
      },
    });
  }

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

  const MODES: OptimizationType[] = ['conservative', 'ats_focused', 'recruiter_focused'];

  it.each(MODES)('preserves certification name, authority, and date in PDF and DOCX for %s mode', async mode => {
    const user = await registerAndLogin('cert_qa');
    const resume = await createParsedResumeWithCertifications(user.userId);

    const jdRes = await request(app)
      .post('/api/jobs')
      .set(authHeader(user.accessToken))
      .send({
        jobTitle: 'Cloud Engineer',
        companyName: 'Acme Cloud',
        rawText: 'Looking for a Cloud Engineer with AWS and Kubernetes experience.',
      });
    expect(jdRes.status).toBe(201);

    const optRes = await request(app)
      .post('/api/optimization/optimize')
      .set(authHeader(user.accessToken))
      .send({ resumeId: resume.id, jobDescriptionId: jdRes.body.data.id, optimizationType: mode });
    expect(optRes.status).toBe(200);
    const versionId = optRes.body.data.versionId as string;

    const pdfRes = await request(app)
      .get(`/api/resumes/${resume.id}/versions/${versionId}/download?format=pdf`)
      .set(authHeader(user.accessToken))
      .buffer(true)
      .parse(binaryParser);
    expect(pdfRes.status).toBe(200);
    const pdfText = (await extractPdfText(pdfRes.body as Buffer)).rawText.toLowerCase();

    const docxRes = await request(app)
      .get(`/api/resumes/${resume.id}/versions/${versionId}/download?format=docx`)
      .set(authHeader(user.accessToken))
      .buffer(true)
      .parse(binaryParser);
    expect(docxRes.status).toBe(200);
    const docxText = (await mammoth.extractRawText({ buffer: docxRes.body as Buffer })).value.toLowerCase();

    for (const cert of CERTIFICATIONS) {
      for (const text of [pdfText, docxText]) {
        expect(text).toContain(cert.name.toLowerCase());
        expect(text).toContain(cert.authority.toLowerCase());
        expect(text).toContain(cert.date.toLowerCase());
      }
    }
  }, 30000);
});
