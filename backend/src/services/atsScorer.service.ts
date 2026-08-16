/**
 * ATS Scorer Service
 *
 * Explainable, deterministic ATS score computation.
 *
 * SCORE MODEL (documented):
 * ─────────────────────────────────────────────────────────────────────────────
 *  Component             Weight   Justification
 *  ────────────────────  ──────   ──────────────────────────────────────────
 *  Skills Match          35%      Primary ATS filter; skills sections are
 *                                 the first thing ATS parsers index.
 *  Technology Match      25%      Critical for tech roles; tech stack fit is
 *                                 the highest-signal hiring signal.
 *  Keyword Match         15%      Literal keyword scanning is how ATS actually
 *                                 filters in the first pass.
 *  Experience Match      10%      Years/level filtering is common; less
 *                                 important than skill fit.
 *  Education             8%       Increasingly less decisive but still a
 *                                 common filter in traditional companies.
 *  Certification         3%       Usually "nice to have"; certification
 *                                 requirements are uncommon in most JDs.
 *  Responsibility Align  4%       Conservative: without AI we use a strict
 *                                 evidence-only approach → low weight.
 *  ────────────────────  ──────
 *  Total                 100%
 *
 * Scoring Rules:
 *  - Matched requirement → full points
 *  - Partial match → 50% of full points
 *  - Missing required requirement → 0 points
 *  - Missing preferred requirement → no penalty (preferred are worth less)
 *  - UNKNOWN → treated as 50% (insufficient data → neutral)
 *  - If a category has 0 requirements → that component scores full marks
 *    (no penalization for requirements that don't exist in the JD)
 *
 * Reproducibility:
 *  - All inputs are deterministic (no randomness, no timestamps, no LLM)
 *  - The scoring version string embeds the weight config for traceability
 */

import type { MatchResult, MatchStatus } from './matchingEngine.service';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ScoreWeights {
  skills: number;       // 0-1
  technology: number;   // 0-1
  keywords: number;     // 0-1
  experience: number;   // 0-1
  education: number;    // 0-1
  certification: number; // 0-1
  responsibility: number; // 0-1
}

export interface ScoreComponent {
  /** Human-readable label */
  label: string;
  /** Points earned (0-100) */
  earned: number;
  /** Maximum possible points (0-100) */
  max: number;
  /** Weight applied (0-1) */
  weight: number;
  /** Weighted contribution to overall score */
  contribution: number;
  /** Brief explanation of how this was computed */
  explanation: string;
}

export interface ATSScoreResult {
  /** Final ATS score 0-100, rounded to 1 decimal */
  overallScore: number;
  /** Per-component breakdown */
  components: {
    skills: ScoreComponent;
    technology: ScoreComponent;
    keywords: ScoreComponent;
    experience: ScoreComponent;
    education: ScoreComponent;
    certification: ScoreComponent;
    responsibility: ScoreComponent;
  };
  /** Summary interpretation */
  interpretation: 'strong' | 'good' | 'fair' | 'weak';
  /** Weights used (for reproducibility) */
  weightsUsed: ScoreWeights;
  /** Version string for reproducibility tracking */
  scoringVersion: string;
  /** Actionable recommendations */
  recommendations: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Weights
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_WEIGHTS: ScoreWeights = {
  skills: 0.35,
  technology: 0.25,
  keywords: 0.15,
  experience: 0.10,
  education: 0.08,
  certification: 0.03,
  responsibility: 0.04,
};

/** Scoring version — change when weights or algorithm change */
export const SCORING_VERSION = 'v1.0.0-deterministic';

// ─────────────────────────────────────────────────────────────────────────────
// Component Scorers
// ─────────────────────────────────────────────────────────────────────────────

/** Points per requirement based on status */
function statusToPoints(status: MatchStatus): number {
  switch (status) {
    case 'matched': return 1.0;
    case 'partial': return 0.5;
    case 'missing': return 0.0;
    case 'unknown': return 0.5; // insufficient data → neutral
  }
}

function scoreRequirementGroup(
  matchResult: MatchResult,
  category: 'required_skill' | 'preferred_skill' | 'technology' | 'certification',
  label: string,
  weight: number,
): ScoreComponent {
  const relevant = matchResult.requirementMatches.filter(
    r => r.requirement.category === category,
  );

  if (relevant.length === 0) {
    return {
      label,
      earned: 100,
      max: 100,
      weight,
      contribution: weight * 100,
      explanation: `No ${label.toLowerCase()} requirements specified in job description.`,
    };
  }

  let totalPoints = 0;
  let maxPoints = 0;

  for (const r of relevant) {
    const isRequired = r.requirement.status === 'required';
    const pts = statusToPoints(r.status);

    // Preferred requirements are weighted at 60% compared to required
    const effectiveWeight = isRequired ? 1.0 : 0.6;
    totalPoints += pts * effectiveWeight;
    maxPoints += effectiveWeight;
  }

  const ratio = maxPoints > 0 ? totalPoints / maxPoints : 1;
  const earned = Math.round(ratio * 100 * 10) / 10;

  const matchedCount = relevant.filter(r => r.status === 'matched').length;
  const partialCount = relevant.filter(r => r.status === 'partial').length;

  return {
    label,
    earned,
    max: 100,
    weight,
    contribution: weight * earned,
    explanation: `${matchedCount} matched, ${partialCount} partial of ${relevant.length} ${label.toLowerCase()} requirements.`,
  };
}

function scoreKeywords(
  matchResult: MatchResult,
  weight: number,
): ScoreComponent {
  const { matchRate, matched, missing } = matchResult.keywordMatch;
  const earned = Math.round(matchRate * 100 * 10) / 10;

  return {
    label: 'Keyword Match',
    earned,
    max: 100,
    weight,
    contribution: weight * earned,
    explanation: `${matched.length} of ${matched.length + missing.length} keywords found in resume.`,
  };
}

function scoreExperience(
  matchResult: MatchResult,
  weight: number,
): ScoreComponent {
  const { status, requiredMinYears, estimatedYears } = matchResult.experienceMatch;

  if (status === 'unknown' || requiredMinYears === null) {
    return {
      label: 'Experience',
      earned: 100,
      max: 100,
      weight,
      contribution: weight * 100,
      explanation: 'No specific experience requirements detected or unable to estimate from resume.',
    };
  }

  const earned = status === 'matched' ? 100 : status === 'partial' ? 60 : 20;
  const yrsLabel = estimatedYears !== null
    ? `Resume shows ~${estimatedYears}y; JD requires ${requiredMinYears}+y.`
    : `JD requires ${requiredMinYears}+y; resume dates insufficient to estimate.`;

  return {
    label: 'Experience',
    earned,
    max: 100,
    weight,
    contribution: weight * earned,
    explanation: yrsLabel,
  };
}

function scoreEducation(
  matchResult: MatchResult,
  weight: number,
): ScoreComponent {
  const { status, requiredLevel, resumeLevel } = matchResult.educationMatch;

  if (status === 'unknown' || !requiredLevel) {
    return {
      label: 'Education',
      earned: 100,
      max: 100,
      weight,
      contribution: weight * 100,
      explanation: 'No specific education requirements detected.',
    };
  }

  const earned = status === 'matched' ? 100 : status === 'partial' ? 60 : 20;
  const levelLabel = resumeLevel
    ? `Resume: ${resumeLevel}, Required: ${requiredLevel}.`
    : `Required: ${requiredLevel}; resume degree not detected.`;

  return {
    label: 'Education',
    earned,
    max: 100,
    weight,
    contribution: weight * earned,
    explanation: levelLabel,
  };
}

function scoreResponsibilities(
  matchResult: MatchResult,
  weight: number,
): ScoreComponent {
  const respMatches = matchResult.requirementMatches.filter(
    r => r.requirement.category === 'responsibility',
  );

  if (respMatches.length === 0) {
    return {
      label: 'Responsibility Alignment',
      earned: 100,
      max: 100,
      weight,
      contribution: weight * 100,
      explanation: 'No responsibility requirements evaluated (conservative matching).',
    };
  }

  const matched = respMatches.filter(r => r.status === 'matched').length;
  const partial = respMatches.filter(r => r.status === 'partial').length;
  const total = respMatches.length;
  const ratio = (matched + partial * 0.5) / total;
  const earned = Math.round(ratio * 100 * 10) / 10;

  return {
    label: 'Responsibility Alignment',
    earned,
    max: 100,
    weight,
    contribution: weight * earned,
    explanation: `${matched} matched, ${partial} partial of ${total} responsibility items.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommendations
// ─────────────────────────────────────────────────────────────────────────────

function buildRecommendations(
  matchResult: MatchResult,
  components: ATSScoreResult['components'],
): string[] {
  const recs: string[] = [];

  // Missing required skills
  const missingRequiredSkills = matchResult.missing
    .filter(r => r.requirement.status === 'required' &&
      (r.requirement.category === 'required_skill' || r.requirement.category === 'technology'))
    .map(r => r.requirement.label)
    .slice(0, 5);

  if (missingRequiredSkills.length > 0) {
    recs.push(
      `Add these required skills to your resume (or acquire them): ${missingRequiredSkills.join(', ')}.`,
    );
  }

  // Partial skills — suggest making them explicit
  const partialSkills = matchResult.partial
    .filter(r => r.requirement.category === 'required_skill' || r.requirement.category === 'technology')
    .map(r => r.requirement.label)
    .slice(0, 3);

  if (partialSkills.length > 0) {
    recs.push(
      `Explicitly list these in your Skills section (currently only mentioned in context): ${partialSkills.join(', ')}.`,
    );
  }

  // Missing certifications
  const missingCerts = matchResult.missing
    .filter(r => r.requirement.category === 'certification')
    .map(r => r.requirement.label);
  if (missingCerts.length > 0) {
    recs.push(`Consider adding relevant certifications: ${missingCerts.join(', ')}.`);
  }

  // Keyword score low
  if (components.keywords.earned < 50 && matchResult.keywordMatch.missing.length > 0) {
    const topMissing = matchResult.keywordMatch.missing.slice(0, 5).join(', ');
    recs.push(`Include these keywords from the job description to improve ATS keyword match: ${topMissing}.`);
  }

  // Experience gap
  if (matchResult.experienceMatch.status === 'missing' || matchResult.experienceMatch.status === 'partial') {
    const req = matchResult.experienceMatch.requiredMinYears;
    const has = matchResult.experienceMatch.estimatedYears;
    if (req !== null) {
      recs.push(
        has !== null
          ? `Job requires ${req}+ years of experience; resume indicates ~${has} years.`
          : `Job requires ${req}+ years of experience; ensure your experience dates are clearly listed.`,
      );
    }
  }

  return recs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Scorer
// ─────────────────────────────────────────────────────────────────────────────

function interpretScore(score: number): ATSScoreResult['interpretation'] {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'weak';
}

/**
 * Compute the ATS score for a match result.
 * Accepts optional weight overrides for testing.
 */
export function computeATSScore(
  matchResult: MatchResult,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): ATSScoreResult {
  // Verify weights sum to ~1 (within float tolerance)
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 1.0) > 0.01) {
    throw new Error(`Score weights must sum to 1.0, got ${total.toFixed(3)}`);
  }

  const skillsComponent = scoreRequirementGroup(matchResult, 'required_skill', 'Skills', weights.skills);
  // For technology we combine required_skill + technology categories for techs
  const techComponent = scoreRequirementGroup(matchResult, 'technology', 'Technologies', weights.technology);
  const keywordsComponent = scoreKeywords(matchResult, weights.keywords);
  const experienceComponent = scoreExperience(matchResult, weights.experience);
  const educationComponent = scoreEducation(matchResult, weights.education);
  const certComponent = scoreRequirementGroup(matchResult, 'certification', 'Certifications', weights.certification);
  const respComponent = scoreResponsibilities(matchResult, weights.responsibility);

  const components = {
    skills: skillsComponent,
    technology: techComponent,
    keywords: keywordsComponent,
    experience: experienceComponent,
    education: educationComponent,
    certification: certComponent,
    responsibility: respComponent,
  };

  // Overall score = sum of weighted contributions
  const raw = Object.values(components).reduce((sum, c) => sum + c.contribution, 0);
  const overallScore = Math.min(100, Math.max(0, Math.round(raw * 10) / 10));

  const recommendations = buildRecommendations(matchResult, components);

  return {
    overallScore,
    components,
    interpretation: interpretScore(overallScore),
    weightsUsed: weights,
    scoringVersion: SCORING_VERSION,
    recommendations,
  };
}
