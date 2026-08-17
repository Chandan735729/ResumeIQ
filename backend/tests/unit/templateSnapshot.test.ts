/**
 * Unit Tests: Template Snapshot Comparison (Phase 14)
 */

import { compareTemplateSnapshots } from '@services/documents/templateSnapshot';
import type { IParsedResumeMetadata } from '../../src/types';

function metadata(overrides: Partial<IParsedResumeMetadata> = {}): IParsedResumeMetadata {
  return {
    pageCount: 1,
    hasMultipleColumns: false,
    hasTables: false,
    fonts: [],
    colors: [],
    layoutNotes: [],
    ...overrides,
  };
}

describe('Template Snapshot Comparison', () => {
  it('reports section order as PRESERVED when rendered order matches source order', () => {
    const report = compareTemplateSnapshots(metadata(), ['summary', 'experience', 'education'], ['summary', 'experience', 'education']);
    const sectionOrder = report.fields.find(f => f.field === 'sectionOrder')!;
    expect(sectionOrder.status).toBe('PRESERVED');
  });

  it('reports section order as CHANGED when rendered order differs from source order', () => {
    const report = compareTemplateSnapshots(metadata(), ['education', 'summary', 'experience'], ['summary', 'experience', 'education']);
    const sectionOrder = report.fields.find(f => f.field === 'sectionOrder')!;
    expect(sectionOrder.status).toBe('CHANGED');
  });

  it('reports columns as UNSUPPORTED (with justification) when source was multi-column', () => {
    const report = compareTemplateSnapshots(metadata({ hasMultipleColumns: true }), ['summary'], ['summary']);
    const columns = report.fields.find(f => f.field === 'columns')!;
    expect(columns.status).toBe('UNSUPPORTED');
    expect(columns.note).toBeDefined();
  });

  it('reports columns as PRESERVED when source was already single-column', () => {
    const report = compareTemplateSnapshots(metadata({ hasMultipleColumns: false }), ['summary'], ['summary']);
    const columns = report.fields.find(f => f.field === 'columns')!;
    expect(columns.status).toBe('PRESERVED');
  });

  it('always reports fonts, colors, and page size as UNSUPPORTED with an explanatory note', () => {
    const report = compareTemplateSnapshots(metadata(), ['summary'], ['summary']);
    for (const field of ['pageSize', 'fonts', 'colors']) {
      const entry = report.fields.find(f => f.field === field)!;
      expect(entry.status).toBe('UNSUPPORTED');
      expect(entry.note).toBeTruthy();
    }
  });

  it('never silently omits a field -- every comparison includes all tracked template fields', () => {
    const report = compareTemplateSnapshots(metadata(), ['summary'], ['summary']);
    const fieldNames = report.fields.map(f => f.field);
    expect(fieldNames).toEqual(
      expect.arrayContaining(['sectionOrder', 'pageSize', 'columns', 'fonts', 'colors', 'tables'])
    );
  });
});
