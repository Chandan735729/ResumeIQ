/**
 * Unit Tests: Real Hyperlink Metadata in Generated PDF/DOCX (Phase 4)
 *
 * Contact links must not be reduced to plain visible text -- the generated
 * document must carry real, clickable hyperlink metadata: a PDF /Link
 * annotation for PDF, a real OOXML hyperlink relationship for DOCX.
 */

import { PDFDocument as PdfLibDocument, PDFDict, PDFName, PDFString } from 'pdf-lib';
import mammoth from 'mammoth';
import { PdfGeneratorService } from '@services/documents/pdfGenerator.service';
import { DocxGeneratorService } from '@services/documents/docxGenerator.service';
import type { ResumeMatchInput } from '@services/matchingEngine.service';

const resume: ResumeMatchInput = {
  skills: ['TypeScript', 'Node.js'],
  experience: [{ title: 'Engineer', company: 'Acme', bullets: ['Built things.'] }],
  education: [],
  certifications: [],
  projectTechnologies: [],
  rawText: 'Engineer at Acme. Built things.',
  contact: {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+1-555-0100', // not linkable -- must NOT produce a link annotation
    location: 'Boston, MA', // not linkable -- must NOT produce a link annotation
    linkedin: 'linkedin.com/in/janedoe',
    github: 'github.com/janedoe',
    otherLinks: [],
  },
};

describe('Real hyperlink metadata', () => {
  it('PDF: attaches a clickable /Link annotation for each linkable contact field, and only those', async () => {
    const gen = new PdfGeneratorService();
    const result = await gen.generate(resume, { format: 'pdf', candidateName: 'Jane Doe' });

    const pdfDoc = await PdfLibDocument.load(result.buffer);
    const page = pdfDoc.getPage(0);
    const annots = page.node.Annots();
    expect(annots).toBeDefined();

    const targets: string[] = [];
    for (let i = 0; i < annots!.size(); i++) {
      const annotDict = pdfDoc.context.lookup(annots!.get(i), PDFDict);
      expect(annotDict.get(PDFName.of('Subtype'))?.toString()).toBe('/Link');
      const actionDict = annotDict.lookupMaybe(PDFName.of('A'), PDFDict);
      const uri = actionDict?.lookupMaybe(PDFName.of('URI'), PDFString);
      if (uri) targets.push(uri.asString());
    }

    // Exactly 3 linkable fields: email, linkedin, github. Phone and location
    // must not produce annotations (they have no URL).
    expect(annots!.size()).toBe(3);
    expect(targets).toContain('mailto:jane@example.com');
    expect(targets).toContain('https://linkedin.com/in/janedoe');
    expect(targets).toContain('https://github.com/janedoe');
  });

  it('DOCX: contains real OOXML hyperlink relationships, not just visible text', async () => {
    const gen = new DocxGeneratorService();
    const result = await gen.generate(resume, { format: 'docx', candidateName: 'Jane Doe' });

    // mammoth's HTML conversion (unlike extractRawText) surfaces real <a href>
    // tags only for genuine OOXML hyperlink relationships -- a plain TextRun
    // with the same visible string would render as unlinked <p> text.
    const html = await mammoth.convertToHtml({ buffer: result.buffer });
    expect(html.value).toContain('<a href="mailto:jane@example.com">');
    expect(html.value).toContain('<a href="https://linkedin.com/in/janedoe">');
    expect(html.value).toContain('<a href="https://github.com/janedoe">');
    // Phone/location have no URL and must remain plain text, not a link.
    expect(html.value).not.toContain('href="+1-555-0100"');
  });
});
