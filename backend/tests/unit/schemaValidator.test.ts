/**
 * Unit Tests: Schema Validation Guardrails
 */

import {
  validateOptimizationSchema,
  cleanJsonText,
} from '@services/ai/guardrails/schemaValidator';

describe('Schema Validator Guardrail', () => {
  describe('cleanJsonText', () => {
    it('strips markdown code fences from json string', () => {
      const wrapped = '```json\n{\n  "key": "value"\n}\n```';
      expect(cleanJsonText(wrapped)).toBe('{\n  "key": "value"\n}');
    });

    it('strips generic code fences', () => {
      const wrapped = '```\n{"key": "value"}\n```';
      expect(cleanJsonText(wrapped)).toBe('{"key": "value"}');
    });

    it('leaves clean json untouched', () => {
      const raw = '{"key": "value"}';
      expect(cleanJsonText(raw)).toBe('{"key": "value"}');
    });
  });

  describe('validateOptimizationSchema', () => {
    it('accepts valid schema conforming JSON', () => {
      const valid = JSON.stringify({
        summarySuggestion: 'Experienced engineer with Python background.',
        changes: [
          {
            section: 'experience',
            itemId: 'exp-1',
            original: 'Wrote code.',
            suggested: 'Engineered REST APIs using Python.',
            reason: 'Improved active phrasing.',
            evidence: ['Python'],
          },
        ],
        preservedFacts: ['Acme Corp', 'Python'],
        warnings: [],
      });

      const res = validateOptimizationSchema(valid);
      expect(res.isValid).toBe(true);
      expect(res.data).not.toBeNull();
      expect(res.data?.changes.length).toBe(1);
    });

    it('rejects empty output', () => {
      const res = validateOptimizationSchema('');
      expect(res.isValid).toBe(false);
      expect(res.errors).toContain('AI output is empty.');
    });

    it('rejects malformed JSON', () => {
      const res = validateOptimizationSchema('{ broken json:');
      expect(res.isValid).toBe(false);
      expect(res.errors[0]).toContain('Failed to parse AI output as JSON');
    });

    it('rejects changes missing required fields', () => {
      const missingOriginal = JSON.stringify({
        changes: [
          {
            section: 'experience',
            suggested: 'New text',
            reason: 'Some reason',
          },
        ],
      });

      const res = validateOptimizationSchema(missingOriginal);
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => e.includes('original'))).toBe(true);
    });

    it('rejects invalid section names', () => {
      const invalidSection = JSON.stringify({
        changes: [
          {
            section: 'hobbies_and_passions',
            original: 'Old text',
            suggested: 'New text',
            reason: 'Some reason',
          },
        ],
      });

      const res = validateOptimizationSchema(invalidSection);
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => e.includes('invalid section'))).toBe(true);
    });

    it('rejects non-array changes field', () => {
      const badChanges = JSON.stringify({
        changes: 'not-an-array',
      });

      const res = validateOptimizationSchema(badChanges);
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => e.includes('must be an array'))).toBe(true);
    });
  });
});
