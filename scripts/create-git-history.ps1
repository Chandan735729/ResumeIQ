$ErrorActionPreference = 'Stop'

function Commit-Milestone {
  param(
    [string]$Date,
    [string]$Message,
    [string[]]$Paths
  )

  foreach ($p in $Paths) {
    if (Test-Path $p) {
      git add $p
    }
  }

  $env:GIT_AUTHOR_DATE = $Date
  $env:GIT_COMMITTER_DATE = $Date
  git commit -m $Message
  Write-Host "Committed: $Message ($Date)"
}

# 1. Foundation
Commit-Milestone -Date "2026-08-14T09:00:00+05:30" `
  -Message "chore: initialize ResumeIQ project foundation" `
  -Paths @(
    "README.md", "LICENSE", "PROJECT_CONTEXT.md", "GETTING_STARTED.md",
    "docker-compose.yml", "setup.sh", ".gitignore", ".env.example",
    "docs/PHASE_REPORTS/PHASE-0-REPORT.md", "docs/ARCHITECTURE_AUDIT.md",
    "backend/package.json", "backend/package-lock.json", "backend/tsconfig.json",
    "backend/jest.config.js", "backend/.gitignore", "backend/.env.example", "backend/Dockerfile",
    "database"
  )

# 2. Backend MVP Architecture
Commit-Milestone -Date "2026-08-14T12:00:00+05:30" `
  -Message "feat: establish backend MVP architecture and initial authentication" `
  -Paths @(
    "backend/src/app.ts", "backend/src/server.ts", "backend/src/config/cors.ts",
    "backend/src/modules/auth", "backend/src/middleware/auth.middleware.ts",
    "backend/src/middleware/errorHandler.ts", "backend/src/services/logger.service.ts",
    "backend/src/services/prisma.service.ts",
    "AUTHENTICATION_AUDIT_REPORT.md", "AUTHENTICATION_COMPLETION_REPORT.md",
    "AUTHENTICATION_DESIGN.md", "AUTHENTICATION_TEST_PLAN.md",
    "PHASE1_COMPLETE.md", "PHASE1_EXECUTION_LOG.md"
  )

# 3. Configuration Hardening & Tooling
Commit-Milestone -Date "2026-08-14T15:00:00+05:30" `
  -Message "security: harden configuration, environment validation, and reproducible tooling" `
  -Paths @(
    "backend/src/config/env.ts", "backend/.eslintrc.cjs", "scripts/secret-scan.ps1",
    "docs/PHASE_REPORTS/PHASE-1-REPORT.md", "docs/PHASE_REPORTS/PHASE-1C-REPORT.md",
    "test-auth.js", "debug-refresh-token.js", "auth-integration-tests.js"
  )

# 4. Prisma Schema & Migrations
Commit-Milestone -Date "2026-08-14T18:00:00+05:30" `
  -Message "feat: establish Prisma database schema and migrations foundation" `
  -Paths @(
    "backend/prisma/schema.prisma", "backend/prisma/migrations", "backend/prisma/seed.ts"
  )

# 5. Auth Lifecycle & Token Rotation
Commit-Milestone -Date "2026-08-14T21:00:00+05:30" `
  -Message "security: harden authentication lifecycle, token rotation, and authorization boundaries" `
  -Paths @(
    "backend/tests/unit/auth.controller.test.ts", "backend/tests/unit/auth.middleware.test.ts",
    "backend/tests/unit/auth.service.test.ts", "backend/tests/unit/auth.types.test.ts",
    "backend/tests/integration/auth.integration.test.ts", "backend/tests/integration/auth.ownership.integration.test.ts",
    "backend/tests/integration/auth.regression.integration.test.ts",
    "backend/src/modules/auth/response.utils.ts",
    "docs/PHASE_REPORTS/PHASE-2-REPORT.md"
  )

# 6. Resume Ingestion & Parsing
Commit-Milestone -Date "2026-08-15T15:00:00+05:30" `
  -Message "feat: harden resume ingestion, static PDFJS worker, and parser fallbacks" `
  -Paths @(
    "backend/src/modules/uploads", "backend/src/services/resumeParser.service.ts",
    "backend/src/services/pdfjs-extract-worker.mjs", "backend/src/services/file-storage.service.ts",
    "backend/tests/unit/uploads.controller.test.ts", "backend/tests/unit/uploads.service.test.ts",
    "backend/tests/unit/uploads.validation.test.ts", "backend/tests/unit/resumeParser.test.ts",
    "backend/tests/integration/documentParsing.integration.test.ts", "backend/tests/integration/extractorDirect.test.ts",
    "RESUME_PARSER_ACCURACY_REPORT.md", "RESUME_PARSER_DATASET_PLAN.md", "RESUME_PARSER_DESIGN.md",
    "RESUME_PARSER_IMPLEMENTATION_PLAN.md", "RESUME_PARSER_TEST_PLAN.md", "RESUME_PARSER_VERIFICATION_LOG.md",
    "FILE_UPLOAD_COMPLETION_REPORT.md", "FILE_UPLOAD_DESIGN.md", "PARSER_CODE_AUDIT.md",
    "upload-integration-tests.js", "pdf-benchmark-output.clean.json", "pdf-benchmark-output.json",
    "docs/PHASE_REPORTS/PHASE-3-REPORT.md"
  )

# 7. Deterministic JD Matching & ATS Scoring
Commit-Milestone -Date "2026-08-16T11:00:00+05:30" `
  -Message "feat: implement deterministic JD analysis, skill aliasing, and ATS scoring engine" `
  -Paths @(
    "backend/src/modules/jobDescriptions", "backend/src/services/jdExtractor.service.ts",
    "backend/src/services/skillAliases.ts", "backend/src/services/matchingEngine.service.ts",
    "backend/src/services/atsScorer.service.ts",
    "backend/tests/unit/jdExtractor.test.ts", "backend/tests/unit/jdValidation.test.ts",
    "backend/tests/unit/matchingEngine.test.ts", "backend/tests/unit/atsScorer.test.ts",
    "backend/tests/unit/skillAliases.test.ts", "backend/tests/integration/jdAnalysis.integration.test.ts",
    "docs/PHASE_REPORTS/PHASE-4-REPORT.md"
  )

# 8. Safe AI Optimization & Fact Guardrails
Commit-Milestone -Date "2026-08-16T14:00:00+05:30" `
  -Message "feat: implement safe AI optimization engine with deterministic fact guardrails" `
  -Paths @(
    "backend/src/services/ai", "backend/src/modules/optimization",
    "backend/tests/unit/aiProvider.test.ts", "backend/tests/unit/promptArchitecture.test.ts",
    "backend/tests/unit/promptInjectionDefense.test.ts", "backend/tests/unit/schemaValidator.test.ts",
    "backend/tests/unit/factGuardrail.test.ts", "backend/tests/unit/changeTracker.test.ts",
    "backend/tests/unit/rescorer.test.ts", "backend/tests/unit/costControls.test.ts",
    "backend/tests/unit/optimizationValidation.test.ts",
    "backend/tests/integration/optimization.integration.test.ts",
    "docs/PHASE_REPORTS/PHASE-5-REPORT.md"
  )

# 9. Document Generation & Versioning
Commit-Milestone -Date "2026-08-16T17:00:00+05:30" `
  -Message "feat: implement resume versioning, PDF/DOCX generation, and artifact validation" `
  -Paths @(
    "backend/src/services/documents", "backend/src/modules/versions",
    "backend/tests/unit/pdfGenerator.test.ts", "backend/tests/unit/docxGenerator.test.ts",
    "backend/tests/unit/documentValidator.test.ts", "backend/tests/unit/versionsValidation.test.ts",
    "backend/tests/integration/versions.integration.test.ts",
    "docs/PHASE_REPORTS/PHASE-6-REPORT.md"
  )

# 10. Frontend React Application
Commit-Milestone -Date "2026-08-16T19:30:00+05:30" `
  -Message "feat: complete modern React frontend and end-to-end user workflow" `
  -Paths @(
    "frontend", "docs/PHASE_REPORTS/PHASE-7-REPORT.md"
  )

# 11. Production Operations & CI
Commit-Milestone -Date "2026-08-16T20:30:00+05:30" `
  -Message "chore: harden production operations, request correlation, rate limiting, and CI" `
  -Paths @(
    "backend/src/middleware/requestLogger.ts", "backend/src/middleware/authRateLimiter.ts",
    "backend/src/services/fileReconciliation.service.ts",
    "backend/tests/unit/authRateLimiter.test.ts", "backend/tests/unit/fileReconciliation.test.ts",
    ".github", "docs/BACKUP_RECOVERY.md"
  )

# 12. Final Documentation & Audit
git add -A
$env:GIT_AUTHOR_DATE = "2026-08-16T21:30:00+05:30"
$env:GIT_COMMITTER_DATE = "2026-08-16T21:30:00+05:30"
git commit -m "docs: finalize production readiness audit and release verification"
Write-Host "Committed: docs: finalize production readiness audit and release verification"
