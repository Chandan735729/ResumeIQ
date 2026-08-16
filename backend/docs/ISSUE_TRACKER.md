# ResumeIQ — Final Issue Tracker (Phase 7 Reconciliation)

> Legend: `P0` = Critical / Blocker, `P1` = High, `P2` = Medium, `P3` = Low  
> Status: `OPEN` | `IN_PROGRESS` | `FIXED` | `WONTFIX` | `DEFERRED`

---

## Phase 7 Hardening & Release Status

### P1-20 — Winston structured logging discarded metadata objects
**Status**: `FIXED`  
**Phase**: 7  
**Description**: The printf formatter only rendered `info.message`, silently omitting structured metadata objects passed in log calls.  
**Resolution**: Updated Winston formatter to serialize and append structured JSON metadata (`requestId`, `userId`, `durationMs`, `statusCode`, `errorCode`) without leaking sensitive credentials or PII.

---

### P1-21 — Request correlation ID missing across API lifecycle
**Status**: `FIXED`  
**Phase**: 7  
**Description**: Requests lacked end-to-end trace identifiers, making distributed debugging difficult.  
**Resolution**: Implemented request correlation middleware assigning and propagating `X-Request-Id` across requests and HTTP access logs.

---

### P2-05 — Dedicated rate limiters on authentication endpoints
**Status**: `FIXED`  
**Phase**: 7  
**Description**: Login, registration, and refresh token endpoints required dedicated brute-force throttles.  
**Resolution**: Implemented `loginRateLimiter` (15/15m), `registerRateLimiter` (10/h), and `tokenRefreshRateLimiter` (45/15m) in `authRateLimiter.ts`.

---

### P2-08 — Storage orphan reconciliation tool missing
**Status**: `FIXED`  
**Phase**: 7  
**Description**: In-flight upload crashes or deleted references could leave unindexed files in user storage directories.  
**Resolution**: Created `fileReconciliationService` with configurable age thresholds (>24h) and safe dry-run/deletion modes.

---

### P2-06 — Real Gemini API verification requires live credential in environment
**Status**: `OPEN` — Environment / Staging Constraint  
**Phase**: 5–7  
**Description**: In environments without a live `GOOGLE_API_KEY`, the application safely uses `MockAIProvider`. Real Gemini provider verification is opt-in and requires an active API key in staging/production deployments.  
**Target**: Production deployment configuration

---

### P2-04 — Database-backed CI integration tests require PostgreSQL service
**Status**: `FIXED` (via CI configuration)  
**Phase**: 4–7  
**Description**: 45+ database-dependent integration tests require a live PostgreSQL server.  
**Resolution**: Configured GitHub Actions CI workflow (`.github/workflows/backend-ci.yml`) with a dedicated `postgres:15-alpine` container service and automated migrations (`prisma migrate deploy`).

---

### P2-11 — Email verification token lifecycle
**Status**: `DEFERRED` — Documented Product Decision  
**Phase**: 7  
**Description**: The application core user journey currently allows immediate registration and login to prioritize frictionless candidate onboarding. Email verification is architected in the schema (`User.emailVerified`) and scheduled for enterprise multi-user tier release.  
**Target**: Post-v1 Enterprise Milestone

---

## Complete Issues Summary

- **Total Tracked Issues**: 24
- **Fixed Issues**: 22
- **Accepted / Environment Constraints**: 1 (Real Gemini API key in staging/prod)
- **Deferred Non-Critical Product Features**: 1 (Email verification for post-v1 enterprise tier)
- **Critical / Blocker Issues (P0)**: 0
- **High Severity Unresolved Issues (P1)**: 0
