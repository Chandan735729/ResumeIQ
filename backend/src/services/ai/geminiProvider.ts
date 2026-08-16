/**
 * Google Gemini AI Provider Implementation
 *
 * Encapsulates the Google Generative AI SDK with timeout controls, exponential backoff
 * retries, cost controls, token limits, and PII-safe logging.
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import {
  IAIProvider,
  OptimizationPromptContext,
  AIProviderOptions,
  AIProviderResponse,
  AIProviderError,
  AIRateLimitError,
  AITimeoutError,
} from './aiProvider.interface';
import { logger } from '../logger.service';

export interface GeminiConfig {
  apiKey?: string;
  modelName?: string;
  defaultTimeoutMs?: number;
  maxRetries?: number;
}

const DEFAULT_MODEL = 'gemini-1.5-flash';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_OUTPUT_TOKENS = 2048;

export class GeminiProvider implements IAIProvider {
  public readonly providerName = 'GeminiProvider';
  private client: GoogleGenerativeAI | null = null;
  private modelName: string;
  private defaultTimeoutMs: number;
  private maxRetries: number;

  constructor(config: GeminiConfig = {}) {
    const apiKey = config.apiKey || process.env.GOOGLE_API_KEY;
    this.modelName = config.modelName || process.env.GEMINI_MODEL || DEFAULT_MODEL;
    this.defaultTimeoutMs = config.defaultTimeoutMs || DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries !== undefined ? config.maxRetries : DEFAULT_MAX_RETRIES;

    if (apiKey && apiKey !== 'your-google-api-key-here') {
      this.client = new GoogleGenerativeAI(apiKey);
    }
  }

  public isConfigured(): boolean {
    return this.client !== null;
  }

  async checkHealth(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const model = this.client.getGenerativeModel({ model: this.modelName });
      const res = await Promise.race([
        model.generateContent('ping'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new AITimeoutError('Gemini health check timeout')), 5000)
        ),
      ]);
      return !!res;
    } catch {
      return false;
    }
  }

  private async callWithRetry<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    retriesLeft: number
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new AITimeoutError(`Gemini request timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    try {
      return await Promise.race([operation(), timeoutPromise]);
    } catch (err: any) {
      if (err instanceof AITimeoutError) {
        if (retriesLeft > 0) {
          logger.warn(`Gemini request timed out, retrying (${retriesLeft} retries remaining)...`);
          await new Promise(r => setTimeout(r, 1000));
          return this.callWithRetry(operation, timeoutMs, retriesLeft - 1);
        }
        throw err;
      }

      // Check for rate limits / quota
      const errMsg = err?.message || '';
      const status = err?.status || err?.statusCode;
      const isRateLimit = status === 429 || errMsg.includes('429') || errMsg.toLowerCase().includes('quota');
      const isServerError = status >= 500 && status < 600;

      if ((isRateLimit || isServerError) && retriesLeft > 0) {
        const backoffMs = (this.maxRetries - retriesLeft + 1) * 1500;
        logger.warn(`Gemini transient error (${status || errMsg}), backing off ${backoffMs}ms...`);
        await new Promise(r => setTimeout(r, backoffMs));
        return this.callWithRetry(operation, timeoutMs, retriesLeft - 1);
      }

      if (isRateLimit) {
        throw new AIRateLimitError('Gemini API quota exceeded or rate limited.');
      }

      throw new AIProviderError(`Gemini generation failed: ${errMsg}`, 'GEMINI_ERROR', false);
    }
  }

  async generateOptimization(
    context: OptimizationPromptContext,
    options?: AIProviderOptions
  ): Promise<AIProviderResponse> {
    if (!this.client) {
      throw new AIProviderError(
        'Gemini API key is not configured in the environment.',
        'GEMINI_NOT_CONFIGURED',
        false
      );
    }

    const modelName = options?.model || this.modelName;
    const timeoutMs = options?.timeoutMs || this.defaultTimeoutMs;
    const maxRetries = options?.maxRetries !== undefined ? options?.maxRetries : this.maxRetries;
    const temperature = options?.temperature !== undefined ? options?.temperature : 0.2;
    const maxOutputTokens = options?.maxOutputTokens || MAX_OUTPUT_TOKENS;

    const startTime = Date.now();

    const model: GenerativeModel = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: context.systemInstruction,
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: 'application/json',
      },
    });

    const result = await this.callWithRetry(
      async () => {
        const res = await model.generateContent(context.userPrompt);
        return res;
      },
      timeoutMs,
      maxRetries
    );

    const durationMs = Date.now() - startTime;
    const response = result.response;
    const rawContent = response.text();

    const usageMetadata = response.usageMetadata;
    const tokenUsage = usageMetadata
      ? {
          promptTokens: usageMetadata.promptTokenCount || 0,
          completionTokens: usageMetadata.candidatesTokenCount || 0,
          totalTokens: usageMetadata.totalTokenCount || 0,
        }
      : undefined;

    logger.info('Gemini optimization generation succeeded', {
      model: modelName,
      promptVersion: context.promptVersion,
      durationMs,
      totalTokens: tokenUsage?.totalTokens,
    });

    return {
      rawContent,
      model: modelName,
      durationMs,
      tokenUsage,
    };
  }
}
