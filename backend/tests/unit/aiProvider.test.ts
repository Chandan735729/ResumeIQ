/**
 * Unit Tests: AI Provider & Mock Provider
 */

import { MockAIProvider } from '@services/ai/mockAIProvider';
import { GeminiProvider } from '@services/ai/geminiProvider';
import {
  AITimeoutError,
  AIRateLimitError,
  AIProviderError,
} from '@services/ai/aiProvider.interface';
import { buildOptimizationPrompt } from '@services/ai/prompts/optimization.prompts';
import { extractJobDescription } from '@services/jdExtractor.service';
import { matchResumeToJob } from '@services/matchingEngine.service';

const dummyResume = {
  skills: ['Python', 'PostgreSQL'],
  experience: [{ title: 'Backend Dev', company: 'Acme', bullets: ['Wrote Python APIs'], isCurrent: true }],
  education: [],
  certifications: [],
  projectTechnologies: [],
  rawText: 'Python PostgreSQL Backend Dev Acme Wrote Python APIs',
};

const dummyJD = extractJobDescription('Software Engineer\nRequirements:\n- Python\n- AWS', 'Software Engineer');
const dummyMatch = matchResumeToJob(dummyResume, dummyJD);
const promptContext = buildOptimizationPrompt(dummyResume.rawText, 'Software Engineer\nRequirements:\n- Python\n- AWS', dummyMatch);

describe('AI Provider Abstraction', () => {
  describe('MockAIProvider', () => {
    it('returns successful structured response in standard scenario', async () => {
      const mock = new MockAIProvider('success_standard');
      const response = await mock.generateOptimization(promptContext);

      expect(response).toHaveProperty('rawContent');
      expect(response).toHaveProperty('model');
      expect(response).toHaveProperty('durationMs');
      expect(JSON.parse(response.rawContent)).toHaveProperty('changes');
    });

    it('throws AITimeoutError in timeout scenario', async () => {
      const mock = new MockAIProvider('timeout');
      await expect(mock.generateOptimization(promptContext)).rejects.toThrow(AITimeoutError);
    });

    it('throws AIRateLimitError in rate limit scenario', async () => {
      const mock = new MockAIProvider('rate_limit');
      await expect(mock.generateOptimization(promptContext)).rejects.toThrow(AIRateLimitError);
    });

    it('throws AIProviderError in server error scenario', async () => {
      const mock = new MockAIProvider('server_error');
      await expect(mock.generateOptimization(promptContext)).rejects.toThrow(AIProviderError);
    });

    it('returns custom response when set', async () => {
      const customJson = JSON.stringify({ custom: 'output' });
      const mock = new MockAIProvider('custom', customJson);
      const response = await mock.generateOptimization(promptContext);
      expect(response.rawContent).toBe(customJson);
    });
  });

  describe('GeminiProvider configuration guard', () => {
    it('throws GEMINI_NOT_CONFIGURED if initialized without API key', async () => {
      const gemini = new GeminiProvider({ apiKey: '' });
      expect(gemini.isConfigured()).toBe(false);
      await expect(gemini.generateOptimization(promptContext)).rejects.toThrow(/Gemini API key is not configured/);
    });

    it('reports health false when not configured', async () => {
      const gemini = new GeminiProvider({ apiKey: '' });
      const health = await gemini.checkHealth();
      expect(health).toBe(false);
    });
  });

  describe('getAIProvider production safety guard', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
      const { setAIProvider } = require('@modules/optimization/optimization.service');
      setAIProvider(null);
    });

    it('throws error in production when GOOGLE_API_KEY is missing and AI_PROVIDER is not mock', () => {
      const { getAIProvider, setAIProvider } = require('@modules/optimization/optimization.service');
      setAIProvider(null);
      process.env.NODE_ENV = 'production';
      delete process.env.GOOGLE_API_KEY;
      delete process.env.AI_PROVIDER;

      expect(() => getAIProvider()).toThrow(/FATAL CONFIGURATION ERROR: GOOGLE_API_KEY is required in production/);
    });

    it('allows explicit MockAIProvider in production when AI_PROVIDER=mock is set', () => {
      const { getAIProvider, setAIProvider } = require('@modules/optimization/optimization.service');
      setAIProvider(null);
      process.env.NODE_ENV = 'production';
      delete process.env.GOOGLE_API_KEY;
      process.env.AI_PROVIDER = 'mock';

      const provider = getAIProvider();
      expect(provider).toBeInstanceOf(MockAIProvider);
    });
  });
});

