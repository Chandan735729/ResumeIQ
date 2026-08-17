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
  }

  for (const [i, cert] of (resume.certifications || []).entries()) {
    check(`certifications[${i}].name`, cert.name);
  }

  for (const [i, lang] of (resume.languages || []).entries()) {
    check(`languages[${i}].name`, lang.name);
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
