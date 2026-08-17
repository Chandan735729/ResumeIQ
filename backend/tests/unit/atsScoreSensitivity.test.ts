/**
 * ATS Score Sensitivity — Controlled Experiment (Phase 10)
 *
 * Proves the deterministic scoring engine is actually responsive to resume
 * content, with no AI/mock provider involved at all. This is deliberately
 * the cleanest possible proof: the same pure functions the optimization
 * pipeline calls (`matchResumeToJob` + `computeATSScore`), exercised with a
 * single controlled variable (one JD-required skill present vs. absent).
 */

import { computeATSScore } from '@services/atsScorer.service';
import { matchResumeToJob } from '@services/matchingEngine.service';
import { extractJobDescription } from '@services/jdExtractor.service';
import type { ResumeMatchInput } from '@services/matchingEngine.service';

const JD_TEXT = `
Senior Backend Engineer

Requirements:
- Python
- Kubernetes
- PostgreSQL

Education: Bachelor's degree in Computer Science required
`;

const job = extractJobDescription(JD_TEXT, 'Senior Backend Engineer', null);

function buildResume(skills: string[]): ResumeMatchInput {
  return {
    skills,
    experience: [
      {
        title: 'Backend Engineer',
        company: 'Acme Corp',
        startDate: 'Jan 2020',
        endDate: 'Present',
        isCurrent: true,
        bullets: ['Built backend services.'],
      },
    ],
    education: [{ institution: 'State University', degree: "Bachelor's in Computer Science" }],
    certifications: [],
    projectTechnologies: [],
    rawText: `Backend Engineer at Acme Corp. ${skills.join(' ')}`,
  };
}

describe('ATS Score Sensitivity (deterministic, no AI involved)', () => {
  it('score increases when a JD-required missing skill is added, and reverts when removed', () => {
    const missing = buildResume(['Python', 'PostgreSQL']); // Kubernetes absent
    const withKeyword = buildResume(['Python', 'PostgreSQL', 'Kubernetes']);
    const removedAgain = buildResume(['Python', 'PostgreSQL']);

    const missingScore = computeATSScore(matchResumeToJob(missing, job));
    const withKeywordScore = computeATSScore(matchResumeToJob(withKeyword, job));
    const removedAgainScore = computeATSScore(matchResumeToJob(removedAgain, job));

    // 1. Adding the missing, JD-required, genuinely-possessed skill must move the score up.
    // Python/Kubernetes/PostgreSQL are classified as 'technology' requirements
    // by the JD extractor (isLikelyTechnology), so that's the component this
    // specific change should move -- see atsScorer.service.ts:384.
    expect(withKeywordScore.overallScore).toBeGreaterThan(missingScore.overallScore);
    expect(withKeywordScore.components.technology.earned).toBeGreaterThan(missingScore.components.technology.earned);

    // 2. Removing it again must return the score to exactly where it started (determinism + reversibility).
    expect(removedAgainScore.overallScore).toBe(missingScore.overallScore);
    expect(removedAgainScore.components.technology.earned).toBe(missingScore.components.technology.earned);
  });

  it('same resume + same JD scored twice produces an identical result (pure function, no hidden state)', () => {
    const resume = buildResume(['Python', 'Kubernetes', 'PostgreSQL']);
    const first = computeATSScore(matchResumeToJob(resume, job));
    const second = computeATSScore(matchResumeToJob(resume, job));
    expect(second).toEqual(first);
  });

  it('adding an UNRELATED skill (not required by the JD) does not move the score', () => {
    const base = buildResume(['Python', 'PostgreSQL', 'Kubernetes']);
    const withUnrelated = buildResume(['Python', 'PostgreSQL', 'Kubernetes', 'Figma']);

    const baseScore = computeATSScore(matchResumeToJob(base, job));
    const unrelatedScore = computeATSScore(matchResumeToJob(withUnrelated, job));

    expect(unrelatedScore.overallScore).toBe(baseScore.overallScore);
  });
});
