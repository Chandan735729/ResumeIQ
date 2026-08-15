/**
 * pdfjs-extract-worker.mjs
 *
 * Standalone ESM helper script for extracting text from a PDF using pdfjs-dist.
 * Called by resumeParser.service.ts via childProcess.spawnSync.
 *
 * Usage:
 *   node pdfjs-extract-worker.mjs <pdf-path>
 *
 * Outputs a JSON object to stdout:
 *   { rawText: string, pageCount: number, layoutNotes: string[] }
 *
 * Exits with code 1 and writes error to stderr on failure.
 *
 * This file lives alongside the service so that Node.js ESM can resolve
 * `pdfjs-dist` from the project's node_modules directory.
 */

import { readFileSync } from 'fs';

const bufPath = process.argv[2];

if (!bufPath) {
  process.stderr.write('Usage: node pdfjs-extract-worker.mjs <pdf-path>');
  process.exit(1);
}

const buffer = readFileSync(bufPath);
const data = new Uint8Array(buffer);

// Dynamic import keeps this compatible with how pdfjs-dist is packaged.
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const loadingTask = pdfjs.getDocument({
  data,
  disableWorker: true,
  useSystemFonts: true,
  // standardFontDataUrl is injected at runtime via argument if needed;
  // useSystemFonts: true handles the common case without it.
});

const document = await loadingTask.promise;
const pages = [];

/**
 * Converts raw PDF text items into a readable string preserving reading order.
 * Groups items by y-coordinate (row) then sorts left-to-right within each row.
 */
function orderItems(items) {
  const rows = new Map();
  const yTolerance = 2;

  for (const item of items) {
    const text = item.str ? item.str.trim() : '';
    const y = item.transform ? item.transform[5] : null;
    if (!text || typeof y !== 'number') continue;

    const key = [...rows.keys()].find(k => Math.abs(k - y) <= yTolerance) ?? y;
    const row = rows.get(key) ?? [];
    row.push(item);
    rows.set(key, row);
  }

  return [...rows.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, rowItems]) =>
      rowItems
        .sort((a, b) =>
          (a.transform ? a.transform[4] : 0) - (b.transform ? b.transform[4] : 0)
        )
        .map(item => (item.str ? item.str.trim() : ''))
        .filter(Boolean)
        .join(' ')
    )
    .filter(Boolean)
    .join('\n');
}

for (let i = 1; i <= document.numPages; i++) {
  const page = await document.getPage(i);
  const tc = await page.getTextContent({
    normalizeWhitespace: true,
    disableCombineTextItems: false,
  });
  pages.push(orderItems(tc.items));
}

const rawText = pages.join('\n\n').trim();

process.stdout.write(
  JSON.stringify({
    rawText,
    pageCount: document.numPages,
    layoutNotes: ['Primary parser: pdfjs-dist child process.'],
  })
);
