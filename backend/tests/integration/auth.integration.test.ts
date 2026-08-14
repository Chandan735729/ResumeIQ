import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Application } from 'express';

type PrismaClient = import('@prisma/client').PrismaClient;

describe('Phase 2 authentication and database integration', () => {
  const password = 'ValidPass123!';
  const jwtSecret = 'integration-test-secret-value-that-is-long-enough-1234567890';
  const storageDir = path.resolve(__dirname, '../tmp-storage-auth');
  const fixturePath = path.resolve(__dirname, '../fixtures/resumes/fresher-resume.pdf');

  let app: Application;
  let prisma: PrismaClient;

  const uniqueEmail = (prefix: string) => `${prefix}.${Date.now()}.${Math.random().toString(16).slice(2)}@resumeiq.dev`;

  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

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

  async function registerUser(email: string) {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        name: 'Test User',
        password,
      });

    return response;
  }

  async function loginUser(email: string, userPassword: string = password) {
    return request(app)
      .post('/api/auth/login')
      .send({
        email,
        password: userPassword,
      });
  }

  async function registerAndLogin(prefix: string) {
    const email = uniqueEmail(prefix);
    const registerResponse = await registerUser(email);
    expect(registerResponse.status).toBe(201);

    const loginResponse = await loginUser(email);
    expect(loginResponse.status).toBe(200);

    return {
      email,
      userId: registerResponse.body.data.id as string,
      accessToken: loginResponse.body.data.accessToken as string,
      refreshToken: loginResponse.body.data.refreshToken as string,
    };
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://resumeiq_user:resumeiq_pass@localhost:5432/resumeiq';
    process.env.JWT_SECRET = jwtSecret;
    process.env.STORAGE_BASE_DIR = storageDir;
    process.env.FRONTEND_URL = 'http://localhost:3001';

    app = (await import('../../src/app')).default;
    prisma = (await import('../../src/services/prisma.service')).prisma;
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

  describe('Runtime health and readiness', () => {
    it('returns healthy and ready responses against the live database', async () => {
      const health = await request(app).get('/health');
      expect(health.status).toBe(200);
      expect(health.body.status).toBe('ok');

      const ready = await request(app).get('/ready');
      expect(ready.status).toBe(200);
      expect(ready.body.status).toBe('ready');
    });
  });

  describe('Registration', () => {
    it('accepts valid registration', async () => {
      const email = uniqueEmail('register-valid');
      const response = await registerUser(email);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe(email);
      expect(response.body.data.id).toEqual(expect.any(String));
    });

    it('rejects duplicate email registration', async () => {
      const email = uniqueEmail('register-duplicate');
      const first = await registerUser(email);
      expect(first.status).toBe(201);

      const duplicate = await registerUser(email);
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.success).toBe(false);
    });

    it('rejects invalid email registration', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          name: 'Test User',
          password,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('rejects weak password registration', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: uniqueEmail('register-weak'),
          name: 'Test User',
          password: 'weak',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('rejects invalid role input on registration', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: uniqueEmail('register-role'),
          name: 'Test User',
          password,
          role: 'ADMIN',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Login', () => {
    it('accepts valid credentials', async () => {
      const email = uniqueEmail('login-valid');
      expect((await registerUser(email)).status).toBe(201);

      const response = await loginUser(email);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toEqual(expect.any(String));
      expect(response.body.data.refreshToken).toEqual(expect.any(String));
    });

    it('rejects a wrong password', async () => {
      const email = uniqueEmail('login-wrong-password');
      expect((await registerUser(email)).status).toBe(201);

      const response = await loginUser(email, 'WrongPass123!');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
    });

    it('rejects an unknown account without a foreign-key error', async () => {
      const email = uniqueEmail('login-unknown');
      const response = await loginUser(email);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');

      const failureLogs = await prisma.auditLog.findMany({
        where: {
          action: 'LOGIN_FAILURE',
          reason: 'User not found',
        },
      });

      expect(failureLogs).toHaveLength(1);
      expect(failureLogs[0].userId).toBeNull();
    });
  });

  describe('Access token', () => {
    it('accepts a valid access token', async () => {
      const { accessToken } = await registerAndLogin('access-valid');

      const response = await request(app)
        .get('/api/auth/profile')
        .set(authHeader(accessToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toContain('@resumeiq.dev');
    });

    it('rejects an expired access token', async () => {
      const user = await registerAndLogin('access-expired');
      const expiredToken = jwt.sign(
        {
          sub: user.userId,
          email: user.email,
          role: 'USER',
          iat: Math.floor(Date.now() / 1000) - 4000,
          exp: Math.floor(Date.now() / 1000) - 10,
        },
        jwtSecret,
        { algorithm: 'HS256' }
      );

      const response = await request(app)
        .get('/api/auth/profile')
        .set(authHeader(expiredToken));

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid or expired token');
    });

    it('rejects a malformed access token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer malformed.token.value');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid or expired token');
    });

    it('rejects a missing access token', async () => {
      const response = await request(app).get('/api/auth/profile');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Missing authorization token');
    });
  });

  describe('Refresh token', () => {
    it('accepts a valid refresh token and rotates it', async () => {
      const user = await registerAndLogin('refresh-valid');

      const response = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: user.refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toEqual(expect.any(String));
      expect(response.body.data.refreshToken).toEqual(expect.any(String));
      expect(response.body.data.refreshToken).not.toBe(user.refreshToken);

      const oldTokenReuse = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: user.refreshToken });

      expect(oldTokenReuse.status).toBe(400);
      expect(oldTokenReuse.body.message).toBe('Invalid or expired refresh token');
    });

    it('rejects an expired refresh token', async () => {
      const user = await registerAndLogin('refresh-expired');
      await prisma.refreshToken.updateMany({
        where: { token: hashToken(user.refreshToken) },
        data: {
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      const response = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: user.refreshToken });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid or expired refresh token');
    });

    it('rejects a revoked refresh token', async () => {
      const user = await registerAndLogin('refresh-revoked');
      await prisma.refreshToken.updateMany({
        where: { token: hashToken(user.refreshToken) },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
        },
      });

      const response = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: user.refreshToken });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid or expired refresh token');
    });

    it('rejects an invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: 'invalid-refresh-token-value' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid or expired refresh token');
    });
  });

  describe('Logout', () => {
    it('revokes a valid logout session', async () => {
      const user = await registerAndLogin('logout-valid');

      const response = await request(app)
        .post('/api/auth/logout')
        .set(authHeader(user.accessToken))
        .send({ refreshToken: user.refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const reuse = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: user.refreshToken });

      expect(reuse.status).toBe(400);
      expect(reuse.body.message).toBe('Invalid or expired refresh token');
    });

    it('rejects an unauthorized logout', async () => {
      const user = await registerAndLogin('logout-unauthorized');

      const response = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken: user.refreshToken });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Missing authorization token');
    });

    it('rejects logout attempts that target another user session', async () => {
      const owner = await registerAndLogin('logout-owner');
      const attacker = await registerAndLogin('logout-attacker');

      const response = await request(app)
        .post('/api/auth/logout')
        .set(authHeader(attacker.accessToken))
        .send({ refreshToken: owner.refreshToken });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied');
    });
  });

  describe('Authorization and IDOR', () => {
    it('allows the owner to read and delete their resume', async () => {
      const owner = await registerAndLogin('resume-owner');

      const resume = await prisma.resume.create({
        data: {
          userId: owner.userId,
          fileName: 'owner-resume.pdf',
          fileSize: 12345,
          fileType: 'pdf',
        },
      });

      const getResponse = await request(app)
        .get(`/api/resumes/${resume.id}`)
        .set(authHeader(owner.accessToken));

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.success).toBe(true);
      expect(getResponse.body.data.id).toBe(resume.id);

      const deleteResponse = await request(app)
        .delete(`/api/resumes/${resume.id}`)
        .set(authHeader(owner.accessToken));

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);
    });

    it('denies a different authenticated user access to another user resume', async () => {
      const owner = await registerAndLogin('resume-owner-idor');
      const attacker = await registerAndLogin('resume-attacker-idor');

      const resume = await prisma.resume.create({
        data: {
          userId: owner.userId,
          fileName: 'owner-only.pdf',
          fileSize: 4444,
          fileType: 'pdf',
        },
      });

      const getResponse = await request(app)
        .get(`/api/resumes/${resume.id}`)
        .set(authHeader(attacker.accessToken));

      expect(getResponse.status).toBe(403);

      const deleteResponse = await request(app)
        .delete(`/api/resumes/${resume.id}`)
        .set(authHeader(attacker.accessToken));

      expect(deleteResponse.status).toBe(403);
    });

    it('rejects unauthenticated resume access', async () => {
      const owner = await registerAndLogin('resume-unauthenticated');
      const resume = await prisma.resume.create({
        data: {
          userId: owner.userId,
          fileName: 'owner-only.pdf',
          fileSize: 4444,
          fileType: 'pdf',
        },
      });

      const getResponse = await request(app).get(`/api/resumes/${resume.id}`);
      expect(getResponse.status).toBe(401);

      const deleteResponse = await request(app).delete(`/api/resumes/${resume.id}`);
      expect(deleteResponse.status).toBe(401);
    });

    it('returns not found for nonexistent and malformed IDs', async () => {
      const owner = await registerAndLogin('resume-not-found');

      const missing = await request(app)
        .get('/api/resumes/nonexistent-id')
        .set(authHeader(owner.accessToken));
      expect(missing.status).toBe(404);

      const malformed = await request(app)
        .delete('/api/resumes/not-a-real-id')
        .set(authHeader(owner.accessToken));
      expect(malformed.status).toBe(404);
    });

    it('allows the owner to access subscription quota info', async () => {
      const owner = await registerAndLogin('quota-owner');

      const response = await request(app)
        .get('/api/resumes/quota/info')
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.quotaLimit).toBeGreaterThan(0);
    });
  });

  describe('Upload smoke test', () => {
    it('accepts a valid authenticated upload and rejects an unauthenticated upload', async () => {
      const user = await registerAndLogin('upload-owner');
      const fileBuffer = await fs.readFile(fixturePath);

      const uploadResponse = await request(app)
        .post('/api/resumes/upload')
        .set(authHeader(user.accessToken))
        .attach('file', fileBuffer, 'fresher-resume.pdf');

      expect(uploadResponse.status).toBe(201);
      expect(uploadResponse.body.success).toBe(true);
      expect(uploadResponse.body.data.resumeId).toEqual(expect.any(String));

      const unauthenticatedResponse = await request(app)
        .post('/api/resumes/upload')
        .attach('file', fileBuffer, 'fresher-resume.pdf');

      expect(unauthenticatedResponse.status).toBe(401);
    });
  });
});