# ResumeIQ Authentication Module - Test Plan

**Version**: 1.0  
**Status**: Ready for Implementation  
**Last Updated**: 2026-06-07

---

## 📋 Executive Summary

This test plan covers comprehensive testing of the ResumeIQ Authentication module across unit tests, integration tests, and end-to-end scenarios. Target coverage: **95%+ code coverage**, **100% endpoint coverage**, **all edge cases** handled.

---

## 🧪 Unit Tests (Auth Service Layer)

### Test Suite 1: Password Hashing

**File**: `auth.service.test.ts`

```typescript
describe('Password Hashing', () => {
  test('should hash password with bcrypt', async () => {
    const password = 'SecurePass123!';
    const hashed = await service.hashPassword(password);
    expect(hashed).not.toBe(password);
    expect(hashed).toMatch(/^\$2[aby]\$/); // bcrypt hash format
  });

  test('should verify correct password', async () => {
    const password = 'SecurePass123!';
    const hashed = await service.hashPassword(password);
    const isValid = await service.verifyPassword(password, hashed);
    expect(isValid).toBe(true);
  });

  test('should reject incorrect password', async () => {
    const password = 'SecurePass123!';
    const hashed = await service.hashPassword(password);
    const isValid = await service.verifyPassword('WrongPassword123!', hashed);
    expect(isValid).toBe(false);
  });

  test('should use bcrypt rounds=12', async () => {
    // Verify by checking hash format and timing
    const start = Date.now();
    await service.hashPassword('SecurePass123!');
    const duration = Date.now() - start;
    expect(duration).toBeGreaterThan(100); // >100ms indicates proper round count
  });

  test('should handle empty password', async () => {
    expect(() => service.hashPassword('')).rejects.toThrow();
  });
});
```

### Test Suite 2: JWT Token Generation

```typescript
describe('JWT Token Generation', () => {
  test('should generate valid access token', () => {
    const payload = { sub: 'user_123', email: 'user@example.com', role: 'USER' };
    const token = service.generateAccessToken(payload);
    expect(token).toBeTruthy();
    expect(token.split('.')).toHaveLength(3); // JWT format: xxx.yyy.zzz
  });

  test('should set correct access token expiry (15 minutes)', () => {
    const payload = { sub: 'user_123', email: 'user@example.com', role: 'USER' };
    const token = service.generateAccessToken(payload);
    const decoded = jwt.decode(token);
    expect(decoded.exp - decoded.iat).toBe(900); // 15 minutes in seconds
  });

  test('should generate valid refresh token', () => {
    const token = service.generateRefreshToken();
    expect(token).toBeTruthy();
    expect(token).toHaveLength(32); // 256-bit random token
  });

  test('should verify valid token signature', () => {
    const payload = { sub: 'user_123', email: 'user@example.com', role: 'USER' };
    const token = service.generateAccessToken(payload);
    expect(() => service.verifyAccessToken(token)).not.toThrow();
  });

  test('should reject invalid token signature', () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.invalid_signature';
    expect(() => service.verifyAccessToken(fakeToken)).toThrow();
  });

  test('should reject expired token', () => {
    // Create token with past expiry
    const expiredToken = jwt.sign(
      { sub: 'user_123', role: 'USER' },
      process.env.JWT_SECRET,
      { expiresIn: '-1h' }
    );
    expect(() => service.verifyAccessToken(expiredToken)).toThrow('Token expired');
  });

  test('should extract correct payload from token', () => {
    const payload = { sub: 'user_123', email: 'user@example.com', role: 'USER' };
    const token = service.generateAccessToken(payload);
    const decoded = service.verifyAccessToken(token);
    expect(decoded.sub).toBe('user_123');
    expect(decoded.email).toBe('user@example.com');
    expect(decoded.role).toBe('USER');
  });
});
```

### Test Suite 3: User Registration

```typescript
describe('User Registration', () => {
  test('should create user with valid input', async () => {
    const result = await service.register({
      email: 'newuser@example.com',
      name: 'John Doe',
      password: 'SecurePass123!'
    });
    expect(result.id).toBeTruthy();
    expect(result.email).toBe('newuser@example.com');
    expect(result.password).toBeUndefined(); // Never return password
  });

  test('should hash password before storing', async () => {
    const result = await service.register({
      email: 'newuser@example.com',
      name: 'John Doe',
      password: 'SecurePass123!'
    });
    const user = await repository.findUserById(result.id);
    expect(user.password).not.toBe('SecurePass123!'); // Should be hashed
    expect(user.password).toMatch(/^\$2[aby]\$/); // bcrypt format
  });

  test('should reject duplicate email', async () => {
    await service.register({
      email: 'duplicate@example.com',
      name: 'User 1',
      password: 'SecurePass123!'
    });
    expect(() => service.register({
      email: 'duplicate@example.com',
      name: 'User 2',
      password: 'SecurePass123!'
    })).rejects.toThrow('Email already registered');
  });

  test('should reject weak password', async () => {
    expect(() => service.register({
      email: 'user@example.com',
      name: 'John Doe',
      password: 'weak'
    })).rejects.toThrow('Password is too weak');
  });

  test('should reject invalid email', async () => {
    expect(() => service.register({
      email: 'not-an-email',
      name: 'John Doe',
      password: 'SecurePass123!'
    })).rejects.toThrow('Invalid email');
  });

  test('should reject missing fields', async () => {
    expect(() => service.register({
      email: 'user@example.com',
      name: 'John Doe'
      // missing password
    })).rejects.toThrow();
  });
});
```

### Test Suite 4: User Login

```typescript
describe('User Login', () => {
  test('should return tokens on successful login', async () => {
    await service.register({
      email: 'user@example.com',
      name: 'John Doe',
      password: 'SecurePass123!'
    });
    
    const result = await service.login('user@example.com', 'SecurePass123!');
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user).toBeTruthy();
    expect(result.expiresIn).toBe(900);
  });

  test('should update lastLogin timestamp', async () => {
    await service.register({
      email: 'user@example.com',
      name: 'John Doe',
      password: 'SecurePass123!'
    });
    
    await service.login('user@example.com', 'SecurePass123!');
    const user = await repository.findUserByEmail('user@example.com');
    expect(user.lastLogin).toBeTruthy();
  });

  test('should reject invalid email', async () => {
    expect(() => service.login('nonexistent@example.com', 'SecurePass123!')).rejects.toThrow();
  });

  test('should reject invalid password', async () => {
    await service.register({
      email: 'user@example.com',
      name: 'John Doe',
      password: 'SecurePass123!'
    });
    
    expect(() => service.login('user@example.com', 'WrongPassword123!')).rejects.toThrow('Invalid credentials');
  });

  test('should not reveal user exists with wrong password', async () => {
    await service.register({
      email: 'user@example.com',
      name: 'John Doe',
      password: 'SecurePass123!'
    });
    
    // Should throw same error as user not found
    expect(() => service.login('user@example.com', 'WrongPassword123!')).rejects.toThrow('Invalid credentials');
    expect(() => service.login('nonexistent@example.com', 'SomePassword123!')).rejects.toThrow('Invalid credentials');
  });

  test('should reject inactive user', async () => {
    const user = await service.register({
      email: 'user@example.com',
      name: 'John Doe',
      password: 'SecurePass123!'
    });
    
    // Deactivate user
    await repository.updateUser(user.id, { isActive: false });
    
    expect(() => service.login('user@example.com', 'SecurePass123!')).rejects.toThrow('Account is inactive');
  });
});
```

### Test Suite 5: Token Refresh

```typescript
describe('Token Refresh', () => {
  test('should issue new access token', async () => {
    const user = await service.register({
      email: 'user@example.com',
      name: 'John Doe',
      password: 'SecurePass123!'
    });
    const login = await service.login('user@example.com', 'SecurePass123!');
    
    const result = await service.refreshAccessToken(login.refreshToken);
    expect(result.accessToken).toBeTruthy();
    expect(result.accessToken).not.toBe(login.accessToken); // Different token
    expect(result.expiresIn).toBe(900);
  });

  test('should reject expired refresh token', async () => {
    // Create expired refresh token
    const expiredToken = 'expired_token_' + Date.now();
    expect(() => service.refreshAccessToken(expiredToken)).rejects.toThrow('Refresh token expired');
  });

  test('should reject revoked refresh token', async () => {
    const user = await service.register({
      email: 'user@example.com',
      name: 'John Doe',
      password: 'SecurePass123!'
    });
    const login = await service.login('user@example.com', 'SecurePass123!');
    
    // Logout (revoke token)
    await service.logout(login.refreshToken);
    
    // Try to refresh
    expect(() => service.refreshAccessToken(login.refreshToken)).rejects.toThrow('Token revoked');
  });

  test('should reject invalid token format', async () => {
    expect(() => service.refreshAccessToken('invalid')).rejects.toThrow();
  });
});
```

### Test Suite 6: Logout

```typescript
describe('Logout', () => {
  test('should revoke refresh token', async () => {
    const user = await service.register({
      email: 'user@example.com',
      name: 'John Doe',
      password: 'SecurePass123!'
    });
    const login = await service.login('user@example.com', 'SecurePass123!');
    
    await service.logout(login.refreshToken);
    
    const token = await repository.findRefreshToken(login.refreshToken);
    expect(token.isRevoked).toBe(true);
  });

  test('should prevent token reuse after logout', async () => {
    const user = await service.register({
      email: 'user@example.com',
      name: 'John Doe',
      password: 'SecurePass123!'
    });
    const login = await service.login('user@example.com', 'SecurePass123!');
    
    await service.logout(login.refreshToken);
    
    expect(() => service.refreshAccessToken(login.refreshToken)).rejects.toThrow('Token revoked');
  });

  test('should handle multiple logout calls', async () => {
    const user = await service.register({
      email: 'user@example.com',
      name: 'John Doe',
      password: 'SecurePass123!'
    });
    const login = await service.login('user@example.com', 'SecurePass123!');
    
    await service.logout(login.refreshToken);
    // Should not throw on second logout
    expect(() => service.logout(login.refreshToken)).not.toThrow();
  });
});
```

---

## 🌐 Integration Tests (API Endpoints)

### Test Suite 7: POST /api/auth/register

```typescript
describe('POST /api/auth/register', () => {
  test('should register new user successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'newuser@example.com',
        name: 'John Doe',
        password: 'SecurePass123!'
      });
    
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.email).toBe('newuser@example.com');
  });

  test('should return 400 on invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'invalid-email',
        name: 'John Doe',
        password: 'SecurePass123!'
      });
    
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeTruthy();
  });

  test('should return 409 on duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'duplicate@example.com',
        name: 'User 1',
        password: 'SecurePass123!'
      });
    
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'duplicate@example.com',
        name: 'User 2',
        password: 'SecurePass123!'
      });
    
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test('should return 400 on weak password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'user@example.com',
        name: 'John Doe',
        password: 'weak'
      });
    
    expect(res.status).toBe(400);
    expect(res.body.errors[0].code).toBe('WEAK_PASSWORD');
  });

  test('should return 400 on missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'user@example.com',
        name: 'John Doe'
      });
    
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeTruthy();
  });

  test('should not return password in response', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'user@example.com',
        name: 'John Doe',
        password: 'SecurePass123!'
      });
    
    expect(res.body.data.password).toBeUndefined();
  });
});
```

### Test Suite 8: POST /api/auth/login

```typescript
describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'user@example.com',
        name: 'John Doe',
        password: 'SecurePass123!'
      });
  });

  test('should login successfully', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'SecurePass123!'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.user).toBeTruthy();
  });

  test('should return 401 on invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'WrongPassword123!'
      });
    
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('should not reveal if user exists', async () => {
    const res1 = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'WrongPassword123!'
      });
    
    const res2 = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'SomePassword123!'
      });
    
    expect(res1.status).toBe(401);
    expect(res2.status).toBe(401);
    expect(res1.body.message).toBe(res2.body.message); // Same message
  });

  test('should return 400 on missing email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        password: 'SecurePass123!'
      });
    
    expect(res.status).toBe(400);
  });
});
```

### Test Suite 9: POST /api/auth/refresh-token

```typescript
describe('POST /api/auth/refresh-token', () => {
  let refreshToken;

  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'user@example.com',
        name: 'John Doe',
        password: 'SecurePass123!'
      });
    
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'SecurePass123!'
      });
    
    refreshToken = loginRes.body.data.refreshToken;
  });

  test('should return new access token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh-token')
      .send({ refreshToken });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.expiresIn).toBe(900);
  });

  test('should return 400 on invalid token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh-token')
      .send({ refreshToken: 'invalid_token' });
    
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('should return 400 on revoked token', async () => {
    await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken });
    
    const res = await request(app)
      .post('/api/auth/refresh-token')
      .send({ refreshToken });
    
    expect(res.status).toBe(400);
  });
});
```

### Test Suite 10: POST /api/auth/logout

```typescript
describe('POST /api/auth/logout', () => {
  let refreshToken;

  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'user@example.com',
        name: 'John Doe',
        password: 'SecurePass123!'
      });
    
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'SecurePass123!'
      });
    
    refreshToken = loginRes.body.data.refreshToken;
  });

  test('should logout successfully', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('should invalidate refresh token', async () => {
    await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken });
    
    const res = await request(app)
      .post('/api/auth/refresh-token')
      .send({ refreshToken });
    
    expect(res.status).toBe(400);
  });

  test('should return 400 on missing token', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .send({});
    
    expect(res.status).toBe(400);
  });
});
```

### Test Suite 11: GET /api/auth/profile

```typescript
describe('GET /api/auth/profile', () => {
  let accessToken;

  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'user@example.com',
        name: 'John Doe',
        password: 'SecurePass123!'
      });
    
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'SecurePass123!'
      });
    
    accessToken = loginRes.body.data.accessToken;
  });

  test('should return user profile when authenticated', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${accessToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('user@example.com');
    expect(res.body.data.id).toBeTruthy();
  });

  test('should return 401 without token', async () => {
    const res = await request(app)
      .get('/api/auth/profile');
    
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('should return 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer invalid_token');
    
    expect(res.status).toBe(401);
  });

  test('should return 401 with expired token', async () => {
    // Create expired token
    const expiredToken = jwt.sign(
      { sub: 'user_123', role: 'USER' },
      process.env.JWT_SECRET,
      { expiresIn: '-1h' }
    );
    
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${expiredToken}`);
    
    expect(res.status).toBe(401);
  });

  test('should not return password in profile', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${accessToken}`);
    
    expect(res.body.data.password).toBeUndefined();
  });
});
```

---

## 🔄 End-to-End Scenarios

### Scenario 1: Complete Registration to Profile Access

```typescript
test('Complete flow: Register → Login → Access Profile', async () => {
  // Step 1: Register
  const registerRes = await request(app)
    .post('/api/auth/register')
    .send({
      email: 'user@example.com',
      name: 'John Doe',
      password: 'SecurePass123!'
    });
  expect(registerRes.status).toBe(201);

  // Step 2: Login
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'user@example.com',
      password: 'SecurePass123!'
    });
  expect(loginRes.status).toBe(200);
  const { accessToken, refreshToken } = loginRes.body.data;

  // Step 3: Access Profile
  const profileRes = await request(app)
    .get('/api/auth/profile')
    .set('Authorization', `Bearer ${accessToken}`);
  expect(profileRes.status).toBe(200);
  expect(profileRes.body.data.email).toBe('user@example.com');
});
```

### Scenario 2: Token Expiration & Refresh

```typescript
test('Token expiration and refresh flow', async () => {
  // Register and login
  await request(app)
    .post('/api/auth/register')
    .send({
      email: 'user@example.com',
      name: 'John Doe',
      password: 'SecurePass123!'
    });
  
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'user@example.com',
      password: 'SecurePass123!'
    });
  
  const { accessToken, refreshToken } = loginRes.body.data;

  // Simulate token expiration by creating expired token
  const expiredToken = jwt.sign(
    { sub: 'user_123', role: 'USER' },
    process.env.JWT_SECRET,
    { expiresIn: '-1h' }
  );

  // Attempt to use expired token
  const failRes = await request(app)
    .get('/api/auth/profile')
    .set('Authorization', `Bearer ${expiredToken}`);
  expect(failRes.status).toBe(401);

  // Refresh token
  const refreshRes = await request(app)
    .post('/api/auth/refresh-token')
    .send({ refreshToken });
  expect(refreshRes.status).toBe(200);
  const newAccessToken = refreshRes.body.data.accessToken;

  // Access profile with new token
  const profileRes = await request(app)
    .get('/api/auth/profile')
    .set('Authorization', `Bearer ${newAccessToken}`);
  expect(profileRes.status).toBe(200);
});
```

### Scenario 3: Logout & Session Termination

```typescript
test('Logout and session termination', async () => {
  // Register and login
  await request(app)
    .post('/api/auth/register')
    .send({
      email: 'user@example.com',
      name: 'John Doe',
      password: 'SecurePass123!'
    });
  
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'user@example.com',
      password: 'SecurePass123!'
    });
  
  const { accessToken, refreshToken } = loginRes.body.data;

  // Verify access works
  let profileRes = await request(app)
    .get('/api/auth/profile')
    .set('Authorization', `Bearer ${accessToken}`);
  expect(profileRes.status).toBe(200);

  // Logout
  const logoutRes = await request(app)
    .post('/api/auth/logout')
    .send({ refreshToken });
  expect(logoutRes.status).toBe(200);

  // Try to refresh token (should fail)
  const refreshFailRes = await request(app)
    .post('/api/auth/refresh-token')
    .send({ refreshToken });
  expect(refreshFailRes.status).toBe(400);

  // Note: Access token still works (by design, short lifetime)
  // In production, client would handle logout by clearing tokens
});
```

---

## 📊 Test Coverage Goals

| Component | Target Coverage |
|-----------|-----------------|
| auth.service.ts | 95%+ |
| auth.controller.ts | 95%+ |
| auth.repository.ts | 90%+ |
| auth.middleware.ts | 95%+ |
| **Total** | **95%+** |

---

## ✅ Test Execution Checklist

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E scenarios pass
- [ ] Code coverage meets 95%+ target
- [ ] No console errors or warnings
- [ ] No hardcoded secrets in tests
- [ ] All tests clean up test data (no side effects)
- [ ] Tests run under 60 seconds total
- [ ] All edge cases covered
- [ ] Documentation updated

---

**Test Plan Status**: ✅ Ready for Implementation
