/**
 * PDF Resume Generator
 *
 * Uses PDFKit to generate clean, professional, ATS-friendly PDF documents
 * from structured resume data.
 *
 * Template-fidelity note: this renderer intentionally normalizes every source
 * resume to a single-column layout with a fixed, safe font family (PDFKit's
 * standard 14 fonts). It does NOT attempt to re-embed the original document's
 * fonts/colors/page size, and it does NOT attempt to reconstruct multi-column
 * layouts — multi-column resumes are a well-known ATS-parsing hazard, so this
 * normalization is a deliberate safety choice, not a missed feature. What IS
 * preserved from the source document is section ordering (via
 * `resume.sectionOrder`, captured at parse time) and full section content.
 */

import PDFDocument from 'pdfkit';
import type { ResumeMatchInput } from '../matchingEngine.service';
import type {
  IDocumentGenerator,
  DocumentGenerationOptions,
  GeneratedDocumentResult,
} from './document.interface';
import { resolveSectionOrder } from './sectionOrder';
import { sanitizeResumeForRender, sanitizeText, joinTokensUnbreakable } from './textSanitizer';
import { dedupeLinkableTokens, linkableToken, type LinkableToken } from './hyperlinks';

const PAGE_MARGIN = { top: 40, bottom: 40, left: 45, right: 45 };
const PAGE_BOTTOM_Y = 792 - PAGE_MARGIN.bottom; // LETTER height 792pt

export class PdfGeneratorService implements IDocumentGenerator {
  public readonly format = 'pdf';

  async generate(
    rawResume: ResumeMatchInput,
    rawOptions?: DocumentGenerationOptions
  ): Promise<GeneratedDocumentResult> {
    const resume = sanitizeResumeForRender(rawResume);
    const options: DocumentGenerationOptions | undefined = rawOptions && {
      ...rawOptions,
      candidateName: rawOptions.candidateName ? sanitizeText(rawOptions.candidateName) : rawOptions.candidateName,
      contactEmail: rawOptions.contactEmail ? sanitizeText(rawOptions.contactEmail) : rawOptions.contactEmail,
      contactPhone: rawOptions.contactPhone ? sanitizeText(rawOptions.contactPhone) : rawOptions.contactPhone,
      summary: rawOptions.summary ? sanitizeText(rawOptions.summary) : rawOptions.summary,
    };
    return new Promise((resolve, reject) => {
      try {
        const candidateName = options?.candidateName || resume.contact?.fullName || 'Candidate Profile';

        const doc = new PDFDocument({
          size: 'LETTER',
          margins: PAGE_MARGIN,
          bufferPages: true,
          info: {
            Title: `${candidateName} - Resume`,
            Author: candidateName,
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
            fileName: `${candidateName.replace(/[^a-zA-Z0-9]/g, '_')}_Optimized.pdf`,
            fileSizeBytes: pdfBuffer.length,
            pageCount: finalPageCount,
            generatedAt: new Date(),
          });
        });
        doc.on('error', err => reject(err));

        this.renderHeader(doc, candidateName, resume, options);

        const sectionOrder = resolveSectionOrder(resume);
        for (const section of sectionOrder) {
          switch (section) {
            case 'summary':
              this.renderSummary(doc, resume, options);
              break;
            case 'skills':
              this.renderSkills(doc, resume);
              break;
            case 'experience':
              this.renderExperience(doc, resume);
              break;
            case 'projects':
              this.renderProjects(doc, resume);
              break;
            case 'education':
              this.renderEducation(doc, resume);
              break;
            case 'certifications':
              this.renderCertifications(doc, resume);
              break;
            case 'languages':
              this.renderLanguages(doc, resume);
              break;
          }
        }

        // Must read the buffered page range before end() flushes it (bufferPages
        // only keeps page objects available *before* the stream finalizes).
        finalPageCount = doc.bufferedPageRange().count || 1;
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /** Force a page break if the remaining space on the current page is below minHeight. */
  private ensureSpace(doc: typeof PDFDocument.prototype, minHeight: number): void {
    if (doc.y + minHeight > PAGE_BOTTOM_Y) {
      doc.addPage();
    }
  }

  private renderHeader(
    doc: typeof PDFDocument.prototype,
    candidateName: string,
    resume: ResumeMatchInput,
    options?: DocumentGenerationOptions
  ): void {
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#1a365d').text(candidateName, { align: 'center' });

    const contact = resume.contact;
    const email = options?.contactEmail || contact?.email;
    const phone = options?.contactPhone || contact?.phone;
    const line1 = dedupeLinkableTokens(
      [linkableToken(email, 'email'), linkableToken(phone), linkableToken(contact?.location)].filter(
        (t): t is LinkableToken => t !== null
      )
    );
    if (line1.length > 0) {
      doc.moveDown(0.3);
      this.renderLinkableLine(doc, line1, 9, '#4a5568');
    }

    const line2 = dedupeLinkableTokens(
      [
        linkableToken(contact?.linkedin, 'web'),
        linkableToken(contact?.github, 'web'),
        linkableToken(contact?.website, 'web'),
        ...(contact?.otherLinks || []).map(l => linkableToken(l, 'web')),
      ].filter((t): t is LinkableToken => t !== null),
      line1.map(t => t.text)
    );
    if (line2.length > 0) {
      doc.moveDown(0.15);
      this.renderLinkableLine(doc, line2, 8.5, '#4a5568');
    }

    doc.moveDown(0.8);
  }

  /**
   * Renders a centered, pipe-separated contact line exactly as before (same
   * joined-string + joinTokensUnbreakable call, so no visual change), then
   * overlays real clickable link annotations (`doc.link`) computed from each
   * token's rendered width -- PDFKit's `link` text option only applies to an
   * entire `.text()` call, not to sub-spans of a joined string, so per-token
   * links need this two-pass approach: render the visible line, then attach
   * invisible clickable rectangles on top of the substrings that have a URL.
   */
  private renderLinkableLine(
    doc: typeof PDFDocument.prototype,
    tokens: LinkableToken[],
    fontSize: number,
    color: string
  ): void {
    const separator = '  |  ';
    doc.fontSize(fontSize).font('Helvetica').fillColor(color);

    const joinedText = joinTokensUnbreakable(
      tokens.map(t => t.text),
      separator
    );
    const totalWidth = doc.widthOfString(joinedText);
    const lineTop = doc.y;
    doc.text(joinedText, { align: 'center' });

    // Only overlay links when the line rendered as a single (unwrapped) line --
    // if it wrapped, our linear width-based x-offsets would no longer line up
    // with the wrapped glyph positions, so skip rather than risk misplaced
    // clickable regions.
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    if (totalWidth > usableWidth) return;

    let cursorX = doc.page.margins.left + (usableWidth - totalWidth) / 2;
    const separatorWidth = doc.widthOfString(separator);
    tokens.forEach(token => {
      const displayText = token.text.replace(/ /g, String.fromCharCode(0xa0));
      const tokenWidth = doc.widthOfString(displayText);
      if (token.url) {
        doc.link(cursorX, lineTop, tokenWidth, doc.currentLineHeight(), token.url);
      }
      cursorX += tokenWidth + separatorWidth;
    });
  }

  private renderSummary(
    doc: typeof PDFDocument.prototype,
    resume: ResumeMatchInput,
    options?: DocumentGenerationOptions
  ): void {
    const summaryText = options?.summary || resume.summary;
    if (!summaryText || summaryText.trim().length === 0) return;
    this.ensureSpace(doc, 60);
    this.renderSectionHeader(doc, 'PROFESSIONAL SUMMARY');
    doc.fontSize(9.5).font('Helvetica').fillColor('#2d3748').text(summaryText.trim(), {
      lineGap: 2.5,
      align: 'justify',
    });
    doc.moveDown(0.8);
  }

  private renderSkills(doc: typeof PDFDocument.prototype, resume: ResumeMatchInput): void {
    if (!resume.skills || resume.skills.length === 0) return;
    this.ensureSpace(doc, 60);
    this.renderSectionHeader(doc, 'TECHNICAL SKILLS');
    const skillList = joinTokensUnbreakable(resume.skills, '  •  ');
    doc.fontSize(9.5).font('Helvetica').fillColor('#2d3748').text(skillList, { lineGap: 2.5 });
    doc.moveDown(0.8);
  }

  private renderExperience(doc: typeof PDFDocument.prototype, resume: ResumeMatchInput): void {
    if (!resume.experience || resume.experience.length === 0) return;
    this.ensureSpace(doc, 60);
    this.renderSectionHeader(doc, 'PROFESSIONAL EXPERIENCE');

    for (const exp of resume.experience) {
      const title = exp.title || 'Role';
      const company = exp.company ? ` at ${exp.company}` : '';
      const dateRange = exp.startDate
        ? `${exp.startDate} - ${exp.endDate || (exp.isCurrent ? 'Present' : '')}`
        : '';

      // Keep the entry heading + first line of content together.
      this.ensureSpace(doc, 55);

      doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#2b6cb0').text(`${title}${company}`);
      if (dateRange) {
        doc.fontSize(9).font('Helvetica-Oblique').fillColor('#718096').text(dateRange);
      }

      doc.moveDown(0.2);

      if (exp.bullets && exp.bullets.length > 0) {
        for (const bullet of exp.bullets) {
          if (!bullet || bullet.trim().length === 0) continue;
          this.ensureSpace(doc, 15);
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

  private renderProjects(doc: typeof PDFDocument.prototype, resume: ResumeMatchInput): void {
    if (!resume.projects || resume.projects.length === 0) return;
    this.ensureSpace(doc, 60);
    this.renderSectionHeader(doc, 'PROJECTS');

    for (const project of resume.projects) {
      this.ensureSpace(doc, 40);
      const name = project.name || 'Project';
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2b6cb0').text(name);

      if (project.technologies && project.technologies.length > 0) {
        doc.fontSize(8.5).font('Helvetica-Oblique').fillColor('#718096').text(joinTokensUnbreakable(project.technologies, '  •  '));
      }

      if (project.description && project.description.trim().length > 0) {
        doc.moveDown(0.1);
        doc.fontSize(9).font('Helvetica').fillColor('#2d3748').text(project.description.trim(), {
          indent: 10,
          lineGap: 2,
        });
      }

      doc.moveDown(0.5);
    }
  }

  private renderEducation(doc: typeof PDFDocument.prototype, resume: ResumeMatchInput): void {
    if (!resume.education || resume.education.length === 0) return;
    this.ensureSpace(doc, 50);
    this.renderSectionHeader(doc, 'EDUCATION');
    for (const edu of resume.education) {
      this.ensureSpace(doc, 20);
      const degree = edu.degree || 'Degree';
      const inst = edu.institution ? ` — ${edu.institution}` : '';
      const field = edu.fieldOfStudy ? ` (${edu.fieldOfStudy})` : '';
      const dateRange = edu.startDate ? `${edu.startDate} - ${edu.endDate || ''}` : edu.endDate || '';
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#2d3748').text(`${degree}${field}${inst}`);
      if (dateRange) {
        doc.fontSize(8.5).font('Helvetica-Oblique').fillColor('#718096').text(dateRange);
      }
    }
    doc.moveDown(0.8);
  }

  private renderCertifications(doc: typeof PDFDocument.prototype, resume: ResumeMatchInput): void {
    if (!resume.certifications || resume.certifications.length === 0) return;
    this.ensureSpace(doc, 50);
    this.renderSectionHeader(doc, 'CERTIFICATIONS');
    for (const cert of resume.certifications) {
      this.ensureSpace(doc, 15);
      const name = cert.name || 'Certification';
      const auth = cert.authority ? ` — ${cert.authority}` : '';
      const date = cert.date ? ` (${cert.date})` : '';
      doc.fontSize(9.5).font('Helvetica').fillColor('#2d3748').text(`•  ${name}${auth}${date}`, { indent: 10 });
    }
    doc.moveDown(0.8);
  }

  private renderLanguages(doc: typeof PDFDocument.prototype, resume: ResumeMatchInput): void {
    if (!resume.languages || resume.languages.length === 0) return;
    this.ensureSpace(doc, 50);
    this.renderSectionHeader(doc, 'LANGUAGES');
    const languageList = joinTokensUnbreakable(
      resume.languages.map(lang => (lang.proficiency ? `${lang.name} (${lang.proficiency})` : lang.name)),
      '  •  '
    );
    doc.fontSize(9.5).font('Helvetica').fillColor('#2d3748').text(languageList, { lineGap: 2.5 });
    doc.moveDown(0.8);
  }

  private renderSectionHeader(doc: typeof PDFDocument.prototype, title: string): void {
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a365d').text(title);
    const y = doc.y + 2;
    doc.strokeColor('#cbd5e0').lineWidth(0.8).moveTo(45, y).lineTo(565, y).stroke();
    doc.moveDown(0.4);
  }
}
