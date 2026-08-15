# Resume Parser Design

## Purpose

This document defines the architecture, data model, and acceptance criteria for the ResumeIQ resume parser.
The parser is the foundational deterministic module that must be completed and validated before any ATS scoring, keyword extraction, job-description analysis, or AI optimization work begins.

## Scope

The parser will support:
- PDF resumes
- DOCX resumes

Future extension candidates:
- plain text resumes (TXT)
- OpenDocument resumes (ODT)
- scanned or image-heavy resumes via OCR

## Design Principles

1. Deterministic parsing
   - Same file input must always produce the same structured output.
   - No randomness, no AI inference, no hallucination.
2. Layout preservation first
   - Retain section boundaries, typography metadata, page structure, column layout, and tables.
   - Preserve the original resume design as the canonical source for later optimization.
3. Fact extraction, not generation
   - Extract what is present in the document.
   - Do not invent new skills, dates, titles, or experiences.
4. Robust fallback behavior
   - Parse partial documents gracefully and return the highest-confidence structured output available.
   - Record warnings for ambiguous or unsupported layout constructs.
5. Modular pipeline
   - Separate ingestion, extraction, normalization, and schema mapping.
   - Keep the parsing core independent of downstream scoring and optimization.

## Architecture Overview

### Pipeline Stages

1. File ingestion
   - Identify file type (`pdf`, `docx`).
   - Load binary content into buffer.
2. Content extraction
   - PDF: Use `pdf-parse` for text extraction and `pdf-lib` for layout hints.
   - DOCX: Use `mammoth` for text and style extraction.
3. Layout metadata extraction
   - Detect page count, columns, bullet lists, tables, fonts, colors, and spacing.
   - Capture section headers, line positions, and text block boundaries.
4. Section detection
   - Identify resume sections such as Contact, Summary, Experience, Education, Skills, Projects, Certifications, Languages, and Other.
   - Group adjacent lines into structured sections.
5. Normalization and schema mapping
   - Normalize whitespace, dates, bullets, and line breaks.
   - Map extracted content into the canonical `ParsedResume` schema.
6. Output generation
   - Return structured resume output plus metadata, confidence, and parse warnings.

### Core Modules

- `FileLoader`
  - Detects supported file type.
  - Reads file buffer.
- `TextExtractor`
  - Extracts raw text from PDF/DOCX.
  - Preserves paragraph boundaries and formatting hints.
- `LayoutExtractor`
  - Builds `LayoutMetadata` with fonts, colors, page structure, tables, bullets, and columns.
- `SectionClassifier`
  - Classifies sections based on headings, keywords, and relative position.
- `SchemaMapper`
  - Converts parsed content to the canonical resume schema.
- `Validator`
  - Checks parse output for missing or suspicious sections.
  - Produces warnings for later review.

## Output Schema

The parser output should be a structured data object that downstream modules can consume directly.

### Canonical `ParsedResume` Schema

```ts
export interface ParsedResume {
  sourceType: 'pdf' | 'docx';
  text: string;
  parseConfidence: number; // 0.0 - 1.0
  warnings: ParseWarning[];
  metadata: ParsedResumeMetadata;
  contact: ContactInfo;
  summary?: string;
  skills: string[];
  experience: ExperienceItem[];
  education: EducationItem[];
  projects: ProjectItem[];
  certifications: CertificationItem[];
  languages: LanguageItem[];
  sections: ParsedSection[];
  rawSections: RawSection[];
}

export interface ParsedResumeMetadata {
  pageCount: number;
  hasMultipleColumns: boolean;
  hasTables: boolean;
  fonts: FontMetadata[];
  colors: string[];
  layoutNotes: string[];
}

export interface ContactInfo {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  website?: string;
  linkedin?: string;
  github?: string;
  otherLinks: string[];
}

export interface ParsedSection {
  id: string;
  name: string;
  type: 'contact' | 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'certifications' | 'languages' | 'other';
  rawText: string;
  normalizedText: string;
  startLine: number;
  endLine: number;
  confidence: number;
}

export interface ExperienceItem {
  title?: string;
  company?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  bullets: string[];
  summary?: string;
}

export interface EducationItem {
  institution?: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
}

export interface ProjectItem {
  name?: string;
  description?: string;
  technologies: string[];
}

export interface CertificationItem {
  name?: string;
  authority?: string;
  date?: string;
}

export interface LanguageItem {
  name: string;
  proficiency?: string;
}

export interface RawSection {
  title: string;
  content: string;
  metadata: SectionMetadata;
}

export interface SectionMetadata {
  headingFont?: string;
  fontSize?: number;
  bulletStyle?: 'circle' | 'disc' | 'square' | 'dash' | 'numbered' | 'none';
  tableDetected: boolean;
}

export interface ParseWarning {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export interface FontMetadata {
  name: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
}
```

### Relationship to Existing Types

The parser output should map cleanly into the existing `backend/src/types/index.ts` definitions:
- `IResume`
- `ILayoutMetadata`
- `ISection`

This ensures the parser can feed the resume storage layer and the optimization/scoring modules without duplicate schema definitions.

## Supported Formats

### PDF

- Primary extraction from text layer using `pdf-parse`.
- Layout metadata from `pdf-lib` and `pdf-parse` positions.
- Special handling for:
  - multi-column text
  - tables and grids
  - embedded fonts and colors
  - page headers/footers

### DOCX

- Use `mammoth` for paragraphs, lists, and formatting hints.
- Preserve original bullets, numbering, and inline formatting.
- Extract style metadata from paragraph and run properties.
- Handle complex DOCX constructs like nested lists and tables.

## Limitations and Risks

### Known parser limitations

- Image-only resumes without a text layer are unsupported until OCR is added.
- Highly decorative resumes that rely on graphical text may lose some structure.
- Non-English resumes are out of scope for the first parser foundation release.
- Handwritten or scanned documents are not supported.

### Risk mitigation

- Return structured output plus warnings rather than failing completely.
- Use best-effort section classification for ambiguous headings.
- Preserve raw parsed sections so later modules can re-evaluate them.

## Acceptance Criteria

The resume parser is considered ready to move on when:

- It supports PDF and DOCX parse flows end-to-end.
- It produces consistent `ParsedResume` output for the same input.
- It extracts contact information, summary, skills, experience, and education reliably.
- It preserves layout metadata including pages, fonts, colors, tables, and columns.
- It flags unsupported or low-confidence parsing issues.
- It integrates cleanly with the resume storage model and downstream scoring/optimization.

## Next Steps

1. Implement the parser pipeline in `backend/src/services/resumeParser.service.ts`.
2. Create fixture resumes for unit and integration tests.
3. Wire parser output into `backend/src/modules/resumes` and the resume upload workflow.
4. Build the first deterministic `ParsedResume` output model before any ATS scoring or AI optimization.
5. Add parser performance and failure-mode tests to ensure production readiness.
