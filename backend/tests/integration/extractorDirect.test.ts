// Test file to run in Jest context to verify PDFJS child process behavior
import { createPdfBuffer } from '../helpers/documentFactories';
import path from 'path';
import childProcess from 'child_process';

describe('Direct extractor verification', () => {
  it('PDFJS child process extracts text from pdfkit PDF', async () => {
    const buffer = await createPdfBuffer([['Avery Patel', 'avery@example.com', 'Skills', 'JavaScript']]);
    
    const backendRoot = path.resolve(__dirname, '../../');
    const fontPath = path.join(backendRoot, 'node_modules', 'pdfjs-dist', 'standard_fonts').replace(/\\/g, '/');
    
    console.log('backendRoot:', backendRoot);
    console.log('fontPath:', fontPath);
    console.log('buffer size:', buffer.length);
    
    const script = `
      import('pdfjs-dist/legacy/build/pdf.mjs').then(async (pdfjs) => {
        const chunks = [];
        process.stdin.on('data', (chunk) => chunks.push(chunk));
        process.stdin.on('end', async () => {
          const data = new Uint8Array(Buffer.concat(chunks));
          const loadingTask = pdfjs.getDocument({ data, disableWorker: true });
          const document = await loadingTask.promise;
          const pages = [];
          for (let i = 1; i <= document.numPages; i++) {
            const page = await document.getPage(i);
            const tc = await page.getTextContent();
            pages.push(tc.items.map(item => item.str).join(' '));
          }
          process.stdout.write(JSON.stringify({ rawText: pages.join('\\n'), pageCount: document.numPages }));
        });
      }).catch(e => { process.stderr.write(e.message); process.exit(1); });
    `;

    const result = childProcess.spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      input: buffer,
      cwd: backendRoot,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    
    console.log('status:', result.status);
    console.log('error:', result.error ? result.error.message : 'none');
    console.log('stderr:', result.stderr ? result.stderr.slice(0, 500) : '(none)');
    console.log('stdout:', result.stdout ? result.stdout.slice(0, 500) : '(none)');
    
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.rawText).toContain('Avery');
  });
  
  it('pdf-parse: shows error for pdfkit PDF', async () => {
    const buffer = await createPdfBuffer([['Avery Patel', 'avery@example.com', 'Skills', 'JavaScript']]);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse') as (data: Buffer) => Promise<any>;
    try {
      const data = await pdfParse(buffer);
      console.log('pdf-parse OK: pages', data.numpages, 'text len', data.text?.length);
    } catch (e) {
      console.log('pdf-parse ERROR:', e instanceof Error ? e.message : e);
    }
  });
});
