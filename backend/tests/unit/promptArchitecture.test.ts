/**
 * Unit Tests: Prompt Architecture & Versioning
 */

import {
  buildOptimizationPrompt,
  CURRENT_PROMPT_VERSION,
  SYSTEM_INSTRUCTION_V1,
} from '@services/ai/prompts/optimization.prompts';
import { extractJobDescription } from '@services/jdExtractor.service';
import { matchResumeToJob } from '@services/matchingEngine.service';

describe('Prompt Architecture & Isolation', () => {
  const resume = {
    skills: ['Python', 'Django'],
    experience: [{ title: 'Dev', company: 'Co', bullets: ['Built Python web apps'], isCurrent: true }],
    education: [],
    certifications: [],
    projectTechnologies: [],
    rawText: 'Python Django Dev Co Built Python web apps',
  };

  const jd = extractJobDescription('Backend Engineer\nRequirements:\n- Python\n- AWS (Lambda)', 'Backend Engineer');
  const matchResult = matchResumeToJob(resume, jd);

  it('embeds the current prompt version', () => {
    const prompt = buildOptimizationPrompt(resume.rawText, 'Backend Engineer\n- Python\n- AWS', matchResult);
    expect(prompt.promptVersion).toBe(CURRENT_PROMPT_VERSION);
    expect(prompt.promptVersion).toBe('optimization-v1');
  });

  it('includes strict fact-preservation rules in system instructions', () => {
    expect(SYSTEM_INSTRUCTION_V1).toContain('FACT PRESERVATION');
    expect(SYSTEM_INSTRUCTION_V1).toContain('MUST NOT invent');
    expect(SYSTEM_INSTRUCTION_V1).toContain('UNTRUSTED DATA');
    expect(SYSTEM_INSTRUCTION_V1).toContain('JSON');
  });

  it('wraps candidate resume and job description in untrusted delimiters', () => {
    const prompt = buildOptimizationPrompt(resume.rawText, 'Job Desc Text', matchResult);
    expect(prompt.userPrompt).toContain('<<<UNTRUSTED_JOB_DESCRIPTION>>>');
    expect(prompt.userPrompt).toContain('<<<END_UNTRUSTED_JOB_DESCRIPTION>>>');
    expect(prompt.userPrompt).toContain('<<<UNTRUSTED_CANDIDATE_RESUME>>>');
    expect(prompt.userPrompt).toContain('<<<END_UNTRUSTED_CANDIDATE_RESUME>>>');
  });

  it('injects deterministic findings into user prompt', () => {
    const prompt = buildOptimizationPrompt(resume.rawText, 'Job Desc Text', matchResult);
    expect(prompt.deterministicFindings).toHaveProperty('matchedSkills');
    expect(prompt.deterministicFindings).toHaveProperty('missingRequiredSkills');
    expect(prompt.userPrompt).toContain('DETERMINISTIC ATS FINDINGS');
  });
});
