# ResumeIQ Authentication & Authorization Architecture

**Version**: 1.0  
**Status**: Production-Ready Design  
**Last Updated**: 2026-06-07  
**Author**: ResumeIQ Engineering Team

---

## 📋 Executive Summary

This document outlines the production-grade authentication and authorization system for ResumeIQ. The system prioritizes security, scalability, user experience, and future extensibility.

**Key Design Principles**:
- ✅ **Security First**: Industry best practices for authentication, not shortcuts
- ✅ **Stateless & Scalable**: JWT-based, works with multiple server instances
- ✅ **Future-Ready**: Role-based authorization designed for easy expansion (ADMIN, PREMIUM roles)
- ✅ **User-Friendly**: Clear error messages, proper HTTP status codes
- ✅ **Audit Trail**: All auth events logged for security and compliance
- ✅ **Recovery Options**: Refresh tokens, logout, session management

---

## 🏗️ Architecture Overview

### Authentication Flow

```
User Registration
↓
[Register] → POST /api/auth/register
↓
Validate input (Zod schema)
↓
Hash password (bcrypt, 12 rounds)
↓
Store in database
↓
Return success message + login instructions

---

User Login
↓
[Login] → POST /api/auth/login
↓
Validate input (email, password)
↓
Find user by email
↓
Verify password against hash (bcrypt.compare)
↓
Generate JWT access token (15 minutes)
↓
Generate refresh token (7 days, stored in DB)
↓
Return tokens + user profile

---

Protected Routes
↓
[API Call] → GET /api/auth/profile (with access token)
↓
JWT middleware validates token signature
↓
Extract user ID from token payload
↓
Verify token not expired
↓
Execute protected endpoint
↓
Return user data

---

Token Refresh
↓
[Refresh] → POST /api/auth/refresh-token
↓
Validate refresh token in database
↓
Check if not revoked/expired
↓
Generate new access token
↓
Return new token

---

User Logout
↓
[Logout] → POST /api/auth/logout
↓
Revoke refresh token in database
↓
Clear user session (if using cookies)
↓
Return success message
```

---

## 🔐 Security Model

### 1. Password Security

**Why bcrypt?**
- Adaptive hashing: Cost parameter increases with computing power
- Salting: Automatically salts each password
- Industry standard: Used by GitHub, Stripe, AWS
- Attack resistance: Slow, memory-hard, resistant to GPU/ASIC attacks

**Implementation**:
```
Rounds: 12 (default for production 2026)
Time: ~150ms per hash (acceptable for registration/login)
Collision: Cryptographically infeasible (2^192 combinations)
```

**Password Requirements**:
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 digit
- At least 1 special character (!@#$%^&*)

**Why These Requirements?**
- 8 characters: Industry minimum (NIST, AWS, GitHub)
- Uppercase + lowercase + digit + special: Prevents common patterns, increases entropy to ~60 bits
- Entropy calculation: ~95^8 possible passwords with these requirements = 6.6 × 10^15 combinations

### 2. JWT Token Strategy

**Access Token**:
- **Lifetime**: 15 minutes
- **Stored**: In-memory (HttpOnly cookie or response body)
- **Use**: For authenticating API requests
- **Refresh**: Before expiration using refresh token
- **Revocation**: Can't be revoked (by design), short lifetime mitigates risk

**Why 15 minutes?**
- Balances security vs. UX
- If stolen, window of abuse is limited to 15 minutes
- User won't notice frequent silent refreshes
- Not too short to avoid excessive refresh calls

**Refresh Token**:
- **Lifetime**: 7 days
- **Stored**: In PostgreSQL database (encrypted, hashed)
- **Use**: For obtaining new access tokens without re-entering credentials
- **Revocation**: Can be revoked immediately (logout, security event)
- **Rotation**: New refresh token issued with each refresh (optional, future enhancement)

**Why JWT over Sessions?**
- **Scalability**: Stateless, works across multiple servers
- **Microservices Ready**: Token can be validated by any service
- **Mobile-Friendly**: Works perfectly for mobile/SPA apps
- **No Server-Side Session State**: Reduces database load for auth checks

**JWT Payload**:
```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "role": "USER",
  "iat": 1717750000,
  "exp": 1717750900
}
```

- `sub` (subject): User ID (subject of token)
- `email`: User email (for convenience, also stored in DB)
- `role`: User role (USER, ADMIN, PREMIUM) - for authorization decisions
- `iat` (issued at): Token creation timestamp
- `exp` (expiration): Token expiration timestamp (15 min for access, 7 days for refresh)

### 3. Authorization Model

**Roles** (Initial, extensible):
- **USER**: Regular user, can upload/optimize resumes, use quota
- **ADMIN**: Internal staff, can manage users, view analytics, manage subscriptions
- **PREMIUM**: High-value customer, increased quota, priority support (future enhancement)

**Why Start with USER + ADMIN?**
- **USER**: Every registered user
- **ADMIN**: Team members (populate manually in DB)
- **Scalability**: Easy to add PREMIUM, ENTERPRISE later
- **Authorization**: Authorization middleware checks `token.role` against endpoint requirements

**Default Authorization**:
- Unauthenticated users: Access public endpoints only (health check, docs)
- Authenticated (USER): Access personal data, upload/optimize resumes
- ADMIN: Access all endpoints, manage system

### 4. Credential Validation

**Input Validation** (Zod schemas):

```typescript
RegisterSchema: {
  email: z.string().email().max(255),
  name: z.string().min(2).max(255),
  password: z.string()
    .min(8)
    .regex(/[A-Z]/) // uppercase
    .regex(/[a-z]/) // lowercase
    .regex(/[0-9]/) // digit
    .regex(/[!@#$%^&*]/) // special char
}

LoginSchema: {
  email: z.string().email().max(255),
  password: z.string().min(1)
}
```

**Why Zod?**
- Type-safe validation at runtime
- Automatic TypeScript type inference
- Clear error messages
- Composable schemas

### 5. Account Security Features

**Password Storage**:
- ✅ Bcrypt hashing (12 rounds)
- ✅ No plaintext passwords ever stored
- ✅ No password recovery (users reset via email)

**Account Lockout** (Future enhancement):
- 5 failed login attempts → 15 minute lockout
- Email notification on suspicious activity
- Configurable lockout duration

**Session Management**:
- All sessions revoked on logout
- All sessions invalidated on password change
- Single session per user (future: configurable)

**Audit Trail**:
- All login attempts logged (success/failure)
- All password changes logged
- All logout events logged
- IP address, user agent recorded for security analysis

---

## 📊 Database Schema Changes

### User Model Enhancement

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  password  String   // bcrypt hashed
  
  // Authorization
  role      UserRole @default(USER)  // USER, ADMIN, PREMIUM
  isActive  Boolean  @default(true)  // For account suspension
  
  // Account metadata
  emailVerified Boolean @default(false)  // For email verification (future)
  lastLogin DateTime?                    // Last successful login
  
  // Relations
  subscription Subscription?
  resumes   Resume[]
  jobDescriptions JobDescription[]
  refreshTokens RefreshToken[]
  auditLogs AuditLog[]
  
  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@map("users")
}

enum UserRole {
  USER
  ADMIN
  PREMIUM
}

model RefreshToken {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Token data
  token     String   @unique          // hashed refresh token
  
  // Metadata
  isRevoked Boolean  @default(false)  // For logout
  revokedAt DateTime?
  expiresAt DateTime                  // 7 days from creation
  
  createdAt DateTime @default(now())
  
  @@index([userId])
  @@index([expiresAt])
  @@map("refresh_tokens")
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Event details
  action    String   // "LOGIN_SUCCESS", "LOGIN_FAILURE", "LOGOUT", "REGISTER", "PASSWORD_CHANGE"
  status    String   // "SUCCESS", "FAILURE"
  reason    String?  // Why it failed (invalid password, account locked, etc.)
  
  // Request metadata
  ipAddress String?
  userAgent String?
  
  createdAt DateTime @default(now())
  
  @@index([userId])
  @@index([createdAt])
  @@index([action])
  @@map("audit_logs")
}
```

**Why These Additions?**
- `role`: Authorization decisions
- `isActive`: Account suspension/deactivation
- `lastLogin`: UX (show in profile), security analysis
- `RefreshToken`: Token management, logout support, revocation
- `AuditLog`: Security audit trail, compliance, threat detection

---

## 🔌 API Endpoints Specification

### 1. POST /api/auth/register

**Purpose**: User registration

**Request**:
```json
{
  "email": "user@example.com",
  "name": "John Doe",
  "password": "SecurePass123!"
}
```

**Validation**:
- Email: Valid email format, not already registered
- Name: 2-255 characters, not empty
- Password: 8+ chars, uppercase, lowercase, digit, special char

**Response (201 Created)**:
```json
{
  "success": true,
  "message": "Account created successfully. Please log in.",
  "data": {
    "id": "user_abc123",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

**Error Responses**:
- 400 Bad Request: Invalid input (validation error)
- 409 Conflict: Email already registered
- 500 Internal Server Error: Database error

**Security Checks**:
- ✅ Password strength validated
- ✅ Email uniqueness checked
- ✅ No duplicate registrations (race condition handled)

**Logging**:
- Log registration attempt (success/failure)
- Log IP address, user agent
- Log reason for failure (if applicable)

---

### 2. POST /api/auth/login

**Purpose**: User authentication, token generation

**Request**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Validation**:
- Email: Valid format
- Password: Not empty

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "refresh_token_xyz",
    "user": {
      "id": "user_abc123",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "USER"
    },
    "expiresIn": 900  // 15 minutes in seconds
  }
}
```

**Error Responses**:
- 401 Unauthorized: Invalid email/password
- 400 Bad Request: Invalid input
- 429 Too Many Requests: Rate limited (future)
- 500 Internal Server Error: Database error

**Security Checks**:
- ✅ User exists check (prevent user enumeration)
- ✅ Password verified with bcrypt
- ✅ Account active check
- ✅ Rate limiting (future: after 5 failed attempts)

**Logging**:
- Log all login attempts (success/failure)
- Log IP address, user agent
- Log failure reason (invalid password, account locked, etc.)
- Update user's `lastLogin` timestamp on success

---

### 3. POST /api/auth/refresh-token

**Purpose**: Get new access token without re-entering password

**Request**:
```json
{
  "refreshToken": "refresh_token_xyz"
}
```

**Validation**:
- Refresh token: Must exist in database, not revoked, not expired

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900  // 15 minutes
  }
}
```

**Error Responses**:
- 400 Bad Request: Invalid/expired/revoked token
- 401 Unauthorized: Token not found or user inactive
- 500 Internal Server Error: Database error

**Security Checks**:
- ✅ Token exists in database
- ✅ Token not revoked
- ✅ Token not expired
- ✅ Associated user is active

**Logging**:
- Log all refresh attempts (success/failure)

---

### 4. POST /api/auth/logout

**Purpose**: Invalidate user's refresh token, end session

**Request**:
```json
{
  "refreshToken": "refresh_token_xyz"
}
```

**Validation**:
- Refresh token: Must be provided

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Error Responses**:
- 400 Bad Request: Invalid token format
- 401 Unauthorized: Token not found
- 500 Internal Server Error: Database error

**Security Checks**:
- ✅ Verify refresh token ownership (matches logged-in user)
- ✅ Revoke token in database

**Logging**:
- Log logout event with timestamp

---

### 5. GET /api/auth/profile

**Purpose**: Get authenticated user's profile information

**Request Headers**:
```
Authorization: Bearer <access_token>
```

**Validation**:
- Access token: Valid, not expired, properly signed

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Profile retrieved",
  "data": {
    "id": "user_abc123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "USER",
    "emailVerified": false,
    "lastLogin": "2026-06-07T14:30:00Z",
    "createdAt": "2026-06-05T10:15:00Z"
  }
}
```

**Error Responses**:
- 401 Unauthorized: Missing/invalid token
- 404 Not Found: User not found (shouldn't happen)
- 500 Internal Server Error: Database error

**Security Checks**:
- ✅ JWT middleware validates token
- ✅ User is authenticated and active

**Logging**:
- Log profile access (optional, to reduce noise)

---

## 🛡️ Standard API Response Format

**All endpoints return this format**:

```json
{
  "success": boolean,
  "message": string,
  "data": any | null,
  "errors": [
    {
      "field": string,
      "code": string,
      "message": string
    }
  ] | null
}
```

**Examples**:

Success Response:
```json
{
  "success": true,
  "message": "Login successful",
  "data": { /* ... */ },
  "errors": null
}
```

Validation Error Response:
```json
{
  "success": false,
  "message": "Validation failed",
  "data": null,
  "errors": [
    {
      "field": "email",
      "code": "INVALID_EMAIL",
      "message": "Invalid email format"
    },
    {
      "field": "password",
      "code": "WEAK_PASSWORD",
      "message": "Password must contain uppercase, lowercase, digit, and special character"
    }
  ]
}
```

HTTP Status Codes:
- 200: Success
- 201: Created (registration)
- 400: Validation error, bad request
- 401: Unauthorized (invalid credentials, missing token)
- 409: Conflict (email already exists)
- 429: Too Many Requests (rate limited)
- 500: Internal server error

---

## 🏛️ Architecture Layers

### 1. Controllers (HTTP Request Handling)

**Responsibility**:
- Parse HTTP request (body, headers, params)
- Call service methods
- Format response
- Handle HTTP-level errors

**Location**: `src/modules/auth/auth.controller.ts`

**Methods**:
- `register(req, res, next)`
- `login(req, res, next)`
- `refreshToken(req, res, next)`
- `logout(req, res, next)`
- `getProfile(req, res, next)`

### 2. Services (Business Logic)

**Responsibility**:
- Implement authentication logic
- Call repository methods
- Validate business rules
- Throw domain-specific errors

**Location**: `src/modules/auth/auth.service.ts`

**Methods**:
- `register(email, name, password)`
- `login(email, password)`
- `refreshAccessToken(refreshToken)`
- `logout(refreshToken, userId)`
- `getProfile(userId)`

### 3. Repositories (Database Access)

**Responsibility**:
- Encapsulate database queries
- Handle Prisma client operations
- Provide clean data access interface

**Location**: `src/modules/auth/auth.repository.ts`

**Methods**:
- `createUser(data)`
- `findUserByEmail(email)`
- `findUserById(id)`
- `createRefreshToken(data)`
- `findRefreshToken(token)`
- `revokeRefreshToken(id)`
- `createAuditLog(data)`

### 4. Middleware (Cross-Cutting Concerns)

**Location**: `src/middleware/auth.middleware.ts`

**Components**:
- `authenticateJWT`: Validate JWT token, extract user
- `authorizeRole`: Check user role for endpoint access
- `validateRequest`: Validate request body with Zod

### 5. Validation (Input/Output Validation)

**Location**: `src/modules/auth/auth.validation.ts`

**Schemas**:
- `RegisterSchema`
- `LoginSchema`
- `RefreshTokenSchema`
- `LogoutSchema`

### 6. Types & DTOs (Data Transfer Objects)

**Location**: `src/modules/auth/auth.types.ts`

**Types**:
- `RegisterDTO`
- `LoginDTO`
- `UserResponse`
- `TokenResponse`
- `JWTPayload`

---

## 🔄 State Management & Token Flow

### Workflow 1: Registration → Login → Access Protected Route

```
1. User submits registration form
2. Controller receives POST /api/auth/register
3. Validation middleware validates input (Zod schema)
4. Service hashes password with bcrypt (12 rounds)
5. Service creates user in database
6. Response: { success: true, message: "Account created" }

7. User submits login form
8. Controller receives POST /api/auth/login
9. Service finds user by email
10. Service verifies password (bcrypt.compare)
11. Service generates JWT access token (15 min expiry)
12. Service generates refresh token, stores in DB (7 day expiry)
13. Response: { accessToken, refreshToken, user, expiresIn }

14. Client stores tokens (access token in memory, refresh token in secure storage)
15. Client makes API request: GET /api/auth/profile
16. Authorization header: "Bearer <access_token>"
17. JWT middleware validates token signature + expiry
18. Middleware extracts user ID from token payload
19. Service retrieves user profile from database
20. Response: { success: true, data: { user profile } }
```

### Workflow 2: Token Expiration & Refresh

```
1. Access token expires (15 minutes pass)
2. Next API request fails: "Token expired"
3. Client calls POST /api/auth/refresh-token with refresh token
4. Service validates refresh token (exists, not revoked, not expired)
5. Service generates new access token
6. Response: { accessToken, expiresIn }
7. Client retries original request with new access token
8. Request succeeds
```

### Workflow 3: Logout & Session Termination

```
1. User clicks logout button
2. Client calls POST /api/auth/logout with refresh token
3. Service finds refresh token in database
4. Service marks token as revoked
5. Response: { success: true, message: "Logged out" }
6. Client clears tokens from local storage
7. All subsequent API requests fail (missing token)
8. User is logged out
```

---

## 🧪 Testing Strategy

### Unit Tests (Auth Service)

**Coverage Areas**:
- ✅ Password hashing (bcrypt)
- ✅ JWT generation and validation
- ✅ Token expiration handling
- ✅ User registration (success, duplicate email, validation errors)
- ✅ User login (success, invalid password, user not found)
- ✅ Token refresh (valid, expired, revoked)
- ✅ Logout (valid, invalid token)

**Test Framework**: Jest

### Integration Tests (API Endpoints)

**Coverage Areas**:
- ✅ POST /api/auth/register (success, errors)
- ✅ POST /api/auth/login (success, errors)
- ✅ POST /api/auth/refresh-token (success, errors)
- ✅ POST /api/auth/logout (success, errors)
- ✅ GET /api/auth/profile (authenticated, unauthenticated)
- ✅ Protected routes (with/without token)
- ✅ Rate limiting (future)

**Test Framework**: Jest + Supertest

### End-to-End Scenarios

**Scenario 1**: Complete registration → login → access profile
**Scenario 2**: Login → token refresh → access resource
**Scenario 3**: Login → logout → verify access denied
**Scenario 4**: Register duplicate email → verify error
**Scenario 5**: Login with invalid credentials → verify error

---

## 🚀 Scalability Considerations

### Horizontal Scaling

**Stateless Design**:
- JWT tokens can be validated by any server (no server-side session state)
- Refresh tokens stored in central database (PostgreSQL)
- Works perfectly with load balancers

**Database Scaling**:
- Read replicas for user lookups
- Write to primary for token generation
- Refresh token queries indexed by `expiresAt` for cleanup jobs

### Performance Optimization

**Token Validation**:
- JWT validation is CPU-only (no DB lookup)
- ~1ms to validate access token
- Scales to millions of requests/second

**Caching**:
- User profile cache (Redis) after token validation (future)
- Cache invalidation on logout

### Rate Limiting (Future)

**Per IP**: 10 registration attempts/hour, 20 login attempts/hour
**Per User**: 50 API calls/minute (all endpoints)
**Implementation**: Redis-backed rate limiting

---

## 🔐 Security Considerations & Threat Mitigation

### Threat 1: Brute Force Attacks

**Risk**: Attacker tries many password combinations

**Mitigation**:
- ✅ Bcrypt with 12 rounds (150ms per attempt)
- ✅ Rate limiting (future): 5 failed attempts → 15 min lockout
- ✅ Email notification on suspicious activity (future)
- ✅ IP-based blocking (future)

**Math**: Even with 10 attempts/second, would need ~2 years to break 8-char password

### Threat 2: Password Leaks

**Risk**: Password stored insecurely

**Mitigation**:
- ✅ Bcrypt hashing (not reversible)
- ✅ Salting (prevents rainbow table attacks)
- ✅ Never log passwords
- ✅ HTTPS only (future: enforce in production)

### Threat 3: Token Theft

**Risk**: Attacker steals access/refresh token

**Mitigation for Access Token**:
- ✅ 15-minute lifetime (limited window of abuse)
- ✅ HttpOnly cookie (can't be accessed by JavaScript)
- ✅ Secure cookie flag (HTTPS only)

**Mitigation for Refresh Token**:
- ✅ Can be revoked immediately (logout)
- ✅ Stored hashed in database
- ✅ 7-day lifetime (longer rotation window)

### Threat 4: SQL Injection

**Risk**: Malicious SQL in user input

**Mitigation**:
- ✅ Prisma ORM (parameterized queries)
- ✅ Input validation with Zod
- ✅ No string concatenation in queries

### Threat 5: Credential Stuffing

**Risk**: Attacker uses leaked credentials from other services

**Mitigation**:
- ✅ Account lockout after failed attempts (future)
- ✅ Unusual login alerts (future)
- ✅ Email verification (future)
- ✅ Two-factor authentication (future)

### Threat 6: User Enumeration

**Risk**: Attacker determines if email exists

**Mitigation**:
- ✅ Same response for "user not found" and "invalid password" (401)
- ✅ No detailed error messages revealing whether user exists

### Threat 7: CSRF Attacks

**Risk**: Attacker tricks user into making unauthorized requests

**Mitigation**:
- ✅ CORS configured (origin validation)
- ✅ Token-based auth (not cookie-based)
- ✅ State-changing requests require JWT in Authorization header

---

## 🔮 Future Enhancements

### Phase 2: Enhanced Security

- [ ] Email verification on registration
- [ ] Password reset via email link
- [ ] Two-factor authentication (TOTP)
- [ ] Social login (Google, GitHub)
- [ ] Account recovery codes
- [ ] Session management (multiple device login)

### Phase 3: Advanced Features

- [ ] API keys for programmatic access
- [ ] OAuth2 implementation
- [ ] SAML for enterprise SSO
- [ ] Role-based access control (RBAC) UI
- [ ] Activity log viewer

### Phase 4: Performance & Scale

- [ ] Token caching (Redis)
- [ ] Refresh token rotation
- [ ] Distributed rate limiting
- [ ] Analytics dashboard
- [ ] Threat detection ML model

---

## 📚 References

- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- JWT Best Practices: https://tools.ietf.org/html/rfc8725
- Password Storage: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- NIST Password Guidelines: https://pages.nist.gov/800-63-3/
- bcrypt: https://en.wikipedia.org/wiki/Bcrypt

---

**Document Status**: ✅ Ready for Implementation  
**Security Review**: ✅ Approved  
**Scalability Review**: ✅ Approved  
**Next Step**: Begin implementation of Auth Module
