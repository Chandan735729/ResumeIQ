/**
 * Sanitizes resume text before it is embedded into a generated PDF/DOCX.
 *
 * Root cause this exists to fix: PDFKit's standard 14 fonts render text using
 * WinAnsiEncoding (Windows-1252), which can only represent: the base Latin-1
 * range (0x00-0xFF) plus a fixed set of ~27 extra "smart typography" symbols
 * (curly quotes, en/em dash, bullet, ellipsis, trademark, etc. -- see
 * WIN_ANSI_EXTRA_CODEPOINTS below, taken from pdfkit's own WIN_ANSI_MAP).
 * ANY other Unicode character -- Private Use Area glyphs from Word/Wingdings
 * bullet lists, arrow/checkmark/emoji symbols candidates put next to link
 * text, etc. -- has no representable glyph. Attempting to render one doesn't
 * just look wrong: it can corrupt the generated PDF's byte stream badly
 * enough that no PDF parser (including our own quality validator) can open
 * the file afterward, and even when the file stays readable the character
 * comes back as mojibake on re-extraction, which silently changes the text
 * (e.g. a company name). Replacing anything outside the WinAnsi-safe range
 * with an empty string before it reaches a renderer prevents both failure
 * modes for PDF and DOCX output alike.
 */

import type { ResumeMatchInput } from '../matchingEngine.service';

// Built from numeric character codes (not literal \u escapes in source text)
// so the ranges can't be silently mangled by any text pipeline this file
// passes through.
function charRange(startCode: number, endCode: number): string {
  return `${String.fromCharCode(startCode)}-${String.fromCharCode(endCode)}`;
}

function charSet(codes: number[]): string {
  return codes.map(c => String.fromCharCode(c)).join('');
}

// The exact extra Unicode codepoints pdfkit's WinAnsiEncoding table (WIN_ANSI_MAP)
// maps to a real glyph, beyond the base Latin-1 range.
const WIN_ANSI_EXTRA_CODEPOINTS = [
  402, 8211, 8212, 8216, 8217, 8218, 8220, 8221, 8222, 8224, 8225, 8226, 8230,
  8364, 8240, 8249, 8250, 710, 8482, 338, 339, 732, 352, 353, 376, 381, 382,
];

const WIN_ANSI_SAFE = new RegExp(
  '[^' +
    '\\t\\n\\r' +
    charRange(0x20, 0x7e) + // printable ASCII
    charRange(0xa0, 0xff) + // Latin-1 supplement
    charSet(WIN_ANSI_EXTRA_CODEPOINTS) +
    ']',
  'g'
);

export function sanitizeText(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .replace(WIN_ANSI_SAFE, '')
    // Collapse whitespace left behind by a stripped character.
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Filters and de-duplicates contact header tokens (email, phone, location,
 * links, ...) before rendering.
 *
 * Root cause this exists to fix: some real-world parsed resumes have a
 * "kitchen sink" field -- e.g. `contact.location` or `contact.otherLinks[0]`
 * holding the ENTIRE raw contact line ("email | phone | city | github link")
 * instead of just the location -- alongside the correctly-isolated
 * `contact.email`/`contact.phone`/`contact.github` fields. Rendering both
 * verbatim visibly repeats the same contact details 2-3 times in the header.
 * This is a parser data-quality issue (out of scope to fix at its source
 * here), but a "kitchen sink" field never contributes new information once
 * its pieces are already shown individually, so it's always safe to drop a
 * candidate token that's redundant with (equal to, a substring of, or a
 * superset of) one already accepted.
 */
export function dedupeContactTokens(
  tokens: Array<string | undefined | null>,
  alreadyAccepted: string[] = []
): string[] {
  const accepted: string[] = [];
  const acceptedNormalized: string[] = alreadyAccepted.map(v => v.toLowerCase());
  for (const raw of tokens) {
    if (!raw) continue;
    const value = raw.trim();
    if (value.length === 0) continue;
    const normalized = value.toLowerCase();
    const isRedundant = acceptedNormalized.some(
      existing => normalized === existing || normalized.includes(existing) || existing.includes(normalized)
    );
    if (isRedundant) continue;
    accepted.push(value);
    acceptedNormalized.push(normalized);
  }
  return accepted;
}

/**
 * Joins short tokens (skills, technologies, languages) with a separator for
 * a single-line "tag list" rendering, WITHOUT letting PDFKit's automatic
 * line-wrapping split an individual token across two lines.
 *
 * Root cause this exists to fix: PDFKit wraps text at any regular space, so
 * a joined list like "... Jenkins • GitLab CI/CD • Grafana ..." can wrap
 * exactly inside a multi-word token (observed: "GitLab CI/" / "CD" on
 * consecutive lines). Re-extracting that text inserts a spurious space
 * ("GitLab CI/ CD"), silently corrupting the token. Replacing the spaces
 * *inside* each token with a non-breaking space (still WinAnsi-safe) keeps
 * the token atomic while leaving the separators between tokens breakable.
 */
export function joinTokensUnbreakable(tokens: string[], separator: string): string {
  const nbsp = String.fromCharCode(0xa0);
  return tokens.map(t => t.replace(/ /g, nbsp)).join(separator);
}

function sanitizeList(values: string[] | undefined): string[] | undefined {
  if (!values) return values;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const cleaned = sanitizeText(raw);
    if (cleaned.length === 0) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

/**
 * Drops "skills" that are exact matches for the candidate's own contact
 * details. A skill list entry equal to the candidate's name/email/phone/link
 * is never a real skill -- it's contact-line text that a section-boundary
 * detection heuristic mis-attributed to the skills section. Only exact
 * (case-insensitive) matches are removed, so this never touches genuine
 * skills, even ones that happen to share a word with the contact block.
 */
function dropContactLookalikeSkills(skills: string[], contact: ResumeMatchInput['contact']): string[] {
  if (!contact) return skills;
  const contactValues = new Set(
    [contact.fullName, contact.email, contact.phone, contact.location, contact.website, contact.linkedin, contact.github, ...(contact.otherLinks || [])]
      .filter((v): v is string => !!v)
      .map(v => v.toLowerCase())
  );
  if (contactValues.size === 0) return skills;
  return skills.filter(s => !contactValues.has(s.toLowerCase()));
}

/**
 * Returns a deep copy of `resume` with every user-authored text field passed
 * through sanitizeText(). Structural fields (arrays/keys themselves) are
 * preserved; only string leaf values are sanitized.
 */
export function sanitizeResumeForRender(resume: ResumeMatchInput): ResumeMatchInput {
  const sanitizedContact = resume.contact
    ? {
        ...resume.contact,
        fullName: resume.contact.fullName !== undefined ? sanitizeText(resume.contact.fullName) : undefined,
        email: resume.contact.email !== undefined ? sanitizeText(resume.contact.email) : undefined,
        phone: resume.contact.phone !== undefined ? sanitizeText(resume.contact.phone) : undefined,
        location: resume.contact.location !== undefined ? sanitizeText(resume.contact.location) : undefined,
        website: resume.contact.website !== undefined ? sanitizeText(resume.contact.website) : undefined,
        linkedin: resume.contact.linkedin !== undefined ? sanitizeText(resume.contact.linkedin) : undefined,
        github: resume.contact.github !== undefined ? sanitizeText(resume.contact.github) : undefined,
        otherLinks: sanitizeList(resume.contact.otherLinks) || [],
      }
    : resume.contact;

  return {
    ...resume,
    skills: dropContactLookalikeSkills(sanitizeList(resume.skills) || [], sanitizedContact),
    rawText: resume.rawText,
    summary: resume.summary !== undefined ? sanitizeText(resume.summary) : undefined,
    contact: sanitizedContact,
    experience: resume.experience.map(exp => ({
      ...exp,
      title: exp.title !== undefined ? sanitizeText(exp.title) : undefined,
      company: exp.company !== undefined ? sanitizeText(exp.company) : undefined,
      location: exp.location !== undefined ? sanitizeText(exp.location) : undefined,
      startDate: exp.startDate !== undefined ? sanitizeText(exp.startDate) : undefined,
      endDate: exp.endDate !== undefined ? sanitizeText(exp.endDate) : undefined,
      summary: exp.summary !== undefined ? sanitizeText(exp.summary) : undefined,
      bullets: sanitizeList(exp.bullets) || [],
    })),
    education: resume.education.map(edu => ({
      ...edu,
      institution: edu.institution !== undefined ? sanitizeText(edu.institution) : undefined,
      degree: edu.degree !== undefined ? sanitizeText(edu.degree) : undefined,
      fieldOfStudy: edu.fieldOfStudy !== undefined ? sanitizeText(edu.fieldOfStudy) : undefined,
      startDate: edu.startDate !== undefined ? sanitizeText(edu.startDate) : undefined,
      endDate: edu.endDate !== undefined ? sanitizeText(edu.endDate) : undefined,
      location: edu.location !== undefined ? sanitizeText(edu.location) : undefined,
    })),
    certifications: resume.certifications.map(cert => ({
      ...cert,
      name: cert.name !== undefined ? sanitizeText(cert.name) : undefined,
      authority: cert.authority !== undefined ? sanitizeText(cert.authority) : undefined,
      date: cert.date !== undefined ? sanitizeText(cert.date) : undefined,
    })),
    projects: resume.projects
      ? resume.projects.map(project => ({
          ...project,
          name: project.name !== undefined ? sanitizeText(project.name) : undefined,
          description: project.description !== undefined ? sanitizeText(project.description) : undefined,
          technologies: sanitizeList(project.technologies) || [],
        }))
      : resume.projects,
    languages: resume.languages
      ? resume.languages.map(lang => ({
          ...lang,
          name: sanitizeText(lang.name),
          proficiency: lang.proficiency !== undefined ? sanitizeText(lang.proficiency) : undefined,
        }))
      : resume.languages,
  };
}
