/**
 * Unit Tests: Matching Engine
 */

import { matchResumeToJob, layoutToMatchInput } from '@services/matchingEngine.service';
import { extractJobDescription } from '@services/jdExtractor.service';
import type { ResumeMatchInput } from '@services/matchingEngine.service';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const STRONG_RESUME: ResumeMatchInput = {
  skills: ['Python', 'TypeScript', 'PostgreSQL', 'AWS', 'Docker', 'Kubernetes', 'CI/CD', 'REST API'],
  experience: [
    {
      title: 'Senior Software Engineer',
      company: 'Acme Corp',
      startDate: 'Jan 2019',
      endDate: 'Present',
      isCurrent: true,
      bullets: [
        'Designed and built REST APIs serving 1M+ daily requests using Python and FastAPI.',
        'Deployed containerized services with Docker and Kubernetes on AWS.',
        'Set up CI/CD pipelines using GitHub Actions.',
      ],
      summary: 'Senior backend engineer',
    },
  ],
  education: [
    { institution: 'MIT', degree: 'Bachelor of Science', fieldOfStudy: 'Computer Science' },
  ],
  certifications: [{ name: 'AWS Certified Solutions Architect', authority: 'Amazon' }],
  projectTechnologies: ['TypeScript', 'React'],
  rawText: 'Python TypeScript PostgreSQL AWS Docker Kubernetes REST API GitHub Actions CI/CD',
};

const WEAK_RESUME: ResumeMatchInput = {
  skills: ['HTML', 'CSS', 'WordPress'],
  experience: [
    {
      title: 'Web Designer',
      company: 'Studio X',
      startDate: 'Jan 2023',
      endDate: 'Present',
      isCurrent: true,
      bullets: ['Designed marketing websites using WordPress.'],
    },
  ],
  education: [{ institution: 'Community College', degree: 'Associate of Arts' }],
  certifications: [],
  projectTechnologies: ['CSS', 'HTML'],
  rawText: 'HTML CSS WordPress web design',
};

const ALIAS_RESUME: ResumeMatchInput = {
  skills: ['JS', 'TS', 'Postgres', 'Node.js', 'K8s', 'Amazon Web Services'],
  experience: [],
  education: [],
  certifications: [],
  projectTechnologies: [],
  rawText: 'JS TS Postgres Node.js K8s Amazon Web Services',
};

const BACKEND_JD_TEXT = `
Senior Software Engineer Requirements:
- 5+ years of experience
- Python and TypeScript required
- AWS required (Lambda, S3)
- PostgreSQL database experience
- Docker and Kubernetes for container management
- CI/CD experience required
- REST API design

Education: Bachelor's degree in Computer Science required

Certifications: AWS certified preferred
`;

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Matching Engine', () => {
  const job = extractJobDescription(BACKEND_JD_TEXT, 'Senior Software Engineer', 'Acme');

  describe('Strong resume match', () => {
    const result = matchResumeToJob(STRONG_RESUME, job);

    it('has matched requirements', () => {
      expect(result.matched.length).toBeGreaterThan(0);
    });

    it('Python is matched in skills section', () => {
      const pythonMatch = result.matched.find(
        r => r.requirement.value === 'python',
      );
      expect(pythonMatch).toBeDefined();
      expect(pythonMatch?.status).toBe('matched');
      expect(pythonMatch?.evidenceSource).toBe('skills');
    });

    it('AWS is matched via skills', () => {
      const awsMatch = result.matched.find(r => r.requirement.value === 'aws');
      expect(awsMatch).toBeDefined();
    });

    it('Docker and Kubernetes matched', () => {
      const dockerMatch = result.matched.find(r => r.requirement.value === 'docker');
      const k8sMatch = result.matched.find(r => r.requirement.value === 'kubernetes');
      expect(dockerMatch?.status).toBe('matched');
      expect(k8sMatch?.status).toBe('matched');
    });

    it('experience matches 5+ year requirement', () => {
      expect(result.experienceMatch.status).toBe('matched');
      expect(result.experienceMatch.estimatedYears).toBeGreaterThanOrEqual(5);
    });

    it('education matches bachelor requirement', () => {
      expect(result.educationMatch.status).toBe('matched');
      expect(result.educationMatch.resumeLevel).toBe('bachelor');
    });
  });

  describe('Weak resume match', () => {
    const result = matchResumeToJob(WEAK_RESUME, job);

    it('has many missing requirements', () => {
      expect(result.missing.length).toBeGreaterThan(result.matched.length);
    });

    it('Python is missing', () => {
      const pythonResult = result.requirementMatches.find(r => r.requirement.value === 'python');
      expect(pythonResult?.status).toBe('missing');
    });

    it('experience is missing (2y < 5y required)', () => {
      // Web Designer started Jan 2023; requirement is 5+ years → well below
      expect(['missing', 'partial']).toContain(result.experienceMatch.status);
    });
  });

  describe('Alias matching', () => {
    const result = matchResumeToJob(ALIAS_RESUME, job);

    it('JS matches JavaScript/TypeScript requirement', () => {
      // TS alias for TypeScript
      const tsMatch = result.requirementMatches.find(r => r.requirement.value === 'typescript');
      expect(tsMatch?.status).toBe('matched');
    });

    it('Postgres matches PostgreSQL requirement', () => {
      const pgMatch = result.requirementMatches.find(r => r.requirement.value === 'postgresql');
      expect(pgMatch?.status).toBe('matched');
    });

    it('K8s matches Kubernetes requirement', () => {
      const k8sMatch = result.requirementMatches.find(r => r.requirement.value === 'kubernetes');
      expect(k8sMatch?.status).toBe('matched');
    });

    it('Amazon Web Services matches AWS requirement', () => {
      const awsMatch = result.requirementMatches.find(r => r.requirement.value === 'aws');
      expect(awsMatch?.status).toBe('matched');
    });
  });

  describe('Evidence tracing', () => {
    const result = matchResumeToJob(STRONG_RESUME, job);

    it('matched requirements have non-null evidence', () => {
      for (const r of result.matched) {
        expect(r.evidence).not.toBeNull();
        expect(r.evidenceSource).not.toBeNull();
      }
    });

    it('missing requirements have null evidence', () => {
      for (const r of result.missing) {
        expect(r.evidence).toBeNull();
        expect(r.evidenceSource).toBeNull();
      }
    });
  });

  describe('Keyword matching', () => {
    it('counts matched and missing keywords', () => {
      const result = matchResumeToJob(STRONG_RESUME, job);
      expect(result.keywordMatch.matched.length).toBeGreaterThan(0);
      expect(result.keywordMatch.matchRate).toBeGreaterThan(0);
    });

    it('matchRate is between 0 and 1', () => {
      const strong = matchResumeToJob(STRONG_RESUME, job);
      const weak = matchResumeToJob(WEAK_RESUME, job);
      expect(strong.keywordMatch.matchRate).toBeGreaterThanOrEqual(0);
      expect(strong.keywordMatch.matchRate).toBeLessThanOrEqual(1);
      expect(weak.keywordMatch.matchRate).toBeGreaterThanOrEqual(0);
      expect(weak.keywordMatch.matchRate).toBeLessThanOrEqual(1);
    });
  });

  describe('Determinism', () => {
    it('same inputs always produce same result', () => {
      const result1 = matchResumeToJob(STRONG_RESUME, job);
      const result2 = matchResumeToJob(STRONG_RESUME, job);
      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  describe('layoutToMatchInput', () => {
    it('parses valid extractedLayout JSON', () => {
      const layout = JSON.stringify({
        skills: ['Python', 'AWS'],
        experience: [],
        education: [],
        certifications: [],
        projects: [{ name: 'X', technologies: ['React'] }],
      });
      const result = layoutToMatchInput(layout, 'Python AWS');
      expect(result).not.toBeNull();
      expect(result?.skills).toEqual(['Python', 'AWS']);
      expect(result?.projectTechnologies).toContain('React');
    });

    it('returns null for null layout', () => {
      expect(layoutToMatchInput(null, 'some text')).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      expect(layoutToMatchInput('{invalid json}', 'text')).toBeNull();
    });
  });
});
