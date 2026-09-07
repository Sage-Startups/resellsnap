/**
 * Dashboard and analytics queries.
 *
 * Every figure here is derived from the database at read time. Nothing is
 * precomputed into a stale totals column, and numbers the seller typed are
 * always distinguishable from numbers an API supplied.
 */
import { AIJobStatus, ItemStatus, type PlatformKey } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { getSettings } from './settings';

export interface DashboardSummary {
  credits: { monthly: number; purchased: number; total: number };
  listingsThisMonth: number;
  statusCounts: Record<ItemStatus, number>;
  /** Sum of confirmed price suggestions for items not yet sold. */
  inventoryValueCents: number;
  inventoryValueBasis: 'user_confirmed' | 'suggested';
  recentItems: Array<{
    id: string;
    title: string;
    sku: string;
    status: ItemStatus;
    thumbnailKey: string | null;
    updatedAt: Date;
  }>;
  activity: Array<{
    id: string;
    kind: string;
    status: AIJobStatus;
    itemId: string | null;
    itemTitle: string | null;
    error: string | null;
    createdAt: Date;
    canRetry: boolean;
  }>;
  onboarding: {
    complete: boolean;
    steps: Array<{ key: string; label: string; done: boolean; href: string }>;
  };
}

const EMPTY_STATUS_COUNTS: Record<ItemStatus, number> = {
  DRAFT: 0,
  ANALYZING: 0,
  READY: 0,
  LISTED: 0,
  SOLD: 0,
  EXPIRED: 0,
  ARCHIVED: 0,
};

export async function getDashboardSummary(workspaceId: string): Promise<DashboardSummary> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [workspace, statusGroups, listingsThisMonth, recentItems, activity, priceRows, connectionCount] =
    await Promise.all([
      prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { monthlyCredits: true, purchasedCredits: true, onboardingState: true },
      }),
      prisma.item.groupBy({
        by: ['status'],
        where: { workspaceId, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.item.count({ where: { workspaceId, deletedAt: null, createdAt: { gte: monthStart } } }),
      prisma.item.findMany({
        where: { workspaceId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        select: {
          id: true,
          title: true,
          sku: true,
          status: true,
          updatedAt: true,
          photos: {
            where: { status: 'PROCESSED' },
            orderBy: { position: 'asc' },
            take: 1,
            select: { thumbnailKey: true },
          },
        },
      }),
      prisma.aIJob.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          kind: true,
          status: true,
          error: true,
          createdAt: true,
          itemId: true,
          item: { select: { title: true } },
        },
      }),
      prisma.priceSuggestion.findMany({
        where: {
          strategy: 'BALANCED',
          item: {
            workspaceId,
            deletedAt: null,
            status: { in: [ItemStatus.READY, ItemStatus.LISTED, ItemStatus.DRAFT] },
          },
        },
        select: { amountCents: true, userEdited: true },
      }),
      prisma.platformConnection.count({ where: { workspaceId, state: 'CONNECTED' } }),
    ]);

  const statusCounts = { ...EMPTY_STATUS_COUNTS };
  for (const group of statusGroups) statusCounts[group.status] = group._count._all;

  const confirmed = priceRows.filter((row) => row.userEdited);
  // Prefer prices the seller has actually confirmed; fall back to suggestions
  // and say so, rather than presenting an estimate as a valuation.
  const basisRows = confirmed.length > 0 ? confirmed : priceRows;
  const inventoryValueCents = basisRows.reduce((sum, row) => sum + row.amountCents, 0);

  const onboardingState = (workspace.onboardingState ?? {}) as Record<string, unknown>;
  const hasItems = Object.values(statusCounts).some((count) => count > 0);
  const hasReady = statusCounts.READY + statusCounts.LISTED + statusCounts.SOLD > 0;

  const steps = [
    { key: 'created', label: 'Create your first item', done: hasItems, href: '/app/items/new' },
    { key: 'generated', label: 'Generate your first drafts', done: hasReady, href: '/app/items/new' },
    {
      key: 'connected',
      label: 'Connect a marketplace or try an export',
      done: connectionCount > 0 || Boolean(onboardingState.exported),
      href: '/app/integrations',
    },
    {
      key: 'listed',
      label: 'Mark an item as listed',
      done: statusCounts.LISTED + statusCounts.SOLD > 0,
      href: '/app/inventory',
    },
  ];

  return {
    credits: {
      monthly: workspace.monthlyCredits,
      purchased: workspace.purchasedCredits,
      total: workspace.monthlyCredits + workspace.purchasedCredits,
    },
    listingsThisMonth,
    statusCounts,
    inventoryValueCents,
    inventoryValueBasis: confirmed.length > 0 ? 'user_confirmed' : 'suggested',
    recentItems: recentItems.map((item) => ({
      id: item.id,
      title: item.title,
      sku: item.sku,
      status: item.status,
      thumbnailKey: item.photos[0]?.thumbnailKey ?? null,
      updatedAt: item.updatedAt,
    })),
    activity: activity.map((job) => ({
      id: job.id,
      kind: job.kind,
      status: job.status,
      itemId: job.itemId,
      itemTitle: job.item?.title ?? null,
      error: job.error,
      createdAt: job.createdAt,
      canRetry: job.status === AIJobStatus.FAILED && Boolean(job.itemId),
    })),
    onboarding: { complete: steps.every((step) => step.done), steps },
  };
}

// --- Customer analytics ----------------------------------------------------

export interface CustomerAnalytics {
  range: { from: Date; to: Date };
  listingsGenerated: number;
  publishedOrExported: number;
  itemsSold: number;
  sellThroughRate: number | null;
  averageDaysToSale: number | null;
  grossSalesCents: number;
  estimatedFeesCents: number;
  shippingCents: number;
  netProceedsCents: number;
  averageOrderValueCents: number | null;
  timeSavedMinutes: number;
  timeSavedAssumption: string;
  byPlatform: Array<{ platform: PlatformKey; sold: number; grossCents: number; apiSynced: number }>;
  byCategory: Array<{ category: string; listed: number; sold: number; grossCents: number }>;
  monthly: Array<{ month: string; generated: number; sold: number; grossCents: number }>;
  hasApiSyncedData: boolean;
}

export async function getCustomerAnalytics(
  workspaceId: string,
  days = 90,
): Promise<CustomerAnalytics> {
  const settings = await getSettings();
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);

  const [items, sales, exportEvents] = await Promise.all([
    prisma.item.findMany({
      where: { workspaceId, deletedAt: null, createdAt: { gte: from } },
      select: { id: true, status: true, categoryHint: true, createdAt: true, soldAt: true, listedAt: true },
    }),
    prisma.saleRecord.findMany({
      where: { workspaceId, soldAt: { gte: from } },
      select: {
        platform: true,
        salePriceCents: true,
        feesCents: true,
        shippingCents: true,
        soldAt: true,
        isApiSynced: true,
        item: { select: { categoryHint: true, createdAt: true } },
      },
    }),
    prisma.analyticsEvent.count({
      where: {
        workspaceId,
        name: { in: ['LISTING_EXPORTED', 'LISTING_PUBLISHED'] },
        createdAt: { gte: from },
      },
    }),
  ]);

  const listingsGenerated = items.length;
  const itemsSold = sales.length;

  const grossSalesCents = sales.reduce((sum, sale) => sum + sale.salePriceCents, 0);
  const estimatedFeesCents = sales.reduce((sum, sale) => sum + sale.feesCents, 0);
  const shippingCents = sales.reduce((sum, sale) => sum + sale.shippingCents, 0);

  const daysToSale = sales
    .map((sale) => {
      const created = sale.item?.createdAt;
      if (!created) return null;
      return Math.max(0, (sale.soldAt.getTime() - created.getTime()) / 86_400_000);
    })
    .filter((value): value is number => value !== null);

  const platformMap = new Map<PlatformKey, { sold: number; grossCents: number; apiSynced: number }>();
  for (const sale of sales) {
    const entry = platformMap.get(sale.platform) ?? { sold: 0, grossCents: 0, apiSynced: 0 };
    entry.sold += 1;
    entry.grossCents += sale.salePriceCents;
    if (sale.isApiSynced) entry.apiSynced += 1;
    platformMap.set(sale.platform, entry);
  }

  const categoryMap = new Map<string, { listed: number; sold: number; grossCents: number }>();
  for (const item of items) {
    const key = item.categoryHint ?? 'uncategorised';
    const entry = categoryMap.get(key) ?? { listed: 0, sold: 0, grossCents: 0 };
    entry.listed += 1;
    categoryMap.set(key, entry);
  }
  for (const sale of sales) {
    const key = sale.item?.categoryHint ?? 'uncategorised';
    const entry = categoryMap.get(key) ?? { listed: 0, sold: 0, grossCents: 0 };
    entry.sold += 1;
    entry.grossCents += sale.salePriceCents;
    categoryMap.set(key, entry);
  }

  const monthlyMap = new Map<string, { generated: number; sold: number; grossCents: number }>();
  const monthKey = (date: Date) => date.toISOString().slice(0, 7);
  for (const item of items) {
    const key = monthKey(item.createdAt);
    const entry = monthlyMap.get(key) ?? { generated: 0, sold: 0, grossCents: 0 };
    entry.generated += 1;
    monthlyMap.set(key, entry);
  }
  for (const sale of sales) {
    const key = monthKey(sale.soldAt);
    const entry = monthlyMap.get(key) ?? { generated: 0, sold: 0, grossCents: 0 };
    entry.sold += 1;
    entry.grossCents += sale.salePriceCents;
    monthlyMap.set(key, entry);
  }

  return {
    range: { from, to },
    listingsGenerated,
    publishedOrExported: exportEvents,
    itemsSold,
    sellThroughRate: listingsGenerated === 0 ? null : itemsSold / listingsGenerated,
    averageDaysToSale:
      daysToSale.length === 0
        ? null
        : Math.round((daysToSale.reduce((a, b) => a + b, 0) / daysToSale.length) * 10) / 10,
    grossSalesCents,
    estimatedFeesCents,
    shippingCents,
    netProceedsCents: grossSalesCents - estimatedFeesCents - shippingCents,
    averageOrderValueCents: itemsSold === 0 ? null : Math.round(grossSalesCents / itemsSold),
    timeSavedMinutes: listingsGenerated * settings.timeSavedMinutesPerListing,
    timeSavedAssumption: `Assumes ${settings.timeSavedMinutesPerListing} minutes saved per generated listing versus writing four marketplace listings by hand.`,
    byPlatform: [...platformMap.entries()]
      .map(([platform, value]) => ({ platform, ...value }))
      .sort((a, b) => b.grossCents - a.grossCents),
    byCategory: [...categoryMap.entries()]
      .map(([category, value]) => ({ category, ...value }))
      .sort((a, b) => b.grossCents - a.grossCents),
    monthly: [...monthlyMap.entries()]
      .map(([month, value]) => ({ month, ...value }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    hasApiSyncedData: sales.some((sale) => sale.isApiSynced),
  };
}
