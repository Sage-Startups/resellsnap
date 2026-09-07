/**
 * Price suggestion engine.
 *
 * Four sources, tried strictly in order. Each carries its own confidence and a
 * plain-English basis the seller can read:
 *
 *   1. MARKETPLACE_API  — real comparables from an approved official API.
 *   2. USER_HISTORY     — the seller's own completed sales.
 *   3. ADMIN_HEURISTIC  — an admin-maintained category rule.
 *   4. AI_ESTIMATE      — attributes only, explicitly labelled as an estimate.
 *
 * What this file never does: scrape a marketplace, fabricate a sold listing,
 * invent a comparable count, or claim live market data it did not retrieve. If
 * nothing usable exists, it says so.
 */
import { ConfidenceLevel, PlatformKey, PriceSource, PriceStrategy } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getAdapter } from '@/server/marketplace';
import { getAIProvider, PriceEstimateSchema, PRICE_ESTIMATE_JSON_SCHEMA } from '@/server/ai';
import { findPromptDefinition, PROMPT_KEYS, renderPrompt } from '@/server/ai/prompts';

export interface PriceSuggestionDraft {
  strategy: PriceStrategy;
  amountCents: number;
  lowCents: number | null;
  highCents: number | null;
  currency: string;
  source: PriceSource;
  confidence: ConfidenceLevel;
  explanation: string;
  comparableCount: number;
  observedAt: Date | null;
}

export interface PricingOutcome {
  suggestions: PriceSuggestionDraft[];
  /** True when we could not price responsibly and said so instead of guessing. */
  unavailable: boolean;
  unavailableReason?: string;
}

export interface PricingInput {
  itemId: string;
  workspaceId: string;
  currency: string;
  itemSummary: string;
  searchQuery: string;
  categoryHint: string | null;
  desiredMinPriceCents: number | null;
  acquisitionCostCents: number | null;
}

/** Multipliers turning a central estimate into the three strategies. */
const QUICK_SALE_FACTOR = 0.78;
const MAXIMISE_FACTOR = 1.28;

export async function generatePriceSuggestions(input: PricingInput): Promise<PricingOutcome> {
  const marketplace = await tryMarketplaceComparables(input);
  if (marketplace) return marketplace;

  const history = await trySellerHistory(input);
  if (history) return history;

  const heuristic = await tryAdminHeuristic(input);
  if (heuristic) return heuristic;

  return tryAIEstimate(input);
}

// --- 1. Official marketplace comparables -----------------------------------

async function tryMarketplaceComparables(input: PricingInput): Promise<PricingOutcome | null> {
  const adapter = getAdapter(PlatformKey.EBAY);
  if (!adapter.fetchComparables) return null;

  const status = await adapter.getStatus(input.workspaceId);
  // Only when an approved API grants us comparable access *and* the workspace
  // is connected. Absent either, we fall through — we do not scrape.
  if (!status.capabilities.canFetchComparables || !status.connectionId) return null;

  try {
    const comparables = await adapter.fetchComparables({
      connectionId: status.connectionId,
      query: input.searchQuery,
      limit: 30,
    });

    if (comparables.length < 3) return null;

    await prisma.comparable.createMany({
      data: comparables.map((comparable) => ({
        itemId: input.itemId,
        platform: PlatformKey.EBAY,
        source: PriceSource.MARKETPLACE_API,
        title: comparable.title.slice(0, 200),
        priceCents: comparable.priceCents,
        currency: comparable.currency,
        condition: comparable.condition,
        soldAt: comparable.soldAt,
        externalRef: comparable.externalRef,
        url: comparable.url,
      })),
    });

    const prices = comparables.map((c) => c.priceCents).sort((a, b) => a - b);
    const observedAt = comparables.reduce<Date | null>(
      (latest, c) => (c.soldAt && (!latest || c.soldAt > latest) ? c.soldAt : latest),
      null,
    );

    return {
      unavailable: false,
      suggestions: fromDistribution({
        prices,
        currency: input.currency,
        source: PriceSource.MARKETPLACE_API,
        confidence: prices.length >= 12 ? ConfidenceLevel.HIGH : ConfidenceLevel.MEDIUM,
        explanation: `Based on ${prices.length} comparable eBay listings retrieved through the official eBay API.`,
        comparableCount: prices.length,
        observedAt,
      }),
    };
  } catch (error) {
    logger.warn('Marketplace comparable lookup failed; falling through', { error });
    return null;
  }
}

// --- 2. The seller's own completed sales -----------------------------------

async function trySellerHistory(input: PricingInput): Promise<PricingOutcome | null> {
  if (!input.categoryHint) return null;

  const sales = await prisma.saleRecord.findMany({
    where: {
      workspaceId: input.workspaceId,
      item: { categoryHint: input.categoryHint, deletedAt: null },
      soldAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60_000) },
    },
    select: { salePriceCents: true, soldAt: true },
    orderBy: { soldAt: 'desc' },
    take: 40,
  });

  if (sales.length < 3) return null;

  const prices = sales.map((sale) => sale.salePriceCents).sort((a, b) => a - b);

  return {
    unavailable: false,
    suggestions: fromDistribution({
      prices,
      currency: input.currency,
      source: PriceSource.USER_HISTORY,
      confidence: sales.length >= 8 ? ConfidenceLevel.MEDIUM : ConfidenceLevel.LOW,
      explanation: `Based on ${sales.length} of your own completed sales in this category over the last 12 months.`,
      comparableCount: sales.length,
      observedAt: sales[0]?.soldAt ?? null,
    }),
  };
}

// --- 3. Admin-maintained category heuristic --------------------------------

export interface CategoryHeuristic {
  category: string;
  /** Typical resale value in cents for a good-condition item. */
  balancedCents: number;
  lowCents: number;
  highCents: number;
  note: string;
}

export const DEFAULT_CATEGORY_HEURISTICS: CategoryHeuristic[] = [
  { category: 'clothing', balancedCents: 1800, lowCents: 800, highCents: 4500, note: 'Typical pre-owned clothing range.' },
  { category: 'shoes', balancedCents: 3200, lowCents: 1200, highCents: 9000, note: 'Typical pre-owned footwear range.' },
  { category: 'bags_accessories', balancedCents: 2800, lowCents: 1000, highCents: 12000, note: 'Typical pre-owned accessory range.' },
  { category: 'electronics', balancedCents: 6500, lowCents: 1500, highCents: 30000, note: 'Wide range; model matters more than category.' },
  { category: 'home_kitchen', balancedCents: 3500, lowCents: 1000, highCents: 15000, note: 'Typical pre-owned homeware range.' },
  { category: 'furniture', balancedCents: 7500, lowCents: 2000, highCents: 40000, note: 'Local pickup items; condition dominates.' },
  { category: 'toys_games', balancedCents: 1500, lowCents: 500, highCents: 6000, note: 'Completeness drives value.' },
  { category: 'books_media', balancedCents: 900, lowCents: 300, highCents: 3500, note: 'Edition and condition drive value.' },
  { category: 'sports_outdoors', balancedCents: 3000, lowCents: 1000, highCents: 15000, note: 'Typical pre-owned sports equipment range.' },
  { category: 'collectables', balancedCents: 2500, lowCents: 500, highCents: 25000, note: 'Highly variable; treat as a starting point only.' },
  { category: 'beauty', balancedCents: 1200, lowCents: 400, highCents: 4000, note: 'Sealed items only on most marketplaces.' },
];

async function tryAdminHeuristic(input: PricingInput): Promise<PricingOutcome | null> {
  if (!input.categoryHint) return null;

  const setting = await prisma.appSetting.findUnique({ where: { key: 'categoryHeuristics' } });
  const heuristics = Array.isArray(setting?.value)
    ? (setting.value as unknown as CategoryHeuristic[])
    : DEFAULT_CATEGORY_HEURISTICS;

  const match = heuristics.find((entry) => entry.category === input.categoryHint);
  if (!match) return null;

  return {
    unavailable: false,
    suggestions: [
      draft(PriceStrategy.QUICK_SALE, Math.round(match.balancedCents * QUICK_SALE_FACTOR), match.lowCents, match.balancedCents, input.currency, PriceSource.ADMIN_HEURISTIC, ConfidenceLevel.LOW, `Category guideline maintained by the ResellSnap AI team, not observed sales. ${match.note}`, 0, null),
      draft(PriceStrategy.BALANCED, match.balancedCents, match.lowCents, match.highCents, input.currency, PriceSource.ADMIN_HEURISTIC, ConfidenceLevel.LOW, `Category guideline maintained by the ResellSnap AI team, not observed sales. ${match.note}`, 0, null),
      draft(PriceStrategy.MAXIMISE_RETURN, Math.round(match.balancedCents * MAXIMISE_FACTOR), match.balancedCents, match.highCents, input.currency, PriceSource.ADMIN_HEURISTIC, ConfidenceLevel.LOW, `Category guideline maintained by the ResellSnap AI team, not observed sales. ${match.note}`, 0, null),
    ],
  };
}

// --- 4. AI estimate from attributes only -----------------------------------

async function tryAIEstimate(input: PricingInput): Promise<PricingOutcome> {
  const definition = findPromptDefinition(PROMPT_KEYS.PRICE_ESTIMATE);
  if (!definition) {
    return {
      suggestions: [],
      unavailable: true,
      unavailableReason: 'The pricing prompt is not configured on this deployment.',
    };
  }

  try {
    const result = await getAIProvider().complete({
      operation: PROMPT_KEYS.PRICE_ESTIMATE,
      systemPrompt: definition.systemPrompt,
      userPrompt: renderPrompt(definition.userTemplate, {
        currency: input.currency,
        itemSummary: input.itemSummary,
        desiredMinPriceCents: input.desiredMinPriceCents ?? '',
        acquisitionCostCents: input.acquisitionCostCents ?? '',
      }),
      jsonSchema: PRICE_ESTIMATE_JSON_SCHEMA,
      schemaName: 'price_estimate',
      validator: PriceEstimateSchema,
      maxOutputTokens: 800,
      temperature: 0.2,
    });

    const { quickSaleCents, balancedCents, maximiseReturnCents, confidence, explanation } = result.data;

    // Enforce the ordering the prompt asks for rather than trusting it.
    const ordered = [quickSaleCents, balancedCents, maximiseReturnCents].sort((a, b) => a - b);
    const [quick = 0, balanced = 0, maximise = 0] = ordered;

    if (balanced <= 0) {
      return {
        suggestions: [],
        unavailable: true,
        unavailableReason:
          'We could not estimate a price for this item from the details supplied. Set your own price — you know it best.',
      };
    }

    const basis = `${explanation} No marketplace sales data was available for this item, so this is an estimate from the confirmed attributes only.`;

    return {
      unavailable: false,
      suggestions: [
        draft(PriceStrategy.QUICK_SALE, quick, null, null, input.currency, PriceSource.AI_ESTIMATE, confidence as ConfidenceLevel, basis, 0, null),
        draft(PriceStrategy.BALANCED, balanced, null, null, input.currency, PriceSource.AI_ESTIMATE, confidence as ConfidenceLevel, basis, 0, null),
        draft(PriceStrategy.MAXIMISE_RETURN, maximise, null, null, input.currency, PriceSource.AI_ESTIMATE, confidence as ConfidenceLevel, basis, 0, null),
      ],
    };
  } catch (error) {
    logger.warn('AI price estimate failed', { itemId: input.itemId, error });
    return {
      suggestions: [],
      unavailable: true,
      unavailableReason:
        'We could not produce a price estimate for this item. Set your own price and we will keep it.',
    };
  }
}

// --- helpers ---------------------------------------------------------------

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
  return sorted[index] ?? 0;
}

function fromDistribution(input: {
  prices: number[];
  currency: string;
  source: PriceSource;
  confidence: ConfidenceLevel;
  explanation: string;
  comparableCount: number;
  observedAt: Date | null;
}): PriceSuggestionDraft[] {
  const { prices } = input;
  const low = percentile(prices, 0.15);
  const median = percentile(prices, 0.5);
  const high = percentile(prices, 0.85);

  return [
    draft(PriceStrategy.QUICK_SALE, low, prices[0] ?? low, median, input.currency, input.source, input.confidence, input.explanation, input.comparableCount, input.observedAt),
    draft(PriceStrategy.BALANCED, median, low, high, input.currency, input.source, input.confidence, input.explanation, input.comparableCount, input.observedAt),
    draft(PriceStrategy.MAXIMISE_RETURN, high, median, prices[prices.length - 1] ?? high, input.currency, input.source, input.confidence, input.explanation, input.comparableCount, input.observedAt),
  ];
}

function draft(
  strategy: PriceStrategy,
  amountCents: number,
  lowCents: number | null,
  highCents: number | null,
  currency: string,
  source: PriceSource,
  confidence: ConfidenceLevel,
  explanation: string,
  comparableCount: number,
  observedAt: Date | null,
): PriceSuggestionDraft {
  return {
    strategy,
    amountCents: Math.max(0, Math.round(amountCents)),
    lowCents: lowCents === null ? null : Math.max(0, Math.round(lowCents)),
    highCents: highCents === null ? null : Math.max(0, Math.round(highCents)),
    currency,
    source,
    confidence,
    explanation,
    comparableCount,
    observedAt,
  };
}

/** Human label for the four sources, used by the price panel. */
export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  [PriceSource.MARKETPLACE_API]: 'Official marketplace data',
  [PriceSource.USER_HISTORY]: 'Your own sales history',
  [PriceSource.ADMIN_HEURISTIC]: 'Category guideline',
  [PriceSource.AI_ESTIMATE]: 'AI estimate (no sales data)',
};

export const PRICE_STRATEGY_LABELS: Record<PriceStrategy, string> = {
  [PriceStrategy.QUICK_SALE]: 'Quick sale',
  [PriceStrategy.BALANCED]: 'Balanced',
  [PriceStrategy.MAXIMISE_RETURN]: 'Maximise return',
};
