import fs from 'fs/promises';
import path from 'path';
import { parseResume } from '@services/resumeParser.service';

describe('Resume Parser Service - Integration', () => {
  const fixturesDir = path.resolve(__dirname, '../fixtures/resumes');
  const files = [
    'fresher-resume.pdf',
    'experienced-resume.pdf',
    'technical-resume.docx',
    'multi-page-resume.pdf',
    'multi-column-resume.pdf',
    'academic-resume.docx',
  ];

  it('should parse every parser fixture successfully', async () => {
    const parsedResults = [] as Array<{ fileName: string; parseTimeMs: number; parseConfidence: number }>;

    for (const fileName of files) {
      const filePath = path.join(fixturesDir, fileName);
      const buffer = await fs.readFile(filePath);
      const parsed = await parseResume(buffer, fileName);

      expect(parsed.rawText.length).toBeGreaterThan(50);
      expect(parsed.contact).toBeDefined();
      expect(parsed.sections.length).toBeGreaterThanOrEqual(1);
      expect(parsed.parsingMetrics.parseTimeMs).toBeGreaterThanOrEqual(0);
      expect(parsed.parseConfidence).toBeGreaterThanOrEqual(0);
      expect(parsed.parseConfidence).toBeLessThanOrEqual(1);

      parsedResults.push({ fileName, parseTimeMs: parsed.parsingMetrics.parseTimeMs, parseConfidence: parsed.parseConfidence });
    }

    const averageParseTime = parsedResults.reduce((sum, item) => sum + item.parseTimeMs, 0) / parsedResults.length;
    expect(averageParseTime).toBeLessThan(2000);
  });

  it('should categorize fresher resume correctly', async () => {
    const filePath = path.join(fixturesDir, 'fresher-resume.pdf');
    const buffer = await fs.readFile(filePath);
    const parsed = await parseResume(buffer, 'fresher-resume.pdf');

    expect(parsed.resumeType).toBe('fresher');
    expect(parsed.skills.length).toBeGreaterThan(0);
    expect(parsed.education.length).toBeGreaterThan(0);
  });

  it('should parse technical DOCX resume and preserve skill items', async () => {
    const filePath = path.join(fixturesDir, 'technical-resume.docx');
    const buffer = await fs.readFile(filePath);
    const parsed = await parseResume(buffer, 'technical-resume.docx');

    expect(parsed.resumeType).toBe('technical');
    expect(parsed.skills).toEqual(expect.arrayContaining([expect.stringMatching(/JavaScript/i)]));
    expect(parsed.metadata.pageCount).toBeGreaterThanOrEqual(1);
  });

  it('should detect multi-page PDF resume page count', async () => {
    const filePath = path.join(fixturesDir, 'multi-page-resume.pdf');
    const buffer = await fs.readFile(filePath);
    const parsed = await parseResume(buffer, 'multi-page-resume.pdf');

    expect(parsed.metadata.pageCount).toBeGreaterThanOrEqual(2);
  });

  it('should detect academic resume education details', async () => {
    const filePath = path.join(fixturesDir, 'academic-resume.docx');
    const buffer = await fs.readFile(filePath);
    const parsed = await parseResume(buffer, 'academic-resume.docx');

    expect(parsed.resumeType).toBe('academic');
    expect(parsed.education.length).toBeGreaterThanOrEqual(1);
    expect(parsed.skills.length).toBeGreaterThan(0);
  });
});
