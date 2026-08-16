/**
 * Unit Tests: ATS Scorer
 * Tests scoring model, component breakdown, determinism, and weight validation.
 */

import { computeATSScore, DEFAULT_WEIGHTS, SCORING_VERSION } from '@services/atsScorer.service';
import { matchResumeToJob } from '@services/matchingEngine.service';
import { extractJobDescription } from '@services/jdExtractor.service';
import type { ResumeMatchInput } from '@services/matchingEngine.service';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const JD_TEXT = `
Senior Backend Engineer

Requirements:
- 5+ years of experience
- Python, TypeScript
- AWS, Docker, Kubernetes
- PostgreSQL
- REST API design

Education: Bachelor's degree in Computer Science required
`;

const PERFECT_RESUME: ResumeMatchInput = {
  skills: ['Python', 'TypeScript', 'AWS', 'Docker', 'Kubernetes', 'PostgreSQL', 'REST API'],
  experience: [
    {
      title: 'Senior Engineer',
      company: 'BigCo',
      startDate: 'Jan 2018',
      endDate: 'Present',
      isCurrent: true,
      bullets: ['Built Python REST APIs', 'Deployed with Docker/K8s on AWS'],
    },
  ],
  education: [{ institution: 'State University', degree: "Bachelor's in Computer Science" }],
  certifications: [],
  projectTechnologies: [],
  rawText: 'Python TypeScript AWS Docker Kubernetes PostgreSQL REST API backend engineer',
};

const EMPTY_RESUME: ResumeMatchInput = {
  skills: [],
  experience: [],
  education: [],
  certifications: [],
  projectTechnologies: [],
  rawText: '',
};

const job = extractJobDescription(JD_TEXT, 'Senior Backend Engineer', null);

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ATS Scorer', () => {
  describe('Score structure', () => {
    it('returns all required fields', () => {
      const match = matchResumeToJob(PERFECT_RESUME, job);
      const score = computeATSScore(match);

      expect(score).toHaveProperty('overallScore');
      expect(score).toHaveProperty('components');
      expect(score).toHaveProperty('interpretation');
      expect(score).toHaveProperty('weightsUsed');
      expect(score).toHaveProperty('scoringVersion');
      expect(score).toHaveProperty('recommendations');
    });

    it('includes all 7 score components', () => {
      const match = matchResumeToJob(PERFECT_RESUME, job);
      const score = computeATSScore(match);

      expect(score.components).toHaveProperty('skills');
      expect(score.components).toHaveProperty('technology');
      expect(score.components).toHaveProperty('keywords');
      expect(score.components).toHaveProperty('experience');
      expect(score.components).toHaveProperty('education');
      expect(score.components).toHaveProperty('certification');
      expect(score.components).toHaveProperty('responsibility');
    });

    it('uses the expected scoring version', () => {
      const match = matchResumeToJob(PERFECT_RESUME, job);
      const score = computeATSScore(match);
      expect(score.scoringVersion).toBe(SCORING_VERSION);
    });
  });

  describe('Score range', () => {
    it('overall score is between 0 and 100', () => {
      const match = matchResumeToJob(PERFECT_RESUME, job);
      const score = computeATSScore(match);
      expect(score.overallScore).toBeGreaterThanOrEqual(0);
      expect(score.overallScore).toBeLessThanOrEqual(100);
    });

    it('each component earned score is 0-100', () => {
      const match = matchResumeToJob(PERFECT_RESUME, job);
      const score = computeATSScore(match);
      for (const component of Object.values(score.components)) {
        expect(component.earned).toBeGreaterThanOrEqual(0);
        expect(component.earned).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('Case 1: Score determinism', () => {
    it('same resume + same JD → same score every time', () => {
      const match1 = matchResumeToJob(PERFECT_RESUME, job);
      const match2 = matchResumeToJob(PERFECT_RESUME, job);
      const score1 = computeATSScore(match1);
      const score2 = computeATSScore(match2);
      expect(score1.overallScore).toBe(score2.overallScore);
      expect(JSON.stringify(score1.components)).toBe(JSON.stringify(score2.components));
    });
  });

  describe('Case 2: Perfect match → high score', () => {
    it('strong resume scores above 70', () => {
      const match = matchResumeToJob(PERFECT_RESUME, job);
      const score = computeATSScore(match);
      expect(score.overallScore).toBeGreaterThan(70);
    });

    it('perfect match scores strong interpretation', () => {
      const match = matchResumeToJob(PERFECT_RESUME, job);
      const score = computeATSScore(match);
      expect(['strong', 'good']).toContain(score.interpretation);
    });
  });

  describe('Case 3: Empty resume → low score', () => {
    it('empty resume scores below 60', () => {
      const match = matchResumeToJob(EMPTY_RESUME, job);
      const score = computeATSScore(match);
      expect(score.overallScore).toBeLessThan(60);
    });

    it('empty resume gets weak or fair interpretation', () => {
      const match = matchResumeToJob(EMPTY_RESUME, job);
      const score = computeATSScore(match);
      expect(['weak', 'fair']).toContain(score.interpretation);
    });
  });

  describe('Case 4: No requirements JD → defined behavior', () => {
    it('JD with no requirements returns score without error', () => {
      const emptyJD = extractJobDescription(
        'We are hiring. Please apply.',
        'Product Manager',
        null,
      );
      const match = matchResumeToJob(PERFECT_RESUME, emptyJD);
      const score = computeATSScore(match);
      expect(score.overallScore).toBeGreaterThanOrEqual(0);
      expect(score.overallScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Strong > Weak ordering', () => {
    it('strong resume scores higher than empty resume', () => {
      const matchStrong = matchResumeToJob(PERFECT_RESUME, job);
      const matchWeak = matchResumeToJob(EMPTY_RESUME, job);
      const scoreStrong = computeATSScore(matchStrong);
      const scoreWeak = computeATSScore(matchWeak);
      expect(scoreStrong.overallScore).toBeGreaterThan(scoreWeak.overallScore);
    });
  });

  describe('Weight validation', () => {
    it('default weights sum to 1.0', () => {
      const total = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(Math.abs(total - 1.0)).toBeLessThan(0.001);
    });

    it('throws on invalid weights that do not sum to 1', () => {
      const match = matchResumeToJob(PERFECT_RESUME, job);
      expect(() =>
        computeATSScore(match, {
          skills: 0.5,
          technology: 0.5,
          keywords: 0.5,
          experience: 0.5,
          education: 0.5,
          certification: 0.5,
          responsibility: 0.5,
        }),
      ).toThrow();
    });
  });

  describe('Recommendations', () => {
    it('returns recommendations array', () => {
      const match = matchResumeToJob(EMPTY_RESUME, job);
      const score = computeATSScore(match);
      expect(Array.isArray(score.recommendations)).toBe(true);
      expect(score.recommendations.length).toBeGreaterThan(0);
    });

    it('returns empty or short recommendations for perfect match', () => {
      const match = matchResumeToJob(PERFECT_RESUME, job);
      const score = computeATSScore(match);
      // Should have fewer recommendations since most are matched
      expect(score.recommendations.length).toBeLessThan(5);
    });
  });

  describe('Component explanations', () => {
    it('each component has a non-empty explanation', () => {
      const match = matchResumeToJob(PERFECT_RESUME, job);
      const score = computeATSScore(match);
      for (const component of Object.values(score.components)) {
        expect(typeof component.explanation).toBe('string');
        expect(component.explanation.length).toBeGreaterThan(0);
      }
    });
  });
});
