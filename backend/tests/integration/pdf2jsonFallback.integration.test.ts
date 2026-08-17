import path from 'path';
import fs from 'fs/promises';

/**
 * Exercises the pdf2json fallback tier's actual SUCCESS path — the final
 * fallback, only reached when both pdfjs-dist and pdf-parse fail. See
 * pdfParseFallback.integration.test.ts for why a real-world fixture (not a
 * pdfkit-generated synthetic one) is required to test a fallback tier's
 * success path.
 */
jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return {
    ...actual,
    spawnSync: jest.fn(() => ({
      status: 1,
      error: null,
      stderr: Buffer.from('simulated pdfjs worker failure for fallback-chain test'),
      stdout: Buffer.from(''),
      pid: 0,
      output: [],
      signal: null,
    })),
  };
});

jest.mock('pdf-parse', () => jest.fn(() => Promise.reject(new Error('simulated pdf-parse failure for fallback-chain test'))));

describe('PDF extraction fallback chain — pdf2json tier', () => {
  it('falls through to pdf2json and still produces a usable ParsedResume when both pdfjs-dist and pdf-parse fail', async () => {
    const { parseResume } = await import('@services/resumeParser.service');
    const fixturePath = path.resolve(__dirname, '../fixtures/real-world-resumes/fau-engineering-resume.pdf');
    const buffer = await fs.readFile(fixturePath);

    const parsed = await parseResume(buffer, 'fau-engineering-resume.pdf');

    expect(parsed.rawText.length).toBeGreaterThan(100);
    expect(parsed.metadata.layoutNotes.some((note) => note.toLowerCase().includes('pdf2json'))).toBe(true);
    expect(parsed.sections.length).toBeGreaterThan(0);
    expect(parsed.skills.length).toBeGreaterThan(0);
  });
});
