/**
 * PDF Resume Generator
 *
 * Uses PDFKit to generate clean, professional, ATS-friendly PDF documents
 * from structured resume data.
 */

import PDFDocument from 'pdfkit';
import type { ResumeMatchInput } from '../matchingEngine.service';
import type {
  IDocumentGenerator,
  DocumentGenerationOptions,
  GeneratedDocumentResult,
} from './document.interface';

export class PdfGeneratorService implements IDocumentGenerator {
  public readonly format = 'pdf';

  async generate(
    resume: ResumeMatchInput,
    options?: DocumentGenerationOptions
  ): Promise<GeneratedDocumentResult> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'LETTER',
          margins: { top: 40, bottom: 40, left: 45, right: 45 },
          bufferPages: true,
          info: {
            Title: options?.candidateName ? `${options.candidateName} - Resume` : 'Resume',
            Author: options?.candidateName || 'ResumeIQ Candidate',
            Creator: 'ResumeIQ Document Engine',
          },
        });

        let finalPageCount = 1;

        const buffers: Buffer[] = [];
        doc.on('data', chunk => buffers.push(chunk));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);

          resolve({
            buffer: pdfBuffer,
            format: 'pdf',
            mimeType: 'application/pdf',
            fileName: `${(options?.candidateName || 'Resume').replace(/[^a-zA-Z0-9]/g, '_')}_Optimized.pdf`,
            fileSizeBytes: pdfBuffer.length,
            pageCount: finalPageCount,
            generatedAt: new Date(),
          });
        });
        doc.on('error', err => reject(err));


        // ── 1. Header (Name & Contact) ─────────────────────────────────────────
        const candidateName = options?.candidateName || 'Candidate Profile';
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#1a365d').text(candidateName, { align: 'center' });

        const contactDetails: string[] = [];
        if (options?.contactEmail) contactDetails.push(options.contactEmail);
        if (options?.contactPhone) contactDetails.push(options.contactPhone);
        if (contactDetails.length > 0) {
          doc.moveDown(0.3);
          doc.fontSize(9).font('Helvetica').fillColor('#4a5568').text(contactDetails.join('  |  '), { align: 'center' });
        }

        doc.moveDown(0.8);

        // ── 2. Professional Summary (if available) ─────────────────────────────
        const summaryText = options?.summary;
        if (summaryText && summaryText.trim().length > 0) {
          this.renderSectionHeader(doc, 'PROFESSIONAL SUMMARY');
          doc.fontSize(9.5).font('Helvetica').fillColor('#2d3748').text(summaryText.trim(), {
            lineGap: 2.5,
            align: 'justify',
          });
          doc.moveDown(0.8);
        }

        // ── 3. Skills Section ──────────────────────────────────────────────────
        if (resume.skills && resume.skills.length > 0) {
          this.renderSectionHeader(doc, 'TECHNICAL SKILLS');
          const skillList = resume.skills.join('  •  ');
          doc.fontSize(9.5).font('Helvetica').fillColor('#2d3748').text(skillList, { lineGap: 2.5 });
          doc.moveDown(0.8);
        }

        // ── 4. Work Experience ─────────────────────────────────────────────────
        if (resume.experience && resume.experience.length > 0) {
          this.renderSectionHeader(doc, 'PROFESSIONAL EXPERIENCE');

          for (const exp of resume.experience) {
            // Role and Date Row
            const title = exp.title || 'Role';
            const company = exp.company ? ` at ${exp.company}` : '';
            const dateRange = exp.startDate
              ? `${exp.startDate} - ${exp.endDate || (exp.isCurrent ? 'Present' : '')}`
              : '';

            // Render Title & Dates on same line if possible
            doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#2b6cb0').text(`${title}${company}`);
            if (dateRange) {
              doc.fontSize(9).font('Helvetica-Oblique').fillColor('#718096').text(dateRange);
            }

            doc.moveDown(0.2);

            // Render Bullets
            if (exp.bullets && exp.bullets.length > 0) {
              for (const bullet of exp.bullets) {
                if (!bullet || bullet.trim().length === 0) continue;
                doc
                  .fontSize(9)
                  .font('Helvetica')
                  .fillColor('#2d3748')
                  .text(`•  ${bullet.trim()}`, {
                    indent: 10,
                    lineGap: 2,
                  });
              }
            } else if (exp.summary) {
              doc.fontSize(9).font('Helvetica').fillColor('#2d3748').text(exp.summary, { indent: 10 });
            }

            doc.moveDown(0.6);
          }
        }

        // ── 5. Education ───────────────────────────────────────────────────────
        if (resume.education && resume.education.length > 0) {
          this.renderSectionHeader(doc, 'EDUCATION');
          for (const edu of resume.education) {
            const degree = edu.degree || 'Degree';
            const inst = edu.institution ? ` — ${edu.institution}` : '';
            const field = edu.fieldOfStudy ? ` (${edu.fieldOfStudy})` : '';
            doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#2d3748').text(`${degree}${field}${inst}`);
          }
          doc.moveDown(0.8);
        }

        // ── 6. Certifications ──────────────────────────────────────────────────
        if (resume.certifications && resume.certifications.length > 0) {
          this.renderSectionHeader(doc, 'CERTIFICATIONS');
          for (const cert of resume.certifications) {
            const name = cert.name || 'Certification';
            const auth = cert.authority ? ` — ${cert.authority}` : '';
            doc.fontSize(9.5).font('Helvetica').fillColor('#2d3748').text(`•  ${name}${auth}`, { indent: 10 });
          }
          doc.moveDown(0.8);
        }

        // Finalize PDF
        finalPageCount = doc.bufferedPageRange()?.count || 1;
        doc.end();
      } catch (err) {

        reject(err);
      }
    });
  }

  private renderSectionHeader(doc: typeof PDFDocument.prototype, title: string): void {
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a365d').text(title);
    const y = doc.y + 2;
    doc.strokeColor('#cbd5e0').lineWidth(0.8).moveTo(45, y).lineTo(565, y).stroke();
    doc.moveDown(0.4);
  }
}
