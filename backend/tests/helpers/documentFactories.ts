import PDFDocument from 'pdfkit';
import JSZip from 'jszip';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeFixtureText(value: string): string {
  return value.replace(/\u0000/g, '').trim();
}

export async function createPdfBuffer(pages: string[][]): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ autoFirstPage: false, margin: 50, compress: false });
    const chunks: Buffer[] = [];

    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    for (const lines of pages) {
      document.addPage();
      document.fontSize(11);

      let y = 60;
      for (const line of lines) {
        document.text(normalizeFixtureText(line), 50, y, { width: 500 });
        y += 18;
      }
    }

    document.end();
  });
}

export async function createTwoColumnPdfBuffer(leftLines: string[], rightLines: string[]): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ autoFirstPage: false, margin: 50, compress: false });
    const chunks: Buffer[] = [];

    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    document.addPage();
    document.fontSize(11);

    let y = 60;
    for (const line of leftLines) {
      document.text(`Left: ${normalizeFixtureText(line)}`, 50, y, { width: 500 });
      y += 18;
    }

    for (const line of rightLines) {
      document.text(`Right: ${normalizeFixtureText(line)}`, 50, y, { width: 500 });
      y += 18;
    }

    document.end();
  });
}

export async function createBlankPdfBuffer(): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ autoFirstPage: false, compress: false });
    const chunks: Buffer[] = [];

    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    document.addPage();
    document.end();
  });
}

export async function createDocxBuffer(paragraphs: string[], tableRows: string[][] = []): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  const paragraphXml = paragraphs
    .map((paragraph) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(paragraph)}</w:t></w:r></w:p>`)
    .join('');

  const tableXml = tableRows.length
    ? `<w:tbl>${tableRows
        .map(
          (row) =>
            `<w:tr>${row
              .map(
                (cell) =>
                  `<w:tc><w:p><w:r><w:t xml:space="preserve">${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`
              )
              .join('')}</w:tr>`
        )
        .join('')}</w:tbl>`
    : '';

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14">
  <w:body>
    ${paragraphXml}
    ${tableXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`
  );

  return await zip.generateAsync({ type: 'nodebuffer' });
}

export function createMalformedDocxBuffer(): Buffer {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('broken-docx-archive'),
  ])
}

export function createMalformedPdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');
}
