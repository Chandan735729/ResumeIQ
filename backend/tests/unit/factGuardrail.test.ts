/**
 * Unit Tests: Deterministic Fact-Checking & Hallucination Guardrails
 */

import {
  extractMetrics,
  extractTechFromText,
  extractCertsFromText,
  factCheckChange,
  runFactGuardrails,
} from '@services/ai/guardrails/factGuardrail';
import type { RawOptimizationChange } from '@services/ai/guardrails/schemaValidator';

describe('Fact Guardrail Engine', () => {
  const originalResumeText = `
John Doe — Backend Developer
Experience at Acme Corp (2020-2023):
- Developed backend APIs using Python and PostgreSQL.
- Collaborated with 5 team members to improve database performance.
Skills: Python, PostgreSQL, Git, Linux
Education: B.S. in Computer Science
  `;

  const originalSkills = ['Python', 'PostgreSQL', 'Git', 'Linux'];

  describe('Extraction Helpers', () => {
    it('extracts percentages, currencies, and multipliers', () => {
      const text = 'Improved throughput by 45.5%, saving $2.5M annually with a 10x performance boost.';
      const metrics = extractMetrics(text);
      expect(metrics).toContain('45.5%');
      expect(metrics).toContain('$2.5M');
      expect(metrics).toContain('10x');
    });

    it('extracts known technologies from text', () => {
      const text = 'Expert in Python, TypeScript, and Docker containerization.';
      const techs = extractTechFromText(text);
      expect(techs.has('python')).toBe(true);
      expect(techs.has('typescript')).toBe(true);
      expect(techs.has('docker')).toBe(true);
    });

    it('extracts certifications from text', () => {
      const text = 'Certified Scrum Master and AWS Certified Solutions Architect.';
      const certs = extractCertsFromText(text);
      expect(certs.has('certified scrum master')).toBe(true);
      expect(certs.has('aws certified solutions architect') || certs.has('aws certified')).toBe(true);
    });
  });

  describe('Hallucination Rejection (Fact Guardrails)', () => {
    it('approves legitimate phrasing improvements based on existing facts', () => {
      const change: RawOptimizationChange = {
        section: 'experience',
        original: 'Developed backend APIs using Python and PostgreSQL.',
        suggested: 'Architected scalable backend REST APIs utilizing Python and PostgreSQL database systems.',
        reason: 'Improved clarity and terminology.',
        evidence: ['Python', 'PostgreSQL'],
      };

      const result = factCheckChange(change, originalResumeText, originalSkills);
      expect(result.isApproved).toBe(true);
      expect(result.rejectionReason).toBeUndefined();
    });

    it('rejects fabricated technologies (e.g. adding AWS when resume has no AWS)', () => {
      const change: RawOptimizationChange = {
        section: 'experience',
        original: 'Developed backend APIs using Python and PostgreSQL.',
        suggested: 'Deployed Python REST APIs to AWS Lambda and Amazon S3.',
        reason: 'Adding cloud keywords.',
        evidence: ['Python'],
      };

      const result = factCheckChange(change, originalResumeText, originalSkills);
      expect(result.isApproved).toBe(false);
      expect(result.rejectionReason).toContain('FABRICATED_TECHNOLOGY');
      expect(result.rejectionReason).toContain('aws');
    });

    it('rejects fabricated certifications', () => {
      const change: RawOptimizationChange = {
        section: 'skills',
        original: 'Git, Linux',
        suggested: 'Git, Linux, AWS Certified Solutions Architect',
        reason: 'Adding certification.',
        evidence: [],
      };

      const result = factCheckChange(change, originalResumeText, originalSkills);
      expect(result.isApproved).toBe(false);
      expect(result.rejectionReason).toContain('FABRICATED_CERTIFICATION');
    });

    it('rejects fabricated numeric metrics (e.g. inventing 50% improvement)', () => {
      const change: RawOptimizationChange = {
        section: 'experience',
        original: 'Collaborated with 5 team members to improve database performance.',
        suggested: 'Optimized PostgreSQL database performance resulting in a 50% latency reduction.',
        reason: 'Quantifying impact.',
        evidence: ['PostgreSQL'],
      };

      const result = factCheckChange(change, originalResumeText, originalSkills);
      expect(result.isApproved).toBe(false);
      expect(result.rejectionReason).toContain('FABRICATED_METRIC');
      expect(result.rejectionReason).toContain('50%');
    });

    it('allows metrics that already exist in original text', () => {
      const textWithMetric = originalResumeText + ' Reduced build times by 30%.';
      const change: RawOptimizationChange = {
        section: 'experience',
        original: 'Reduced build times by 30%.',
        suggested: 'Optimized internal build workflows, achieving a 30% build time reduction.',
        reason: 'Polished phrasing.',
        evidence: ['30%'],

      };

      const result = factCheckChange(change, textWithMetric, originalSkills);
      expect(result.isApproved).toBe(true);
    });
  });

  describe('runFactGuardrails batch processing', () => {
    it('separates approved and rejected changes and compiles warnings', () => {
      const changes: RawOptimizationChange[] = [
        {
          section: 'experience',
          original: 'Developed backend APIs using Python and PostgreSQL.',
          suggested: 'Engineered REST APIs using Python and PostgreSQL.',
          reason: 'Valid phrasing',
          evidence: ['Python', 'PostgreSQL'],
        },
        {
          section: 'experience',
          original: 'Developed backend APIs using Python and PostgreSQL.',
          suggested: 'Built Kubernetes clusters with AWS EKS.',
          reason: 'Hallucinated cloud',
          evidence: [],
        },
      ];

      const report = runFactGuardrails(changes, originalResumeText, originalSkills);
      expect(report.totalProposed).toBe(2);
      expect(report.totalApproved).toBe(1);
      expect(report.totalRejected).toBe(1);
      expect(report.approvedChanges[0].suggested).toContain('Engineered REST APIs');
      expect(report.rejectedChanges[0].rejectionReason).toContain('FABRICATED_TECHNOLOGY');
    });
  });
});
