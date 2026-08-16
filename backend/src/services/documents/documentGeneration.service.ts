/**
 * Unified Document Generation Service
 *
 * Coordinates PDF and DOCX generation, artifact validation, and secure user-scoped storage.
 */

import { PdfGeneratorService } from './pdfGenerator.service';
import { DocxGeneratorService } from './docxGenerator.service';
import { validateGeneratedDocument, DocumentValidationResult } from './documentValidator';
import { fileStorage } from '../file-storage.service';
import { logger } from '../logger.service';
import type { ResumeMatchInput } from '../matchingEngine.service';
import type {
  DocumentGenerationOptions,
  GeneratedDocumentResult,
} from './document.interface';


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

    // 1. Generate document buffer
    const docResult = await generator.generate(resume, options);

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
    const docResult = await generator.generate(resume, options);
    const validation = await validateGeneratedDocument(docResult);
    if (!validation.isValid) {
      throw new Error(`Generated document failed validation: ${validation.errors.join(', ')}`);
    }
    return docResult;
  }
}

export const documentGenerationService = new DocumentGenerationService();
