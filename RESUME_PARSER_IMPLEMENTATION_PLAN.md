# Resume Parser Implementation Plan

## Objective

Build a deterministic resume parser that converts uploaded PDF and DOCX resumes into a canonical `ParsedResume` object.
This phase focuses on text extraction, normalization, deterministic section extraction, and structured resume field mapping.

## Scope

Included in Phase 3A:
- File type detection layer
- PDF text extraction layer
- DOCX text extraction layer
- Text normalization layer
- Contact extraction layer
- Section detection engine
- Skills extraction engine
- Experience extraction engine
- Education extraction engine
- ParsedResume mapper
- Validation engine
- Confidence scoring engine

Excluded from Phase 3A:
- ATS scoring
- Keyword extraction
- AI rewriting or Gemini integration
- Recruiter simulation
- Layout reconstruction
- OCR or scanned document processing
- Full design preservation

## Implementation Order

1. File Type Detection Layer
   - Create deterministic detection based on file extension and magic bytes.
   - Support supported types only: `pdf` and `docx`.
   - Fail fast with clear error when unsupported.

2. PDF Text Extraction Layer
   - Extract raw text from PDF resumes using `pdf-parse`.
   - Capture page count and basic layout heuristics.
   - Return parse warnings for low-text or empty PDFs.

3. DOCX Text Extraction Layer
   - Extract raw text from DOCX resumes using `mammoth`.
   - Preserve list markers and paragraph separation.
   - Return parse warnings for empty or malformed DOCX.

4. Text Normalization Layer
   - Normalize whitespace, line breaks, and bullets.
   - Convert raw text into a stable line array.
   - Remove noise from PDF line wrapping where possible.

5. Contact Extraction Layer
   - Extract name, email, phone, location, website, LinkedIn, GitHub, and other links.
   - Use deterministic regex-based heuristics.
   - Prefer the first resume block and contact-style lines.

6. Section Detection Engine
   - Identify resume sections using heading patterns.
   - Support summary, experience, education, skills, projects, certifications, languages, and other.
   - Create canonical `ParsedSection` entries.

7. Skills Extraction Engine
   - Extract skill tokens from a skills section or fallback heuristics.
   - Normalize and deduplicate skills.
   - Support comma-separated lists and bullets.

8. Experience Extraction Engine
   - Parse experience section blocks into structured experience items.
   - Detect roles, companies, dates, bullets, and summaries.
   - Use deterministic block splitting by blank lines and bullet markers.

9. Education Extraction Engine
   - Parse education section blocks into structured education items.
   - Detect institutions, degrees, dates, and locations.
   - Use deterministic rule-based parsing.

10. ParsedResume Mapper
   - Build the canonical resume object with required fields:
     - `sourceType`
     - `rawText`
     - `contact`
     - `summary`
     - `skills`
     - `experience`
     - `education`
     - `projects`
     - `certifications`
     - `languages`
     - `metadata`
     - `warnings`
     - `parsingMetrics`
     - `parseConfidence`
     - `resumeType`

11. Validation Engine
   - Validate that the parse result contains minimum required structure.
   - Emit warnings for missing sections, low text, or insufficient contact data.
   - Fail gracefully when the resume is unusable.

12. Confidence Scoring Engine
   - Compute a deterministic confidence score based on extraction success.
   - Weight contact extraction, skills, experience, education, and summary.
   - Clamp score between `0.0` and `1.0`.

## Deliverables

- `backend/src/services/resumeParser.service.ts`
- `backend/src/types/index.ts` updates for parser schema
- Parser unit tests for each component
- Parser integration tests for full parse workflows
- Parser fixtures in `backend/tests/fixtures/resumes`
- `RESUME_PARSER_AUDIT_REPORT.md`
- `RESUME_PARSER_ACCURACY_REPORT.md`
- `RESUME_PARSER_COMPLETION_REPORT.md`

## Milestones

### Milestone 1: Design & Schema
- Create implementation plan
- Define parser types and schema
- Add new docs and update project context

### Milestone 2: Core Parsing
- Implement file type detection
- Implement PDF/DOCX extraction
- Implement normalization and contact extraction

### Milestone 3: Structured Extraction
- Implement section detection
- Implement skills, experience, education extraction
- Map parsed data to canonical schema

### Milestone 4: Validation & Scoring
- Add parser validation and warnings
- Add confidence scoring
- Add metrics tracking

### Milestone 5: Testing & Metrics
- Create fixture resumes
- Build unit tests for all parser components
- Build integration tests for full parse flows
- Measure and record accuracy metrics

## Success Criteria for Phase 3A

- Parser produces deterministic `ParsedResume` for supported files.
- No parser exceptions escape into higher layers.
- Parser returns structured contact, skills, experience, education, and section data.
- Unit and integration tests cover parser components and workflows.
- Parser docs and implementation plan exist and are aligned.
- Phase 3A is ready to advance when parser tests are passing and metrics are collected.
