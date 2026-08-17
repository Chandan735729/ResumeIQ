/**
 * Template Snapshot + Comparison Report
 *
 * Captures what the SOURCE document's template/layout looked like (from the
 * parser's already-extracted `metadata`) and compares it against what the
 * export renderers actually used, field by field: PRESERVED, CHANGED, or
 * UNSUPPORTED. This is informational (used in the real-data QA report), not
 * a pass/fail gate -- several fields are UNSUPPORTED by explicit, documented
 * design (see pdfGenerator.service.ts's template-fidelity note), not bugs.
 */

import type { IParsedResumeMetadata } from '../../types';

export type TemplateFieldStatus = 'PRESERVED' | 'CHANGED' | 'UNSUPPORTED';

export interface TemplateFieldReport {
  field: string;
  status: TemplateFieldStatus;
  original: string;
  rendered: string;
  note?: string;
}

export interface TemplateComparisonReport {
  fields: TemplateFieldReport[];
}

/** What the renderers actually, always use today (see pdfGenerator.service.ts / docxGenerator.service.ts). */
const RENDERED_TEMPLATE = {
  pageSize: 'LETTER',
  columns: 1,
  fontFamily: 'Helvetica (PDF standard-14) / Calibri-equivalent default (DOCX)',
};

export function compareTemplateSnapshots(
  originalMetadata: IParsedResumeMetadata,
  sourceSectionOrder: string[],
  renderedSectionOrder: string[]
): TemplateComparisonReport {
  const fields: TemplateFieldReport[] = [];

  const sectionOrderMatches =
    sourceSectionOrder.length > 0 &&
    JSON.stringify(sourceSectionOrder) === JSON.stringify(renderedSectionOrder.filter(s => sourceSectionOrder.includes(s)));
  fields.push({
    field: 'sectionOrder',
    status: sectionOrderMatches ? 'PRESERVED' : sourceSectionOrder.length === 0 ? 'UNSUPPORTED' : 'CHANGED',
    original: sourceSectionOrder.join(' > ') || '(none detected)',
    rendered: renderedSectionOrder.join(' > '),
    note: sectionOrderMatches ? undefined : 'Section order captured at parse time did not fully carry through to rendering.',
  });

  fields.push({
    field: 'pageSize',
    status: 'UNSUPPORTED',
    original: '(not captured by parser -- page dimensions are not extracted)',
    rendered: RENDERED_TEMPLATE.pageSize,
    note: 'Always renders LETTER regardless of source page size (e.g. A4). Parser does not currently extract page dimensions.',
  });

  fields.push({
    field: 'columns',
    status: originalMetadata.hasMultipleColumns ? 'UNSUPPORTED' : 'PRESERVED',
    original: originalMetadata.hasMultipleColumns ? 'multi-column' : 'single-column',
    rendered: 'single-column',
    note: originalMetadata.hasMultipleColumns
      ? 'Multi-column source layouts are deliberately normalized to single-column -- multi-column resumes are a known ATS-parsing hazard, so this is an intentional safety choice, not a defect.'
      : undefined,
  });

  fields.push({
    field: 'fonts',
    status: 'UNSUPPORTED',
    original: originalMetadata.fonts.length > 0 ? originalMetadata.fonts.map(f => f.name).join(', ') : '(none captured)',
    rendered: RENDERED_TEMPLATE.fontFamily,
    note: 'PDFKit can only use its standard 14 fonts (or embedded font files, which are not available for arbitrary source resumes); original document fonts are not re-embedded.',
  });

  fields.push({
    field: 'colors',
    status: 'UNSUPPORTED',
    original: originalMetadata.colors.length > 0 ? originalMetadata.colors.join(', ') : '(none captured)',
    rendered: 'fixed ResumeIQ palette (#1a365d headings, #2d3748 body, #2b6cb0 accents)',
    note: 'A consistent, accessible palette is used for every export rather than attempting to reproduce arbitrary source colors.',
  });

  fields.push({
    field: 'tables',
    status: originalMetadata.hasTables ? 'UNSUPPORTED' : 'PRESERVED',
    original: originalMetadata.hasTables ? 'source used table-based layout' : 'no tables detected',
    rendered: 'no tables (flowing paragraphs/bullets only)',
    note: originalMetadata.hasTables
      ? 'Table-based source layouts are flattened to linear content -- table structure itself is not reproduced, though the text content is.'
      : undefined,
  });

  return { fields };
}
