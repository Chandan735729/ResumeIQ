/**
 * AI Provider Interface
 *
 * Defines the contract for AI providers (Gemini, Mock, etc.).
 * The rest of the application must not depend on vendor-specific SDK details.
 */

export interface OptimizationPromptContext {
  promptVersion: string;
  systemInstruction: string;
  userPrompt: string;
  untrustedResumeData: string;
  untrustedJobDescription: string;
  deterministicFindings: {
    matchedSkills: string[];
    partialSkills: string[];
    missingRequiredSkills: string[];
    missingPreferredSkills: string[];
    missingKeywords: string[];
  };
}

export interface AIProviderOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIProviderResponse {
  rawContent: string;
  model: string;
  durationMs: number;
  tokenUsage?: TokenUsage;
  finishReason?: string;
}

export class AIProviderError extends Error {
  public readonly code: string;
  public readonly isRetryable: boolean;

  constructor(message: string, code: string = 'AI_PROVIDER_ERROR', isRetryable: boolean = false) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    this.isRetryable = isRetryable;
  }
}

export class AIRateLimitError extends AIProviderError {
  constructor(message: string = 'AI Provider rate limit exceeded') {
    super(message, 'AI_RATE_LIMIT', true);
    this.name = 'AIRateLimitError';
  }
}

export class AITimeoutError extends AIProviderError {
  constructor(message: string = 'AI Provider request timed out') {
    super(message, 'AI_TIMEOUT', true);
    this.name = 'AITimeoutError';
  }
}

export class AIInvalidOutputError extends AIProviderError {
  constructor(message: string = 'AI Provider returned invalid output') {
    super(message, 'AI_INVALID_OUTPUT', false);
    this.name = 'AIInvalidOutputError';
  }
}

export interface IAIProvider {
  readonly providerName: string;

  /**
   * Generate resume optimization suggestions
   */
  generateOptimization(
    context: OptimizationPromptContext,
    options?: AIProviderOptions
  ): Promise<AIProviderResponse>;

  /**
   * Health check / ping provider connectivity
   */
  checkHealth(): Promise<boolean>;
}
