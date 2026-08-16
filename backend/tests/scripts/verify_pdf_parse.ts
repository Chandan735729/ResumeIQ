/**
 * Standalone verification: which PDF extractors return meaningful text for pdfkit buffers.
 */
import PDFDocument from 'pdfkit';

async function createPdfBuffer(lines: string[]): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, margin: 50, compress: false });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.addPage();
    doc.fontSize(11);
    let y = 60;
    for (const line of lines) {
      doc.text(line, 50, y, { width: 500 });
      y += 18;
    }
    doc.end();
  });
}

async function testPdfParse(buffer: Buffer): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse') as (data: Buffer) => Promise<any>;
    const data = await pdfParse(buffer);
    console.log('pdf-parse result:');
    console.log('  numpages:', data?.numpages);
    console.log('  text length:', data?.text?.length);
    console.log('  text preview:', JSON.stringify(data?.text?.slice(0, 200)));
  } catch (e) {
    console.log('pdf-parse ERROR:', e instanceof Error ? e.message : e);
  }
}

async function main() {
  const lines = [
    'Avery Patel',
    'avery.patel@example.com | +1 555-0789 | San Francisco, CA',
    'Summary',
    'Software engineer with product and backend experience.',
    'Skills',
    'JavaScript, TypeScript, Node.js, AWS',
    'Experience',
    'Software Engineer | Acme Corp | 2022 - Present',
  ];

  console.log('=== Creating pdfkit buffer ===');
  const buffer = await createPdfBuffer(lines);
  console.log('Buffer size:', buffer.length);
  console.log('Header:', buffer.slice(0, 8).toString('utf8'));

  console.log('\n=== Testing pdf-parse ===');
  await testPdfParse(buffer);
}

main().catch(console.error);
