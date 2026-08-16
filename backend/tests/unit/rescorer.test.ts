/**
 * Unit Tests: Deterministic Re-Scorer
 */

import { rescoreOptimizedResume } from '@services/ai/rescorer.service';
import { extractJobDescription } from '@services/jdExtractor.service';
import { matchResumeToJob } from '@services/matchingEngine.service';
import { computeATSScore } from '@services/atsScorer.service';
import type { ResumeMatchInput } from '@services/matchingEngine.service';

describe('Deterministic Re-Scorer Service', () => {
  const jdText = `
Senior Software Engineer
Requirements:
- 5+ years of experience
- Python and TypeScript required
- PostgreSQL and Redis required
Education: Bachelor's degree in Computer Science
  `;
  const structuredJD = extractJobDescription(jdText, 'Senior Software Engineer');

  const beforeResume: ResumeMatchInput = {
    skills: ['Python'],
    experience: [
      {
        title: 'Developer',
        company: 'Tech',
        startDate: '2018',
        endDate: 'Present',
        isCurrent: true,
        bullets: ['Wrote Python code.'],
      },
    ],
    education: [{ institution: 'Univ', degree: 'Bachelor of Science in Computer Science' }],
    certifications: [],
    projectTechnologies: [],
    rawText: 'Developer at Tech. Wrote Python code. Bachelor of Science in Computer Science.',
  };

  const beforeMatch = matchResumeToJob(beforeResume, structuredJD);
  const beforeScore = computeATSScore(beforeMatch);

  it('re-scores optimized resume and calculates score deltas accurately', () => {
    // Candidate genuine addition: making PostgreSQL explicit where candidate worked with it
    const afterResume: ResumeMatchInput = {
      ...beforeResume,
      skills: ['Python', 'PostgreSQL'],
      rawText: 'Developer at Tech. Wrote Python code with PostgreSQL databases. Bachelor of Science in Computer Science.',
    };

    const report = rescoreOptimizedResume(afterResume, structuredJD, beforeScore);

    expect(report.beforeScore).toBe(beforeScore.overallScore);
    expect(report.afterScore).toBeGreaterThanOrEqual(report.beforeScore);
    expect(report.scoreDelta).toBe(Math.round((report.afterScore - report.beforeScore) * 10) / 10);
    expect(report.componentDeltas).toHaveProperty('skills');
    expect(report.componentDeltas).toHaveProperty('technology');
  });

  it('reports isImproved=false if optimization does not improve score', () => {
    // No relevant changes made
    const report = rescoreOptimizedResume(beforeResume, structuredJD, beforeScore);
    expect(report.scoreDelta).toBe(0);
    expect(report.isImproved).toBe(false);
  });
});
