# Resume Parser Dataset Plan

## Objective

Create a focused dataset of resume fixtures for Phase 3A parser validation.
The dataset will cover the resume categories required for deterministic parser accuracy tests.

## Required Fixture Types

1. Fresher Resume
   - Entry-level candidate
   - Minimal professional experience
   - Strong education and project sections

2. Experienced Resume
   - Multiple years of work history
   - Several experience blocks
   - Clear company, title, and date ranges

3. Technical Resume
   - Emphasizes technical skills and tools
   - Includes a technical skills section
   - Contains technology keywords and tools

4. Multi-Page Resume
   - At least two pages long
   - Includes header/footer or page breaks
   - Verifies parser page count handling

5. Multi-Column Resume
   - Uses a two-column layout or split sections
   - Verifies parser fallback on column-style text
   - Ensures section boundaries still resolve

6. Academic Resume
   - Focused on education, publications, academic projects
   - Minimal work experience
   - Includes institutional and degree details

## Dataset Organization

Store parser fixtures in:
- `backend/tests/fixtures/resumes`

Planned fixture file names:
- `fresher-resume.pdf`
- `experienced-resume.pdf`
- `technical-resume.docx`
- `multi-page-resume.pdf`
- `multi-column-resume.pdf`
- `academic-resume.docx`

## Fixture Format Requirements

Each fixture should include:
- Clear contact block at top
- One or more explicit section headings
- A skills section, when applicable
- Experience or education blocks with date ranges
- Bulleted lists for responsibilities or projects
- Distinct section text to verify parsing decisions

## Metric Labels

For each fixture, capture the following expected values in a JSON companion file or test assertions:
- `expectedContact` (name, email, phone)
- `expectedSectionTypes` (summary, experience, education, skills, etc.)
- `expectedSkillsCount`
- `expectedExperienceCount`
- `expectedEducationCount`
- `expectedPageCount`
- `expectedResumeType`

Example companion metadata file:
- `backend/tests/fixtures/resumes/fresher-resume.expected.json`

## Accuracy Measurement

The dataset plan will support the following parser accuracy metrics:
- Contact Extraction Accuracy
- Section Detection Accuracy
- Skills Extraction Accuracy
- Education Extraction Accuracy
- Experience Extraction Accuracy
- Parse Success Rate
- Average Parse Time

### Measurement Strategy

1. Maintain ground truth for each fixture.
2. Run parser across fixtures and compare extracted results to expected values.
3. Compute accuracy percentages per category.
4. Track parse time for each fixture.
5. Store results in `RESUME_PARSER_ACCURACY_REPORT.md`.

## Ground Truth Strategy

Ground truth values should be small, deterministic, and easy to compare.
Use the following targets:
- Exact contact email and phone
- Section count and section label stability
- Skill token counts and presence of core keywords
- Experience item counts and date-range detection
- Education item counts and institution names

## Fixture Creation Approach

### PDF fixtures
- Use `pdf-lib` or a small helper script to generate PDF resumes from text templates.
- Ensure multi-page and multi-column demos reflect real resume patterns.

### DOCX fixtures
- Generate DOCX files from minimal OOXML templates or a lightweight helper.
- Ensure the DOCX parser can extract paragraphs and list items cleanly.

## Test Coverage Plan

Use the fixture dataset for:
- Unit tests that load a single fixture and validate specific parser outputs.
- Integration tests that run the full parser workflow on each fixture.
- Regression tests using the same fixture set after parser changes.

## Maintenance Notes

- Add new fixtures when the parser expands to new resume patterns.
- Keep expected metadata files in sync with fixture content.
- Update the dataset plan if new resume categories are introduced.
