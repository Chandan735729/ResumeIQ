/**
 * Unit Tests: Skill Aliases
 */

import {
  normalizeSkill,
  resolveCanonical,
  areSkillsEquivalent,
  findSkillMatch,
  skillMentionedInText,
} from '@services/skillAliases';

describe('Skill Alias System', () => {
  describe('normalizeSkill', () => {
    it('lowercases and collapses whitespace', () => {
      expect(normalizeSkill('  JavaScript  ')).toBe('javascript');
      expect(normalizeSkill('Node.JS')).toBe('node.js');
      expect(normalizeSkill('Amazon  Web  Services')).toBe('amazon web services');
    });
  });

  describe('resolveCanonical', () => {
    it('resolves known aliases to canonical', () => {
      expect(resolveCanonical('JS')).toBe('javascript');
      expect(resolveCanonical('Postgres')).toBe('postgresql');
      expect(resolveCanonical('k8s')).toBe('kubernetes');
      expect(resolveCanonical('AWS')).toBe('aws');
      expect(resolveCanonical('Amazon Web Services')).toBe('aws');
      expect(resolveCanonical('TS')).toBe('typescript');
      expect(resolveCanonical('Node.js')).toBe('nodejs');
      expect(resolveCanonical('React.js')).toBe('react');
    });

    it('returns normalized form for unknown skill', () => {
      expect(resolveCanonical('FooBarBaz')).toBe('foobarbaz');
    });
  });

  describe('areSkillsEquivalent', () => {
    it('matches aliases correctly', () => {
      expect(areSkillsEquivalent('JavaScript', 'JS')).toBe(true);
      expect(areSkillsEquivalent('postgresql', 'Postgres')).toBe(true);
      expect(areSkillsEquivalent('Kubernetes', 'K8s')).toBe(true);
      expect(areSkillsEquivalent('AWS', 'Amazon Web Services')).toBe(true);
    });

    it('does not match unrelated skills', () => {
      expect(areSkillsEquivalent('Python', 'JavaScript')).toBe(false);
      expect(areSkillsEquivalent('Docker', 'Kubernetes')).toBe(false);
    });
  });

  describe('findSkillMatch', () => {
    it('finds exact match', () => {
      const result = findSkillMatch(['Python', 'TypeScript', 'AWS'], 'TypeScript');
      expect(result).toBe('TypeScript');
    });

    it('finds alias match', () => {
      const result = findSkillMatch(['Python', 'Postgres', 'Docker'], 'PostgreSQL');
      expect(result).toBe('Postgres');
    });

    it('finds JS alias for JavaScript requirement', () => {
      const result = findSkillMatch(['JS', 'React', 'Node.js'], 'JavaScript');
      expect(result).toBe('JS');
    });

    it('returns null for missing skill', () => {
      const result = findSkillMatch(['Python', 'Flask'], 'Kubernetes');
      expect(result).toBeNull();
    });
  });

  describe('skillMentionedInText', () => {
    it('detects skill in text', () => {
      expect(skillMentionedInText('Docker', 'We use Docker and Kubernetes for deployments')).toBe(true);
    });

    it('avoids false positive for short tokens within words', () => {
      // 'go' should not match 'algorithm'
      expect(skillMentionedInText('go', 'We need a strong algorithm background')).toBe(false);
    });

    it('detects skill with surrounding punctuation', () => {
      expect(skillMentionedInText('Python', 'Experience with Python, Django, and FastAPI')).toBe(true);
    });

    it('is case insensitive', () => {
      expect(skillMentionedInText('kubernetes', 'Kubernetes orchestration required')).toBe(true);
    });
  });
});
