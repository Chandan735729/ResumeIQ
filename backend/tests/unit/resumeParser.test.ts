/**
 * Resume Parser Unit Tests
 *
 * These tests validate the parser building blocks used in Phase 3A.
 */

import fs from 'fs/promises';
import path from 'path';
import {
  detectFileType,
  normalizeText,
  extractContact,
  detectSections,
  extractSkills,
  extractExperience,
  extractEducation,
  parsePdfResume,
  parseDocxResume,
  parseResume,
  validateParsedResume,
  calculateParseConfidence,
} from '@services/resumeParser.service';

describe('Resume Parser Service - Unit', () => {
  const fixturesDir = path.resolve(__dirname, '../fixtures/resumes');

  it('should detect PDF and DOCX file types correctly', async () => {
    const pdfBuffer = await fs.readFile(path.join(fixturesDir, 'fresher-resume.pdf'));
    const docxBuffer = await fs.readFile(path.join(fixturesDir, 'technical-resume.docx'));

    expect(detectFileType('fresher-resume.pdf', pdfBuffer)).toBe('pdf');
    expect(detectFileType('technical-resume.docx', docxBuffer)).toBe('docx');
  });

  it('should normalize text and preserve bullets', () => {
    const rawText = '  JavaScript,  TypeScript\n\n• React\n  • Node.js \n';
    const normalized = normalizeText(rawText);

    expect(normalized).toContain('JavaScript, TypeScript');
    expect(normalized).toContain('• React');
    expect(normalized).toContain('• Node.js');
  });

  it('should extract contact details from resume header lines', () => {
    const lines = [
      'Avery Patel',
      'avery.patel@example.com | +1 555-0789 | San Francisco, CA | linkedin.com/in/averypatel',
      '• JavaScript, TypeScript, Python',
    ];

    const contact = extractContact(lines);

    expect(contact.fullName).toBe('Avery Patel');
    expect(contact.email).toBe('avery.patel@example.com');
    expect(contact.phone).toContain('555');
    expect(contact.location).toContain('San Francisco');
    expect(contact.linkedin).toContain('linkedin.com');
  });

  it('should detect common resume sections', () => {
    const lines = [
      'Summary',
      'Skilled engineer with a background in automation.',
      'Experience',
      'Software Engineer | DevCo | 2022 - Present',
      'Skills',
      '• JavaScript, AWS, Docker',
      'Education',
      'B.Sc. Computer Science | 2021',
    ];

    const sections = detectSections(lines);
    const sectionTypes = sections.map((section) => section.type);

    expect(sectionTypes).toEqual(expect.arrayContaining(['summary', 'experience', 'skills', 'education']));
  });

  it('should extract skills from a skills section', () => {
    const section = {
      id: 'section-1',
      title: 'Skills',
      type: 'skills' as const,
      rawText: '• JavaScript\n• TypeScript\n• Node.js',
      normalizedText: '• JavaScript\n• TypeScript\n• Node.js',
      startLine: 1,
      endLine: 3,
      confidence: 0.95,
    };

    const skills = extractSkills([section]);

    expect(skills).toEqual(expect.arrayContaining(['JavaScript', 'TypeScript', 'Node.js']));
  });

  it('should extract experience item blocks from the experience section', () => {
    const section = {
      id: 'section-1',
      title: 'Experience',
      type: 'experience' as const,
      rawText: 'Software Engineer | DevCo | Jan 2022 - Present\n• Built REST APIs\n• Led automation efforts',
      normalizedText: 'Software Engineer | DevCo | Jan 2022 - Present\n• Built REST APIs\n• Led automation efforts',
      startLine: 1,
      endLine: 3,
      confidence: 0.95,
    };

    const experience = extractExperience([section]);

    expect(experience[0].title).toContain('Software Engineer');
    expect(experience[0].company).toContain('DevCo');
    expect(experience[0].bullets.length).toBe(2);
    expect(experience[0].startDate).toContain('Jan 2022');
  });

  it('should extract education items from the education section', () => {
    const section = {
      id: 'section-1',
      title: 'Education',
      type: 'education' as const,
      rawText: 'Bachelor of Science in Computer Science | University of Washington | 2024',
      normalizedText: 'Bachelor of Science in Computer Science | University of Washington | 2024',
      startLine: 1,
      endLine: 1,
      confidence: 0.95,
    };

    const education = extractEducation([section]);

    expect(education[0].degree).toContain('Bachelor of Science');
    expect(education[0].institution).toContain('University of Washington');
  });

  it('should parse a valid PDF fixture buffer', async () => {
    const buffer = await fs.readFile(path.join(fixturesDir, 'fresher-resume.pdf'));
    const result = await parsePdfResume(buffer);

    expect(result.rawText.length).toBeGreaterThan(20);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
  });

  it('should parse a valid DOCX fixture buffer', async () => {
    const buffer = await fs.readFile(path.join(fixturesDir, 'technical-resume.docx'));
    const result = await parseDocxResume(buffer);

    expect(result.rawText.length).toBeGreaterThan(20);
    expect(result.pageCount).toBe(1);
  });

  it('should validate parsed resume warnings and scoring', async () => {
    const buffer = await fs.readFile(path.join(fixturesDir, 'experienced-resume.pdf'));
    const parsed = await parseResume(buffer, 'experienced-resume.pdf');
    const warnings = validateParsedResume(parsed);
    const score = calculateParseConfidence({
      contact: parsed.contact,
      summary: parsed.summary,
      skills: parsed.skills,
      experience: parsed.experience,
      education: parsed.education,
      warnings: parsed.warnings,
    });

    expect(Array.isArray(warnings)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
