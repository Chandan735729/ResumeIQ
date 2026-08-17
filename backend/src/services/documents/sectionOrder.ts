/**
 * Resolves which order to render resume sections in.
 *
 * Prefers the order sections appeared in the source document (captured at
 * parse time as `resume.sectionOrder`), falling back to a sensible default
 * for any section type not present in that list (e.g. a resume whose
 * languages were detected inline rather than as their own heading).
 */

import type { ResumeMatchInput } from '../matchingEngine.service';

export type RenderableSection =
  | 'summary'
  | 'skills'
  | 'experience'
  | 'projects'
  | 'education'
  | 'certifications'
  | 'languages';

export const DEFAULT_SECTION_ORDER: RenderableSection[] = [
  'summary',
  'skills',
  'experience',
  'projects',
  'education',
  'certifications',
  'languages',
];

export function resolveSectionOrder(resume: Pick<ResumeMatchInput, 'sectionOrder'>): RenderableSection[] {
  const known = new Set<string>(DEFAULT_SECTION_ORDER);
  const fromSource = (resume.sectionOrder || []).filter((t): t is RenderableSection => known.has(t));
  const seen = new Set(fromSource);
  const rest = DEFAULT_SECTION_ORDER.filter(t => !seen.has(t));
  return [...fromSource, ...rest];
}
