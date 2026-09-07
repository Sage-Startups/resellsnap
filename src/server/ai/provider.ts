/**
 * AI provider abstraction.
 *
 * Business logic talks to `AIProvider` and nothing else. Adding Anthropic or a
 * self-hosted model later means writing one file — no service, route or
 * component changes.
 */
import type { z } from 'zod';

export interface AIImageInput {
  /** Raw image bytes. Data never leaves the server as a public URL. */
  data: Buffer;
  contentType: string;
}

export interface AICompletionRequest<T> {
  operation: string;
  systemPrompt: string;
  userPrompt: string;
  images?: AIImageInput[];
  /** JSON Schema sent to the provider for constrained decoding. */
  jsonSchema: object;
  schemaName: string;
  /** Zod schema the response is validated against before it is trusted. */
  validator: z.ZodType<T>;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface AIUsageStats {
  inputTokens: number;
  outputTokens: number;
  imageCount: number;
  /** Estimated internal cost in USD micro-units (1/1,000,000 USD). */
  estimatedCostMicros: number;
  durationMs: number;
  model: string;
  provider: string;
}

export interface AICompletionResult<T> {
  data: T;
  usage: AIUsageStats;
}

export class AIProviderError extends Error {
  readonly retryable: boolean;
  readonly code: string;

  constructor(message: string, options: { retryable: boolean; code: string }) {
    super(message);
    this.name = 'AIProviderError';
    this.retryable = options.retryable;
    this.code = options.code;
  }
}

export class AIValidationError extends AIProviderError {
  constructor(message: string) {
    super(message, { retryable: true, code: 'schema_validation_failed' });
    this.name = 'AIValidationError';
  }
}

export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  complete<T>(request: AICompletionRequest<T>): Promise<AICompletionResult<T>>;
  healthCheck(): Promise<{ ok: boolean; detail: string }>;
}
