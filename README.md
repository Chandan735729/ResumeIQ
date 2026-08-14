# ResumeIQ — Safe AI Resume Optimization & Deterministic ATS Scoring

ResumeIQ is a production-engineered SaaS platform that optimizes resumes for target job descriptions with mathematical precision. It combines a 100% deterministic, explainable ATS matching engine with fact-guarded AI phrasing improvements and enterprise-grade document generation.

---

## 🚀 Key Features

- **Deterministic ATS Scoring**: 100% mathematical, reproducible scoring across 7 weighted dimensions (skills, tech, keywords, experience, education, certifications, responsibilities) with exact evidence citations. AI never dictates the authoritative score.
- **Safe AI Optimization**: Phrasing enhancements powered by Google Gemini (`optimization-v1`) with untrusted data isolation (`<<<UNTRUSTED>>>`) and strict post-generation fact guardrails that reject unevidenced technologies, fake certifications, or invented metrics.
- **Robust Resume Ingestion**: 3-tier parsing fallback (Static PDFJS Worker → pdf-parse → pdf2json → mammoth DOCX) with timeout safeguards and user-isolated storage.
- **Enterprise Document Generation**: Generates clean, multi-page, ATS-friendly PDF and DOCX files with automated magic bytes and round-trip parser verification.
- **Resume Versioning & Comparison**: Immutable original resumes with sequential version tracking, detailed side-by-side diffs, and before/after score metrics.
- **Modern Full-Stack Frontend**: Fast React 18 single-page application built with Vite, TypeScript, TailwindCSS, Zustand state management, and React Router.
- **Production Hardened**: Structured Winston logging with `X-Request-Id` correlation, dedicated authentication rate limiting, and storage orphan reconciliation.

---

## 🏗️ Architecture

```
[ React 18 + Vite Frontend ]
              │
         HTTPS / JSON (JWT + X-Request-Id)
              ▼
[ Express API + Rate Limiters + Request Correlation ]
              │
   ┌──────────┼──────────────────────┐
   ▼          ▼                      ▼
[ Ingestion ] [ Deterministic Engine] [ Safe AI Boundary ]
- PDFJS       - Regex JD Extractor   - optimization-v1 Prompts
- pdf-parse   - Skill Aliasing       - Fact Guardrails
- mammoth     - 7-Component ATS      - Mathematical Re-Scorer
   │          │                      │
   └──────────┼──────────────────────┘
              ▼
[ Document Generation Subsystem ]
- PDFKit Multi-Page Engine
- OpenXML DOCX Engine
- Magic Bytes & Parser Round-Trip Validator
              │
              ▼
[ Storage & Database Layer ]
- PostgreSQL 15 (Prisma ORM, Foreign Key Cascades)
- Local User Storage (Path Traversal Safe)
- Storage Orphan File Reconciliation Service
```

---

## 🎯 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+ (or Docker & Docker Compose)
- Google Gemini API Key (optional for local mock testing; required for live AI optimization)

### 1. Clone & Configure
```bash
git clone https://github.com/Chandan735729/ResumeIQ.git
cd ResumeIQ

# Configure environment variables
cp .env.example .env
cp backend/.env.example backend/.env
```

### 2. Backend Setup
```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy

# Run tests
npm test -- --runInBand

# Start backend server (port 3000)
npm run dev
```

### 3. Frontend Setup
```bash
cd ../frontend
npm install

# Run type check and lint
npm run type-check
npm run lint

# Start development server (port 3001)
npm run dev
```

---

## 🧪 Testing & Verification

ResumeIQ includes a comprehensive suite of unit, integration, and security tests:

```bash
# In backend/ directory:
npm test                        # Runs all 216+ non-DB unit & integration tests
npm run type-check              # TypeScript verification (0 errors)
npm run lint                    # ESLint code quality (0 errors)
npm run build                   # Production compilation

# In frontend/ directory:
npm run type-check              # TypeScript verification (0 errors)
npm run lint                    # ESLint verification (0 errors)
npm run build                   # Production bundle build
```

---

## 🔒 Security & Privacy

- **No Data Hallucination**: AI suggestions are deterministic-guarded against unevidenced facts.
- **Tenant Isolation**: Strict ownership checks prevent cross-user IDOR access.
- **PII-Safe Logging**: Winston formatter sanitizes passwords, tokens, API keys, and candidate full text.
- **Header Injection Defense**: RFC 5987 filename sanitization on download headers.
- **Dedicated Rate Limiting**: Throttles brute-force attempts on login, registration, and refresh endpoints.

---

## 📊 Release Status

- **Engineering Readiness**: `96 / 100`
- **Deployment Readiness**: `82 / 100`
- **Release Decision**: `GO (CONDITIONAL)`
- **Detailed Audits**: See [FINAL_PRODUCTION_AUDIT.md](./docs/FINAL_PRODUCTION_AUDIT.md) and [PHASE_REPORTS/](./docs/PHASE_REPORTS/).

---

## 📄 License

MIT License — see [LICENSE](./LICENSE) for details.
