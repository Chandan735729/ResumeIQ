import fs from 'fs/promises';
import path from 'path';
import request from 'supertest';
import type { Application } from 'express';
import { prisma } from '../../src/services/prisma.service';
import { createPdfBuffer } from '../helpers/documentFactories';

describe('Phase 3 upload and lifecycle integration', () => {
  const password = 'ValidPass123!';
  const jwtSecret = 'integration-test-secret-value-that-is-long-enough-1234567890';
  const storageDir = path.resolve(__dirname, '../tmp-storage-upload');

  let app: Application;

  const uniqueEmail = (prefix: string) => `${prefix}.${Date.now()}.${Math.random().toString(16).slice(2)}@resumeiq.dev`;

  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  // fs/promises has no pathExists (that's an fs-extra API); fs.access resolving/
  // rejecting is the standard fs/promises equivalent boolean check.
  const pathExists = (target: string) => fs.access(target).then(() => true).catch(() => false);

  async function resetDatabase() {
    await prisma.auditLog.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.originalFile.deleteMany();
    await prisma.optimizationMetrics.deleteMany();
    await prisma.jobDescription.deleteMany();
    await prisma.resumeVersion.deleteMany();
    await prisma.resume.deleteMany();
    await prisma.apiUsageLog.deleteMany();
    await prisma.user.deleteMany();
  }

  async function resetStorage() {
    await fs.rm(storageDir, { recursive: true, force: true });
    await fs.mkdir(storageDir, { recursive: true });
  }

  async function registerAndLogin(prefix: string) {
    const email = uniqueEmail(prefix);
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        name: 'Test User',
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

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    // This suite registers many fresh users; without an explicit bypass the
    // real 10/hour production register limit gets exhausted mid-suite.
    process.env.RATE_LIMIT_TEST_BYPASS = 'true';
    process.env.DATABASE_URL = 'postgresql://resumeiq_user:resumeiq_pass@localhost:5432/resumeiq';
    process.env.JWT_SECRET = jwtSecret;
    process.env.STORAGE_BASE_DIR = storageDir;
    process.env.FRONTEND_URL = 'http://localhost:3001';

    app = (await import('../../src/app')).default;
    await resetStorage();
  });

  beforeEach(async () => {
    await resetDatabase();
    await resetStorage();
  });

  afterAll(async () => {
    await resetDatabase();
    await fs.rm(storageDir, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it('rejects unauthenticated uploads', async () => {
    const buffer = await createPdfBuffer([['Unauthenticated upload']]);

    const response = await request(app)
      .post('/api/resumes/upload')
      .attach('file', buffer, 'resume.pdf');

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Missing authorization token');
  });

  it('rejects legacy .doc uploads explicitly', async () => {
    const buffer = await createPdfBuffer([['Legacy doc upload']]);
    const user = await registerAndLogin('upload-doc');

    // Explicit contentType so this exercises the extension-specific validator
    // in uploads.validation.ts (UNSUPPORTED_EXTENSION), not multer's broader
    // MIME-type fileFilter — without it, supertest infers "application/msword"
    // from the .doc filename, which multer's fileFilter rejects first with a
    // generic "Unsupported file type" message, never reaching the extension
    // check this test is actually named for. This mirrors a real case: a file
    // renamed to .doc while its actual bytes/MIME still look like a PDF.
    const response = await request(app)
      .post('/api/resumes/upload')
      .set(authHeader(user.accessToken))
      .attach('file', buffer, { filename: 'legacy.doc', contentType: 'application/pdf' });

    // This reaches uploadService's deeper validateFile() check, which wraps
    // field errors via sendValidationError — the outer body.message is the
    // generic "File validation failed"; the specific reason is in errors[].
    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNSUPPORTED_EXTENSION',
          message: expect.stringContaining('Unsupported file extension'),
        }),
      ])
    );
  });

  it('rejects invalid MIME types before storage', async () => {
    const buffer = await createPdfBuffer([['Invalid MIME upload']]);
    const user = await registerAndLogin('upload-mime');

    const response = await request(app)
      .post('/api/resumes/upload')
      .set(authHeader(user.accessToken))
      .attach('file', buffer, {
        filename: 'resume.pdf',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Unsupported file type');
  });

  it('rejects invalid magic bytes', async () => {
    const user = await registerAndLogin('upload-magic');
    const buffer = Buffer.from('%PDF-1.7\nthis is not a real pdf');

    const response = await request(app)
      .post('/api/resumes/upload')
      .set(authHeader(user.accessToken))
      .attach('file', buffer, {
        filename: 'resume.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('validation failed');
  });

  it('sanitizes dangerous filenames before writing to storage', async () => {
    const user = await registerAndLogin('upload-filename');
    const buffer = await createPdfBuffer([['Dangerous filename']]);

    const response = await request(app)
      .post('/api/resumes/upload')
      .set(authHeader(user.accessToken))
      .attach('file', buffer, '../../evil.pdf');

    expect(response.status).toBe(201);

    const resume = await prisma.resume.findFirst({
      where: { userId: user.userId },
      include: { originalFile: true },
    });

    expect(resume).toBeTruthy();
    expect(resume?.fileName).toBe('evil.pdf');
    expect(resume?.originalFile?.s3Key).not.toContain('..');

    const fileExists = await pathExists(path.join(storageDir, resume!.originalFile!.s3Key));
    expect(fileExists).toBe(true);
  });

  it('stores, parses, and persists a valid upload', async () => {
    const user = await registerAndLogin('upload-valid');
    const buffer = await createPdfBuffer([
      [
        'Taylor Brooks',
        'taylor.brooks@example.com | Seattle, WA',
        'Summary',
        'Backend engineer with cloud and systems experience.',
        'Skills',
        'JavaScript, TypeScript, AWS, PostgreSQL',
        'Experience',
        'Platform Engineer | Acme | 2021 - Present',
      ],
    ]);

    const response = await request(app)
      .post('/api/resumes/upload')
      .set(authHeader(user.accessToken))
      .attach('file', buffer, 'resume.pdf');

    expect(response.status).toBe(201);
    expect(response.body.data.parseStatus).toBe('completed');
    expect(response.body.data.parseProgress).toBe(100);

    const resume = await prisma.resume.findFirst({
      where: { userId: user.userId, fileName: 'resume.pdf' },
      include: { originalFile: true },
    });

    expect(resume).toBeTruthy();
    expect(resume?.parseStatus).toBe('COMPLETED');
    expect(resume?.parseError).toBeNull();
    expect(resume?.extractedText).toContain('Taylor Brooks');
    expect(resume?.originalFile?.s3Key).toContain(`users/${user.userId}/originals`);

    const storedFileExists = await pathExists(path.join(storageDir, resume!.originalFile!.s3Key));
    expect(storedFileExists).toBe(true);
  });

  it('marks parse failures, removes stored files, and avoids orphaned original-file rows', async () => {
    const user = await registerAndLogin('upload-failed-parse');
    // Two blank pages, not one: a single blank page serializes to ~1023 bytes,
    // one byte under the 1KB minimum file size check, so the upload would be
    // rejected as FILE_SIZE_TOO_SMALL (400) before ever reaching the parser —
    // this test is about the parser's empty-document handling (422), so the
    // fixture needs to clear the unrelated size floor while staying textless.
    const blankBuffer = await createPdfBuffer([[], []]);

    const response = await request(app)
      .post('/api/resumes/upload')
      .set(authHeader(user.accessToken))
      .attach('file', blankBuffer, 'blank.pdf');

    expect(response.status).toBe(422);

    const resume = await prisma.resume.findFirst({
      where: { userId: user.userId, fileName: 'blank.pdf' },
      include: { originalFile: true },
    });

    expect(resume).toBeTruthy();
    expect(resume?.parseStatus).toBe('FAILED');
    expect(resume?.parseError).toBeTruthy();
    expect(resume?.originalFile).toBeNull();

    const storageEntries = await fs.readdir(path.join(storageDir, 'users', user.userId, 'originals')).catch(() => []);
    expect(storageEntries).toEqual([]);
  });

  it('enforces ownership for uploaded resumes and deletes stored files on removal', async () => {
    const owner = await registerAndLogin('upload-owner');
    const attacker = await registerAndLogin('upload-attacker');
    const buffer = await createPdfBuffer([
      [
        'Jordan Miles',
        'jordan.miles@example.com | New York, NY',
        'Skills',
        'Go, Kubernetes, PostgreSQL',
        'Experience',
        'Engineer | Example | 2020 - Present',
      ],
    ]);

    const uploadResponse = await request(app)
      .post('/api/resumes/upload')
      .set(authHeader(owner.accessToken))
      .attach('file', buffer, 'owner-resume.pdf');

    expect(uploadResponse.status).toBe(201);

    const resume = await prisma.resume.findFirst({
      where: { userId: owner.userId, fileName: 'owner-resume.pdf' },
      include: { originalFile: true },
    });

    expect(resume).toBeTruthy();

    const attackerGet = await request(app)
      .get(`/api/resumes/${resume!.id}`)
      .set(authHeader(attacker.accessToken));

    expect(attackerGet.status).toBe(403);

    const ownerDelete = await request(app)
      .delete(`/api/resumes/${resume!.id}`)
      .set(authHeader(owner.accessToken));

    expect(ownerDelete.status).toBe(200);

    const deletedResume = await prisma.resume.findUnique({
      where: { id: resume!.id },
      include: { originalFile: true },
    });

    expect(deletedResume).toBeNull();

    const storedFileExists = await pathExists(path.join(storageDir, resume!.originalFile!.s3Key));
    expect(storedFileExists).toBe(false);
  });
});
