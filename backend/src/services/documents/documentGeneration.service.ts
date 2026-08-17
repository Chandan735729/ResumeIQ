/**
 * Unified Document Generation Service
 *
 * Coordinates PDF and DOCX generation, artifact validation, and secure user-scoped storage.
 */

import { PdfGeneratorService } from './pdfGenerator.service';
import { DocxGeneratorService } from './docxGenerator.service';
import { validateGeneratedDocument, DocumentValidationResult } from './documentValidator';
import { verifyContentPreserved } from './contentPreservation';
import { sanitizeResumeForRender } from './textSanitizer';
import { fileStorage } from '../file-storage.service';
import { logger } from '../logger.service';
import type { ResumeMatchInput } from '../matchingEngine.service';
import type {
  DocumentGenerationOptions,
  GeneratedDocumentResult,
} from './document.interface';

function assertContentPreserved(
  resume: ResumeMatchInput,
  extractedText: string,
  context: { userId: string; format: string }
): void {
  const preservation = verifyContentPreserved(resume, extractedText);
  if (!preservation.ok) {
    logger.error('Generated document failed content-preservation gate', {
      ...context,
      missing: preservation.missing,
      checkedUnitCount: preservation.checkedUnitCount,
    });
    throw new Error(
      `Generated document is missing required content: ${preservation.missing.join(', ')}`
    );
  }
  if (preservation.duplicateWarnings.length > 0) {
    logger.warn('Generated document has duplicate content warnings', {
      ...context,
      duplicateWarnings: preservation.duplicateWarnings,
    });
  }
}


export interface StoredDocumentResult extends GeneratedDocumentResult {
  fileKey: string;
  validation: DocumentValidationResult;
}

export class DocumentGenerationService {
  private pdfGenerator = new PdfGeneratorService();
  private docxGenerator = new DocxGeneratorService();

  /**
   * Generate a PDF or DOCX resume document, validate its integrity, and store it.
   */
  async generateAndStoreDocument(
    userId: string,
    resume: ResumeMatchInput,
    options: DocumentGenerationOptions
  ): Promise<StoredDocumentResult> {
    const generator = options.format === 'docx' ? this.docxGenerator : this.pdfGenerator;

    // Sanitize once, up front, so the content-preservation check below compares
    // against the exact same text the renderer actually used (the renderers
    // also sanitize internally -- idempotently -- as a defense-in-depth for
    // callers that invoke them directly, e.g. unit tests).
    const sanitizedResume = sanitizeResumeForRender(resume);

    // 1. Generate document buffer
    const docResult = await generator.generate(sanitizedResume, options);

    // 2. Validate artifact quality & parser re-open capability
    const validation = await validateGeneratedDocument(docResult);
    if (!validation.isValid) {
      logger.error('Generated document failed quality validation', {
        userId,
        format: options.format,
        errors: validation.errors,
      });
      throw new Error(`Generated document failed validation: ${validation.errors.join(', ')}`);
    }

    // 2b. Hard content-preservation gate: the regenerated document must still
    // contain every meaningful content unit from the structured resume.
    assertContentPreserved(sanitizedResume, validation.extractedText, { userId, format: options.format });

    // 3. Store document in user-scoped storage
    const fileKey = await fileStorage.upload(userId, docResult.buffer, docResult.fileName);

    logger.info('Generated document successfully stored', {
      userId,
      format: options.format,
      fileKey,
      fileSizeBytes: docResult.fileSizeBytes,
    });

    return {
      ...docResult,
      fileKey,
      validation,
    };
  }

  /**
   * Generate a document buffer directly in memory (for on-demand downloads or tests)
   */
  async generateDocumentBuffer(
    resume: ResumeMatchInput,
    options: DocumentGenerationOptions
  ): Promise<GeneratedDocumentResult> {
    const generator = options.format === 'docx' ? this.docxGenerator : this.pdfGenerator;
    const sanitizedResume = sanitizeResumeForRender(resume);
    const docResult = await generator.generate(sanitizedResume, options);
    const validation = await validateGeneratedDocument(docResult);
    if (!validation.isValid) {
      throw new Error(`Generated document failed validation: ${validation.errors.join(', ')}`);
    }
    assertContentPreserved(sanitizedResume, validation.extractedText, { userId: 'buffer-only', format: options.format });
    return docResult;
  }
}

export const documentGenerationService = new DocumentGenerationService();
