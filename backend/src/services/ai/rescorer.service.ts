/**
 * Deterministic Re-Scorer Service
 *
 * Recalculates the ATS score after AI optimization using the authoritative
 * mathematical engine from Phase 4. The AI never determines the score.
 */

import { matchResumeToJob } from '../matchingEngine.service';
import { computeATSScore } from '../atsScorer.service';
import type { ResumeMatchInput, MatchResult } from '../matchingEngine.service';
import type { StructuredJobDescription } from '../jdExtractor.service';
import type { ATSScoreResult } from '../atsScorer.service';

export interface ScoreComparisonReport {
  beforeScore: number;
  afterScore: number;
  scoreDelta: number;
  isImproved: boolean;
  beforeInterpretation: string;
  afterInterpretation: string;
  beforeResult: ATSScoreResult;
  afterResult: ATSScoreResult;
  afterMatchResult: MatchResult;
  componentDeltas: {
    skills: number;
    technology: number;
    keywords: number;
    experience: number;
    education: number;
    certification: number;
    responsibility: number;
  };
}

/**
 * Rescores an optimized resume against the target job description deterministically.
 */
export function rescoreOptimizedResume(
  optimizedResume: ResumeMatchInput,
  structuredJD: StructuredJobDescription,
  beforeScoreResult: ATSScoreResult
): ScoreComparisonReport {
  // 1. Run deterministic matching on the optimized resume
  const afterMatchResult = matchResumeToJob(optimizedResume, structuredJD);

  // 2. Run authoritative deterministic scoring
  const afterResult = computeATSScore(afterMatchResult);

  const beforeScore = beforeScoreResult.overallScore;
  const afterScore = afterResult.overallScore;
  const scoreDelta = Math.round((afterScore - beforeScore) * 10) / 10;

  const componentDeltas = {
    skills: Math.round((afterResult.components.skills.earned - beforeScoreResult.components.skills.earned) * 10) / 10,
    technology: Math.round((afterResult.components.technology.earned - beforeScoreResult.components.technology.earned) * 10) / 10,
    keywords: Math.round((afterResult.components.keywords.earned - beforeScoreResult.components.keywords.earned) * 10) / 10,
    experience: Math.round((afterResult.components.experience.earned - beforeScoreResult.components.experience.earned) * 10) / 10,
    education: Math.round((afterResult.components.education.earned - beforeScoreResult.components.education.earned) * 10) / 10,
    certification: Math.round((afterResult.components.certification.earned - beforeScoreResult.components.certification.earned) * 10) / 10,
    responsibility: Math.round((afterResult.components.responsibility.earned - beforeScoreResult.components.responsibility.earned) * 10) / 10,
  };

  return {
    beforeScore,
    afterScore,
    scoreDelta,
    isImproved: scoreDelta > 0,
    beforeInterpretation: beforeScoreResult.interpretation,
    afterInterpretation: afterResult.interpretation,
    beforeResult: beforeScoreResult,
    afterResult,
    afterMatchResult,
    componentDeltas,
  };
}
