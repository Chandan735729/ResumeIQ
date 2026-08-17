/**
 * DOCX Resume Generator
 *
 * Uses the `docx` library to generate Microsoft Word (.docx) documents
 * from structured resume data.
 *
 * See pdfGenerator.service.ts for the shared template-fidelity note: this
 * renderer normalizes to a single-column layout and does not attempt to
 * clone the source document's fonts/colors/page size, but does preserve
 * section ordering and full section content.
 */

import {
  Document,
  Packer,
  Paragraph,
  ParagraphChild,
  TextRun,
  ExternalHyperlink,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import type { ResumeMatchInput } from '../matchingEngine.service';
import type {
  IDocumentGenerator,
  DocumentGenerationOptions,
  GeneratedDocumentResult,
} from './document.interface';
import { resolveSectionOrder } from './sectionOrder';
import { sanitizeResumeForRender, sanitizeText } from './textSanitizer';
import { dedupeLinkableTokens, linkableToken, type LinkableToken } from './hyperlinks';

export class DocxGeneratorService implements IDocumentGenerator {
  public readonly format = 'docx';

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
    const candidateName = options?.candidateName || resume.contact?.fullName || 'Candidate Profile';
    const children: Paragraph[] = [];

    children.push(...this.renderHeader(candidateName, resume, options));

    const sectionOrder = resolveSectionOrder(resume);
    for (const section of sectionOrder) {
      switch (section) {
        case 'summary':
          children.push(...this.renderSummary(resume, options));
          break;
        case 'skills':
          children.push(...this.renderSkills(resume));
          break;
        case 'experience':
          children.push(...this.renderExperience(resume));
          break;
        case 'projects':
          children.push(...this.renderProjects(resume));
          break;
        case 'education':
          children.push(...this.renderEducation(resume));
          break;
        case 'certifications':
          children.push(...this.renderCertifications(resume));
          break;
        case 'languages':
          children.push(...this.renderLanguages(resume));
          break;
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
    const fileName = `${candidateName.replace(/[^a-zA-Z0-9]/g, '_')}_Optimized.docx`;

    return {
      buffer: docxBuffer,
      format: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName,
      fileSizeBytes: docxBuffer.length,
      generatedAt: new Date(),
    };
  }

  private renderHeader(
    candidateName: string,
    resume: ResumeMatchInput,
    options?: DocumentGenerationOptions
  ): Paragraph[] {
    const paragraphs: Paragraph[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.HEADING_1,
        keepNext: true,
        children: [
          new TextRun({
            text: candidateName,
            bold: true,
            size: 32, // 16pt
            color: '1A365D',
          }),
        ],
      }),
    ];

    const contact = resume.contact;
    const email = options?.contactEmail || contact?.email;
    const phone = options?.contactPhone || contact?.phone;
    const line1 = dedupeLinkableTokens(
      [linkableToken(email, 'email'), linkableToken(phone), linkableToken(contact?.location)].filter(
        (t): t is LinkableToken => t !== null
      )
    );
    if (line1.length > 0) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: this.renderLinkableRuns(line1, 18, '4A5568'),
        })
      );
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
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: this.renderLinkableRuns(line2, 17, '4A5568'),
        })
      );
    }

    return paragraphs;
  }

  /**
   * Builds paragraph children for a pipe-separated contact line, using a real
   * `ExternalHyperlink` (not plain text) for any token that has a URL --
   * unlike PDFKit, `docx` paragraph children support this per-run, so no
   * width-computation overlay trick is needed here.
   */
  private renderLinkableRuns(tokens: LinkableToken[], size: number, color: string): ParagraphChild[] {
    const runs: ParagraphChild[] = [];
    tokens.forEach((token, i) => {
      if (i > 0) {
        runs.push(new TextRun({ text: '  |  ', size, color }));
      }
      if (token.url) {
        runs.push(
          new ExternalHyperlink({
            link: token.url,
            children: [new TextRun({ text: token.text, size, color: '2B6CB0', underline: {} })],
          })
        );
      } else {
        runs.push(new TextRun({ text: token.text, size, color }));
      }
    });
    return runs;
  }

  private renderSummary(resume: ResumeMatchInput, options?: DocumentGenerationOptions): Paragraph[] {
    const summaryText = options?.summary || resume.summary;
    if (!summaryText || summaryText.trim().length === 0) return [];
    return [
      this.createSectionHeading('PROFESSIONAL SUMMARY'),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: summaryText.trim(),
            size: 20, // 10pt
            color: '2D3748',
          }),
        ],
      }),
    ];
  }

  private renderSkills(resume: ResumeMatchInput): Paragraph[] {
    if (!resume.skills || resume.skills.length === 0) return [];
    return [
      this.createSectionHeading('TECHNICAL SKILLS'),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: resume.skills.join('  •  '),
            size: 20,
            color: '2D3748',
          }),
        ],
      }),
    ];
  }

  private renderExperience(resume: ResumeMatchInput): Paragraph[] {
    if (!resume.experience || resume.experience.length === 0) return [];
    const paragraphs: Paragraph[] = [this.createSectionHeading('PROFESSIONAL EXPERIENCE')];

    for (const exp of resume.experience) {
      const title = exp.title || 'Role';
      const company = exp.company ? ` at ${exp.company}` : '';
      const dateRange = exp.startDate
        ? `${exp.startDate} - ${exp.endDate || (exp.isCurrent ? 'Present' : '')}`
        : '';

      paragraphs.push(
        new Paragraph({
          keepNext: true,
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
          paragraphs.push(
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
        paragraphs.push(
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

    return paragraphs;
  }

  private renderProjects(resume: ResumeMatchInput): Paragraph[] {
    if (!resume.projects || resume.projects.length === 0) return [];
    const paragraphs: Paragraph[] = [this.createSectionHeading('PROJECTS')];

    for (const project of resume.projects) {
      paragraphs.push(
        new Paragraph({
          keepNext: true,
          spacing: { before: 100, after: 40 },
          children: [
            new TextRun({
              text: project.name || 'Project',
              bold: true,
              size: 20,
              color: '2B6CB0',
            }),
          ],
        })
      );

      if (project.technologies && project.technologies.length > 0) {
        paragraphs.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: project.technologies.join('  •  '),
                italics: true,
                size: 17,
                color: '718096',
              }),
            ],
          })
        );
      }

      if (project.description && project.description.trim().length > 0) {
        paragraphs.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: project.description.trim(),
                size: 19,
                color: '2D3748',
              }),
            ],
          })
        );
      }
    }

    return paragraphs;
  }

  private renderEducation(resume: ResumeMatchInput): Paragraph[] {
    if (!resume.education || resume.education.length === 0) return [];
    const paragraphs: Paragraph[] = [this.createSectionHeading('EDUCATION')];
    for (const edu of resume.education) {
      const degree = edu.degree || 'Degree';
      const inst = edu.institution ? ` — ${edu.institution}` : '';
      const field = edu.fieldOfStudy ? ` (${edu.fieldOfStudy})` : '';
      const dateRange = edu.startDate ? `${edu.startDate} - ${edu.endDate || ''}` : edu.endDate || '';
      paragraphs.push(
        new Paragraph({
          keepNext: true,
          spacing: { after: dateRange ? 0 : 100 },
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
      if (dateRange) {
        paragraphs.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: dateRange,
                italics: true,
                size: 17,
                color: '718096',
              }),
            ],
          })
        );
      }
    }
    return paragraphs;
  }

  private renderCertifications(resume: ResumeMatchInput): Paragraph[] {
    if (!resume.certifications || resume.certifications.length === 0) return [];
    const paragraphs: Paragraph[] = [this.createSectionHeading('CERTIFICATIONS')];
    for (const cert of resume.certifications) {
      const name = cert.name || 'Certification';
      const auth = cert.authority ? ` — ${cert.authority}` : '';
      const date = cert.date ? ` (${cert.date})` : '';
      paragraphs.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: `${name}${auth}${date}`,
              size: 19,
              color: '2D3748',
            }),
          ],
        })
      );
    }
    return paragraphs;
  }

  private renderLanguages(resume: ResumeMatchInput): Paragraph[] {
    if (!resume.languages || resume.languages.length === 0) return [];
    const languageList = resume.languages
      .map(lang => (lang.proficiency ? `${lang.name} (${lang.proficiency})` : lang.name))
      .join('  •  ');
    return [
      this.createSectionHeading('LANGUAGES'),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: languageList,
            size: 20,
            color: '2D3748',
          }),
        ],
      }),
    ];
  }

  private createSectionHeading(title: string): Paragraph {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      keepNext: true,
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
