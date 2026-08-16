// Test the PDFJS child process path directly with a pdfkit PDF
const PDFDocument = require('pdfkit');
const path = require('path');
const childProcess = require('child_process');

async function createPdf() {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, margin: 50, compress: false });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.addPage();
    doc.fontSize(11);
    let y = 60;
    const lines = ['Avery Patel', 'avery.patel@example.com', 'Summary', 'Software engineer.', 'Skills', 'JavaScript TypeScript'];
    for (const line of lines) {
      doc.text(line, 50, y, { width: 500 });
      y += 18;
    }
    doc.end();
  });
}

// Replicate the EXACT script from resumeParser.service.ts
function extractPdfJsChildProcess(buffer) {
  const backendRoot = path.resolve(__dirname, '../../');
  const fontPath = path.join(backendRoot, 'node_modules', 'pdfjs-dist', 'standard_fonts').replace(/\\/g, '/');
  console.log('backendRoot:', backendRoot);
  console.log('fontPath:', fontPath);
  
  const script = `
    import('pdfjs-dist/legacy/build/pdf.mjs').then(async (pdfjs) => {
      const chunks = [];
      process.stdin.on('data', (chunk) => chunks.push(chunk));
      process.stdin.on('end', async () => {
        const data = new Uint8Array(Buffer.concat(chunks));
        const loadingTask = pdfjs.getDocument({
          data,
          disableWorker: true,
          useSystemFonts: true,
          standardFontDataUrl: '${fontPath}/',
        });

        const document = await loadingTask.promise;
    const pages = [];

    function orderPdfTextItems(items) {
      const rows = new Map();
      const yTolerance = 2;

      for (const item of items) {
        const text = item.str?.trim();
        const y = item.transform?.[5];

        if (!text || typeof y !== 'number') {
          continue;
        }

        const rowKey = Array.from(rows.keys()).find((key) => Math.abs(key - y) <= yTolerance) ?? y;
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
        .filter(Boolean)
        .join('\\n');
    }

    for (let i = 1; i <= document.numPages; i += 1) {
      const page = await document.getPage(i);
      const textContent = await page.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });
      pages.push(orderPdfTextItems(textContent.items));
    }

    process.stdout.write(JSON.stringify({
      rawText: pages.join('\\\\n\\\\n').trim(),
      pageCount: document.numPages,
      layoutNotes: ['Fallback parser: pdfjs-dist in child process.'],
    }));
      });
      process.stdin.on('error', (error) => {
        console.error(error);
        process.exit(1);
      });
    }).catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;

  const result = childProcess.spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    input: buffer,
    cwd: backendRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });

  console.log('status:', result.status);
  console.log('error:', result.error ? result.error.message : 'none');
  console.log('stderr:', result.stderr ? result.stderr.slice(0, 500) : 'none');
  console.log('stdout:', result.stdout ? result.stdout.slice(0, 500) : 'none');
  
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`PDFJS failed: ${result.stderr}`);
  if (!result.stdout) throw new Error('No output');
  
  const parsed = JSON.parse(result.stdout);
  console.log('parsed rawText:', parsed.rawText);
  console.log('parsed pageCount:', parsed.pageCount);
  return parsed;
}

async function main() {
  const buf = await createPdf();
  console.log('Buffer size:', buf.length);
  console.log('');
  extractPdfJsChildProcess(buf);
}

main().catch(e => console.error('FATAL:', e.message));
