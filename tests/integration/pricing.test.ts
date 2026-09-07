import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PlatformKey, PriceSource } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { generatePriceSuggestions, DEFAULT_CATEGORY_HEURISTICS } from '@/server/pricing/engine';
import {
  createTestItem, createTestWorkspace, destroyTestWorkspace, ensureReferenceData,
  type TestWorkspace,
} from '../helpers/db';

const created: TestWorkspace[] = [];

async function freshWorkspace() {
  const workspace = await createTestWorkspace();
  created.push(workspace);
  return workspace;
}

beforeAll(async () => {
  await ensureReferenceData();
});

afterEach(async () => {
  for (const entry of created.splice(0)) await destroyTestWorkspace(entry);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('price suggestion sources', () => {
  it('uses the seller’s own completed sales when there are enough of them', async () => {
    const workspace = await freshWorkspace();

    // Three prior sales in the same category is the documented threshold.
    for (const price of [3000, 3500, 4000]) {
      const itemId = await createTestItem(workspace.workspaceId, { status: 'SOLD' });
      await prisma.item.update({ where: { id: itemId }, data: { categoryHint: 'shoes' } });
      await prisma.saleRecord.create({
        data: {
          itemId,
          workspaceId: workspace.workspaceId,
          platform: PlatformKey.EBAY,
          salePriceCents: price,
          soldAt: new Date(),
        },
      });
    }

    const target = await createTestItem(workspace.workspaceId);
    const outcome = await generatePriceSuggestions({
      itemId: target,
      workspaceId: workspace.workspaceId,
      currency: 'USD',
      itemSummary: 'Leather trainers',
      searchQuery: 'leather trainers',
      categoryHint: 'shoes',
      desiredMinPriceCents: null,
      acquisitionCostCents: null,
    });

    expect(outcome.unavailable).toBe(false);
    expect(outcome.suggestions).toHaveLength(3);

    for (const suggestion of outcome.suggestions) {
      expect(suggestion.source).toBe(PriceSource.USER_HISTORY);
      expect(suggestion.comparableCount).toBe(3);
      expect(suggestion.explanation).toContain('your own completed sales');
    }
  });

  it('falls back to the admin heuristic below the history threshold', async () => {
    const workspace = await freshWorkspace();

    // Two sales is not enough to price from.
    for (const price of [3000, 3500]) {
      const itemId = await createTestItem(workspace.workspaceId, { status: 'SOLD' });
      await prisma.item.update({ where: { id: itemId }, data: { categoryHint: 'shoes' } });
      await prisma.saleRecord.create({
        data: {
          itemId,
          workspaceId: workspace.workspaceId,
          platform: PlatformKey.EBAY,
          salePriceCents: price,
          soldAt: new Date(),
        },
      });
    }

    const target = await createTestItem(workspace.workspaceId);
    const outcome = await generatePriceSuggestions({
      itemId: target,
      workspaceId: workspace.workspaceId,
      currency: 'USD',
      itemSummary: 'Leather trainers',
      searchQuery: 'leather trainers',
      categoryHint: 'shoes',
      desiredMinPriceCents: null,
      acquisitionCostCents: null,
    });

    expect(outcome.suggestions[0]?.source).toBe(PriceSource.ADMIN_HEURISTIC);
    expect(outcome.suggestions[0]?.comparableCount).toBe(0);
    // The wording must not imply observed sales.
    expect(outcome.suggestions[0]?.explanation).toContain('not observed sales');
  });

  it('falls through to an AI estimate when no category heuristic exists', async () => {
    const workspace = await freshWorkspace();
    const target = await createTestItem(workspace.workspaceId);

    const outcome = await generatePriceSuggestions({
      itemId: target,
      workspaceId: workspace.workspaceId,
      currency: 'USD',
      itemSummary: 'An unusual item',
      searchQuery: 'unusual item',
      categoryHint: 'a-category-with-no-heuristic',
      desiredMinPriceCents: null,
      acquisitionCostCents: null,
    });

    expect(outcome.unavailable).toBe(false);
    expect(outcome.suggestions[0]?.source).toBe(PriceSource.AI_ESTIMATE);
    // The honesty requirement: an estimate must say it consulted no sales data.
    expect(outcome.suggestions[0]?.explanation).toContain('No marketplace sales data');
  });

  it('never claims comparables it does not have', async () => {
    const workspace = await freshWorkspace();
    const target = await createTestItem(workspace.workspaceId);

    const outcome = await generatePriceSuggestions({
      itemId: target,
      workspaceId: workspace.workspaceId,
      currency: 'USD',
      itemSummary: 'Leather trainers',
      searchQuery: 'leather trainers',
      categoryHint: 'shoes',
      desiredMinPriceCents: null,
      acquisitionCostCents: null,
    });

    for (const suggestion of outcome.suggestions) {
      if (suggestion.source !== PriceSource.MARKETPLACE_API &&
          suggestion.source !== PriceSource.USER_HISTORY) {
        expect(suggestion.comparableCount).toBe(0);
        expect(suggestion.observedAt).toBeNull();
      }
    }

    // Nothing may be written to the comparables table without a real source.
    expect(await prisma.comparable.count({ where: { itemId: target } })).toBe(0);
  });

  it('orders the three strategies from cheapest to dearest', async () => {
    const workspace = await freshWorkspace();
    const target = await createTestItem(workspace.workspaceId);

    const outcome = await generatePriceSuggestions({
      itemId: target,
      workspaceId: workspace.workspaceId,
      currency: 'USD',
      itemSummary: 'Denim jacket',
      searchQuery: 'denim jacket',
      categoryHint: 'clothing',
      desiredMinPriceCents: null,
      acquisitionCostCents: null,
    });

    const byStrategy = Object.fromEntries(
      outcome.suggestions.map((suggestion) => [suggestion.strategy, suggestion.amountCents]),
    );

    expect(byStrategy.QUICK_SALE).toBeLessThan(byStrategy.BALANCED!);
    expect(byStrategy.BALANCED).toBeLessThan(byStrategy.MAXIMISE_RETURN!);
  });

  it('returns integer cents only', async () => {
    const workspace = await freshWorkspace();
    const target = await createTestItem(workspace.workspaceId);

    const outcome = await generatePriceSuggestions({
      itemId: target,
      workspaceId: workspace.workspaceId,
      currency: 'USD',
      itemSummary: 'Espresso machine',
      searchQuery: 'espresso machine',
      categoryHint: 'home_kitchen',
      desiredMinPriceCents: null,
      acquisitionCostCents: null,
    });

    for (const suggestion of outcome.suggestions) {
      expect(Number.isInteger(suggestion.amountCents)).toBe(true);
      expect(suggestion.amountCents).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('category heuristics', () => {
  it('keeps every band ordered and positive', () => {
    for (const heuristic of DEFAULT_CATEGORY_HEURISTICS) {
      expect(heuristic.lowCents).toBeGreaterThan(0);
      expect(heuristic.lowCents).toBeLessThan(heuristic.balancedCents);
      expect(heuristic.balancedCents).toBeLessThan(heuristic.highCents);
      expect(heuristic.note).toBeTruthy();
    }
  });
});
