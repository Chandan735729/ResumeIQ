/**
 * Document Generation Interface & Types
 */

import type { ResumeMatchInput } from '../matchingEngine.service';

export type DocumentFormat = 'pdf' | 'docx';

export interface DocumentStylingOptions {
  primaryColor?: string;
  fontFamily?: string;
  fontSize?: number;
  lineSpacing?: number;
  margin?: number;
}

export interface DocumentGenerationOptions {
  format: DocumentFormat;
  styling?: DocumentStylingOptions;
  candidateName?: string;
  contactEmail?: string;
  contactPhone?: string;
  summary?: string;
}

export interface GeneratedDocumentResult {
  buffer: Buffer;
  format: DocumentFormat;
  mimeType: string;
  fileName: string;
  fileSizeBytes: number;
  pageCount?: number;
  generatedAt: Date;
}

export interface IDocumentGenerator {
  readonly format: DocumentFormat;
  generate(resume: ResumeMatchInput, options?: DocumentGenerationOptions): Promise<GeneratedDocumentResult>;
}
