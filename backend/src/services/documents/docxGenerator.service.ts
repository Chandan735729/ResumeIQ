/**
 * DOCX Resume Generator
 *
 * Uses the `docx` library to generate Microsoft Word (.docx) documents
 * from structured resume data.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import type { ResumeMatchInput } from '../matchingEngine.service';
import type {
  IDocumentGenerator,
  DocumentGenerationOptions,
  GeneratedDocumentResult,
} from './document.interface';

export class DocxGeneratorService implements IDocumentGenerator {
  public readonly format = 'docx';

  async generate(
    resume: ResumeMatchInput,
    options?: DocumentGenerationOptions
  ): Promise<GeneratedDocumentResult> {
    const children: Paragraph[] = [];

    // ── 1. Header (Name & Contact) ─────────────────────────────────────────
    const candidateName = options?.candidateName || 'Candidate Profile';
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({
            text: candidateName,
            bold: true,
            size: 32, // 16pt
            color: '1A365D',
          }),
        ],
      })
    );

    const contactDetails: string[] = [];
    if (options?.contactEmail) contactDetails.push(options.contactEmail);
    if (options?.contactPhone) contactDetails.push(options.contactPhone);
    if (contactDetails.length > 0) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: contactDetails.join('  |  '),
              size: 18, // 9pt
              color: '4A5568',
            }),
          ],
        })
      );
    }

    // ── 2. Professional Summary ─────────────────────────────────────────────
    const summaryText = options?.summary;
    if (summaryText && summaryText.trim().length > 0) {
      children.push(this.createSectionHeading('PROFESSIONAL SUMMARY'));
      children.push(
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: summaryText.trim(),
              size: 20, // 10pt
              color: '2D3748',
            }),
          ],
        })
      );
    }

    // ── 3. Skills Section ──────────────────────────────────────────────────
    if (resume.skills && resume.skills.length > 0) {
      children.push(this.createSectionHeading('TECHNICAL SKILLS'));
      children.push(
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: resume.skills.join('  •  '),
              size: 20,
              color: '2D3748',
            }),
          ],
        })
      );
    }

    // ── 4. Work Experience ─────────────────────────────────────────────────
    if (resume.experience && resume.experience.length > 0) {
      children.push(this.createSectionHeading('PROFESSIONAL EXPERIENCE'));

      for (const exp of resume.experience) {
        const title = exp.title || 'Role';
        const company = exp.company ? ` at ${exp.company}` : '';
        const dateRange = exp.startDate
          ? `${exp.startDate} - ${exp.endDate || (exp.isCurrent ? 'Present' : '')}`
          : '';

        children.push(
          new Paragraph({
            spacing: { before: 100, after: 40 },
            children: [
              new TextRun({
                text: `${title}${company}`,
                bold: true,
                size: 21,
                color: '2B6CB0',
              }),
              new TextRun({
                text: dateRange ? `   (${dateRange})` : '',
                italics: true,
                size: 18,
                color: '718096',
              }),
            ],
          })
        );

        if (exp.bullets && exp.bullets.length > 0) {
          for (const bullet of exp.bullets) {
            if (!bullet || bullet.trim().length === 0) continue;
            children.push(
              new Paragraph({
                bullet: { level: 0 },
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: bullet.trim(),
                    size: 19,
                    color: '2D3748',
                  }),
                ],
              })
            );
          }
        } else if (exp.summary) {
          children.push(
            new Paragraph({
              spacing: { after: 100 },
              children: [
                new TextRun({
                  text: exp.summary,
                  size: 19,
                  color: '2D3748',
                }),
              ],
            })
          );
        }
      }
    }

    // ── 5. Education ───────────────────────────────────────────────────────
    if (resume.education && resume.education.length > 0) {
      children.push(this.createSectionHeading('EDUCATION'));
      for (const edu of resume.education) {
        const degree = edu.degree || 'Degree';
        const inst = edu.institution ? ` — ${edu.institution}` : '';
        const field = edu.fieldOfStudy ? ` (${edu.fieldOfStudy})` : '';
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: `${degree}${field}${inst}`,
                bold: true,
                size: 20,
                color: '2D3748',
              }),
            ],
          })
        );
      }
    }

    // ── 6. Certifications ──────────────────────────────────────────────────
    if (resume.certifications && resume.certifications.length > 0) {
      children.push(this.createSectionHeading('CERTIFICATIONS'));
      for (const cert of resume.certifications) {
        const name = cert.name || 'Certification';
        const auth = cert.authority ? ` — ${cert.authority}` : '';
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: `${name}${auth}`,
                size: 19,
                color: '2D3748',
              }),
            ],
          })
        );
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: { top: 720, bottom: 720, left: 720, right: 720 }, // 0.5 inch margins
            },
          },
          children,
        },
      ],
    });

    const docxBuffer = await Packer.toBuffer(doc);
    const fileName = `${(options?.candidateName || 'Resume').replace(/[^a-zA-Z0-9]/g, '_')}_Optimized.docx`;

    return {
      buffer: docxBuffer,
      format: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName,
      fileSizeBytes: docxBuffer.length,
      generatedAt: new Date(),
    };
  }

  private createSectionHeading(title: string): Paragraph {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 100 },
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 22,
          color: '1A365D',
        }),
      ],
    });
  }
}
