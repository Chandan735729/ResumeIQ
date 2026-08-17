/**
 * Unit Tests: PDF Resume Generator & PDF Quality Validation
 */

import { extractPdfText } from '@services/resumeParser.service';
import { PdfGeneratorService } from '@services/documents/pdfGenerator.service';
import { validateGeneratedDocument } from '@services/documents/documentValidator';
import type { ResumeMatchInput } from '@services/matchingEngine.service';

// Round-trip verification uses the same pdfjs-dist-based extractor the
// production parser uses (extractPdfText), not the raw `pdf-parse` package --
// pdf-parse bundles an old pdfjs build with an intermittent XRef-table race
// that fails on ~50% of otherwise well-formed PDFKit output (see
// documentValidator.ts for the full root-cause note), which made this test
// flaky.
async function extractText(buffer: Buffer): Promise<string> {
  return (await extractPdfText(buffer)).rawText;
}

describe('PDF Document Generation', () => {
  const pdfGenerator = new PdfGeneratorService();

  const standardResume: ResumeMatchInput = {
    skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Docker', 'AWS'],
    experience: [
      {
        title: 'Senior Software Engineer',
        company: 'Cloud Corp',
        startDate: '2021',
        endDate: 'Present',
        isCurrent: true,
        bullets: [
          'Architected high-throughput microservices handling 10,000+ RPS.',
          'Reduced API latency by 35% through PostgreSQL indexing and Redis caching.',
          'Mentored 4 junior engineers on clean architecture and TypeScript best practices.',
        ],
      },
      {
        title: 'Software Developer',
        company: 'Startup Lab',
        startDate: '2019',
        endDate: '2021',
        bullets: [
          'Developed RESTful endpoints using Node.js and Express.',
          'Integrated third-party payment gateways with 99.9% reliability.',
        ],
      },
    ],
    education: [
      {
        institution: 'University of Engineering',
        degree: 'Bachelor of Science',
        fieldOfStudy: 'Computer Science',
      },
    ],
    certifications: [
      {
        name: 'AWS Certified Solutions Architect',
        authority: 'Amazon Web Services',
      },
    ],
    projectTechnologies: ['TypeScript', 'Docker'],
    rawText: 'Senior Software Engineer with TypeScript and Node.js experience.',
  };

  it('generates a valid, parseable PDF with header, summary, experience, skills, and education', async () => {
    const result = await pdfGenerator.generate(standardResume, {
      format: 'pdf',
      candidateName: 'Alex Rivera',
      contactEmail: 'alex.rivera@example.com',
      contactPhone: '+1-555-0199',
      summary: 'Experienced full-stack engineer specializing in scalable cloud architectures.',
    });

    expect(result.format).toBe('pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(500);

    // Verify PDF header magic bytes
    const header = result.buffer.slice(0, 5).toString('utf-8');
    expect(header).toBe('%PDF-');

    // Verify PDF quality validator approves it
    const validation = await validateGeneratedDocument(result);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.extractedTextLength).toBeGreaterThan(100);

    // Verify text can be extracted back
    const text = await extractText(result.buffer);
    expect(text).toContain('Alex Rivera');
    expect(text).toContain('alex.rivera@example.com');
    expect(text).toContain('Senior Software Engineer');
    expect(text).toContain('Cloud Corp');
    expect(text).toContain('TypeScript');
    expect(text).toContain('Bachelor of Science');
    expect(text).toContain('AWS Certified Solutions Architect');
  });

  it('handles multi-page long resume without clipping or crashing', async () => {
    const longExperience = Array.from({ length: 8 }).map((_, i) => ({
      title: `Staff Engineer Level ${i + 1}`,
      company: `Enterprise Tech ${i + 1}`,
      startDate: `201${i}`,
      endDate: `201${i + 1}`,
      bullets: [
        `Led company-wide technical transformation for division ${i + 1}.`,
        `Designed and delivered mission-critical database clustering solutions.`,
        `Implemented automated testing frameworks reducing deployment defects by 40%.`,
      ],
    }));

    const longResume: ResumeMatchInput = {
      ...standardResume,
      experience: longExperience,
    };

    const result = await pdfGenerator.generate(longResume, {
      format: 'pdf',
      candidateName: 'Jordan Taylor',
      summary: 'Distinguished technical architect with over a decade of systems engineering expertise.',
    });

    expect(result.pageCount).toBeGreaterThanOrEqual(2);
    const text = await extractText(result.buffer);
    expect(text).toContain('Staff Engineer Level 1');
    expect(text).toContain('Staff Engineer Level 8');
  });

  it('renders Unicode characters correctly', async () => {
    const unicodeResume: ResumeMatchInput = {
      ...standardResume,
      skills: ['C++', 'Python 3.11', 'Résumé Parsing', 'Naïve Bayes', 'Über-scale'],
    };

    const result = await pdfGenerator.generate(unicodeResume, {
      format: 'pdf',
      candidateName: 'François Müller',
    });

    const validation = await validateGeneratedDocument(result);
    expect(validation.isValid).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(500);
  });
});
