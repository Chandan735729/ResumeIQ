/**
 * Content-Preservation Gate
 *
 * Unlike documentValidator.ts (which only checks that a generated PDF/DOCX is
 * a well-formed, non-empty, parseable file), this module checks that the
 * REGENERATED document's extracted text actually contains every meaningful
 * content unit from the structured resume that was supposed to produce it —
 * contact name, every job title/company, every degree/institution, every
 * project/certification/language name, and every skill.
 *
 * This is the hard information-preservation gate: if a structured entry
 * cannot be found in the regenerated document's extracted text, that is
 * treated as unexpectedly-missing content, not an acceptable rewrite.
 */

import type { ResumeMatchInput } from '../matchingEngine.service';
import { dedupeRedundantTexts } from './hyperlinks';

export interface ContentPreservationResult {
  ok: boolean;
  checkedUnitCount: number;
  missing: string[];
  duplicateWarnings: string[];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Strips ALL whitespace (not just collapsing runs of it) before comparing.
 * PDF page layout can legitimately insert a line break -- and therefore
 * whitespace -- in the middle of a token that has no space of its own to
 * break at (observed: PDFKit wrapping "GitLab CI/CD" as "GitLab CI/" then
 * "CD"). That's a formatting artifact, not lost content, so the containment
 * check ignores whitespace entirely rather than trying to reproduce PDFKit's
 * exact line-break rules here.
 */
function normalizeForContainment(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '');
}

function contains(haystack: string, needle: string | undefined | null): boolean {
  if (!needle) return true;
  const normalizedNeedle = normalizeForContainment(needle);
  if (normalizedNeedle.length === 0) return true;
  return haystack.includes(normalizedNeedle);
}

/**
 * Verify that every meaningful content unit in `resume` is present in
 * `extractedText` (the text re-extracted from the generated PDF/DOCX).
 */
export function verifyContentPreserved(
  resume: ResumeMatchInput,
  extractedText: string
): ContentPreservationResult {
  const haystack = normalizeForContainment(extractedText);
  const missing: string[] = [];
  let checkedUnitCount = 0;

  const check = (label: string, value: string | undefined | null) => {
    if (!value || value.trim().length === 0) return;
    checkedUnitCount++;
    if (!contains(haystack, value)) {
      missing.push(label);
    }
  };

  check('contact.fullName', resume.contact?.fullName);

  // Contact fields below are checked against the SAME de-duplicated set the
  // renderers actually keep (dedupeRedundantTexts in hyperlinks.ts), not the
  // raw pre-dedup fields directly. Real-world parsed resumes sometimes have
  // a "kitchen sink" field (e.g. `contact.location` holding the entire raw
  // contact line) that the renderers intentionally drop as a redundant
  // duplicate of already-shown fields -- checking the raw field directly
  // would misreport that intentional, correct suppression as lost content.
  const contact = resume.contact;
  const line1Texts = dedupeRedundantTexts([contact?.email, contact?.phone, contact?.location].filter((v): v is string => !!v));
  const line2Texts = dedupeRedundantTexts(
    [contact?.linkedin, contact?.github, contact?.website, ...(contact?.otherLinks || [])].filter((v): v is string => !!v),
    line1Texts
  );
  checkedUnitCount += line1Texts.length + line2Texts.length;
  for (const text of [...line1Texts, ...line2Texts]) {
    if (!contains(haystack, text)) {
      missing.push(`contact:"${text}"`);
    }
  }

  for (const [i, exp] of (resume.experience || []).entries()) {
    check(`experience[${i}].title`, exp.title);
    check(`experience[${i}].company`, exp.company);
  }

  for (const [i, edu] of (resume.education || []).entries()) {
    check(`education[${i}].institution`, edu.institution);
    check(`education[${i}].degree`, edu.degree);
  }

  for (const [i, project] of (resume.projects || []).entries()) {
    check(`projects[${i}].name`, project.name);
    check(`projects[${i}].description`, project.description);
  }

  for (const [i, cert] of (resume.certifications || []).entries()) {
    check(`certifications[${i}].name`, cert.name);
    check(`certifications[${i}].authority`, cert.authority);
    check(`certifications[${i}].date`, cert.date);
  }

  for (const [i, lang] of (resume.languages || []).entries()) {
    check(`languages[${i}].name`, lang.name);
    check(`languages[${i}].proficiency`, lang.proficiency);
  }

  for (const [i, skill] of (resume.skills || []).entries()) {
    check(`skills[${i}]`, skill);
  }

  const duplicateWarnings = findDuplicateLines(extractedText);

  return {
    ok: missing.length === 0,
    checkedUnitCount,
    missing,
    duplicateWarnings,
  };
}

/**
 * Flags any non-trivial line (>40 chars) that appears 3+ times in the
 * extracted text — a cheap heuristic for accidental duplicate rendering.
 */
export function findDuplicateLines(extractedText: string): string[] {
  const counts = new Map<string, number>();
  for (const rawLine of extractedText.split('\n')) {
    const line = normalize(rawLine);
    if (line.length <= 40) continue;
    counts.set(line, (counts.get(line) || 0) + 1);
  }
  const warnings: string[] = [];
  for (const [line, count] of counts) {
    if (count >= 3) {
      warnings.push(`Line repeated ${count} times: "${line.slice(0, 80)}${line.length > 80 ? '…' : ''}"`);
    }
  }
  return warnings;
}

export interface StructuralIntegrityResult {
  ok: boolean;
  violations: string[];
}

/**
 * Detects a changed employer/job-title/date/institution/degree/certification
 * field between the ORIGINAL parsed resume and the OPTIMIZED structured
 * resume, before either is ever rendered.
 *
 * These fields should never change through optimization in ANY mode --
 * `applyChangesToResume` (changeTracker.ts) only ever rewrites bullet/skill/
 * summary/project-description text, never these structural fields, so under
 * correct operation this check should never fire. It exists as a regression
 * tripwire: a future bug that accidentally corrupts a fact-bearing field
 * (rather than just rewording a bullet) fails loudly here instead of quietly
 * shipping a resume with a wrong employer or date.
 */
export function verifyStructuralFieldsUnchanged(
  original: ResumeMatchInput,
  optimized: ResumeMatchInput
): StructuralIntegrityResult {
  const violations: string[] = [];

  function compareEntries<T extends object>(
    label: string,
    originalArr: T[] | undefined,
    optimizedArr: T[] | undefined,
    fields: Array<keyof T>
  ): void {
    const a = originalArr || [];
    const b = optimizedArr || [];
    if (a.length !== b.length) {
      violations.push(`${label}: entry count changed (${a.length} -> ${b.length})`);
      return;
    }
    a.forEach((origItem, i) => {
      const optItem = b[i];
      for (const field of fields) {
        const origVal = (origItem[field] as unknown) ?? '';
        const optVal = (optItem[field] as unknown) ?? '';
        if (origVal !== optVal) {
          violations.push(`${label}[${i}].${String(field)}: changed from "${String(origVal)}" to "${String(optVal)}"`);
        }
      }
    });
  }

  compareEntries('experience', original.experience, optimized.experience, [
    'title',
    'company',
    'startDate',
    'endDate',
    'isCurrent',
  ]);
  compareEntries('education', original.education, optimized.education, [
    'institution',
    'degree',
    'fieldOfStudy',
    'startDate',
    'endDate',
  ]);
  compareEntries('certifications', original.certifications, optimized.certifications, ['name', 'authority', 'date']);

  return { ok: violations.length === 0, violations };
}
