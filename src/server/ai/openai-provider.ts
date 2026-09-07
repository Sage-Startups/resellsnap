import OpenAI from 'openai';
import { getEnv } from '@/lib/env';
import { logger, sanitizeError } from '@/lib/logger';
import {
  AIProviderError,
  AIValidationError,
  type AICompletionRequest,
  type AICompletionResult,
  type AIProvider,
} from './provider';

/**
 * Rough USD micro-unit cost per 1M tokens, used only for the internal cost
 * estimate shown to admins. Overridable per deployment; wrong numbers here
 * affect a dashboard, never a charge.
 */
const COST_TABLE: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  default: { inputPerMillion: 400_000, outputPerMillion: 1_600_000 },
};

function costFor(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_TABLE[model] ?? COST_TABLE.default;
  if (!rates) return 0;
  return Math.round(
    (inputTokens * rates.inputPerMillion) / 1_000_000 + (outputTokens * rates.outputPerMillion) / 1_000_000,
  );
}

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  #client: OpenAI | null = null;

  isConfigured(): boolean {
    return Boolean(getEnv().OPENAI_API_KEY);
  }

  #openai(): OpenAI {
    if (this.#client) return this.#client;
    const env = getEnv();
    if (!env.OPENAI_API_KEY) {
      throw new AIProviderError('OpenAI is not configured', { retryable: false, code: 'not_configured' });
    }
    this.#client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL,
      maxRetries: 0, // retries are owned by the job runner, with jitter
    });
    return this.#client;
  }

  async complete<T>(request: AICompletionRequest<T>): Promise<AICompletionResult<T>> {
    const env = getEnv();
    const hasImages = (request.images?.length ?? 0) > 0;
    const model = hasImages ? env.OPENAI_VISION_MODEL : env.OPENAI_TEXT_MODEL;
    const startedAt = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? 120_000);

    try {
      // Images are sent inline as data URLs so the bucket stays private and no
      // public URL is ever minted for a customer's photograph.
      const imageParts = (request.images ?? []).map((image) => ({
        type: 'input_image' as const,
        image_url: `data:${image.contentType};base64,${image.data.toString('base64')}`,
        detail: 'auto' as const,
      }));

      const response = await this.#openai().responses.create(
        {
          model,
          instructions: request.systemPrompt,
          input: [
            {
              role: 'user',
              content: [{ type: 'input_text', text: request.userPrompt }, ...imageParts],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: request.schemaName,
              schema: request.jsonSchema as Record<string, unknown>,
              strict: false,
            },
          },
          max_output_tokens: request.maxOutputTokens ?? 4000,
          temperature: request.temperature ?? 0.3,
        },
        { signal: controller.signal },
      );

      const text = response.output_text;
      if (!text) {
        throw new AIProviderError('The model returned an empty response', {
          retryable: true,
          code: 'empty_response',
        });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new AIValidationError('The model returned a response that was not valid JSON');
      }

      const validation = request.validator.safeParse(parsed);
      if (!validation.success) {
        // Log the shape of the failure, never the content.
        logger.warn('AI response failed schema validation', {
          operation: request.operation,
          issues: validation.error.issues.slice(0, 5).map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
          })),
        });
        throw new AIValidationError('The model response did not match the expected structure');
      }

      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;

      return {
        data: validation.data,
        usage: {
          inputTokens,
          outputTokens,
          imageCount: request.images?.length ?? 0,
          estimatedCostMicros: costFor(model, inputTokens, outputTokens),
          durationMs: Date.now() - startedAt,
          model,
          provider: this.name,
        },
      };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new AIProviderError('The AI request timed out', { retryable: true, code: 'timeout' });
      }

      if (error instanceof OpenAI.APIError) {
        const status = error.status ?? 0;
        // 408/409/429 and 5xx are worth another attempt; 4xx is not.
        const retryable = status === 408 || status === 409 || status === 429 || status >= 500;
        throw new AIProviderError(sanitizeError(error, 'The AI provider returned an error'), {
          retryable,
          code: `openai_${status || 'unknown'}`,
        });
      }

      throw new AIProviderError(sanitizeError(error, 'The AI request failed'), {
        retryable: true,
        code: 'unknown',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    if (!this.isConfigured()) return { ok: false, detail: 'OPENAI_API_KEY is not set' };
    try {
      await this.#openai().models.list();
      return { ok: true, detail: `Reachable (vision: ${getEnv().OPENAI_VISION_MODEL})` };
    } catch (error) {
      return { ok: false, detail: sanitizeError(error, 'OpenAI unreachable') };
    }
  }
}
