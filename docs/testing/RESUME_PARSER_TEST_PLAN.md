# Resume Parser Test Plan

## Purpose

This test plan defines the validation strategy for the ResumeIQ resume parser.
It ensures the parser foundation is verified before any ATS scoring, keyword extraction, job-description analysis, or AI optimization begins.

## Objectives

- Verify deterministic parse output for PDF and DOCX resumes.
- Confirm accurate extraction of sections, contact details, skills, experience, education, and layout metadata.
- Measure parser behavior on edge cases, corrupted values, and unsupported formatting.
- Ensure parser errors return clear diagnostics instead of crashing.

## Test Categories

### 1. Unit Tests

Focus on individual parser components.

- `FileLoader`
  - Accepts valid PDF buffer.
  - Accepts valid DOCX buffer.
  - Rejects unsupported file types.
- `TextExtractor`
  - Extracts raw text from a simple PDF.
  - Extracts raw text from a DOCX document.
  - Preserves bullet points and list items.
- `LayoutExtractor`
  - Detects page count and column layout.
  - Identifies fonts and colors.
  - Detects tables and list formatting.
- `SectionClassifier`
  - Correctly labels Experience, Education, Skills, and Summary headers.
  - Groups related lines into one section.
  - Emits warnings for ambiguous headings.
- `SchemaMapper`
  - Maps raw sections into `ParsedResume` fields.
  - Normalizes dates and bullets.
  - Populates contact fields when present.

### 2. Integration Tests

Verify full parse flow on real.resume examples.

- One-page modern PDF resume.
- Two-column PDF resume.
- DOCX resume with tables and sections.
- DOCX resume with nested lists and multiple fonts.
- Resume with header/footer content.
- Resume with icons or decorative section headers.

Expected outcomes:

- `parseConfidence` is computed and reasonable.
- `contact.fullName`, `email`, and `phone` are extracted when present.
- `experience` items contain job title and company when available.
- `education` items contain institution and dates.
- `skills` list contains technical and soft skills.
- `metadata.pageCount`, `hasTables`, and `hasMultipleColumns` are correct.

### 3. Regression Tests

Cover known parse failure patterns.

- Resumes with tables used for layout rather than data.
- Resumes with two-column sections and line-wrapped bullets.
- Resumes where the contact block is split across multiple lines.
- Resumes with unusual heading labels like "Professional Background" or "What I Bring".
- Resumes with missing section headers but clear content blocks.

### 4. Error Handling Tests

Ensure parser returns graceful failure metadata.

- Corrupted PDF buffer.
- Invalid DOCX buffer.
- Unsupported file extension.
- Empty resume file.
- Unsupported language / non-text content.

Expected behavior:

- No unhandled exceptions escape the parser.
- The response includes parse warnings and a `success: false` indicator when parse fails.

### 5. Performance Tests

Measure parser speed and resource usage.

- Average parse time for one resume should be under 2 seconds in normal conditions.
- Worst-case parse time for complex resumes should be under 5 seconds.
- Memory usage should remain bounded for resume buffers under 10MB.

## Test Data Strategy

### Fixture organization

Store canonical fixtures in:
- `backend/tests/fixtures/resumes/simple.pdf`
- `backend/tests/fixtures/resumes/two-column.pdf`
- `backend/tests/fixtures/resumes/table-layout.docx`
- `backend/tests/fixtures/resumes/nested-lists.docx`
- `backend/tests/fixtures/resumes/ambiguous-sections.pdf`

### Expected outputs

For integration tests, capture expected parse metadata and canonical section summaries in JSON fixtures.
Use snapshot-style comparisons for stable parse output fields such as:
- section names and types
- number of experience items
- extracted contact fields
- layout metadata values

## Acceptance Criteria

The resume parser is ready to move forward when:

- A full parse test passes for both PDF and DOCX fixtures.
- Key resume sections are extracted with >90% accuracy on sample fixtures.
- Layout metadata fields are populated correctly for page count, tables, and columns.
- Parser outputs are deterministic across repeated runs with the same file.
- Parser warnings are explicit and actionable.
- There are no uncaught exceptions during parser execution.

## Validation Process

1. Create unit tests for each parser component.
2. Build integration tests around sample resume fixtures.
3. Run a regression suite against ambiguous/complex layouts.
4. Capture snapshots for stable fields and review diffs after changes.
5. Confirm that parse output can be stored in `IResume` and consumed by later modules.

## Notes

- Do not begin optimization work until this parser foundation is stable.
- Keep this test plan updated as parser behavior evolves.
- Add new fixtures whenever a new resume layout class is supported.
