// Direct verification of pdf-parse on pdfkit-generated PDFs
// Run with: node --require ts-node/register tests/scripts/pdf_verify.js

/* eslint-disable */
const PDFDocument = require('pdfkit');
const pdfParse = require('pdf-parse');

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
    const lines = ['Avery Patel', 'avery.patel@example.com', 'Summary', 'Software engineer with backend experience.', 'Skills', 'JavaScript TypeScript Node.js'];
    for (const line of lines) {
      doc.text(line, 50, y, { width: 500 });
      y += 18;
    }
    doc.end();
  });
}

async function main() {
  const buf = await createPdf();
  console.log('=== pdfkit buffer ===');
  console.log('Buffer size:', buf.length);
  console.log('Header:', buf.slice(0, 8).toString('utf8'));

  console.log('\n=== pdf-parse test ===');
  try {
    const data = await pdfParse(buf);
    console.log('pages:', data.numpages);
    console.log('text length:', data.text ? data.text.length : 'null');
    console.log('text preview:', data.text ? JSON.stringify(data.text.slice(0, 300)) : 'null');
  } catch(e) {
    console.log('ERROR:', e.message);
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
