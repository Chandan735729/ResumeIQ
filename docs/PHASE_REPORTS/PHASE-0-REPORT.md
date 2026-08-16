# ResumeIQ — Phase 0 Full Repository Audit

**Audit date:** 2026-08-14  
**Phase 0 gate:** PASSED  
**Project status:** Prototype  
**Production readiness:** 18/100

## 1. Executive Summary

The repository verifies as a backend prototype, not a production-grade or end-to-end ResumeIQ SaaS. The Express API has partial auth, local file upload persistence, a parser service, Docker development definitions, a Prisma schema, and a small Jest suite. The frontend implementation and the central advertised product capabilities are absent. A real-looking AI credential is exposed in runtime configuration, there is no verified database migration history, lint and two parser tests fail, and local startup cannot connect to its database.

## 2. Current Project Status

**Prototype.** The code demonstrates component-level foundations, but no verified user journey reaches job analysis, scoring, optimization, document generation, comparison, download, or history. The README's “production-grade,” “GDPR compliant,” and broad feature claims are not substantiated by the repository.

## 3. Repository Architecture

See [ARCHITECTURE_AUDIT.md](../audits/ARCHITECTURE_AUDIT.md). Implemented traffic is Express → Prisma/PostgreSQL and local `/app/storage`; Winston emits console and local log files. Redis, Gemini, AWS S3, and frontend packages are configuration/dependency intentions, not integrated services.

## 4. Actual Technology Stack

| Area | Verified technology | Status |
|---|---|---|
| Language/runtime | TypeScript; Node v22.14.0 observed (Dockerfile requests Node 20) | Partial version alignment |
| API | Express 4, Helmet, express-rate-limit, JWT, Zod | Implemented/partial |
| Persistence | Prisma 5.8, PostgreSQL configured | Unverified runtime |
| Cache | Redis 7 in Compose, `redis` package | Not integrated |
| Parsing | `pdfjs-dist` child process with `pdf-parse` fallback; Mammoth DOCX | Partial/broken PDFs |
| Storage | fs-extra local filesystem | Implemented only locally |
| Tests | Jest + ts-jest | Partial |
| Frontend | package declares React/Vite/Zustand/React Query | No source/dependencies |
| Package manager | npm; backend lockfile only | Frontend non-reproducible |

README correctly calls the frontend “coming soon” in one place but also makes unsupported security/feature claims. It refers to scripts (`db:migrate`, `db:seed`, `test:coverage`, `type-check`) that do not exist in `backend/package.json`.

## 5. Build & Runtime Results

| Check | Result | Evidence |
|---|---|---|
| Backend dependencies | Present locally | `backend/node_modules` exists |
| Backend build | PASS | `npm run build` completed |
| Backend lint | FAIL | 18 errors, 78 warnings |
| Backend tests | FAIL | 53 passed, 2 failed, 55 total |
| Backend start | FAIL in audited environment | cannot reach configured `postgres:5432` |
| Prisma schema validation | PASS | backend schema valid |
| Migration status | NOT VERIFIED | connection targets unavailable `postgres`; no migrations found |
| Frontend install/build/type/lint | FAIL / NOT VERIFIABLE | no lockfile/node_modules; `tsc` and ESLint unavailable; `src` is empty |
| Docker config render | PASS, with secret exposure | `docker compose config` rendered services |
| Docker startup | NOT VERIFIED | daemon inaccessible in audit environment |
| Dependency vulnerability audit | NOT VERIFIED | npm audit registry endpoint inaccessible |

## 6. Backend Audit

**IMPLEMENTED:** Express app, security headers, global rate limit, manual CORS, liveness endpoint, auth routing, upload routing, Winston files, Prisma access.  
**PARTIAL:** controller/service/repository layers, errors, auth, parsing, local storage.  
**MISSING:** job analysis, deterministic scoring, AI optimization, document generation, download, history APIs, async processing, Redis usage, email/reset flows, production config.

The app exposes only auth and resume routes. Error response formats differ between app-level error/404 handlers and module response utilities. Multiple `PrismaClient` instances are created. The logger uses string formats rather than structured fields, records local files, and no request ID is present.

## 7. Frontend Audit

**MISSING.** `frontend/` contains `package.json` and an empty `src/` directory only. No React entry point, Vite config, pages, routes, components, auth UI, upload UI, API client, accessibility states, tests, or lockfile were found. Its build/lint/type-check commands cannot execute because dependencies are not installed.

## 8. Database Audit

`backend/prisma/schema.prisma` is valid and contains users, subscriptions, resumes, original files, versions, jobs, metrics, usage, and audit/refresh-token models. Relationships include user ownership and several foreign keys/cascades. However:

- `database/schema.prisma` is a different schema, while documentation calls it the source of truth.
- `database/migrations/` contains no migration SQL/directories; clean creation and deployment cannot be verified.
- `database/seed.ts` is disconnected from package scripts.
- The running configuration targets `postgres`, correct only on the Compose network, while backend `.env` describes localhost.

## 9. Authentication & Authorization Audit

Registration/login use Zod policy checks and bcryptjs with 12 rounds. Access JWTs use HS256 and a 15-minute expiry; refresh tokens have seven-day expiry and revocation fields. Profile and resume data require JWT; resume get/delete compare `resume.userId` to caller ID, so direct cross-user resume retrieval/deletion is code-level protected.

Risks: the service falls back to a known development JWT secret, refresh tokens are stored as raw bearer tokens despite schema comments saying hashed, a token prefix is logged during refresh, logout has no JWT middleware, and an unknown-user login attempts an audit row with `userId: 'unknown'` even though the schema requires a real user relation. No password reset, verification, lockout, per-identity auth rate limit, session rotation, or auth integration tests were verified.

## 10. Resume Upload & Parsing Audit

Pipeline actually implemented:

```text
Authenticated upload -> Multer memory buffer (10 MB) -> MIME/extension/magic-byte/name validation
-> local `/app/storage/users/<id>/originals` file -> Resume + OriginalFile + AuditLog database rows
```

It stops there: parsing is never invoked, `extractedText` remains empty, and the response truthfully says `parseStatus: pending`. PDF uses a PDFJS subprocess then `pdf-parse`; DOCX uses Mammoth. Section/contact/skill heuristic normalization exists, and low-text/missing-section warnings are produced. The test failures demonstrate PDF extraction is not reliable for all supplied fixtures. Scanned/malformed/complex resumes do not have a tested durable handling lifecycle. `.doc` is allowed by MIME/extension but is treated as DOCX and only has ZIP magic-byte support, so legacy DOC cannot be validly uploaded.

Filename sanitization and basic path checks exist. Storage is local only; S3 throws. Delete cascades database records but does not delete the local file, leaving orphaned PII.

## 11. Job Description Audit

**MISSING.** Database types/schema describe job fields, but no route, controller, analyser, prompt, structured schema, or test exists.

## 12. ATS Scoring Audit

**MISSING.** Types and Prisma fields define score names only. No scoring algorithm, weights, explanation, input processing, or test exists. Scores cannot be considered reproducible.

## 13. AI Audit

**MISSING.** A Google key and Gemini variables/dependencies/documentation exist, but no provider client, model call, prompt, structured-output validator, retry, timeout, cost/rate limit, prompt-injection control, or hallucination prevention was found. Untrusted resume/JD content has no AI boundary because AI is not implemented.

## 14. Resume Generation Audit

**MISSING.** `pdf-lib`/`pdfkit` are declared dependencies but there is no generation service, template, endpoint, test, download route, or output storage. Formatting-preserving generation is not verified.

## 15. Testing Audit

| Type | Verified state |
|---|---|
| Unit | Parser and upload validation tests: 53 passed, 1 parser test failed |
| Integration | Parser fixture suite: 1 test failed |
| API/auth/database/security/E2E/frontend | No runnable suite found |
| Coverage | Historical coverage directory exists; no current coverage command/report verified |

Jest also warns that the ts-jest configuration is deprecated. Existing root JavaScript test scripts are ad hoc and not wired into `package.json`.

## 16. Security Audit

P0: credential exposure. P1: raw refresh-token persistence/prefix logging, development-secret fallback, and likely foreign-key error on unknown login. Positive controls include Helmet, explicit CORS origin, global IP rate limit, bcrypt, signed expiring access tokens, upload size/MIME/extension/header checks, filename sanitization, and resume ownership checks. Missing/not verified: TLS deployment, secret rotation/scanning, CSRF strategy, request correlation, security tests, dependency audit, malware scanning, content-disposition/download controls, and production CORS/proxy configuration.

## 17. Deployment Audit

Compose defines Postgres 15, Redis 7, and a development backend with source bind mounts and `npm run dev`. The Dockerfile runs `npm install` rather than deterministic `npm ci`, has no production build stage, and defaults to a development server. No migration is run in the Dockerfile/Compose command despite README claims. Docker startup was not verifiable because the local daemon is unavailable. No Vercel, cloud deployment, health/readiness, CI/CD, frontend deployment, persistent production storage, or production URL configuration was found.

## 18. Observability Audit

Partial: console/file logs and `/health` liveness. Missing: structured JSON logs, request IDs, readiness/dependency checks, metrics, traces, error tracking, alerting, database/Redis monitoring, AI telemetry, and deployment monitoring.

## 19. Documentation Audit

README, GETTING_STARTED, PROJECT_CONTEXT, and historical completion reports are aspirational and conflict with executable code. Concrete discrepancies: promised automatic migrations and scripts do not exist; the frontend is absent; Redis/Gemini/S3 are not wired; tests do not pass; no API/DATABASE/ARCHITECTURE files previously existed; and security/GDPR claims are unverified. This Phase 0 documentation establishes the baseline.

## 20. Feature Matrix

| Feature | Implemented | Working | Tested | Secure | Production Ready |
|---|---|---|---|---|---|
| Authentication | PARTIAL | PARTIAL | NO | PARTIAL | NO |
| Resume Upload | PARTIAL | UNKNOWN | PARTIAL | PARTIAL | NO |
| Resume Parsing | PARTIAL | PARTIAL | PARTIAL | UNKNOWN | NO |
| Job Analysis | NO | NO | NO | NO | NO |
| ATS Scoring | NO | NO | NO | NO | NO |
| AI Optimization | NO | NO | NO | NO | NO |
| Resume Generation | NO | NO | NO | NO | NO |
| Comparison | NO | NO | NO | NO | NO |
| Version History | NO | NO | NO | NO | NO |
| Analytics | NO | NO | NO | NO | NO |
| Batch Processing | NO | NO | NO | NO | NO |

## 21. Core User Journey Audit

| Step | Implemented | Working | Tested/verified | Blocking issue |
|---|---|---|---|---|
| Register / login | PARTIAL | UNKNOWN | Not runtime verified | DB unavailable; auth flaws |
| Upload | PARTIAL | UNKNOWN | Validation unit tests | DB unavailable; no parse trigger |
| Parse | PARTIAL | PARTIAL | 2 parser tests fail | PDF regression |
| Add/analyse JD | NO | NO | NO | No API/service |
| ATS / AI optimization / validation | NO | NO | NO | No implementation |
| Generate / compare / download / save history | NO | NO | NO | No implementation |

## 22. Critical Issues

P0-01, P0-02, and P0-03 are detailed in [ISSUE_TRACKER.md](../ISSUE_TRACKER.md): exposed AI credential, absent core product journey, and no verified database migration source of truth. Counts: **P0 3**.

## 23. High Priority Issues

P1-01 through P1-07 cover refresh-token handling, failed-login audit integrity, PDF parser regression, runtime database reachability, incomplete file lifecycle, route shadowing, and failed lint. Counts: **P1 7**.

## 24. Medium Priority Issues

P2-01 through P2-03 cover missing test layers, deployment/operations configuration, and insufficient auth-specific abuse protection. Counts: **P2 3**.

## 25. Low Priority Issues

P3-01 and P3-02 cover pervasive unsafe typing and the unavailable dependency audit. Counts: **P3 2**.

## 26. Technical Debt

Type-safety bypasses (`any` persistence casts), 18 lint errors, deprecated ts-jest config, unused CORS configuration, local-only storage, uncoordinated Prisma clients, inconsistent error envelopes, schema duplication, stale historical reports, and committed/generated coverage/log artifacts all obscure the real baseline.

## 27. Missing Capabilities

Frontend, JD ingestion/analysis, deterministic/scored matching, AI safety/optimization, result validation, PDF/DOCX generation and download, persistent object storage, migration/seed automation, password recovery/verification, user-level rate limits, CI/CD, production deployment, monitoring, and complete test layers are missing.

## 28. Recommended Phase Order

1. **Phase 1 — Secure and reproducible foundation:** rotate secret, normalize configuration, restore lint, fix Docker/runtime, add CI and dependency scanning.
2. **Phase 2 — Database and auth correctness:** single schema/migrations, clean migration test, auth token/audit repairs, integration tests.
3. **Phase 3 — Upload and parser reliability:** transactional lifecycle/cleanup, correct route order and legacy format policy, parser fixtures/regression repairs.
4. **Phase 4 — Job description and deterministic matching:** validated JD model/API and explainable testable scoring.
5. **Phase 5 — AI optimization safety:** provider boundary, schemas, prompts, controls, evaluation and cost limits.
6. **Phase 6 — Generation and complete frontend journey:** document outputs, UI, comparison/download/history, E2E/accessibility.
7. **Phase 7 — Production operations:** production storage/deployments, observability, performance/security validation.

This order puts secret, database, authentication, and reliable file handling ahead of user-facing product expansion.

## 29. Production Readiness Score

**18/100.** Transparent allocation: 5/15 build/runtime, 4/15 data/deployment, 4/20 security, 3/20 product completeness, 2/15 testing/quality, 0/15 observability/operations. A compiling backend foundation earns limited credit; exposed credential, failed tests/lint, missing user journey, and missing production operations prevent a higher score.

## 30. Phase 0 Gate

**PASSED.** The audit scope was completed and baseline reports were created. This does not mean the application passed production readiness.

## 31. Recommended Next Phase

**Next Phase:** Phase 1 — Secure and reproducible foundation.  
**Why:** Credential exposure and an unverified runtime/database path invalidate every later integration.  
**Top priorities:** revoke/rotate exposed key; establish one configuration/schema/migration path; make backend lint/build/start/test gates reproducible; add CI and secret/dependency scanning.
