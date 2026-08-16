// Test all three extractors with pdfkit-generated PDF
const PDFDocument = require('pdfkit');
const pdfParse = require('pdf-parse');
const PDFParser = require('pdf2json');
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

async function testPdfParse(buffer) {
  console.log('--- pdf-parse ---');
  try {
    const data = await pdfParse(buffer);
    console.log('pages:', data.numpages);
    console.log('text len:', data.text ? data.text.length : 'null');
    console.log('text:', JSON.stringify((data.text || '').slice(0, 200)));
    return data.text || '';
  } catch(e) {
    console.log('ERROR:', e.message);
    return '';
  }
}

async function testPdf2Json(buffer) {
  console.log('\n--- pdf2json ---');
  return new Promise((resolve) => {
    const parser = new PDFParser();
    parser.on('pdfParser_dataError', (err) => {
      console.log('ERROR:', err.parserError ? err.parserError.message : err);
      resolve('');
    });
    parser.on('pdfParser_dataReady', (data) => {
      const pages = (data.Pages || []).map(page =>
        (page.Texts || []).map(item => (item.R || []).map(run => {
          try { return decodeURIComponent(run.T || ''); } catch { return run.T || ''; }
        }).join('')).join('\n')
      );
      const text = pages.join('\n\n').trim();
      console.log('pages:', (data.Pages || []).length);
      console.log('text len:', text.length);
      console.log('text:', JSON.stringify(text.slice(0, 200)));
      resolve(text);
    });
    parser.parseBuffer(buffer);
  });
}

function testPdfJsChildProcess(buffer) {
  console.log('\n--- pdfjs-dist child process ---');
  const backendRoot = path.resolve(__dirname, '../../');
  const fontPath = path.join(backendRoot, 'node_modules', 'pdfjs-dist', 'standard_fonts').replace(/\\/g, '/');
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
        for (let i = 1; i <= document.numPages; i++) {
          const page = await document.getPage(i);
          const tc = await page.getTextContent({ normalizeWhitespace: true });
          const pageText = tc.items.map(item => item.str).join(' ');
          pages.push(pageText);
        }
        process.stdout.write(JSON.stringify({ rawText: pages.join('\\n\\n'), pageCount: document.numPages }));
      });
    }).catch(e => { console.error(e.message); process.exit(1); });
  `;
  const result = childProcess.spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    input: buffer,
    cwd: backendRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) {
    console.log('ERROR:', result.error.message);
    return '';
  }
  if (result.status !== 0) {
    console.log('ERROR (status', result.status, '):', result.stderr ? result.stderr.trim() : '');
    return '';
  }
  try {
    const parsed = JSON.parse(result.stdout);
    console.log('pages:', parsed.pageCount);
    console.log('text len:', (parsed.rawText || '').length);
    console.log('text:', JSON.stringify((parsed.rawText || '').slice(0, 200)));
    return parsed.rawText || '';
  } catch(e) {
    console.log('Parse error:', e.message, 'stdout:', result.stdout.slice(0, 200));
    return '';
  }
}

async function main() {
  const buf = await createPdf();
  console.log('=== pdfkit PDF buffer ===');
  console.log('Size:', buf.length, 'bytes');
  console.log('Header:', buf.slice(0, 8).toString('utf8'));
  console.log();
  
  await testPdfParse(buf);
  await testPdf2Json(buf);
  testPdfJsChildProcess(buf);
  
  console.log('\nDone.');
}

main().catch(e => console.error('FATAL:', e.message));
