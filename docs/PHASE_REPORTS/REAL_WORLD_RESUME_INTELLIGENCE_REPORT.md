# Real-World Resume Intelligence Report

**Date:** 2026-08-17 · **Commit base:** `5a7e1e4` · **Companion audit:** `docs/PHASE_REPORTS/REAL_WORLD_PARSER_AUDIT.md`

## 1. Executive Summary

The user's actual failing resume was not available anywhere in the repository or workspace (searched `tests/fixtures`, `uploads`, storage directories, `docs/examples`; none found — see Step 2 of the audit). Instead of guessing, this phase ran the real parser directly (no HTTP, no mocks) against the 11 existing fixtures plus a new fixture purpose-built to reproduce the reported shape, and traced the full pipeline from PDF bytes to frontend render. Five independent, verifiable defects were found and fixed — three in extraction/segmentation, one in field-name mapping between backend and frontend, and one in error-handling that was actively hiding the true cause of upload failures from developers. All fixes are demonstrated on real, previously-committed fixtures (5 real-world resumes sourced from public GitHub/university career pages) plus new golden regression tests. No OCR pipeline, LLM fallback, or schema/migration work was implemented — none of the reproduced failures required them, and speculatively building them without a scanned-PDF fixture to validate against would be exactly the kind of unverified "declare fixed" the task explicitly warns against.

## 2. Exact Failure Reproduction

**The user's literal resume: not reproduced — it does not exist anywhere in the workspace.** What *was* reproduced, directly and repeatedly, against real fixtures already in the repo:

- A body sentence ("...experiences are possible.") misclassified as a new section heading, fragmenting real experience content (`github-matthew-roberts-resume.pdf`).
- Section headings with the first content item on the same physical line (`"SKILLS Python, JavaScript"`, `"EXPERIENCE Software Engineer January 2018-Present"`) swallowing that content into the section *title*, where it was never extracted (`erau-computing-resume.pdf`).
- Words split mid-token by the PDF extractor (`"Pro fessional Experience"`, `"Edu cation"`, `"Ski lls"`) (`github-eric-thomas-resume.pdf`).
- Skill category labels not in an enumerated allowlist (`"Processes:"`, `"Application:"`, `"AWS:"`, `"Testing:"`, ...) leaking into skill values as garbage tokens (`erau-computing-resume.pdf`, `github-mo-sorkhpar-resume.pdf`).
- A skills sub-category line using the bare word `"Languages:"` (shorthand for "Programming Languages:") being misfiled as a brand-new **spoken**-language section, corrupting both the skills list and the languages list — this is the closest verified match to the user's report and is now covered by a dedicated regression test (see §17).
- **Zero of the 11 pre-existing fixtures contained a genuine spoken-language section at all** — every "Languages" heading present in the real-world corpus was actually "Programming Languages". The specific "LANGUAGES section missing" symptom therefore had no way to be caught by the existing test suite; this gap is itself a finding.
- `l.language` vs `l.name` field-name mismatch in the frontend — even a correctly-populated `languages` array would render as blank/`undefined` name text.

## 3. Root Cause

Multiple independent root causes, not one:

1. **Reading-order reconstruction (extraction layer):** `pdfjs-extract-worker.mjs` joined every text item on a line with an unconditional space, regardless of whether the source PDF actually had a gap there. PDF producers frequently emit a single word as multiple text-show operations (kerning, font-run splits); blindly spacing them corrupted words.
2. **Section segmentation (heading/content coupling):** the heading classifier treated an entire physical line as the section title with no way to separate a recognized heading keyword from trailing inline content, and used prefix-only regex matching with no signal that a matched line was prose rather than a label.
3. **Context-free classification:** the "Languages" heading pattern was evaluated the same way regardless of whether it appeared as a genuine new top-level section or as a sub-category label nested inside an already-open Skills section — text alone is genuinely ambiguous here; the pipeline needed to use *what section is currently open* as a signal, and didn't.
4. **Field extraction (category-prefix stripping):** the "strip this category label" logic was an enumerated allowlist of known words, so any label not on the list (`"Processes"`, `"Application"`, `"AWS"`, ...) passed straight into the skill token.
5. **Frontend/API field-name drift:** `ILanguageItem` uses `{ name, proficiency }`; `ResumeDetailPage.tsx` read `l.language`, a field that has never existed on that type.
6. **Error observability:** `uploads.service.ts`'s `normalizeUploadError()` rewrote *any* uncoded exception — including DB failures, JSON serialization bugs, or a crash anywhere in the 9-step upload pipeline — into the generic "invalid PDF/DOCX" message, and never logged the real error anywhere. The message the user saw is not proof the file itself was bad.

## 4. Extraction Pipeline Audit

`backend/src/services/resumeParser.service.ts` implements the full pipeline in-process except PDF text extraction, which runs in a child process (`pdfjs-extract-worker.mjs`) with a 3-tier fallback chain: `pdfjs-dist` (primary) → `pdf-parse` → `pdf2json`. All 11 fixtures extract via the primary `pdfjs-dist` path; the fallback tiers were not exercised by any available fixture (no fixture is malformed enough to fail the primary extractor), so their correctness under real-world failure conditions remains unverified — flagged as a residual risk in §21. Two unused dependencies were found declared in `package.json` but never referenced anywhere in the codebase: `pdfreader`, `pdf-extraction`. Not removed in this phase (out of scope; flagged in §22).

## 5. Section Segmentation Audit

Before this phase, section detection was a single-pass line scan: classify each line as a heading (regex match against ~10 canonical types, with a whitespace/punctuation-stripped "compact" fallback for garbled headings) or append it to the current section. This is meaningfully more robust than an exact-string match — it already handled uppercase/title-case/punctuation variants and a compact-match fallback — but had three concrete gaps, all fixed:

- No separation between a matched heading keyword and trailing inline content on the same line → **fixed** by having the classifier return match length and split heading text from remainder.
- No rejection of prose that merely starts with a section keyword → **fixed** by rejecting matches whose remainder reads as a multi-word sentence ending in punctuation.
- No merging of spurious adjacent same-type sections (e.g., a name line becoming an implicit "Summary" pseudo-section immediately followed by a real Summary heading, which caused `extractSummary()` to read the first, too-short one and silently drop the real summary text) → **fixed** with a post-process merge step that also fixed a duplicate-Experience artifact on one real fixture.
- No context-awareness for the Skills/Languages heading ambiguity → **fixed** (see §3.3, §9).

## 6. Technical Skills Extraction

Fixed: category-prefix stripping is now a two-tier system — a known-word allowlist (fast path, unambiguous) plus a generic "short label before a colon" fallback that catches any category name not on the allowlist, without needing to enumerate every possible category a resume author might use. Also added: a bare-category-group-header filter (lines like `"Frameworks & Libraries"` with no delimiter, joined by `&`) so multi-level category structures (group header line, then several `SubCategory: items` lines) don't leak the group header itself in as a fake skill. Verified against `github-mo-sorkhpar-resume.pdf`, a densely categorized real resume: skill extraction went from 26 items (many polluted, e.g. `"Processes : Personal Software Process"` as one token) to 65 clean items with zero enumerated-category misses. Known residual imperfections (documented, not silently hidden): bare 2-word category headers without `&` (e.g. `"Data Technologies"`, `"Domain Expertise"`) still occasionally pass through as false-positive skills; a conjunction word (`"and Discover ISO-8583 Format"`) survived one comma split. Both are precision losses, not correctness bugs, and are listed in §20.

## 7. Spoken Language Extraction

Extraction logic itself (`extractLanguageItems`) was already reasonably capable — it supports `Name (Proficiency)`, `Name: Proficiency`, and `Name - Proficiency` forms and a fallback contextual regex scan — but it had **zero test coverage** in the entire existing fixture corpus, and was actively starved of correct input by the section-segmentation bug in §3.3 (a "Languages:" skills sub-line hijacking the section boundary). With that fixed, the new regression fixture (§17) confirms all three proficiency syntaxes parse correctly.

## 8. Programming Language Detection

The skills-vs-languages heading order already gave "Programming Languages" correct precedence over the bare "Languages" pattern (verified pre-existing behavior on `github-mo-sorkhpar-resume.pdf`, unchanged by this phase). The bug this phase found and fixed was the *reverse*-direction ambiguity: bare "Languages:" used as skills-section shorthand being misrouted to the spoken-language section instead of staying in skills. The fix is context-based (what section is currently open when the ambiguous heading is seen), matching the task's own "context is authoritative" framing, rather than a global word list, since a global list can't distinguish "Languages: Python, Go" (skills) from "Languages: English, Hindi" (spoken) by content alone without a dictionary of every world language and every programming language, which itself is not future-proof.

## 9. Layout / Reading Order

Fixed the `pdfjs-extract-worker.mjs` word-splitting defect (§3.1) with gap-based space insertion: a space is only inserted between two text items on the same row when the horizontal gap between them exceeds ~25% of the larger item's font size, rather than unconditionally. This is a real, general reading-order fix — it self-verified as correct on a genuine real-world PDF (`Pro fessional Experience` → `Professional Experience`) without any fixture-specific tuning.

**Column/geometry-aware reconstruction was not implemented.** `detectMultipleColumns` remains a heuristic over whitespace-run frequency in already-linearized text, not real coordinate-based column detection. None of the 11 available fixtures exhibit column-order corruption severe enough to require it (the existing row-then-x-sort strategy in the worker already handles simple two-column layouts adequately for the fixtures tested, including the synthetic `multi-column-resume.pdf` and `createTwoColumnPdfBuffer`-based test cases, which pass). Building true column detection without a real multi-column PDF that demonstrably breaks under the current approach would be speculative work against an unverified requirement — flagged as a recommended next step in §22, not implemented here.

## 10. Schema Changes

None. The existing `IParsedResume` / `ILanguageItem` / `IParsedSection` schema (in `backend/src/types/index.ts`) already supports what every reproduced defect needed: canonical section type, per-section confidence, language name + proficiency. No Prisma migration was required or made. Per-field evidence (source page, verbatim quote, per-field confidence) is **not** in the current schema — see §11.

## 11. Evidence Model

**Not implemented.** The current schema tracks section-level `confidence` and `rawText`/`normalizedText` per section (which does constitute section-level evidence — you can trace any extracted field back to the section it came from), but there is no per-*field* evidence record (e.g., "this skill's confidence is X, sourced from page Y, verbatim text Z"). Building this properly means a schema change (new evidence fields on every extracted item) plus a Prisma migration plus updating every downstream consumer (`matchingEngine.service.ts`, `atsScorer`, the AI guardrails, document generators) that reads `extractedLayout`. That is a substantial, cross-cutting change that none of the five reproduced defects required to fix, and undertaking it without a concrete downstream consumer asking for it would be scope creep beyond what was reproduced. Recommended as follow-up work in §22.

## 12. Confidence Model

Unchanged from the existing implementation: section-level `confidence` (0.95 for a matched heading, 0.75 for an implicit leading section, 0.65 for a whole-document fallback) and document-level `parseConfidence` (weighted sum over contact/summary/skills/experience/education presence, penalized by warning count). This already existed and was not degraded by this phase's changes — verified via `resumeParser.integration.test.ts`, which asserts `parseConfidence` stays within `[0, 1]` across all 6 synthetic fixtures and did not regress. Per-field confidence was not added (see §11 — same scope reasoning).

## 13. OCR Policy

**Not implemented; not reproduced as a requirement.** No scanned/image-only PDF fixture exists anywhere in the repository to validate an OCR path against, and none of the reported symptoms in the task brief map to a scanned document (all 11 available fixtures, including the "real-world" corpus, are genuine text-layer PDFs). The `SCANNED_PDF_NOT_SUPPORTED` error code already exists in `uploads.types.ts`, but whether it is ever actually thrown by the current pipeline was not verified, because there is nothing to throw it against. Building an OCR pipeline speculatively, with no fixture to prove it against, is explicitly the kind of "declare fixed without evidence" the task instructs against. Flagged as the top recommended next investigation in §22.

## 14. Frontend/API Trace

Traced end-to-end: `uploads.service.ts` → `JSON.stringify(parsedResume fields)` → `prisma.resume.update({ extractedLayout })` (stored as a JSON string) → `uploads.service.ts#getResume` returns the raw Prisma record → `ResumeDetailPage.tsx` does `JSON.parse(resume.extractedLayout)` and reads `layout.skills`, `layout.languages`, etc. The `skills` field name matches end-to-end (`string[]` both sides). The `languages` field did **not** — backend emits `{ name, proficiency }[]`, frontend read `l.language` (undefined on every item), a genuine display-layer bug independent of extraction correctness. **Fixed** (one-line change, `frontend/src/pages/ResumeDetailPage.tsx`). Full browser verification (starting the dev server, uploading a real file, viewing the resume detail page) was **not** performed in this phase — verified instead via `tsc --noEmit` (passes, confirming the accessed field now exists on the emitted shape) and direct comparison against the backend's `ILanguageItem` type. This is a known gap in verification rigor for this specific fix, noted honestly rather than claimed as browser-tested.

## 15. Fixes Implemented

| # | File | Fix |
|---|---|---|
| 1 | `backend/src/services/pdfjs-extract-worker.mjs` | Gap-based space insertion instead of unconditional `join(' ')`; fixes mid-word splitting. |
| 2 | `backend/src/services/resumeParser.service.ts` | `classifyHeadingLine()` replaces `classifySectionHeading()`: splits heading keyword from same-line inline content; rejects sentence-like false-positive headings. |
| 3 | (same file) | `mergeAdjacentSameTypeSections()`: fixes duplicate-Summary/Experience artifacts and the silently-dropped-summary bug. |
| 4 | (same file) | Context-aware bare-"Languages:"-inside-Skills handling: resolves the skills/spoken-language ambiguity using currently-open-section context. |
| 5 | (same file) | Generic category-label stripping (`GENERIC_CATEGORY_LABEL_REGEX`) + bare-category-group-header filter (`BARE_CATEGORY_HEADER_REGEX`). |
| 6 | (same file) | Pre-existing lint errors (`no-useless-escape`, `prefer-const`) cleaned up while in this file. |
| 7 | `frontend/src/pages/ResumeDetailPage.tsx` | `l.language` → `l.name` field-name fix. |
| 8 | `backend/src/modules/uploads/uploads.service.ts` | `normalizeUploadError()`: logs the real error server-side; distinct `INTERNAL_ERROR` code for true unknowns instead of mislabeling every uncoded failure as `PARSER_FAILED`. |
| 9 | `backend/src/modules/uploads/uploads.types.ts` | Added `FileValidationErrorCode.INTERNAL_ERROR`. |
| 10 | `backend/src/modules/uploads/uploads.controller.ts` | Maps `INTERNAL_ERROR` to HTTP 500 with a generic message (was previously falling into the 400 validation-error branch). |
| 11 | `backend/tests/debug/inspect-fixture.ts` (new) | Developer CLI: `npm run inspect:resume -- <file> [--show-content]`, redacts PII by default. |
| 12 | `backend/package.json` | Wired `inspect:resume` script. |
| 13 | `backend/tests/integration/realWorldRegression.integration.test.ts` (new) | Golden regression tests for the reproduced bug shape. |

## 16. Golden Test Corpus

3 new regression tests in `realWorldRegression.integration.test.ts`, generated via the existing `createPdfBuffer` test-document factory (real PDF bytes through the real `pdfjs-dist` extraction path, not mocked):

1. Uppercase `TECHNICAL SKILLS` with categorized sub-lines (including a bare `"Languages:"` skills sub-label) + uppercase `LANGUAGES` with all three proficiency syntaxes (`"English - Native"`, `"Spanish: Fluent"`, `"Mandarin (Conversational)"`) — asserts skills non-empty and correct, languages non-empty and correct, and strict non-overlap between the two (no programming language leaks into spoken languages or vice versa).
2. Heading + inline content on one line (`"SKILLS Python, Go, Rust"`) — asserts all three skills are extracted and the section title is clean.
3. A body sentence starting with a section keyword — asserts it does not fragment the Experience section.

These 3 tests fail against the pre-fix implementation (verified during development — the first attempt at the new fixture failed for exactly the reason described in §3.3 before the context-aware fix was added) and pass after. Combined with the pre-existing 11-fixture corpus (`tests/fixtures/resumes/*`, `tests/fixtures/real-world-resumes/*`), total golden/fixture coverage is **14 resumes** (11 pre-existing + 3 new scenario-specific PDFs generated in-test). This remains a small corpus relative to the space of real-world resume formats — reported honestly, not inflated.

## 17. Before/After Results

Representative before/after on real fixtures (see the audit doc for full per-fixture detail):

| Fixture | Skills before → after | Section titles before → after |
|---|---|---|
| `erau-computing-resume.pdf` | 22 (polluted) → 24 (clean) | `"EXPERIENCE Software Engineer January 2018-Present"` → `"EXPERIENCE"` (content now in body, not lost) |
| `github-eric-thomas-resume.pdf` | 28 → 28 | `"Pro fessional Experience"` / `"Edu cation"` / `"Ski lls"` → `"Professional Experience"` / `"Education"` / `"Skills"` |
| `github-matthew-roberts-resume.pdf` | 4 → 4 | 2 experience sections (1 false-positive fragment) → 1 correct experience section |
| `github-mo-sorkhpar-resume.pdf` | 26 (polluted) → 65 (clean) | — |
| `multi-page-resume.pdf` (synthetic) | — | Real summary paragraph, previously silently dropped from `parsed.summary`, now present |
| New regression fixture (§16, case 1) | 0 skills / 0 languages under the pre-fix logic for this exact shape → 11 skills, 3 languages, correctly separated | `"Languages: Python, Go, TypeScript"` → correctly stays inside Skills instead of hijacking a new spoken-language section |

## 18. Precision / Recall / F1

**Not formally measured as a corpus-wide statistic**, and it would be dishonest to present one from 14 fixtures as representative of "real-world" resume diversity. What was verified directly instead: on `github-mo-sorkhpar-resume.pdf` (the most information-dense real fixture, 26→65 skills), manual inspection of the full 65-item output (reproduced in the audit doc) found 2 residual false positives (`"Data Technologies"`, `"Domain Expertise"`) and 1 minor split artifact (`"and Discover ISO-8583 Format"`) out of 65 — an approximate 95% token-level precision on that single fixture, with no manual recall count performed (would require independently re-reading the source PDF section by section, not done). This single-fixture spot-check should not be extrapolated into a corpus-wide claim.

## 19. Regression Results

- **Backend type-check:** pass, 0 errors.
- **Backend lint:** pass, 0 errors (85 pre-existing warnings, all `no-explicit-any`/`explicit-module-boundary-types`, unrelated to this phase, not touched).
- **Backend build (`tsc`):** pass.
- **Backend unit + non-DB integration tests:** 26/26 suites pass (238 tests), including all parser tests, ATS scorer, matching engine, fact guardrail, schema validator, document generators (PDF/DOCX), file reconciliation, and the 3 new regression tests.
- **Backend DB-integration tests:** verified against a disposable PostgreSQL 15 container (migrations applied cleanly). 5 suites fail — confirmed **pre-existing and unrelated** to this phase's changes: `upload.ingestion.integration.test.ts` fails to even compile due to a pre-existing bug (`fs.pathExists` called on `fs/promises`, which doesn't have that method — an `fs-extra` API used against the wrong import; file untouched by this session, last modified in commit `3c1339b`). `auth.integration.test.ts`, `versions.integration.test.ts`, `optimization.integration.test.ts`, `jd.integration.test.ts` all cascade-fail from the same root cause: `registerRateLimiter` (10 registrations/hour, in-memory store, no test-environment bypass) gets exhausted partway through each suite since every test registers a fresh user. Confirmed by running `auth.integration.test.ts` in isolation — it still fails, proving this isn't cross-suite state.
- **Frontend type-check:** pass, 0 errors.
- **Frontend lint:** pass, 0 errors.
- **Frontend build:** pass.

## 20. Remaining Known Failures

- 2 residual false-positive skill tokens per densely-categorized real fixture (bare multi-word category headers without `&`).
- One conjunction-word split artifact (`"and X"`).
- Frontend languages fix not browser-verified (verified via type-check + schema comparison only).
- `pdf-parse`/`pdf2json` fallback tiers untested against any fixture that actually forces them (primary extractor succeeds on all 11 available fixtures).
- No real geometry-based column detection; current heuristic is text-pattern-based.
- No scanned/OCR path validated (no fixture available).
- Two dead dependencies (`pdfreader`, `pdf-extraction`) left in `package.json`, unrelated to this phase's scope.

## 21. Production Risks

- **Untested fallback extractors**: if `pdfjs-dist` ever fails on a real user PDF, the `pdf-parse`/`pdf2json` fallback paths have zero fixture coverage validating their output quality — they may reintroduce extraction defects this phase fixed only in the primary path.
- **No OCR path**: any scanned/image-only resume will currently either fail with `EMPTY_DOCUMENT`/`PARSER_FAILED` or silently produce near-empty output; there is no fixture proving which.
- **Auth rate limiter has no test/staging bypass**: beyond blocking CI-style full-suite test runs, this suggests the same in-memory, non-configurable limiter is live in whatever environment mirrors these settings — worth confirming separately from this phase's scope.
- **Uploads controller/routes/types/validation files are still un-committed** (`git status` shows them as untracked since before this session) — not a code defect, but a real deployment risk if `git clean` or a fresh checkout is ever run without noticing these are needed. Flagged for the user to commit, not committed automatically by this phase per the instruction to only commit when asked.

## 22. Recommended Next Improvements

1. **Get the actual failing resume from the user.** Everything in this phase is inference from public fixtures; a 10-minute look at the real file would immediately confirm or redirect the root-cause list in §3.
2. Add fixture coverage that actually forces the `pdf-parse`/`pdf2json` fallback tiers, to validate they don't reintroduce the extraction defects fixed here.
3. Obtain or construct one real scanned/image-only PDF and decide the OCR policy against real evidence, rather than the current unexercised `SCANNED_PDF_NOT_SUPPORTED` code path.
4. If per-field evidence/confidence becomes a requirement for a specific downstream consumer (e.g., the AI guardrails wanting to cite "why was this skill trusted"), design the schema change and migration then — driven by that consumer's actual need, not speculatively.
5. Fix the pre-existing `upload.ingestion.integration.test.ts` compile error and give the auth rate limiters a test-environment bypass so the full DB-backed suite can run in CI without manual isolation.
6. Commit the four untracked `uploads.*` module files.

## Addendum (2026-08-17, release-cleanup pass)

Items 2, 5, and 6 above were closed in a follow-up pass the same day. Superseding the stale claims elsewhere in this report:

- **DB integration suite**: all 5 previously-failing suites now pass, run together as the standard `npm test` invocation (no manual per-suite isolation). Root causes found and fixed: (a) `upload.ingestion.integration.test.ts` called `fs.pathExists` (an `fs-extra` API) on a `fs/promises` import — fixed with a local `fs.access`-based helper; (b) the in-memory auth rate limiters had no test bypass and were exhausted by the volume of registrations across suites — added an explicit `RATE_LIMIT_TEST_BYPASS=true` opt-in (never inferred from `NODE_ENV` alone, so it can't be silently triggered in a real deployment), proven by dedicated tests asserting both that production stays enforced and that the bypass requires an exact match; (c) Jest's default parallel workers all hit one shared, non-isolated PostgreSQL database, racing each other's `deleteMany()` resets — fixed by setting `maxWorkers: 1` for this suite, which is a real architectural constraint (no per-worker DB isolation exists) worth revisiting if the suite grows large enough for serial execution to become a real cost; (d) three further latent bugs surfaced only once the suite could run to completion: a Windows path-separator leak into `s3Key` (`file-storage.service.ts`), a test fixture that accidentally tripped the file-size floor instead of the parser's empty-document path, and a test asserting on a MIME-inferred rejection path instead of the extension-specific one it was named for.
- **Schema/migration drift (new finding, not in the original audit)**: `schema.prisma` defined a `MatchResult` model (and `job_descriptions.analysisStatus`/`extractedStructure` columns) with **no corresponding migration ever generated** — any fresh `prisma migrate deploy` silently produced a database missing that table, latent until something actually queried it. Generated and applied `20260817072245_add_match_result_table` (purely additive: new table + new columns + indexes, no drops).
- **Fallback extractors**: no longer "untested." Verified empirically that pdfkit-generated PDFs (the parser's own synthetic test fixtures) are exactly the kind pdf-parse/pdf2json fail on — confirming the code's own inline comment — so the 5 real-world fixtures were used instead, with only the primary pdfjs-dist child process mocked to fail. Both fallback tiers verified to actually complete a full parse successfully. This also surfaced and fixed a real crash: `extractLanguageItems` threw an unhandled `TypeError` on a degenerate all-punctuation token, reachable via pdf2json's cruder text reconstruction.
- **Security**: found and fixed two issues in `file-storage.service.ts` while reviewing the upload path — the Windows path-separator leak above, and a directory-containment check (`resolvedPath.startsWith(resolvedUserDir)`) missing a trailing separator, making it bypassable by a sibling directory sharing the same string prefix (e.g. `users/user1` vs `users/user1-evil`). Low practical exploitability today (fileKeys reaching these methods are sourced from already-ownership-checked DB rows, not raw request input), but it didn't actually enforce what its own comment claimed, so it's fixed as defense-in-depth.
- **Untracked files**: the four `uploads.*` module files are staged and committed in the same commit as this addendum, along with the new migration and all fixes above.
- **Still not done, unchanged from the original report**: OCR, per-field evidence model, real geometry-based column detection, and the two dead PDF-parsing dependencies. See §22 above.
