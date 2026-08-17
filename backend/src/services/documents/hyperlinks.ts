/**
 * Normalizes a contact-info value into an absolute, clickable URL.
 *
 * Parsed contact fields are typically bare ("linkedin.com/in/jane",
 * "jane@example.com") rather than fully-qualified URLs, since that's how
 * they appear on the source resume. Neither PDFKit's `link` option nor
 * DOCX's `ExternalHyperlink` will treat a bare domain/email as clickable --
 * both need an explicit scheme.
 */
export function toClickableUrl(value: string, kind: 'email' | 'web'): string {
  const v = value.trim();
  if (kind === 'email') {
    return /^mailto:/i.test(v) ? v : `mailto:${v}`;
  }
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export interface LinkableToken {
  text: string;
  url?: string;
}

export function linkableToken(value: string | undefined | null, kind?: 'email' | 'web'): LinkableToken | null {
  if (!value || value.trim().length === 0) return null;
  const text = value.trim();
  return { text, url: kind ? toClickableUrl(text, kind) : undefined };
}

/**
 * Filters and de-duplicates contact header tokens (email, phone, location,
 * links, ...) before rendering, carrying each surviving token's URL through.
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
export function dedupeLinkableTokens(
  tokens: LinkableToken[],
  alreadyAcceptedTexts: string[] = []
): LinkableToken[] {
  const survivingTexts = dedupeRedundantTexts(
    tokens.map(t => t.text),
    alreadyAcceptedTexts
  );
  const survivingSet = new Set(survivingTexts);
  // Preserve first-occurrence order/URLs; dedupeRedundantTexts already
  // dropped exact-duplicate texts, so a plain filter is safe here.
  const seen = new Set<string>();
  return tokens.filter(t => {
    if (!survivingSet.has(t.text) || seen.has(t.text)) return false;
    seen.add(t.text);
    return true;
  });
}

/**
 * The plain-text redundancy check underlying dedupeLinkableTokens, shared
 * with contentPreservation.ts's verifyContentPreserved() so the content
 * gate's notion of "is this field's information already present elsewhere"
 * matches exactly what the renderers actually decided to keep or drop --
 * otherwise the gate would flag an intentionally-suppressed "kitchen sink"
 * duplicate field as unexpectedly-missing content.
 */
export function dedupeRedundantTexts(texts: string[], alreadyAccepted: string[] = []): string[] {
  const acceptedNormalized = alreadyAccepted.map(t => t.toLowerCase());
  const result: string[] = [];
  for (const raw of texts) {
    const text = raw.trim();
    if (text.length === 0) continue;
    const normalized = text.toLowerCase();
    const isRedundant = acceptedNormalized.some(
      existing => normalized === existing || normalized.includes(existing) || existing.includes(normalized)
    );
    if (isRedundant) continue;
    result.push(text);
    acceptedNormalized.push(normalized);
  }
  return result;
}
