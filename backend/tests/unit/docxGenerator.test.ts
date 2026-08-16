/**
 * Unit Tests: DOCX Resume Generator & Word Document Quality Validation
 */

import mammoth from 'mammoth';
import { DocxGeneratorService } from '@services/documents/docxGenerator.service';
import { validateGeneratedDocument } from '@services/documents/documentValidator';
import type { ResumeMatchInput } from '@services/matchingEngine.service';

describe('DOCX Document Generation', () => {
  const docxGenerator = new DocxGeneratorService();

  const standardResume: ResumeMatchInput = {
    skills: ['Python', 'Django', 'PostgreSQL', 'Redis', 'Docker'],
    experience: [
      {
        title: 'Lead Backend Developer',
        company: 'Apex Systems',
        startDate: '2020',
        endDate: 'Present',
        isCurrent: true,
        bullets: [
          'Engineered resilient payment APIs processing over $50M in annual transactions.',
          'Optimized SQL query performance to achieve sub-50ms p99 latency.',
        ],
      },
    ],
    education: [
      {
        institution: 'Tech Institute',
        degree: 'B.S. in Software Engineering',
      },
    ],
    certifications: [
      {
        name: 'Certified Kubernetes Administrator',
        authority: 'CNCF',
      },
    ],
    projectTechnologies: ['Python', 'PostgreSQL'],
    rawText: 'Lead Backend Developer with Python and PostgreSQL experience.',
  };

  it('generates a valid, parseable DOCX file with headings, bullets, and metadata', async () => {
    const result = await docxGenerator.generate(standardResume, {
      format: 'docx',
      candidateName: 'Taylor Morgan',
      contactEmail: 'taylor.morgan@example.com',
      contactPhone: '+1-555-0144',
      summary: 'Results-driven backend architect with a focus on database optimization and microservices.',
    });

    expect(result.format).toBe('docx');
    expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(1000);

    // Verify DOCX ZIP header signature PK\x03\x04
    expect(result.buffer[0]).toBe(0x50);
    expect(result.buffer[1]).toBe(0x4b);
    expect(result.buffer[2]).toBe(0x03);
    expect(result.buffer[3]).toBe(0x04);

    // Verify document quality validator
    const validation = await validateGeneratedDocument(result);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.extractedTextLength).toBeGreaterThan(100);

    // Verify round-trip parsing with mammoth
    const parsed = await mammoth.extractRawText({ buffer: result.buffer });
    expect(parsed.value).toContain('Taylor Morgan');
    expect(parsed.value).toContain('taylor.morgan@example.com');
    expect(parsed.value).toContain('Lead Backend Developer');
    expect(parsed.value).toContain('Apex Systems');
    expect(parsed.value).toContain('Python');
    expect(parsed.value).toContain('Certified Kubernetes Administrator');
  });

  it('handles empty sections gracefully without errors', async () => {
    const sparseResume: ResumeMatchInput = {
      skills: ['Go'],
      experience: [],
      education: [],
      certifications: [],
      projectTechnologies: [],
      rawText: 'Go Developer',
    };

    const result = await docxGenerator.generate(sparseResume, {
      format: 'docx',
      candidateName: 'Sam Developer',
    });

    const validation = await validateGeneratedDocument(result);
    expect(validation.isValid).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(500);
  });
});
