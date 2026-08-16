/**
 * Unit Tests: JD Extractor
 */

import { extractJobDescription } from '@services/jdExtractor.service';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures: realistic synthetic job descriptions
// ─────────────────────────────────────────────────────────────────────────────

const SOFTWARE_ENGINEER_JD = `
Senior Software Engineer — Backend

About the Role:
We are looking for a Senior Software Engineer to join our platform team at Acme Corp.
You will be responsible for designing REST APIs, maintaining our PostgreSQL databases,
and improving system reliability.

Requirements:
- 5+ years of professional software engineering experience
- Strong proficiency in Python and TypeScript
- Experience with AWS (Lambda, S3, RDS)
- PostgreSQL and Redis for data storage
- Docker and Kubernetes for container orchestration
- Experience with CI/CD pipelines (GitHub Actions)
- RESTful API design and implementation

Preferred Qualifications:
- Experience with GraphQL
- Familiarity with Terraform
- AWS certifications preferred

Education:
- Bachelor's degree in Computer Science or related field required

Responsibilities:
- Design and build scalable REST APIs
- Lead code reviews and mentor junior engineers
- Work closely with product and data teams
`;

const DATA_ENGINEER_JD = `
Data Engineer

We are seeking a mid-level Data Engineer to build and maintain our data pipelines.

Required Skills:
- Python programming (3+ years)
- Apache Spark or PySpark
- AWS Glue, S3, and Redshift
- SQL and experience with data modeling
- Experience building ETL pipelines

Nice to Have:
- Airflow or similar orchestration
- dbt knowledge

Education:
- Master's degree in Computer Science, Data Science, or Statistics preferred
`;

const MINIMAL_JD = `
Product Manager

We are hiring a Product Manager. Strong communication skills required.
Experience with Agile methodologies desired.
3+ years of experience required.
`;

const EMPTY_JD = `
We are a great company looking for great people.
`;

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('JD Extractor Service', () => {
  describe('Title and seniority normalization', () => {
    it('preserves job title', () => {
      const result = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Senior Software Engineer', 'Acme Corp');
      expect(result.normalizedTitle).toBe('Senior Software Engineer');
    });

    it('detects senior seniority from title', () => {
      const result = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Senior Software Engineer', null);
      expect(result.seniorityLevel).toBe('senior');
    });

    it('detects mid-level seniority', () => {
      const result = extractJobDescription(DATA_ENGINEER_JD, 'Data Engineer', null);
      expect(result.seniorityLevel).toBe('mid');
    });


    it('company name is preserved', () => {
      const result = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Software Engineer', 'Acme Corp');
      expect(result.companyName).toBe('Acme Corp');
    });

    it('null company is preserved', () => {
      const result = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Software Engineer', null);
      expect(result.companyName).toBeNull();
    });
  });

  describe('Skill and technology extraction', () => {
    it('extracts Python from requirements', () => {
      const result = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Backend Engineer', null);
      const values = result.requirements.map(r => r.value);
      expect(values).toContain('python');
    });

    it('extracts TypeScript from requirements', () => {
      const result = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Backend Engineer', null);
      const values = result.requirements.map(r => r.value);
      expect(values).toContain('typescript');
    });

    it('extracts AWS from requirements', () => {
      const result = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Backend Engineer', null);
      const values = result.requirements.map(r => r.value);
      expect(values).toContain('aws');
    });

    it('extracts Docker and Kubernetes', () => {
      const result = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Backend Engineer', null);
      const values = result.requirements.map(r => r.value);
      expect(values).toContain('docker');
      expect(values).toContain('kubernetes');
    });

    it('marks GraphQL as preferred', () => {
      const result = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Backend Engineer', null);
      const graphql = result.requirements.find(r => r.value === 'graphql');
      expect(graphql).toBeDefined();
      expect(graphql?.status).toBe('preferred');
    });

    it('does not duplicate requirements', () => {
      const result = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Backend Engineer', null);
      const values = result.requirements.map(r => r.value);
      const unique = new Set(values);
      expect(values.length).toBe(unique.size);
    });
  });

  describe('Experience extraction', () => {
    it('extracts minimum years of experience', () => {
      const result = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Senior Software Engineer', null);
      expect(result.experience).not.toBeNull();
      expect(result.experience?.minYears).toBe(5);
    });

    it('handles shorter experience requirement', () => {
      const result = extractJobDescription(DATA_ENGINEER_JD, 'Data Engineer', null);
      expect(result.experience?.minYears).toBe(3);
    });

    it('returns null experience for JDs with no mention', () => {
      const result = extractJobDescription(EMPTY_JD, 'Something', null);
      expect(result.experience).toBeNull();
    });
  });

  describe('Education extraction', () => {
    it('extracts bachelor degree requirement', () => {
      const result = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Backend Engineer', null);
      expect(result.education).not.toBeNull();
      expect(result.education?.degreeLevel).toBe('bachelor');
    });

    it('extracts master degree requirement', () => {
      const result = extractJobDescription(DATA_ENGINEER_JD, 'Data Engineer', null);
      expect(result.education?.degreeLevel).toBe('master');
    });

    it('extracts field of study', () => {
      const result = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Backend Engineer', null);
      expect(result.education?.fieldOfStudy).toBe('Computer Science');
    });
  });

  describe('Certification extraction', () => {
    it('detects AWS certification in preferred section', () => {
      const result = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Backend Engineer', null);
      const certs = result.requirements.filter(r => r.category === 'certification');
      expect(certs.length).toBeGreaterThan(0);
    });
  });

  describe('Responsibilities extraction', () => {
    it('extracts responsibility bullets', () => {
      const result = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Backend Engineer', null);
      expect(result.responsibilities.length).toBeGreaterThan(0);
      expect(result.responsibilities.some(r => r.toLowerCase().includes('api'))).toBe(true);
    });
  });

  describe('Keywords extraction', () => {
    it('extracts high-frequency keywords', () => {
      const result = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Backend Engineer', null);
      expect(result.keywords.length).toBeGreaterThan(0);
    });
  });

  describe('Determinism', () => {
    it('same input always produces same output', () => {
      const result1 = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Senior Software Engineer', 'Acme');
      const result2 = extractJobDescription(SOFTWARE_ENGINEER_JD, 'Senior Software Engineer', 'Acme');

      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  describe('Edge cases', () => {
    it('handles JDs with no clear sections', () => {
      const result = extractJobDescription(EMPTY_JD, 'Product', null);
      expect(result).toBeDefined();
      expect(result.normalizedTitle).toBe('Product');
    });

    it('handles JD with only soft skills', () => {
      const result = extractJobDescription(MINIMAL_JD, 'Product Manager', null);
      expect(result).toBeDefined();
      expect(result.experience?.minYears).toBe(3);
    });
  });
});
