/**
 * Deterministic fixture provider.
 *
 * Purpose: end-to-end tests and local development that exercise the *whole*
 * pipeline — job queue, credit debit, validation, revisions — without spending
 * money or depending on a network.
 *
 * It is impossible to reach in production by design:
 *   1. `env.ts` rejects `AI_PROVIDER=fake` when `NODE_ENV=production`.
 *   2. The constructor throws if it is ever instantiated in production.
 * Output is derived from a hash of the input, so the same item always produces
 * the same listing and assertions stay stable.
 */
import { createHash } from 'node:crypto';
import { getEnv } from '@/lib/env';
import {
  AIProviderError,
  AIValidationError,
  type AICompletionRequest,
  type AICompletionResult,
  type AIProvider,
} from './provider';

function seededPick<T>(seed: string, options: readonly T[]): T {
  const hash = createHash('sha256').update(seed).digest();
  const index = (hash[0] ?? 0) % options.length;
  return options[index] as T;
}

function seededNumber(seed: string, min: number, max: number): number {
  const hash = createHash('sha256').update(seed).digest();
  const value = ((hash[0] ?? 0) << 8) | (hash[1] ?? 0);
  return min + (value % Math.max(1, max - min + 1));
}

export class FakeAIProvider implements AIProvider {
  readonly name = 'fake';

  constructor() {
    if (getEnv().isProduction) {
      throw new Error(
        'The deterministic fixture AI provider cannot run in production. Set AI_PROVIDER=openai.',
      );
    }
  }

  isConfigured(): boolean {
    return !getEnv().isProduction;
  }

  async complete<T>(request: AICompletionRequest<T>): Promise<AICompletionResult<T>> {
    const seed = createHash('sha256')
      .update(request.operation)
      .update(request.userPrompt)
      .digest('hex');

    const payload = this.#buildPayload(request.operation, seed, request.userPrompt);

    const validation = request.validator.safeParse(payload);
    if (!validation.success) {
      // A fixture that no longer matches the schema is a bug in this file, and
      // it should surface as loudly in tests as a real provider drift would.
      throw new AIValidationError(
        `Fixture for "${request.operation}" no longer matches its schema: ${validation.error.issues[0]?.message ?? 'unknown'}`,
      );
    }

    return {
      data: validation.data,
      usage: {
        inputTokens: 900 + (request.images?.length ?? 0) * 250,
        outputTokens: 420,
        imageCount: request.images?.length ?? 0,
        estimatedCostMicros: 1200,
        durationMs: 40,
        model: 'fixture-v1',
        provider: this.name,
      },
    };
  }

  #buildPayload(operation: string, seed: string, userPrompt: string): unknown {
    switch (operation) {
      case 'image_analysis':
        return this.#analysis(seed, userPrompt);
      case 'master_listing':
        return this.#master(seed, userPrompt);
      case 'platform_variant':
        return this.#variant(seed, userPrompt);
      case 'price_estimate':
        return this.#price(seed);
      default:
        throw new AIProviderError(`No fixture defined for operation "${operation}"`, {
          retryable: false,
          code: 'no_fixture',
        });
    }
  }

  #analysis(seed: string, userPrompt: string) {
    const itemType = seededPick(seed, [
      'leather trainers',
      'denim jacket',
      'espresso machine',
      'film camera',
      'wool coat',
      'ceramic vase',
    ]);
    const colour = seededPick(`${seed}colour`, ['cream', 'indigo', 'charcoal', 'sage green', 'tan']);
    const photoCount = Number(/Number of photographs supplied: (\d+)/.exec(userPrompt)?.[1] ?? 3);

    return {
      itemType,
      categoryPath: ['Fixtures', 'Sample category'],
      brand: null,
      model: null,
      colour: {
        value: colour,
        confidence: 'HIGH',
        evidence: 'Consistent colour across all supplied photographs',
      },
      pattern: null,
      material: {
        value: 'appears textured; not confirmed',
        confidence: 'LOW',
        evidence: 'Surface texture visible in photo 1',
      },
      style: null,
      sizeVisible: null,
      conditionSummary:
        'Used with visible signs of wear consistent with normal use. Seller confirmation needed for anything not visible in the photographs.',
      conditionEvidence: [
        { description: 'Light surface marking', photoIndex: 0, severity: 'COSMETIC' },
        { description: 'Minor wear along one edge', photoIndex: Math.min(1, photoCount - 1), severity: 'MINOR' },
      ],
      photoWarnings:
        photoCount < 4
          ? [
              {
                photoIndex: 0,
                kind: 'MISSING_ANGLE',
                message: 'A photograph of the label or underside would help buyers.',
              },
            ]
          : [],
      suggestedQuestions: [
        'Can you confirm the brand and model from the label?',
        'Are there any defects that are not visible in the photographs?',
        'What measurements can you provide?',
      ],
      searchKeywords: [itemType, colour, 'second hand', 'preloved'],
      safetyFlags: [],
      notes: 'Deterministic fixture output. Not a real analysis.',
    };
  }

  #master(seed: string, userPrompt: string) {
    const itemType = /itemType"?\s*[:=]\s*"?([^",\n]+)/.exec(userPrompt)?.[1]?.trim() ?? 'second-hand item';
    const colour = seededPick(`${seed}colour`, ['cream', 'indigo', 'charcoal', 'sage green', 'tan']);

    return {
      title: `${colour.charAt(0).toUpperCase()}${colour.slice(1)} ${itemType} — good used condition`,
      description: `A ${colour} ${itemType} in good used condition.\n\nSold as seen from a smoke-free home. Please read the condition notes and check the photographs before buying — everything visible in the images is included unless stated otherwise.\n\nThis is deterministic sample copy produced by the local fixture provider.`,
      conditionSummary: 'Good used condition with light cosmetic wear consistent with normal use.',
      defectDisclosure: 'Light surface marking and minor edge wear as shown in the photographs.',
      includedItems: 'Item only unless otherwise stated in the photographs.',
      measurements: 'See seller-supplied measurements.',
      attributes: { Colour: colour, Condition: 'Used — good' },
      searchTerms: [itemType, colour, 'preloved', 'second hand'],
    };
  }

  #variant(seed: string, userPrompt: string) {
    const platform = /Marketplace: (.+)/.exec(userPrompt)?.[1]?.trim() ?? 'Marketplace';
    const colour = seededPick(`${seed}colour`, ['cream', 'indigo', 'charcoal', 'sage green', 'tan']);

    const base = {
      title: `${colour.charAt(0).toUpperCase()}${colour.slice(1)} second-hand item — good condition`,
      description: `Good used condition ${colour} item, sold as seen.\n\nCheck the photographs for exact condition. Deterministic fixture copy for ${platform}.`,
    };

    switch (platform) {
      case 'eBay':
        return {
          ...base,
          fields: {
            categorySuggestion: 'Sample category',
            conditionDescriptor: 'Used',
            itemSpecifics: ['Colour: ' + colour, 'Condition: Used'],
          },
        };
      case 'Vinted':
        return { ...base, fields: { category: 'Sample category', condition: 'Good', colour } };
      case 'Depop':
        return {
          ...base,
          fields: { category: 'Sample category', hashtags: ['#preloved', '#secondhand', '#vintage'] },
        };
      case 'Facebook Marketplace':
        return {
          ...base,
          fields: { category: 'Sample category', condition: 'Used — good', pickupNotes: 'Local pickup available.' },
        };
      default:
        return { ...base, fields: {} };
    }
  }

  #price(seed: string) {
    const balanced = seededNumber(seed, 1800, 9000);
    return {
      quickSaleCents: Math.round(balanced * 0.75),
      balancedCents: balanced,
      maximiseReturnCents: Math.round(balanced * 1.3),
      confidence: 'LOW',
      explanation:
        'Deterministic fixture estimate based on item attributes only. No marketplace sales data was consulted.',
    };
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: 'Deterministic fixture provider (development and test only)' };
  }
}
