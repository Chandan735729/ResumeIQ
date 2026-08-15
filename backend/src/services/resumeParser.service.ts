import childProcess from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import mammoth from 'mammoth';
import { logger } from './logger.service';
import type {
  IParsedResume,
  IContactInfo,
  IParsedSection,
  IExperienceItem,
  IEducationItem,
  IProjectItem,
  ICertificationItem,
  ILanguageItem,
  IParsedResumeMetadata,
  IParseWarning,
  IParsingMetrics,
  ResumeType,
  ParsedSectionType,
} from '../types';

export const supportedFileTypes = ['pdf', 'docx'] as const;
export type SupportedFileType = typeof supportedFileTypes[number];

const NAME_LINE_BLACKLIST = ['resume', 'experience', 'education', 'skills', 'projects', 'certifications', 'languages', 'objective', 'summary', 'profile'];
const TECHNICAL_KEYWORDS = ['javascript', 'typescript', 'python', 'java', 'c#', 'c++', 'golang', 'go', 'react', 'node', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'sql', 'nosql', 'graphql', 'api'];

export function detectFileType(fileName: string, buffer: Buffer): SupportedFileType | null {
  const extension = path.extname(fileName).toLowerCase();
  const header = buffer.slice(0, 4).toString('utf8');
  const isPdf = header === '%PDF';
  const isZip = header === 'PK\u0003\u0004';

  if ((extension === '.pdf' || isPdf) && isPdf) {
    return 'pdf';
  }

  if (extension === '.docx' && isZip) {
    return 'docx';
  }

  return null;
}

export async function parseResume(buffer: Buffer, fileName: string): Promise<IParsedResume> {
  const start = Date.now();
  const sourceType = detectFileType(fileName, buffer);

  if (!sourceType) {
    throw new Error('Unsupported resume file type');
  }

  const extractor = sourceType === 'pdf' ? parsePdfResume : parseDocxResume;
  const parseResult = await extractor(buffer);

  const normalizedText = normalizeText(parseResult.rawText);
  if (!normalizedText) {
    const error = new Error('Uploaded document is empty or contains too little text.');
    (error as Error & { code?: string }).code = 'EMPTY_DOCUMENT';
    throw error;
  }
  const lines = normalizedText.split('\n').map((line) => line.trim()).filter(Boolean);

  const contact = extractContact(lines);
  const sections = detectSections(lines);
  const skills = extractSkills(sections);
  const experience = extractExperience(sections);
  const education = extractEducation(sections);
  const projects = extractProjectItems(sections);
  const certifications = extractCertificationItems(sections);
  const languages = extractLanguageItems(sections);
  const summary = extractSummary(sections);
  const resumeType = determineResumeType({ experience, education, skills, sections });

  const metadata: IParsedResumeMetadata = {
    pageCount: parseResult.pageCount,
    hasMultipleColumns: parseResult.hasMultipleColumns,
    hasTables: parseResult.hasTables,
    fonts: parseResult.fonts,
    colors: parseResult.colors,
    layoutNotes: parseResult.layoutNotes ?? [],
  };

  const warnings = [...parseResult.warnings];
  const elapsed = Date.now() - start;

  const parsed: IParsedResume = {
    sourceType,
    rawText: normalizedText,
    contact,
    summary,
    skills,
    experience,
    education,
    projects,
    certifications,
    languages,
    sections,
    metadata,
    warnings,
    parsingMetrics: buildParsingMetrics({ sections, skills, experience, education, projects, certifications, languages, rawText: normalizedText, warnings: parseResult.warnings, parseTimeMs: elapsed }),
    parseConfidence: 0,
    resumeType,
  };

  const validationWarnings = validateParsedResume(parsed);
  parsed.warnings.push(...validationWarnings);
  parsed.parsingMetrics.warningCount = parsed.warnings.length;
  parsed.parseConfidence = calculateParseConfidence({ contact, summary, skills, experience, education, warnings: parsed.warnings });

  logger.info('Parsed resume', {
    sourceType,
    sections: sections.length,
    skills: skills.length,
    experience: experience.length,
    education: education.length,
    parseConfidence: parsed.parseConfidence,
  });

  return parsed;
}

interface RawExtractionResult {
  rawText: string;
  pageCount: number;
  hasMultipleColumns: boolean;
  hasTables: boolean;
  fonts: { name: string; size: number; color: string; bold: boolean; italic: boolean }[];
  colors: string[];
  layoutNotes: string[];
  warnings: IParseWarning[];
}

export async function parsePdfResume(buffer: Buffer): Promise<RawExtractionResult> {
  let extraction: { rawText: string; pageCount: number; layoutNotes: string[] } | null = null;
  let extractionFailed = false; // true = all extractors threw; false = extractors ran but produced no text

  try {
    extraction = await extractPdfText(buffer);
  } catch (error) {
    // extractPdfText only throws if ALL fallbacks failed (i.e., the PDF is malformed/unreadable)
    extractionFailed = true;
    const errorDetails = error instanceof Error ? { message: error.message } : { error };
    logger.warn('PDF extraction failed', errorDetails);
  }

  // Determine the correct error code based on whether extractors failed entirely or
  // ran successfully but produced no usable text.
  if (!extraction || !extraction.rawText) {
    logger.warn('PDF extraction ultimately failed or produced no text');

    if (extractionFailed) {
      // All extractors threw — the PDF is malformed or corrupted.
      const error = new Error('Unable to extract text from PDF resume');
      (error as Error & { code?: string }).code = 'PARSER_FAILED';
      throw error;
    }

    // Extractors ran but produced no text. Use pdf-lib to determine intent:
    // if pdf-lib can load it then it's a valid-but-blank PDF; otherwise it's malformed.
    if (await isLoadablePdf(buffer)) {
      const error = new Error('Uploaded PDF is empty.');
      (error as Error & { code?: string }).code = 'EMPTY_DOCUMENT';
      throw error;
    }
    const error = new Error('Unable to extract text from PDF resume');
    (error as Error & { code?: string }).code = 'PARSER_FAILED';
    throw error;
  }

  const rawText = extraction.rawText.trim();
  if (!rawText) {
    const error = new Error('Uploaded PDF is empty.');
    (error as Error & { code?: string }).code = 'EMPTY_DOCUMENT';
    throw error;
  }

  const pageCount = extraction.pageCount;
  const hasTables = detectTablePatterns(rawText);
  const hasMultipleColumns = detectMultipleColumns(rawText);
  const warnings: IParseWarning[] = [];

  // Warn on very short resumes but do not reject them — they may be legitimate.
  if (rawText.length < 50) {
    warnings.push({
      code: 'short_resume',
      message: 'Resume contains very little text. It may be incomplete or use non-standard formatting.',
      severity: 'medium',
    });
  }

  return {
    rawText,
    pageCount,
    hasMultipleColumns,
    hasTables,
    fonts: [],
    colors: [],
    layoutNotes: [
      'PDF text extraction uses pdfjs-dist legacy build with page-aware text ordering.',
      ...extraction.layoutNotes,
    ],
    warnings,
  };
}

async function extractPdfText(buffer: Buffer): Promise<{ rawText: string; pageCount: number; layoutNotes: string[] }> {
  // Strategy: pdfjs-dist (via child process) is the most reliable extractor for all PDF types.
  // pdf-parse and pdf2json both fail on PDFs generated by pdfkit due to XRef table parsing issues.
  // PDFJS is therefore tried first; pdf-parse and pdf2json are attempted as fallbacks for
  // edge cases where PDFJS fails (e.g., certain encrypted or non-standard PDFs).
  try {
    return await extractPdfTextWithPdfJsChildProcess(buffer);
  } catch (pdfjsErr) {
    logger.warn('Primary PDFJS extraction failed, attempting pdf-parse fallback', {
      error: pdfjsErr instanceof Error ? pdfjsErr.message : pdfjsErr,
    });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse') as (data: Buffer) => Promise<any>;
    const data = await pdfParse(buffer);
    const text = (data?.text ?? '').trim();
    const pageCount = data?.numpages ?? 1;

    if (text && text.length > 20) {
      return {
        rawText: text,
        pageCount,
        layoutNotes: ['Fallback parser: pdf-parse.'],
      };
    }
    throw new Error('pdf-parse returned insufficient text');
  } catch (fallbackErr) {
    logger.warn('pdf-parse fallback failed, attempting pdf2json', {
      error: fallbackErr instanceof Error ? fallbackErr.message : fallbackErr,
    });
  }

  try {
    return await extractPdfTextWithPdf2Json(buffer);
  } catch (fallbackErr) {
    logger.warn('pdf2json fallback also failed', {
      error: fallbackErr instanceof Error ? fallbackErr.message : fallbackErr,
    });
  }

  throw new Error('Unable to extract text from PDF resume');
}

async function extractPdfTextWithPdf2Json(buffer: Buffer): Promise<{ rawText: string; pageCount: number; layoutNotes: string[] }> {
  // pdf2json supports some legacy PDFs that are rejected by the PDFJS/pdf-parse path.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PDFParser = require('pdf2json');
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();
    parser.on('pdfParser_dataError', (error: { parserError?: Error }) => reject(error.parserError ?? new Error('pdf2json failed')));
    parser.on('pdfParser_dataReady', (data: { Pages?: Array<{ Texts?: Array<{ R?: Array<{ T?: string }> }> }> }) => {
      const pages = (data.Pages ?? []).map((page) => (page.Texts ?? [])
        .map((item) => (item.R ?? []).map((run) => safeDecodePdfText(run.T ?? '')).join(''))
        .join('\n'));
      const rawText = pages.join('\n\n').trim();
      if (rawText.length < 20) {
        reject(new Error('pdf2json returned insufficient text'));
        return;
      }
      resolve({ rawText, pageCount: pages.length, layoutNotes: ['Fallback parser: pdf2json.'] });
    });
    parser.parseBuffer(buffer);
  });
}

function safeDecodePdfText(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Extracts text from a PDF using pdfjs-dist in a child process.
 *
 * Uses a static worker script (pdfjs-extract-worker.mjs) that lives in the same
 * directory as this service. The worker script file is necessary because:
 *   1. pdfjs-dist is an ESM-only package and must be imported dynamically.
 *   2. Passing inline scripts via `node --input-type=module -e <script>` is unreliable
 *      on Windows — escape sequences inside string literals cause SyntaxErrors.
 *   3. Writing scripts to os.tmpdir() fails because Node.js ESM resolves packages
 *      relative to the *script file's location*, not `cwd`, so pdfjs-dist cannot
 *      be found from the system temp directory.
 *
 * Only the PDF content is written to a temp file; the script itself is stable.
 */
async function extractPdfTextWithPdfJsChildProcess(buffer: Buffer): Promise<{ rawText: string; pageCount: number; layoutNotes: string[] }> {
  const backendRoot = path.resolve(__dirname, '../../');
  // Worker script lives in the same directory as this service file so that
  // Node.js ESM resolves pdfjs-dist from the project node_modules.
  const workerScript = path.join(__dirname, 'pdfjs-extract-worker.mjs');

  // Write only the PDF buffer to a temp file; the script itself is the static worker.
  const tmpDir = os.tmpdir();
  const tmpPdf = path.join(tmpDir, `resumeiq-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);

  let result: ReturnType<typeof childProcess.spawnSync>;
  try {
    // Write buffer inside try so the finally block always cleans up, even on write errors.
    fs.writeFileSync(tmpPdf, buffer);

    result = childProcess.spawnSync(process.execPath, [workerScript, tmpPdf], {
      cwd: backendRoot,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      // 30-second timeout prevents a hung PDFJS worker from blocking the event loop.
      timeout: 30_000,
      killSignal: 'SIGKILL',
    });
  } finally {
    try { fs.unlinkSync(tmpPdf); } catch { /* ignore */ }
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr ? String(result.stderr).trim() : 'Unknown error';
    throw new Error(`PDFJS worker failed (status=${result.status}): ${stderr}`);
  }

  const stdoutStr = String(result.stdout ?? '');

  if (!stdoutStr) {
    throw new Error('PDFJS worker returned no output');
  }

  let parsed: { rawText?: string; pageCount?: number; layoutNotes?: string[] };
  try {
    parsed = JSON.parse(stdoutStr);
  } catch {
    throw new Error(`PDFJS worker returned unparseable output: ${stdoutStr.slice(0, 80)}`);
  }

  const rawText = (parsed.rawText ?? '').trim();
  // Note: do NOT throw for empty rawText here. An empty result is valid for blank PDFs.
  // The caller (parsePdfResume) handles the empty-text case by checking isLoadablePdf.

  return {
    rawText,
    pageCount: parsed.pageCount ?? 1,
    layoutNotes: parsed.layoutNotes ?? ['Primary parser: pdfjs-dist child process.'],
  };
}

export async function parseDocxResume(buffer: Buffer): Promise<RawExtractionResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const rawText = (result.value ?? '').trim();
    const pageCount = 1;
    const hasTables = detectTablePatterns(rawText);
    const hasMultipleColumns = detectMultipleColumns(rawText);
    const warnings: IParseWarning[] = [];

    if (!rawText || rawText.length < 50) {
      warnings.push({
        code: 'low_text',
        message: 'DOCX resume contains very little extracted text.',
        severity: 'medium',
      });
    }

    return {
      rawText,
      pageCount,
      hasMultipleColumns,
      hasTables,
      fonts: [],
      colors: [],
      layoutNotes: ['DOCX metadata extraction is limited in Phase 3A.'],
      warnings,
    };
  } catch (error) {
    logger.warn('DOCX extraction failed', { error });
    const parserError = new Error('Unable to extract text from DOCX resume');
    (parserError as Error & { code?: string }).code = 'PARSER_FAILED';
    throw parserError;
  }
}

async function isLoadablePdf(buffer: Buffer): Promise<boolean> {
  try {
    await PDFDocument.load(buffer, { ignoreEncryption: true });
    return true;
  } catch {
    return false;
  }
}

export function normalizeText(rawText: string): string {
  const cleaned = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const lines = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•]+\s*/, '• '));

  return lines.join('\n');
}

export function extractContact(lines: string[]): IContactInfo {
  const contact: IContactInfo = { otherLinks: [] };
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const phoneRegex = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s-]?)?\d{3}[\s-]?\d{4}/;
  const websiteRegex = /(https?:\/\/)?(www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/\S*)?/;
  const linkedinRegex = /(https?:\/\/)?(www\.)?linkedin\.com\/[^\s]+/i;
  const githubRegex = /(https?:\/\/)?(www\.)?github\.com\/[^\s]+/i;

  for (const rawLine of lines.slice(0, 8)) {
    const line = rawLine.trim();

    if (!contact.email) {
      const emailMatch = line.match(emailRegex);
      if (emailMatch) {
        contact.email = emailMatch[0];
      }
    }

    if (!contact.phone) {
      const phoneMatch = line.match(phoneRegex);
      if (phoneMatch) {
        contact.phone = phoneMatch[0];
      }
    }

    if (!contact.website) {
      const websiteMatch = line.match(websiteRegex);
      if (websiteMatch) {
        const value = websiteMatch[0].replace(/\.+$/g, '');
        if (!line.toLowerCase().includes('linkedin.com') && !line.toLowerCase().includes('github.com')) {
          contact.website = value;
        }
      }
    }

    if (!contact.linkedin) {
      const linkedinMatch = line.match(linkedinRegex);
      if (linkedinMatch) {
        contact.linkedin = linkedinMatch[0];
      }
    }

    if (!contact.github) {
      const githubMatch = line.match(githubRegex);
      if (githubMatch) {
        contact.github = githubMatch[0];
      }
    }

    const hasLocation = /\b(Street|St\.|Avenue|Ave\.|Blvd|Boulevard|Road|Rd\.|City|State|USA|United States|UK|England|India|Canada|CA|TX|WA|MA|IL|NY)\b/i.test(line);
    if (!contact.location && hasLocation) {
      contact.location = line;
    }

    if (!contact.fullName && isLikelyName(line)) {
      contact.fullName = line;
    }

    if (websiteRegex.test(line) || linkedinRegex.test(line) || githubRegex.test(line)) {
      contact.otherLinks.push(line);
    }
  }

  if (!contact.otherLinks) {
    contact.otherLinks = [];
  }

  return contact;
}

function isLikelyName(line: string): boolean {
  if (!line || line.length > 40) {
    return false;
  }

  const words = line.split(/\s+/);
  if (words.length < 2 || words.length > 4) {
    return false;
  }

  const lower = line.toLowerCase();
  if (NAME_LINE_BLACKLIST.some((keyword) => lower.includes(keyword))) {
    return false;
  }

  return !/\d/.test(line) && /^[A-Za-z .,'-]+$/.test(line);
}

export function detectSections(lines: string[]): IParsedSection[] {
  const activeSections: IParsedSection[] = [];
  let current: IParsedSection | null = null;

  const sectionLines = lines.filter((line, index) => index > 4 ? true : !isContactLine(line));

  for (let index = 0; index < sectionLines.length; index += 1) {
    const line = sectionLines[index];
    const sectionType = classifySectionHeading(line);

    if (sectionType) {
      if (current) {
        activeSections.push(finalizeSection(current));
      }

      current = {
        id: `section-${activeSections.length + 1}`,
        title: line,
        type: sectionType,
        rawText: '',
        normalizedText: '',
        startLine: index + 1,
        endLine: index + 1,
        confidence: 0.95,
      };
      continue;
    }

    if (!current) {
      current = {
        id: 'section-1',
        title: 'Summary',
        type: 'summary',
        rawText: line,
        normalizedText: line,
        startLine: index + 1,
        endLine: index + 1,
        confidence: 0.75,
      };
      continue;
    }

    current.rawText = [current.rawText, line].filter(Boolean).join('\n');
    current.normalizedText = normalizeText(current.rawText);
    current.endLine = index + 1;
  }

  if (current) {
    activeSections.push(finalizeSection(current));
  }

  if (activeSections.length === 0) {
    activeSections.push({
      id: 'section-1',
      title: 'Summary',
      type: 'summary',
      rawText: lines.join('\n'),
      normalizedText: normalizeText(lines.join('\n')),
      startLine: 1,
      endLine: lines.length,
      confidence: 0.65,
    });
  }

  return activeSections;
}

function isContactLine(line: string): boolean {
  return /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(line)
    || /(?:\+?\d[\d ()-]{7,}\d)/.test(line)
    || /(linkedin\.com|github\.com|www\.|https?:\/\/)/i.test(line);
}

function classifySectionHeading(line: string): ParsedSectionType | null {
  const normalized = line.toLowerCase().replace(/[:-]+$/, '').trim();
  const compact = normalized.replace(/\s+/g, '');

  if (line.includes('|') && line.length > 30) {
    return null;
  }

  const compactHeadingMap: [string[], ParsedSectionType][] = [
    [['summary', 'professionalsummary', 'profile', 'aboutme', 'careersummary', 'objective', 'professionalprofile'], 'summary'],
    [['experience', 'workexperience', 'professionalexperience', 'employmenthistory', 'careerhistory'], 'experience'],
    [['education', 'academicbackground', 'academiccredentials', 'education&training'], 'education'],
    [['skills', 'technicalskills', 'corecompetencies', 'skillset', 'areasofexpertise'], 'skills'],
    [['projects', 'academicprojects', 'selectedprojects', 'projectexperience'], 'projects'],
    [['certifications', 'certificates', 'licenses', 'credentials'], 'certifications'],
    [['languages', 'languageproficiency', 'languageskills'], 'languages'],
  ];

  for (const [headings, type] of compactHeadingMap) {
    if (headings.includes(compact)) {
      return type;
    }
  }

  const headingMap: [RegExp, ParsedSectionType][] = [
    [/^(summary|professional summary|profile|about me|career summary|objective|professional profile)/i, 'summary'],
    [/^(experience|work experience|professional experience|employment history|career history)/i, 'experience'],
    [/^(education|academic background|academic credentials|education & training)/i, 'education'],
    [/^(skills|technical skills|core competencies|skillset|areas of expertise)/i, 'skills'],
    [/^(projects|academic projects|selected projects|project experience)/i, 'projects'],
    [/^(certifications|certificates|licenses|credentials)/i, 'certifications'],
    [/^(languages|language proficiency|language skills)/i, 'languages'],
  ];

  for (const [pattern, type] of headingMap) {
    if (pattern.test(normalized) || pattern.test(compact)) {
      return type;
    }
  }

  if (/^[A-Z\s]{2,50}$/.test(line) && line.length < 40 && !line.includes(' ')) {
    return null;
  }

  return null;
}

function finalizeSection(section: IParsedSection): IParsedSection {
  return {
    ...section,
    rawText: section.rawText.trim(),
    normalizedText: normalizeText(section.rawText),
  };
}

export function extractSkills(sections: IParsedSection[]): string[] {
  const skillsSection = sections.find((section) => section.type === 'skills');
  if (!skillsSection) {
    return [];
  }

  const rawItems = skillsSection.normalizedText.split(/[,;\n]/).map((piece) => piece.trim());
  const skills = rawItems
    .map((item) => item.replace(/^•\s*/u, '').trim())
    .filter(Boolean)
    .map((item) => item.replace(/\s{2,}/g, ' '));

  return Array.from(new Set(skills));
}

export function extractExperience(sections: IParsedSection[]): IExperienceItem[] {
  const experienceSection = sections.find((section) => section.type === 'experience');
  if (!experienceSection) {
    return [];
  }

  const blocks = experienceSection.normalizedText.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return blocks.map(parseExperienceBlock).filter((item) => item.title || item.company || item.bullets.length > 0);
}

function parseExperienceBlock(block: string): IExperienceItem {
  const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
  const result: IExperienceItem = { bullets: [] };

  if (lines.length === 0) {
    return result;
  }

  const firstLine = lines[0];
  const dates = extractDateRange(firstLine);
  const headline = dates ? firstLine.replace(dates.raw, '').trim() : firstLine;
  const parts = headline.split(/\||@|\u2013|\u2014|-|–|—/).map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 2) {
    result.title = parts[0];
    result.company = parts[1];
  } else {
    result.title = headline;
  }

  if (dates) {
    result.startDate = dates.startDate;
    result.endDate = dates.endDate;
    result.isCurrent = dates.isCurrent;
  }

  const remainder = lines.slice(1);
  const bullets: string[] = [];
  const summaryLines: string[] = [];

  for (const line of remainder) {
    if (/^•\s|^[-*]\s/.test(line)) {
      bullets.push(line.replace(/^•\s|^[-*]\s/, '').trim());
      continue;
    }

    if (/\d{4}/.test(line) && !result.startDate) {
      const hidden = extractDateRange(line);
      if (hidden) {
        result.startDate = hidden.startDate;
        result.endDate = hidden.endDate;
        result.isCurrent = hidden.isCurrent;
        continue;
      }
    }

    summaryLines.push(line);
  }

  if (bullets.length > 0) {
    result.bullets = bullets;
  } else if (summaryLines.length > 0) {
    result.summary = summaryLines.join(' ');
  }

  return result;
}

export function extractEducation(sections: IParsedSection[]): IEducationItem[] {
  const educationSection = sections.find((section) => section.type === 'education');
  if (!educationSection) {
    return [];
  }

  const blocks = educationSection.normalizedText.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return blocks.map(parseEducationBlock).filter((item) => item.institution || item.degree);
}

function parseEducationBlock(block: string): IEducationItem {
  const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
  const result: IEducationItem = {};

  if (lines.length === 0) {
    return result;
  }

  const firstLine = lines[0];
  const dates = extractDateRange(firstLine);
  let headline = firstLine;

  if (dates) {
    result.startDate = dates.startDate;
    result.endDate = dates.endDate;
    headline = firstLine.replace(dates.raw, '').trim();
  }

  const parts = headline.split(/\||@|\u2013|\u2014|-|–|—/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    result.degree = parts[0];
    result.institution = parts[1];
  } else {
    result.institution = headline;
  }

  if (lines.length > 1) {
    result.location = lines[lines.length - 1];
    if (!result.degree && /Bachelor|Master|MBA|PhD|Doctor|B\.|M\.|BS|MS|BA|MA/i.test(lines[1])) {
      result.degree = lines[1];
      result.location = lines.slice(2).join(', ');
    }
  }

  return result;
}

function extractSummary(sections: IParsedSection[]): string | undefined {
  const summarySection = sections.find((section) => section.type === 'summary');
  if (summarySection && summarySection.normalizedText.length > 20) {
    return summarySection.normalizedText;
  }

  const firstSection = sections[0];
  if (firstSection && firstSection.type !== 'experience' && firstSection.normalizedText.length > 20) {
    return firstSection.normalizedText;
  }

  return undefined;
}

export function extractProjectItems(sections: IParsedSection[]): IProjectItem[] {
  const section = sections.find((item) => item.type === 'projects');
  if (!section) {
    return [];
  }

  const lines = section.normalizedText.split('\n').map((line) => line.replace(/^•\s*/u, '').trim()).filter(Boolean);
  return lines.map((line) => ({ name: line, description: '', technologies: [] }));
}

export function extractCertificationItems(sections: IParsedSection[]): ICertificationItem[] {
  const section = sections.find((item) => item.type === 'certifications');
  if (!section) {
    return [];
  }

  const lines = section.normalizedText.split('\n').map((line) => line.replace(/^•\s*/u, '').trim()).filter(Boolean);
  return lines.map((line) => ({ name: line, authority: '', date: '' }));
}

export function extractLanguageItems(sections: IParsedSection[]): ILanguageItem[] {
  const section = sections.find((item) => item.type === 'languages');
  if (!section) {
    return [];
  }

  const tokens = section.normalizedText.split(/[,\n]/).map((line) => line.replace(/^•\s*/u, '').trim()).filter(Boolean);
  return tokens.map((token) => {
    const parts = token.split(/\(|\)/).map((item) => item.trim()).filter(Boolean);
    return {
      name: parts[0],
      proficiency: parts[1],
    };
  });
}

export function determineResumeType(params: {
  experience: IExperienceItem[];
  education: IEducationItem[];
  skills: string[];
  sections: IParsedSection[];
}): ResumeType {
  const { experience, education, skills, sections } = params;
  const hasPublications = sections.some((section) => /publications|research|papers/i.test(section.title));
  const hasTechnicalSkills = skills.some((skill) => TECHNICAL_KEYWORDS.some((keyword) => skill.toLowerCase().includes(keyword)));
  const hasPhD = education.some((edu) => /phd|doctorate|doctor of philosophy/i.test(edu.degree || ''));

  // Academic: PhD degree OR publications OR (academic heading + no work experience)
  if (hasPhD || hasPublications || (sections.some((section) => section.type === 'education' && /academic|thesis|research/i.test(section.title)) && experience.length === 0)) {
    return 'academic';
  }

  // Experienced: Multiple work experiences
  if (experience.length >= 2) {
    return 'experienced';
  }

  if (experience.length === 0 && education.length > 0) {
    return 'fresher';
  }

  // Technical: Has technical skills and at least one work experience
  if (hasTechnicalSkills && experience.length > 0) {
    return 'technical';
  }

  // Fresher: Minimal experience and education
  return 'fresher';
}

function validateParsedResume(parsed: IParsedResume): IParseWarning[] {
  const warnings: IParseWarning[] = [];

  if (!parsed.rawText || parsed.rawText.length < 80) {
    warnings.push({
      code: 'short_resume',
      message: 'Parsed resume text is very short and may be incomplete.',
      severity: 'medium',
    });
  }

  if (!parsed.contact.fullName && !parsed.contact.email && !parsed.contact.phone) {
    warnings.push({
      code: 'missing_contact',
      message: 'Contact information could not be reliably extracted.',
      severity: 'high',
    });
  }

  if (parsed.skills.length === 0) {
    warnings.push({
      code: 'missing_skills',
      message: 'No skills section or skill items were extracted.',
      severity: 'medium',
    });
  }

  if (parsed.experience.length === 0) {
    warnings.push({
      code: 'missing_experience',
      message: 'No work experience entries were extracted.',
      severity: 'medium',
    });
  }

  if (parsed.education.length === 0) {
    warnings.push({
      code: 'missing_education',
      message: 'No education section was extracted.',
      severity: 'low',
    });
  }

  return warnings;
}

export function calculateParseConfidence(params: {
  contact: IContactInfo;
  summary?: string;
  skills: string[];
  experience: IExperienceItem[];
  education: IEducationItem[];
  warnings: IParseWarning[];
}): number {
  let confidence = 0.2;
  const { contact, summary, skills, experience, education, warnings } = params;

  if (contact.email || contact.phone || contact.fullName) {
    confidence += 0.2;
  }

  if (summary) {
    confidence += 0.1;
  }

  if (skills.length > 0) {
    confidence += 0.2;
  }

  if (experience.length > 0) {
    confidence += 0.2;
  }

  if (education.length > 0) {
    confidence += 0.1;
  }

  confidence -= Math.min(0.2, warnings.length * 0.03);
  confidence = Math.max(0, Math.min(1, confidence));
  return Number(confidence.toFixed(2));
}

function detectMultipleColumns(rawText: string): boolean {
  const lines = rawText.split('\n').filter(Boolean);
  if (lines.length < 10) {
    return false;
  }

  const multiColumnPattern = /\s{4,}/;
  const matches = lines.filter((line) => multiColumnPattern.test(line));
  return matches.length >= Math.max(2, Math.floor(lines.length * 0.05));
}

function detectTablePatterns(rawText: string): boolean {
  return /\t|\|/.test(rawText) || /\b(Responsibilities|Skills|Experience|Education)\b/.test(rawText);
}

function extractDateRange(text: string): { raw: string; startDate?: string; endDate?: string; isCurrent: boolean } | null {
  const datePattern = /((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|Present|Current)\s*\d{4}|\b\d{4}\b)(?:\s*[-–—]\s*((?:Present|Current)|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\d{4}|\b\d{4}\b))?/i;
  const match = text.match(datePattern);
  if (!match) {
    return null;
  }

  const startDate = match[1]?.trim();
  const endDate = match[2]?.trim();
  const isCurrent = !!endDate && /present|current/i.test(endDate);
  return {
    raw: match[0],
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
    isCurrent,
  };
}

function buildParsingMetrics(params: {
  sections: IParsedSection[];
  skills: string[];
  experience: IExperienceItem[];
  education: IEducationItem[];
  projects: IProjectItem[];
  certifications: ICertificationItem[];
  languages: ILanguageItem[];
  rawText: string;
  warnings: IParseWarning[];
  parseTimeMs: number;
}): IParsingMetrics {
  const { sections, skills, experience, education, projects, certifications, languages, rawText, warnings, parseTimeMs } = params;
  return {
    parseTimeMs,
    sectionCount: sections.length,
    skillCount: skills.length,
    experienceCount: experience.length,
    educationCount: education.length,
    projectCount: projects.length,
    certificationCount: certifications.length,
    languageCount: languages.length,
    warningCount: warnings.length,
    rawTextLength: rawText.length,
  };
}

export { validateParsedResume };
