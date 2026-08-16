import fs from 'fs/promises';
import path from 'path';
import PDFDocument from 'pdfkit';
import { parseResume } from '../../src/services/resumeParser.service';

type ExtractResult = { text: string; pages: number };
type Extractor = (buffer: Buffer) => Promise<ExtractResult>;

const fixturesDir = path.resolve(__dirname, '../fixtures/resumes');
const realWorldDir = path.resolve(__dirname, '../fixtures/real-world-resumes');

const expectedTokens: Record<string, string[]> = {
  'minimal-hello-world.pdf': ['hello', 'world', 'pdf', 'resume'],
  'fresher-resume.pdf': ['emma', 'johnson', 'summary', 'education', 'skills', 'javascript'],
  'experienced-resume.pdf': ['michael', 'carter', 'experience', 'education', 'skills', 'backend'],
  'multi-page-resume.pdf': ['sophia', 'lee', 'experience', 'education', 'skills', 'volunteer'],
  'multi-column-resume.pdf': ['jordan', 'kim', 'summary', 'skills', 'experience', 'education'],
  'fau-engineering-resume.pdf': ['sample', 'resume', 'engineering', 'education', 'experience'],
  'erau-computing-resume.pdf': ['computing', 'resume', 'software', 'engineer', 'education'],
  'github-matthew-roberts-resume.pdf': ['matthew', 'roberts', 'software', 'engineer', 'experience'],
  'github-mo-sorkhpar-resume.pdf': ['sorkhpar', 'senior', 'software', 'engineer', 'summary'],
  'github-eric-thomas-resume.pdf': ['eric', 'thomas', 'software', 'developer', 'experience'],
};

async function main() {
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  console.warn = () => undefined;
  console.error = () => undefined;

  const corpus = await loadCorpus();
  const extractors: Record<string, Extractor> = {
    'pdf-parse@1.1.1 default': extractWithPdfParseDefault,
    'pdf-parse@1.1.1 v1.10.100': extractWithPdfParseV110100,
    'pdfjs-dist@6 custom': extractWithPdfJsDist,
    'pdf2json@4.0.3': extractWithPdf2Json,
    'pdfreader@3.0.8': extractWithPdfReader,
    'pdf-extraction@1.0.2': extractWithPdfExtraction,
  };

  const libraryResults = [];
  for (const [library, extractor] of Object.entries(extractors)) {
    for (const item of corpus) {
      libraryResults.push(await measureExtraction(library, item.fileName, item.buffer, extractor));
    }
  }

  const parserResults = [];
  for (const item of corpus.filter((entry) => entry.fileName !== 'minimal-hello-world.pdf')) {
    parserResults.push(await measureParser(item.fileName, item.buffer));
  }

  const docxResults = [];
  for (const fileName of ['technical-resume.docx', 'academic-resume.docx']) {
    const buffer = await fs.readFile(path.join(fixturesDir, fileName));
    docxResults.push(await measureParser(fileName, buffer));
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    corpus: corpus.map((item) => ({ fileName: item.fileName, bytes: item.buffer.length })),
    librarySummary: summarizeLibraryResults(libraryResults),
    parserSummary: summarizeParserResults(parserResults),
    docxSummary: summarizeParserResults(docxResults),
    libraryResults,
    parserResults,
    docxResults,
  };

  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
  console.log(JSON.stringify(summary, null, 2));
}

async function loadCorpus(): Promise<Array<{ fileName: string; buffer: Buffer }>> {
  const generatedPdfNames = ['fresher-resume.pdf', 'experienced-resume.pdf', 'multi-page-resume.pdf', 'multi-column-resume.pdf'];
  const realWorldPdfNames = (await fs.readdir(realWorldDir)).filter((fileName) => fileName.endsWith('.pdf')).sort();
  const corpus = [{ fileName: 'minimal-hello-world.pdf', buffer: await createMinimalPdf() }];

  for (const fileName of generatedPdfNames) {
    corpus.push({ fileName, buffer: await fs.readFile(path.join(fixturesDir, fileName)) });
  }

  for (const fileName of realWorldPdfNames) {
    corpus.push({ fileName, buffer: await fs.readFile(path.join(realWorldDir, fileName)) });
  }

  return corpus;
}

async function createMinimalPdf(): Promise<Buffer> {
  const doc = new PDFDocument();
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk as Buffer));
  const finished = new Promise<void>((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });

  doc.font('Helvetica').fontSize(12).text('Hello World PDF Resume');
  doc.end();
  await finished;
  return Buffer.concat(chunks);
}

async function measureExtraction(library: string, fileName: string, buffer: Buffer, extractor: Extractor) {
  const beforeMemory = process.memoryUsage().heapUsed;
  const start = performance.now();

  try {
    const result = await extractor(buffer);
    const elapsedMs = performance.now() - start;
    const memoryDeltaKb = (process.memoryUsage().heapUsed - beforeMemory) / 1024;
    const text = normalize(result.text);
    const tokens = expectedTokens[fileName] ?? [];
    const matchedTokens = tokens.filter((token) => text.toLowerCase().includes(token));

    return {
      library,
      fileName,
      success: text.length > 0 && (tokens.length === 0 || matchedTokens.length / tokens.length >= 0.7),
      pages: result.pages,
      textLength: text.length,
      matchedTokens: matchedTokens.length,
      expectedTokens: tokens.length,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      memoryDeltaKb: Number(memoryDeltaKb.toFixed(2)),
    };
  } catch (error) {
    const elapsedMs = performance.now() - start;
    const memoryDeltaKb = (process.memoryUsage().heapUsed - beforeMemory) / 1024;

    return {
      library,
      fileName,
      success: false,
      pages: 0,
      textLength: 0,
      matchedTokens: 0,
      expectedTokens: expectedTokens[fileName]?.length ?? 0,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      memoryDeltaKb: Number(memoryDeltaKb.toFixed(2)),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function measureParser(fileName: string, buffer: Buffer) {
  const beforeMemory = process.memoryUsage().heapUsed;
  const start = performance.now();

  try {
    const parsed = await parseResume(buffer, fileName);
    const elapsedMs = performance.now() - start;
    const memoryDeltaKb = (process.memoryUsage().heapUsed - beforeMemory) / 1024;

    return {
      fileName,
      success: parsed.rawText.length > 50 && parsed.sections.length > 0 && parsed.parseConfidence >= 0.5,
      sourceType: parsed.sourceType,
      parseConfidence: parsed.parseConfidence,
      rawTextLength: parsed.rawText.length,
      sections: parsed.sections.length,
      skills: parsed.skills.length,
      experience: parsed.experience.length,
      education: parsed.education.length,
      warnings: parsed.warnings.map((warning) => warning.code),
      elapsedMs: Number(elapsedMs.toFixed(2)),
      memoryDeltaKb: Number(memoryDeltaKb.toFixed(2)),
    };
  } catch (error) {
    const elapsedMs = performance.now() - start;
    const memoryDeltaKb = (process.memoryUsage().heapUsed - beforeMemory) / 1024;

    return {
      fileName,
      success: false,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      memoryDeltaKb: Number(memoryDeltaKb.toFixed(2)),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeLibraryResults(results: Awaited<ReturnType<typeof measureExtraction>>[]) {
  return Object.values(results.reduce<Record<string, { library: string; total: number; passed: number; avgMs: number; avgMemoryKb: number }>>((acc, result) => {
    const current = acc[result.library] ?? { library: result.library, total: 0, passed: 0, avgMs: 0, avgMemoryKb: 0 };
    current.total += 1;
    current.passed += result.success ? 1 : 0;
    current.avgMs += result.elapsedMs;
    current.avgMemoryKb += result.memoryDeltaKb;
    acc[result.library] = current;
    return acc;
  }, {})).map((item) => ({
    ...item,
    successRate: Number(((item.passed / item.total) * 100).toFixed(2)),
    avgMs: Number((item.avgMs / item.total).toFixed(2)),
    avgMemoryKb: Number((item.avgMemoryKb / item.total).toFixed(2)),
  }));
}

function summarizeParserResults(results: Awaited<ReturnType<typeof measureParser>>[]) {
  const total = results.length;
  const passed = results.filter((result) => result.success).length;
  const avgMs = results.reduce((sum, result) => sum + result.elapsedMs, 0) / total;
  const avgMemoryKb = results.reduce((sum, result) => sum + result.memoryDeltaKb, 0) / total;

  return {
    total,
    passed,
    successRate: Number(((passed / total) * 100).toFixed(2)),
    avgMs: Number(avgMs.toFixed(2)),
    avgMemoryKb: Number(avgMemoryKb.toFixed(2)),
  };
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

async function extractWithPdfParseDefault(buffer: Buffer): Promise<ExtractResult> {
  const pdf = require('pdf-parse');
  const result = await pdf(buffer);
  return { text: result.text ?? '', pages: result.numpages ?? 0 };
}

async function extractWithPdfParseV110100(buffer: Buffer): Promise<ExtractResult> {
  const pdf = require('pdf-parse');
  const result = await pdf(buffer, { version: 'v1.10.100' });
  return { text: result.text ?? '', pages: result.numpages ?? 0 };
}

async function extractWithPdfExtraction(buffer: Buffer): Promise<ExtractResult> {
  const pdf = require('pdf-extraction');
  const result = await pdf(buffer);
  return { text: result.text ?? '', pages: result.numpages ?? 0 };
}

async function extractWithPdfJsDist(buffer: Buffer): Promise<ExtractResult> {
  ensurePdfJsNodeGlobals();
  const runtimeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
  const pdfjs = await runtimeImport('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useSystemFonts: true,
    standardFontDataUrl: path.join(__dirname, '../../node_modules/pdfjs-dist/standard_fonts/').replace(/\\/g, '/') + '/',
  });
  const document = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
    pages.push(orderPdfTextItems(textContent.items));
  }

  await loadingTask.destroy();
  return { text: pages.join('\n\n'), pages: document.numPages };
}

async function extractWithPdf2Json(buffer: Buffer): Promise<ExtractResult> {
  const PDFParser = require('pdf2json');
  const parser = new PDFParser();

  return new Promise((resolve, reject) => {
    parser.on('pdfParser_dataError', (error: { parserError: Error }) => reject(error.parserError));
    parser.on('pdfParser_dataReady', (data: any) => {
      const pages = data.Pages ?? [];
      const text = pages.map((page: any) => (page.Texts ?? [])
        .map((item: any) => (item.R ?? []).map((run: any) => safeDecode(run.T ?? '')).join(''))
        .join(' '))
        .join('\n\n');
      resolve({ text, pages: pages.length });
    });
    parser.parseBuffer(buffer);
  });
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function extractWithPdfReader(buffer: Buffer): Promise<ExtractResult> {
  const { PdfReader } = require('pdfreader');

  return new Promise((resolve, reject) => {
    const rows = new Map<number, string[]>();
    let pages = 0;

    new PdfReader().parseBuffer(buffer, (error: Error | null, item: any) => {
      if (error) {
        reject(error);
        return;
      }

      if (!item) {
        const text = Array.from(rows.entries())
          .sort(([a], [b]) => a - b)
          .map(([, values]) => values.join(' '))
          .join('\n');
        resolve({ text, pages });
        return;
      }

      if (item.page) {
        pages = Math.max(pages, item.page);
      }

      if (item.text) {
        const rowKey = Math.round((item.page ?? 1) * 10000 + item.y * 10);
        const row = rows.get(rowKey) ?? [];
        row.push(item.text);
        rows.set(rowKey, row);
      }
    });
  });
}

function orderPdfTextItems(items: Array<{ str?: string; transform?: number[] }>): string {
  const rows = new Map<number, Array<{ str?: string; transform?: number[] }>>();

  for (const item of items) {
    const text = item.str?.trim();
    const y = item.transform?.[5];
    if (!text || typeof y !== 'number') {
      continue;
    }

    const rowKey = Array.from(rows.keys()).find((key) => Math.abs(key - y) <= 2) ?? y;
    const row = rows.get(rowKey) ?? [];
    row.push(item);
    rows.set(rowKey, row);
  }

  return Array.from(rows.entries())
    .sort(([a], [b]) => b - a)
    .map(([, rowItems]) => rowItems
      .sort((a, b) => (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0))
      .map((item) => item.str?.trim())
      .filter(Boolean)
      .join(' '))
    .join('\n');
}

function ensurePdfJsNodeGlobals(): void {
  const globalObject = globalThis as typeof globalThis & { DOMMatrix?: unknown; ImageData?: unknown; Path2D?: unknown };
  globalObject.DOMMatrix = globalObject.DOMMatrix ?? class DOMMatrix {};
  globalObject.ImageData = globalObject.ImageData ?? class ImageData {};
  globalObject.Path2D = globalObject.Path2D ?? class Path2D {};
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
