import path from 'path';
import fs from 'fs/promises';

/**
 * Exercises the pdf-parse fallback tier's actual SUCCESS path — not just that
 * it's attempted, but that it produces a usable ParsedResume when the primary
 * pdfjs-dist child process fails.
 *
 * The parser's own synthetic test fixtures (built with pdfkit, see
 * documentFactories.ts) can't be used for this: pdf-parse and pdf2json both
 * genuinely fail to read pdfkit-generated PDFs (their XRef table structure —
 * confirmed empirically, see tests/integration/extractorDirect.test.ts), so a
 * pdfkit fixture can only prove the fallback chain's *failure* path, not its
 * success path. The 5 "real-world" fixtures (sourced from actual GitHub/
 * university career-page PDFs, not pdfkit) were verified directly to extract
 * successfully via both pdf-parse and pdf2json, so one of those is used here
 * as the input, with only the primary extractor's child process mocked to fail.
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

describe('PDF extraction fallback chain — pdf-parse tier', () => {
  it('falls through to pdf-parse and still produces a usable ParsedResume when pdfjs-dist fails', async () => {
    const { parseResume } = await import('@services/resumeParser.service');
    const fixturePath = path.resolve(__dirname, '../fixtures/real-world-resumes/fau-engineering-resume.pdf');
    const buffer = await fs.readFile(fixturePath);

    const parsed = await parseResume(buffer, 'fau-engineering-resume.pdf');

    expect(parsed.rawText.length).toBeGreaterThan(100);
    expect(parsed.metadata.layoutNotes.some((note) => note.toLowerCase().includes('pdf-parse'))).toBe(true);
    expect(parsed.sections.length).toBeGreaterThan(0);
    expect(parsed.skills.length).toBeGreaterThan(0);
  });
});
