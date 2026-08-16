# ResumeIQ — Security Architecture & Threat Model

This document outlines the multi-layered security architecture, defense-in-depth principles, and threat mitigations implemented across the ResumeIQ platform.

---

## 1. Core Security Principles

1. **Deterministic Authority**: AI is treated as an untrusted phrasing assistant. The deterministic ATS scoring engine and post-generation fact guardrails retain absolute authority over candidate qualification metrics.
2. **Tenant & Data Isolation**: All database records and storage directories are strictly scoped to authenticated user IDs with automated ownership verification (`verifyResumeOwnership`).
3. **Defense-in-Depth Ingestion**: File uploads are restricted by magic byte validation, MIME-type verification, file size limits (10MB), and child-process timeout sandboxing.
4. **Zero-PII Log Scrutiny**: Structured Winston logging preserves metadata objects while stripping passwords, JWT tokens, refresh tokens, API keys, and candidate full text.

---

## 2. Authentication & Authorization

### 2.1 Password Hashing & JWT
- **Password Security**: Passwords hashed using bcrypt with salt rounds = 10.
- **Access Tokens**: Short-lived JWTs (24h default) signed with high-entropy keys (min 32 characters).
- **Refresh Token Rotation**: Refresh tokens are single-use; each refresh issues a new token family and revokes previous tokens.
- **Logout Invalidation**: Logout revokes active refresh tokens and clears client session cookies/local storage.

### 2.2 Dedicated Rate Limiting
- **Login Rate Limiter**: 15 attempts per 15 minutes per IP.
- **Registration Rate Limiter**: 10 accounts per hour per IP.
- **Token Refresh Rate Limiter**: 45 requests per 15 minutes per IP.
- **Global API Rate Limiter**: 100 requests per 15 minutes per IP.

---

## 3. Storage & Document Delivery Security

### 3.1 Path Traversal Defenses
- Storage keys follow strict template: `users/{userId}/originals/{resumeId}.{ext}`.
- Sanitized filenames strip `..`, `/`, and `\` characters.
- Base directory boundaries are enforced prior to any filesystem read or write.

### 3.2 RFC 5987 Header Sanitization
- File download endpoints protect against HTTP response splitting and header injection by encoding filenames via RFC 5987 syntax:
  ```http
  Content-Disposition: attachment; filename="Resume.pdf"; filename*=UTF-8''Resume.pdf
  ```

---

## 4. AI Guardrails & Prompt Injection Defense

### 4.1 Untrusted Input Delimiters
- All user-supplied resume text and job description content are wrapped with strict untrusted boundaries (`<<<UNTRUSTED_RESUME_TEXT>>>` and `<<<UNTRUSTED_JOB_DESCRIPTION>>>`).
- System instructions explicitly command the LLM to ignore any instructions, prompts, or attempts to modify evaluation criteria contained inside untrusted blocks.

### 4.2 Deterministic Fact Guardrails (`factGuardrail.ts`)
- Every change proposed by the AI is intercepted by a post-generation rule engine before persistence:
  - **Technologies**: Rejected if not present in the candidate's original parsed skill set.
  - **Certifications / Degrees**: Rejected if introducing new unverified credentials.
  - **Numeric Metrics**: Rejected if fabricating new quantitative figures.
  - **Rejected Suggestions**: Preserves candidate's original text and records rejection reasons.

---

## 5. Storage Orphan Reconciliation

- `FileReconciliationService` scans storage directories against database records (`OriginalFile` and `ResumeVersion`).
- Files older than 24 hours without DB references are detected and safely purged in cleanup mode.
