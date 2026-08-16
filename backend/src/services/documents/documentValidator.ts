/**
 * Document Quality & Artifact Validator
 *
 * Verifies that generated PDF and DOCX files are non-empty, well-formed,
 * have valid magic bytes, and can be successfully parsed back by standard parsers.
 */

import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import type { GeneratedDocumentResult, DocumentFormat } from './document.interface';

export interface DocumentValidationResult {
  isValid: boolean;
  format: DocumentFormat;
  fileSizeBytes: number;
  extractedTextLength: number;
  errors: string[];
}

export async function validateGeneratedDocument(
  docResult: GeneratedDocumentResult
): Promise<DocumentValidationResult> {
  const errors: string[] = [];
  const buffer = docResult.buffer;

  // 1. Buffer existence and size checks
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return {
      isValid: false,
      format: docResult.format,
      fileSizeBytes: 0,
      extractedTextLength: 0,
      errors: ['Document buffer is null or invalid.'],
    };
  }

  if (buffer.length < 100) {
    errors.push(`Document size (${buffer.length} bytes) is suspiciously small.`);
  }

  let extractedTextLength = 0;

  // 2. Format-specific header and parser validation
  if (docResult.format === 'pdf') {
    // PDF Magic bytes check: %PDF-
    const header = buffer.slice(0, 10).toString('utf-8');
    if (!header.includes('%PDF')) {
      errors.push(`Invalid PDF header. Expected '%PDF', found '${header.slice(0, 5)}'.`);
    }

    // Verify PDF can be parsed
    try {
      const parsedPdf = await pdfParse(buffer);
      extractedTextLength = parsedPdf.text.length;
      if (extractedTextLength === 0) {
        errors.push('PDF generator produced an empty document with 0 extracted characters.');
      }
    } catch (err: any) {
      errors.push(`Generated PDF failed parser verification: ${err?.message || 'Corrupt PDF'}`);
    }
  } else if (docResult.format === 'docx') {
    // DOCX Magic bytes check: PK\x03\x04 (ZIP signature)
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
    if (!isZip) {
      errors.push('Invalid DOCX signature. Document is not a valid OpenXML ZIP package.');
    }

    // Verify DOCX can be parsed
    try {
      const docxParsed = await mammoth.extractRawText({ buffer });
      extractedTextLength = docxParsed.value.length;
      if (extractedTextLength === 0) {
        errors.push('DOCX generator produced an empty document with 0 extracted characters.');
      }
    } catch (err: any) {
      errors.push(`Generated DOCX failed parser verification: ${err?.message || 'Corrupt DOCX'}`);
    }
  } else {
    errors.push(`Unsupported document format: ${docResult.format}`);
  }

  return {
    isValid: errors.length === 0,
    format: docResult.format,
    fileSizeBytes: buffer.length,
    extractedTextLength,
    errors,
  };
}
