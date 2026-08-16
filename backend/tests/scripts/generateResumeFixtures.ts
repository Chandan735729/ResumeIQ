import fs from 'fs/promises';
import path from 'path';
import PDFDocument from 'pdfkit';
import JSZip from 'jszip';

const fixturesDir = path.resolve(__dirname, '../fixtures/resumes');

async function ensureFixturesDirectory() {
  await fs.mkdir(fixturesDir, { recursive: true });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function createPdfBuffer(content: string[], pages: number, columns: boolean): Promise<Buffer> {
  const doc = new PDFDocument({ size: [612, 792], margin: 50 });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk) => chunks.push(chunk as Buffer));
  const finished = new Promise<void>((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });

  for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
    if (pageIndex > 0) {
      doc.addPage({ size: [612, 792], margin: 50 });
    }

    const fontSize = 10;
    const margin = 50;
    const width = 612;
    const columnWidth = columns ? (width - margin * 2) / 2 - 10 : width - margin * 2;
    const leftPositions = columns ? [margin, margin + columnWidth + 20] : [margin];
    let y = margin;
    let columnIndex = 0;

    for (const line of content) {
      if (line.trim().length === 0) {
        y += fontSize + 8;
        continue;
      }

      const x = leftPositions[columnIndex];
      doc.font('Helvetica').fontSize(fontSize).text(line, x, y, { width: columnWidth });
      y += fontSize + 8;
      if (y > 792 - margin - 20) {
        columnIndex += 1;
        if (columnIndex >= leftPositions.length) {
          break;
        }
        y = margin;
      }
    }
  }

  doc.end();
  await finished;
  return Buffer.concat(chunks);
}

function buildDocxBuffer(lines: string[]): Promise<Buffer> {
  const zip = new JSZip();

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${lines
      .map((line) => `<w:p><w:r><w:t>${escapeXml(line)}</w:t></w:r></w:p>`)
      .join('\n    ')}
  </w:body>
</w:document>`;

  const typesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

  zip.file('[Content_Types].xml', typesXml);
  zip.folder('_rels')?.file('.rels', relsXml);
  zip.folder('word')?.file('document.xml', documentXml);
  zip.folder('word')?.folder('_rels')?.file('document.xml.rels', documentRelsXml);

  return zip.generateAsync({ type: 'nodebuffer' });
}

async function writePdfFixture(fileName: string, pages: number, columns = false, content: string[]) {
  const bytes = await createPdfBuffer(content, pages, columns);
  await fs.writeFile(path.join(fixturesDir, fileName), bytes);
}

async function writeDocxFixture(fileName: string, content: string[]) {
  const buffer = await buildDocxBuffer(content);
  await fs.writeFile(path.join(fixturesDir, fileName), buffer);
}

async function main() {
  await ensureFixturesDirectory();

  await writePdfFixture('fresher-resume.pdf', 1, false, [
    'Emma Johnson',
    'emma.johnson@example.com | +1 555-0123 | Seattle, WA | linkedin.com/in/emmajohnson',
    '',
    'Summary',
    'Recent computer science graduate with internship experience building web applications and data-driven tools.',
    '',
    'Education',
    'Bachelor of Science in Computer Science | University of Washington | 2024',
    '',
    'Projects',
    '• Campus Job Finder: React app to locate internships',
    '• Chatbot Assistant: Node.js and Express chatbot',
    '',
    'Skills',
    '• JavaScript, TypeScript, HTML, CSS, React, Node.js',
    '• Git, REST APIs, SQL',
  ]);

  await writePdfFixture('experienced-resume.pdf', 1, false, [
    'Michael Carter',
    'michael.carter@example.com | +1 555-0456 | Austin, TX | github.com/mcarter',
    '',
    'Professional Summary',
    'Seasoned software engineer with 8 years of experience in backend systems and cloud infrastructure.',
    '',
    'Experience',
    'Senior Backend Engineer | CloudOps Inc. | Jan 2021 - Present',
    '• Architected microservices for payment processing',
    '• Reduced API latency by 35%',
    '',
    'Backend Engineer | DataWorks LLC | May 2017 - Dec 2020',
    '• Built scalable ETL pipelines in Node.js',
    '• Implemented monitoring and alerts',
    '',
    'Education',
    'Bachelor of Engineering in Software Engineering | University of Texas | 2016',
    '',
    'Skills',
    '• Node.js, Express, PostgreSQL, Redis, Docker, AWS',
  ]);

  await writeDocxFixture('technical-resume.docx', [
    'Avery Patel',
    'avery.patel@example.com | +1 555-0789 | San Francisco, CA | linkedin.com/in/averypatel',
    '',
    'Technical Skills',
    '• JavaScript, TypeScript, Python',
    '• React, Node.js, AWS, Docker, Kubernetes',
    '• SQL, NoSQL, GraphQL',
    '',
    'Experience',
    'Full Stack Engineer | DevTech Labs | Feb 2022 - Present',
    '• Developed platform features using React and Node.js',
    '• Integrated AWS services for deployment',
    '',
    'Education',
    'B.Sc. in Computer Science | Stanford University | 2021',
  ]);

  await writePdfFixture('multi-page-resume.pdf', 2, false, [
    'Sophia Lee',
    'sophia.lee@example.com | +1 555-0912 | Boston, MA | github.com/sophialee',
    '',
    'Summary',
    'Consultant with expertise in product strategy and cross-functional collaboration.',
    '',
    'Experience',
    'Product Consultant | BrightPath Advisors | Mar 2020 - Present',
    '• Guided product launches for SaaS clients',
    '• Managed cross-functional teams across design and engineering',
    '',
    'Education',
    'MBA | MIT Sloan | 2019',
    '',
    'Skills',
    '• Product Strategy, Agile, Roadmapping, Data Analysis',
    '',
    'Additional Experience',
    '• Volunteer Mentor at TechBridge',
    '• Speaker at industry events',
  ]);

  await writePdfFixture('multi-column-resume.pdf', 1, true, [
    'Jordan Kim',
    'jordan.kim@example.com | +1 555-0345 | Chicago, IL',
    '',
    'SUMMARY',
    'Software engineer with a strong record of building distributed systems.',
    '',
    'SKILLS',
    '• Java, Spring Boot, Microservices',
    '• Docker, Kubernetes, CI/CD',
    '• SQL, NoSQL',
    '',
    'EXPERIENCE',
    'Senior Software Engineer | FinTech Co. | 2019 - Present',
    '• Designed a transaction ingestion system',
    '• Improved system reliability by 40%',
    '',
    'EDUCATION',
    'B.S. in Computer Science | Northwestern University | 2018',
  ]);

  await writeDocxFixture('academic-resume.docx', [
    'Dr. Priya Shah',
    'priya.shah@example.com | +1 555-0678 | New York, NY | linkedin.com/in/priyashah',
    '',
    'Academic Profile',
    'PhD candidate in computer science researching natural language processing and human-computer interaction.',
    '',
    'Education',
    'PhD in Computer Science | Columbia University | 2023',
    'M.S. in Computer Science | Columbia University | 2019',
    'B.S. in Computer Science | Indian Institute of Technology | 2017',
    '',
    'Publications',
    '• Shah, P. et al. (2024) Advances in conversational AI',
    '• Shah, P. et al. (2023) NLP systems for education',
    '',
    'Skills',
    '• Python, TensorFlow, NLP, Research Design',
  ]);

  console.log('Resume fixtures created in', fixturesDir);
}

main().catch((error) => {
  console.error('Failed to generate resume fixtures:', error);
  process.exit(1);
});
