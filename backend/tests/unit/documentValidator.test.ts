/**
 * Unit Tests: Document Quality & Artifact Validator
 */

import { validateGeneratedDocument } from '@services/documents/documentValidator';
import type { GeneratedDocumentResult } from '@services/documents/document.interface';

describe('Document Artifact Quality Validator', () => {
  it('rejects null or empty buffers', async () => {
    const corruptDoc: GeneratedDocumentResult = {
      buffer: Buffer.alloc(0),
      format: 'pdf',
      mimeType: 'application/pdf',
      fileName: 'test.pdf',
      fileSizeBytes: 0,
      generatedAt: new Date(),
    };

    const validation = await validateGeneratedDocument(corruptDoc);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some(e => e.includes('suspiciously small'))).toBe(true);
  });

  it('rejects fake PDF missing %PDF header', async () => {
    const fakePdf: GeneratedDocumentResult = {
      buffer: Buffer.from('This is a plain text file pretending to be a PDF. It has more than 100 bytes of content.'.repeat(2)),
      format: 'pdf',
      mimeType: 'application/pdf',
      fileName: 'fake.pdf',
      fileSizeBytes: 150,
      generatedAt: new Date(),
    };

    const validation = await validateGeneratedDocument(fakePdf);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some(e => e.includes('Invalid PDF header'))).toBe(true);
  });

  it('rejects fake DOCX missing ZIP signature', async () => {
    const fakeDocx: GeneratedDocumentResult = {
      buffer: Buffer.from('Plain text file pretending to be docx.'.repeat(5)),
      format: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName: 'fake.docx',
      fileSizeBytes: 200,
      generatedAt: new Date(),
    };

    const validation = await validateGeneratedDocument(fakeDocx);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some(e => e.includes('Invalid DOCX signature'))).toBe(true);
  });
});
