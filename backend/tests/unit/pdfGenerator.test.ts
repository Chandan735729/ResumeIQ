/**
 * Unit Tests: PDF Resume Generator & PDF Quality Validation
 */

import pdfParse from 'pdf-parse';
import { PdfGeneratorService } from '@services/documents/pdfGenerator.service';
import { validateGeneratedDocument } from '@services/documents/documentValidator';
import type { ResumeMatchInput } from '@services/matchingEngine.service';

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

    // Verify text can be extracted back with pdf-parse
    const parsed = await pdfParse(result.buffer);
    expect(parsed.text).toContain('Alex Rivera');
    expect(parsed.text).toContain('alex.rivera@example.com');
    expect(parsed.text).toContain('Senior Software Engineer');
    expect(parsed.text).toContain('Cloud Corp');
    expect(parsed.text).toContain('TypeScript');
    expect(parsed.text).toContain('Bachelor of Science');
    expect(parsed.text).toContain('AWS Certified Solutions Architect');
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
    const parsed = await pdfParse(result.buffer);
    expect(parsed.text).toContain('Staff Engineer Level 1');
    expect(parsed.text).toContain('Staff Engineer Level 8');
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
