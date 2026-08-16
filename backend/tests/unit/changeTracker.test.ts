/**
 * Unit Tests: Change Tracker & Diff Engine
 */

import { applyChangesToResume } from '@services/ai/changeTracker';
import type { ValidatedChange } from '@services/ai/guardrails/factGuardrail';
import type { ResumeMatchInput } from '@services/matchingEngine.service';

describe('Change Tracker & Diff Engine', () => {
  const originalResume: ResumeMatchInput = {
    skills: ['Python', 'PostgreSQL'],
    experience: [
      {
        title: 'Backend Dev',
        company: 'Acme',
        startDate: '2021',
        endDate: 'Present',
        isCurrent: true,
        bullets: ['Built APIs with Python.', 'Maintained database tables.'],
        summary: 'Dev',
      },
    ],
    education: [{ institution: 'State U', degree: 'B.S.' }],
    certifications: [],
    projectTechnologies: [],
    rawText: 'Backend Dev at Acme. Built APIs with Python. Maintained database tables.',
  };

  it('applies approved changes and produces structured diffs', () => {
    const approvedChanges: ValidatedChange[] = [
      {
        section: 'experience',
        itemId: 'exp-1',
        original: 'Built APIs with Python.',
        suggested: 'Engineered RESTful APIs with Python and PostgreSQL.',
        reason: 'Added verified database keyword',
        evidence: ['Python', 'PostgreSQL'],
        isApproved: true,
      },
    ];

    const rejectedChanges: ValidatedChange[] = [
      {
        section: 'experience',
        original: 'Maintained database tables.',
        suggested: 'Deployed AWS Cloud infrastructure.',
        reason: 'Invalid hallucination',
        evidence: [],
        isApproved: false,
        rejectionReason: 'FABRICATED_TECHNOLOGY: aws',
      },
    ];

    const diff = applyChangesToResume(
      originalResume,
      approvedChanges,
      rejectedChanges,
      'Senior Python Developer with PostgreSQL expertise.'
    );

    expect(diff.totalChangesProposed).toBe(2);
    expect(diff.totalChangesApplied).toBe(1);
    expect(diff.totalChangesRejected).toBe(1);
    expect(diff.optimizedText).toContain('Engineered RESTful APIs with Python and PostgreSQL.');
    expect(diff.optimizedText).not.toContain('Deployed AWS Cloud');
    expect(diff.optimizedText).toContain('Senior Python Developer with PostgreSQL expertise.');
    expect(diff.optimizedLayout.experience[0].bullets[0]).toBe('Engineered RESTful APIs with Python and PostgreSQL.');
  });
});
