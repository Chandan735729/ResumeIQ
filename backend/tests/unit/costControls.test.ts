/**
 * Unit Tests: AI Cost Controls & Input Size Constraints
 */

import {
  validateAIInputSize,
  MAX_RESUME_INPUT_CHARS,
  MAX_JD_INPUT_CHARS,
} from '@services/ai/costControls';

describe('Cost Controls & Input Size Constraints', () => {
  it('accepts valid input sizes under 50,000 characters', () => {
    const resumeText = 'A'.repeat(5000);
    const jdText = 'B'.repeat(3000);
    const res = validateAIInputSize(resumeText, jdText);
    expect(res.isValid).toBe(true);
  });

  it('rejects oversized resume text exceeding 50,000 characters', () => {
    const resumeText = 'A'.repeat(MAX_RESUME_INPUT_CHARS + 1);
    const jdText = 'Valid JD text';
    const res = validateAIInputSize(resumeText, jdText);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Resume text size');
  });

  it('rejects oversized job description exceeding 50,000 characters', () => {
    const resumeText = 'Valid resume text';
    const jdText = 'B'.repeat(MAX_JD_INPUT_CHARS + 1);
    const res = validateAIInputSize(resumeText, jdText);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Job description size');
  });
});
