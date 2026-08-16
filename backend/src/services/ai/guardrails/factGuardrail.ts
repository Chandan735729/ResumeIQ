/**
 * Fact-Checking Guardrails for AI Optimization
 *
 * Deterministically inspects every proposed change from the AI to ensure
 * NO unevidenced facts, certifications, technologies, or numeric metrics are added.
 */

import { resolveCanonical, skillMentionedInText, SKILL_ALIAS_MAP } from '../../skillAliases';
import type { RawOptimizationChange } from './schemaValidator';

export interface ValidatedChange extends RawOptimizationChange {
  isApproved: boolean;
  rejectionReason?: string;
}

export interface FactCheckReport {
  approvedChanges: ValidatedChange[];
  rejectedChanges: ValidatedChange[];
  totalProposed: number;
  totalApproved: number;
  totalRejected: number;
  warnings: string[];
}

const KNOWN_CERT_NAMES = [
  'aws certified', 'aws solutions architect', 'aws developer', 'aws sysops',
  'google cloud certified', 'gcp certified', 'azure certified', 'microsoft certified',
  'pmp', 'project management professional',
  'cpa', 'cfa', 'cissp', 'cism', 'ceh',
  'kubernetes administrator', 'cka', 'ckad',
  'comptia security+', 'comptia network+',
  'certified scrum master', 'csm',
  'safe agilist', 'safe certified',
  'oracle certified', 'ocp', 'ocjp',
  'rhcsa', 'rhce', 'red hat certified',
];

// All skill canonical keys and tokens from alias map
const ALL_TECH_CANONICALS = new Set<string>();
const ALL_TECH_TOKENS = new Set<string>();
for (const [canonical, aliases] of Object.entries(SKILL_ALIAS_MAP)) {
  ALL_TECH_CANONICALS.add(canonical);
  for (const alias of aliases) {
    ALL_TECH_TOKENS.add(alias.toLowerCase());
  }
}

/**
 * Extract numeric metrics (percentages, dollar amounts, multipliers, team counts) from text
 */
export function extractMetrics(text: string): string[] {
  const metrics: string[] = [];
  // Percentage: e.g. 40%, 15.5%
  const percentMatches = text.match(/\b\d+(?:\.\d+)?%/g);
  if (percentMatches) metrics.push(...percentMatches);

  // Currency: e.g. $1M, $500k, $2.5M, $100,000
  const currencyMatches = text.match(/\$\d+(?:,\d+)*(?:\.\d+)?[kmbKMB]?\b/g);
  if (currencyMatches) metrics.push(...currencyMatches);

  // Multipliers: e.g. 10x, 2x, 5X
  const multiplierMatches = text.match(/\b\d+(?:\.\d+)?[xX]\b/g);
  if (multiplierMatches) metrics.push(...multiplierMatches);

  return metrics;
}

/**
 * Extract technology mentions from text using the known alias map
 */
export function extractTechFromText(text: string): Set<string> {
  const found = new Set<string>();
  const lower = text.toLowerCase();

  const sortedTokens = Array.from(ALL_TECH_TOKENS).sort((a, b) => b.length - a.length);

  for (const token of sortedTokens) {
    if (token.length < 2) continue;
    if (skillMentionedInText(token, lower)) {
      found.add(resolveCanonical(token));
    }
  }
  return found;
}

/**
 * Extract certification mentions from text
 */
export function extractCertsFromText(text: string): Set<string> {
  const found = new Set<string>();
  const lower = text.toLowerCase();
  for (const cert of KNOWN_CERT_NAMES) {
    if (lower.includes(cert)) {
      found.add(cert);
    }
  }
  return found;
}

/**
 * Check a single proposed change against the original resume content
 */
export function factCheckChange(
  change: RawOptimizationChange,
  originalResumeText: string,
  originalResumeSkills: string[]
): { isApproved: boolean; rejectionReason?: string } {
  // 1. Check for fabricated certifications

  const suggestedCerts = extractCertsFromText(change.suggested);
  const originalCerts = extractCertsFromText(originalResumeText);
  for (const cert of suggestedCerts) {
    if (!originalCerts.has(cert)) {
      return {
        isApproved: false,
        rejectionReason: `FABRICATED_CERTIFICATION: Proposed change introduced "${cert}" which is not in the original resume.`,
      };
    }
  }

  // 2. Check for fabricated numeric metrics
  const suggestedMetrics = extractMetrics(change.suggested);
  const originalMetrics = new Set(extractMetrics(originalResumeText).concat(extractMetrics(change.original)));
  for (const metric of suggestedMetrics) {
    if (!originalMetrics.has(metric)) {
      return {
        isApproved: false,
        rejectionReason: `FABRICATED_METRIC: Proposed change introduced metric "${metric}" which is not evidenced in the original resume.`,
      };
    }
  }

  // 3. Check for fabricated technologies / hard skills
  const suggestedTechs = extractTechFromText(change.suggested);
  const originalTechs = extractTechFromText(originalResumeText);
  const resumeSkillsSet = new Set(originalResumeSkills.map(s => resolveCanonical(s)));

  for (const tech of suggestedTechs) {
    // If tech is evidenced in original text or explicit skills section, it is allowed
    const isEvidenced = originalTechs.has(tech) || resumeSkillsSet.has(tech);
    if (!isEvidenced) {
      return {
        isApproved: false,
        rejectionReason: `FABRICATED_TECHNOLOGY: Proposed change introduced skill "${tech}" which is not evidenced anywhere in the candidate's original resume.`,
      };
    }
  }

  return { isApproved: true };
}

/**
 * Run deterministic fact-checking across all proposed changes
 */
export function runFactGuardrails(
  changes: RawOptimizationChange[],
  originalResumeText: string,
  originalResumeSkills: string[] = []
): FactCheckReport {
  const approvedChanges: ValidatedChange[] = [];
  const rejectedChanges: ValidatedChange[] = [];
  const warnings: string[] = [];

  for (const change of changes) {
    const check = factCheckChange(change, originalResumeText, originalResumeSkills);
    if (check.isApproved) {
      approvedChanges.push({ ...change, isApproved: true });
    } else {
      rejectedChanges.push({
        ...change,
        isApproved: false,
        rejectionReason: check.rejectionReason,
      });
      if (check.rejectionReason) {
        warnings.push(check.rejectionReason);
      }
    }
  }

  return {
    approvedChanges,
    rejectedChanges,
    totalProposed: changes.length,
    totalApproved: approvedChanges.length,
    totalRejected: rejectedChanges.length,
    warnings,
  };
}
