# Real-World Parser Audit

## Metadata

- **Date:** 2026-08-17
- **Current commit:** `5a7e1e4` (`fix(uploads): fix quota remaining calculation and correct .gitignore rule for uploads module`)
- **Repository state:** clean except 4 untracked files (`backend/src/modules/uploads/uploads.controller.ts`, `uploads.routes.ts`, `uploads.types.ts`, `uploads.validation.ts`) — these are real, in-use source files that were simply never `git add`ed; not WIP stubs. `uploads.service.ts` is the only tracked file in that module.
- **Parser dependency versions** (`backend/package.json`):
  - `pdfjs-dist ^6.0.227` (primary extractor, run in a child process via `src/services/pdfjs-extract-worker.mjs`)
  - `pdf-parse 1.1.1` (fallback #1)
  - `pdf2json ^4.0.3` (fallback #2)
  - `pdf-lib 1.17.1` (used only to check if a blank-text PDF is at least structurally loadable)
  - `pdfreader ^3.0.8`, `pdf-extraction ^1.0.2` (declared as dependencies but **not referenced anywhere** in `resumeParser.service.ts` — dead weight)
  - `mammoth 1.8.0` (DOCX text extraction)

## Current Parser Architecture (as found)

Single file, `backend/src/services/resumeParser.service.ts` (1178 lines), implements the entire pipeline synchronously in-process (except PDF text extraction, which shells out to a child process running `pdfjs-extract-worker.mjs`):

```
buffer + fileName
  -> detectFileType (magic-byte + extension check)
  -> parsePdfResume | parseDocxResume        (raw text extraction, 3-tier PDF fallback chain)
  -> normalizeText                            (whitespace/bullet normalization)
  -> extractContact                           (regex over first 8 lines)
  -> detectSections                           (single-pass line scan + regex heading classifier)
  -> extractSkills / extractExperience / extractEducation / extractProjectItems /
     extractCertificationItems / extractLanguageItems / extractSummary
  -> determineResumeType
  -> validateParsedResume (warnings)
  -> calculateParseConfidence
```

There is **no coordinate/layout-aware column detection** — `detectMultipleColumns` is a heuristic over whitespace-run frequency in already-linearized text, not real geometry. There is **no OCR path**. There is **no LLM fallback**. Section detection is 100% text/regex-based (heading keyword matching with a "compact" whitespace-stripped fallback), which is more sophisticated than a naive exact-string match (matches uppercase/title-case/punctuation/colon variants, category prefixes like "Languages:", generic delimiters) but operates purely line-by-line with no font/position signal, because none is captured — `metadata.fonts` and `metadata.colors` are hardcoded to `[]` for both PDF and DOCX.

This is materially healthier than the task brief's "declare fixed because PDFJS returns text" worry — there is already real regex-based section classification with ~10 canonical types, a "compact" (whitespace/punctuation-stripped) matching fallback for garbled headings, a fallback dictionary scan for skills, and a fallback regex scan for languages. The gap is not "the parser does nothing"; it's specific, verifiable defects in extraction fidelity and downstream field mapping, documented below.

## Known Symptoms (from task brief)

- Real uploaded resume with `TECHNICAL SKILLS` and `LANGUAGES` sections → `extractedSkills = 0`, spoken languages missing/empty.
- Some uploads report: *"Unable to process resume file. Please ensure it is a valid, uncorrupted PDF or DOCX."*

## Step 1 — Locating the Exact Failing Resume

Searched `tests/fixtures`, `backend/tests/fixtures`, any `uploads`/`storage` directories, `docs/examples`, and the full workspace for `*.pdf`/`*.docx` outside `node_modules`/`dist`. Found only the pre-existing fixture corpus (11 files: 5 "real-world" resumes sourced from public GitHub/university career-services PDFs, 6 synthetic fixtures). No trace of the user's actual manually-tested resume (no upload storage directory with retained files, no attached file in the workspace).

**REAL RESUME: NOT AVAILABLE**

Per the task's own instructions for this case, this audit instead (a) runs the real parser directly against the existing 11 real-world/synthetic fixtures to find genuine, reproducible defects, and (b) later adds a new sanitized synthetic fixture purpose-built to reproduce the exact reported symptom (TECHNICAL SKILLS + LANGUAGES both present but extraction empty/wrong), since none of the 11 existing fixtures contain a spoken-language section at all (verified below) — that is itself a finding: the existing test corpus has zero coverage of spoken-language extraction, so a regression exactly like the user's report could ship undetected.

## Step 2 — Reproduction Outside the API

Built `backend/tests/debug/inspect-fixture.ts`, a standalone script that calls `parseResume()` directly (no HTTP, no DB, no auth) and prints redacted structural diagnostics (`npx ts-node -T tests/debug/inspect-fixture.ts <file> [--show-content]`). Ran it against all 5 real-world fixtures and all 6 synthetic fixtures.

Findings (redacted — no PII reproduced here; the underlying people's resumes are public GitHub/university career-page samples already committed to the repo by a prior phase):

| Fixture | Sections found | Skills | Languages | Notable defects observed |
|---|---|---|---|---|
| erau-computing-resume.pdf | 3 | 22 (some garbage tokens) | 0 | Heading `EXPERIENCE Software Engineer January 2018-Present` swallowed the first job's title/dates into the section *title*, not its content. `extractSkills` produced junk tokens like `"Processes : Personal Software Process"` (category-prefix list is an enumerated allowlist, missed "Processes"). |
| fau-engineering-resume.pdf | 5 | 21 | 0 | Clean parse otherwise. |
| github-eric-thomas-resume.pdf | 4 | 28 | 0 | Section titles came out as `Pro fessional Experience`, `Edu cation`, `Ski lls` — words are being split mid-token by the PDF text extractor. |
| github-matthew-roberts-resume.pdf | 3 | 4 | 0 | A body sentence, `"...experiences are possible."`, was misclassified as a **new** `experience`-type section heading (prefix-only regex match on the word "experience"), fragmenting real experience content. |
| github-mo-sorkhpar-resume.pdf | 7 | 26 | 0 | `Programming Languages: Java, Python` heading correctly routed to `skills` (not spoken languages) — the programming/spoken language distinction already works correctly when content is present, via heading-text match order. Heading+inline-content-on-one-line again truncates a `Skills` section body. |
| 6 synthetic fixtures (`tests/fixtures/resumes/*`) | — | — | 0 | **None of the 6 synthetic fixtures contain a spoken-language section either.** `multi-page-resume.pdf` produces two adjacent `Summary`-type sections (`"Sophia Lee"` then the real summary paragraph) — traced further below. |

**Root finding for "LANGUAGES missing": all 11 fixtures in the repository — the entire existing test corpus — contain zero examples of a genuine spoken-language section.** Every "Languages" heading present in the real-world fixtures is actually "Programming Languages" (a skills subheading), which the parser already routes correctly to `skills`. This means the specific "spoken languages missing" bug reported by the user cannot be reproduced from anything currently in the repo; the fixture gap itself is a finding (see Step 21/23 fix below). The **skills = 0** class of symptom, however, reproduces immediately and repeatedly across fixtures via three independent, verifiable defects traced in Steps 3–5 of the full report:

1. **Reading-order/text-extraction defect** (`pdfjs-extract-worker.mjs`): text items on the same line are joined with an unconditional space regardless of whether a real gap existed in the PDF, corrupting words split across multiple PDF text-show operations (a common PDF-producer behavior for kerning). This is a genuine **reading-order reconstruction failure** (task category C), not cosmetic — it corrupts section titles and can corrupt in-body tokens.
2. **Section segmentation defect**: when a recognized heading and its first content item share one physical line (`"SKILLS Python, JavaScript"`, `"EXPERIENCE Software Engineer Jan 2018-Present"`), the entire line — heading *and* content — is captured as the section **title**, and the section **body** starts only on the next line. Any inline content is silently discarded from extraction. This is category **D (section segmentation failure)**, and it is the most direct, reproducible analogue of the user's "skills = 0" report: a resume whose skills section starts with content on the same line as the heading (a very common resume layout) will lose that content entirely.
3. **False-positive heading detection**: prefix-only regex matching (`/^experience/i.test(line)`) misclassifies ordinary prose that happens to start with a section keyword as a brand-new section boundary, fragmenting real content out of its section (category **D**).

A fourth, independent defect was found in Step 20 (frontend/API trace): the frontend reads `l.language` on each language item, but the backend's `ILanguageItem` schema uses `name`. Even in the hypothetical case where `languages` is correctly populated by the backend, the frontend renders it as blank/`undefined`. This is category **J (frontend display failure)** and is the closest concrete match to "LANGUAGES section... empty" being a display bug rather than an extraction bug.

## Step 24 — "Unable to process resume file" Root Cause

Traced to `backend/src/modules/uploads/uploads.service.ts`, `normalizeUploadError()` (line ~364). Any thrown error that is a plain `Error` **without** an explicit `.code` property — which includes DB/Prisma failures, `JSON.stringify` failures, and any unhandled bug anywhere in the 9-step `uploadResume()` try block (quota logic, file storage, section extraction, audit logging) — is unconditionally rewritten to:

```
"Unable to process resume file. Please ensure it is a valid, uncorrupted PDF or DOCX."
```

with `code: PARSER_FAILED`, **and the original error is never logged anywhere** before being discarded (the catch block logs nothing; the audit-log entry only stores the already-generic `normalizedError.message`). This means the message the user saw is not proof the PDF itself was invalid — it is the default catch-all for *any* unexpected exception in the upload pipeline. This is category **I/K (serialization/multiple failure classes)** and an **observability gap** (task Step 25): there is currently no way for a developer to distinguish "the PDF really is corrupt" from "a bug in section extraction threw partway through" from server logs alone.

## Failure Classification Summary

- **C — Reading order / extraction failure**: confirmed (pdfjs word-splitting).
- **D — Section segmentation failure**: confirmed (heading+inline-content swallowed; false-positive heading detection; duplicate adjacent same-type sections from the implicit leading pseudo-section).
- **F — Field extraction failure**: confirmed (category-prefix allowlist misses labels like "Processes:", producing garbage skill tokens).
- **J — Frontend display failure**: confirmed (`l.language` vs `l.name` mismatch for languages).
- **I/K — Error serialization / observability gap**: confirmed (generic message masks true cause; no server-side logging of the original error).
- **B — Hard PDF extraction failure**: not reproduced against any available fixture (all 11 fixtures extract non-empty text through the primary or fallback extractors).
- **H — Database persistence failure**: not reproduced; `extractedLayout` round-trips through `JSON.stringify`/`JSON.parse` correctly for all fixtures tested.
- **Scanned/OCR (image-only PDFs)**: no scanned-PDF fixture exists in the repo to test against; the code path exists (`SCANNED_PDF_NOT_SUPPORTED` error code is defined) but whether it is ever actually thrown was not verified against a real scanned file, since none is available.

Fixes for the confirmed defects, a new regression fixture covering the untested spoken-language path, and full before/after verification are documented in `docs/PHASE_REPORTS/REAL_WORLD_RESUME_INTELLIGENCE_REPORT.md`.
