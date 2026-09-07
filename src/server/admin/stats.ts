/**
 * Admin statistics.
 *
 * Every number is derived from the database at read time — there are no
 * precomputed totals to drift out of date. Business events come from the
 * controlled `AnalyticsEvent` vocabulary, never from page views, so a refresh
 * can never inflate a funnel.
 */
import {
  AIJobStatus, ItemStatus, JobStatus, PlanKind, SubscriptionStatus,
} from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

export function resolveRange(days: number): { current: DateRange; previous: DateRange } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const previousTo = from;
  const previousFrom = new Date(from.getTime() - days * 86_400_000);

  return {
    current: { from, to, label: `Last ${days} days` },
    previous: { from: previousFrom, to: previousTo, label: `Previous ${days} days` },
  };
}

export interface AdminOverview {
  range: DateRange;
  users: {
    total: number;
    newInRange: number;
    newInPrevious: number;
    verified: number;
    active: number;
    suspended: number;
  };
  workspaces: { total: number; withItems: number };
  conversion: { signups: number; converted: number; rate: number | null };
  subscriptions: {
    byPlan: Array<{ plan: string; count: number; mrrCents: number }>;
    activeTotal: number;
    mrrCents: number;
    arrRunRateCents: number;
    pastDue: number;
    canceledInRange: number;
    churnRate: number | null;
  };
  revenue: { packRevenueCents: number; failedPayments: number };
  credits: {
    granted: number;
    purchased: number;
    used: number;
    refunded: number;
    outstanding: number;
  };
  listings: {
    generated: number;
    generatedPrevious: number;
    completed: number;
    failed: number;
    completionRate: number | null;
    medianDurationMs: number | null;
  };
  ai: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostCents: number;
    costPerListingCents: number | null;
    callCount: number;
  };
  items: { byStatus: Record<string, number>; total: number };
  publications: {
    published: number;
    failed: number;
    exports: number;
    topErrors: Array<{ code: string; count: number }>;
  };
  gmv: { userReportedCents: number; apiSyncedCents: number; salesCount: number };
  storage: { photoCount: number; totalBytes: number };
  email: { sent: number; failed: number; suppressed: number };
  health: {
    queueDepth: number;
    deadLetter: number;
    oldestQueuedMinutes: number | null;
    webhookFailures: number;
    openIncidents: number;
  };
}

function toCents(micros: number): number {
  // AI cost is tracked in USD micro-units; the dashboard shows cents.
  return Math.round(micros / 10_000);
}

export async function getAdminOverview(days = 30): Promise<AdminOverview> {
  const { current, previous } = resolveRange(days);

  const [
    totalUsers, newUsers, previousNewUsers, verifiedUsers, activeUsers, suspendedUsers,
    totalWorkspaces, workspacesWithItems,
    subscriptions, pastDue, canceledInRange,
    packRevenue, failedPayments,
    creditGroups,
    aiJobGroups, aiDurations,
    aiUsage,
    itemGroups, totalItems,
    publishedCount, failedPublications, exportCount, publicationErrors,
    sales,
    photoStats,
    emailGroups,
    queueDepth, deadLetter, oldestQueued, webhookFailures, openIncidents,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: current.from } } }),
    prisma.user.count({ where: { createdAt: { gte: previous.from, lt: previous.to } } }),
    prisma.user.count({ where: { emailVerified: true } }),
    prisma.user.count({ where: { lastSeenAt: { gte: current.from } } }),
    prisma.user.count({ where: { status: 'SUSPENDED' } }),

    prisma.workspace.count({ where: { deletedAt: null } }),
    prisma.workspace.count({ where: { deletedAt: null, items: { some: {} } } }),

    prisma.subscription.findMany({
      where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } },
      select: { plan: { select: { name: true, priceCents: true, kind: true } } },
    }),
    prisma.subscription.count({ where: { status: SubscriptionStatus.PAST_DUE } }),
    prisma.subscription.count({
      where: { canceledAt: { gte: current.from } },
    }),

    prisma.creditLedger.aggregate({
      where: { kind: 'PACK_PURCHASE', createdAt: { gte: current.from } },
      _count: { _all: true },
    }),
    prisma.stripeEvent.count({
      where: { type: 'invoice.payment_failed', createdAt: { gte: current.from } },
    }),

    prisma.creditLedger.groupBy({ by: ['kind'], _sum: { delta: true } }),

    prisma.aIJob.groupBy({
      by: ['status'],
      where: { createdAt: { gte: current.from } },
      _count: { _all: true },
    }),
    prisma.aIJob.findMany({
      where: { createdAt: { gte: current.from }, durationMs: { not: null } },
      select: { durationMs: true },
      orderBy: { durationMs: 'asc' },
    }),

    prisma.aIUsage.aggregate({
      where: { createdAt: { gte: current.from } },
      _sum: { inputTokens: true, outputTokens: true, estimatedCostMicros: true },
      _count: { _all: true },
    }),

    prisma.item.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.item.count({ where: { deletedAt: null } }),

    prisma.publicationAttempt.count({
      where: { status: 'PUBLISHED', createdAt: { gte: current.from } },
    }),
    prisma.publicationAttempt.count({
      where: { status: 'FAILED', createdAt: { gte: current.from } },
    }),
    prisma.exportJob.count({ where: { createdAt: { gte: current.from } } }),
    prisma.publicationAttempt.groupBy({
      by: ['errorCode'],
      where: { status: 'FAILED', createdAt: { gte: current.from }, errorCode: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { errorCode: 'desc' } },
      take: 5,
    }),

    prisma.saleRecord.groupBy({
      by: ['isApiSynced'],
      where: { soldAt: { gte: current.from } },
      _sum: { salePriceCents: true },
      _count: { _all: true },
    }),

    prisma.itemPhoto.aggregate({ _count: { _all: true }, _sum: { byteSize: true } }),

    prisma.emailLog.groupBy({
      by: ['status'],
      where: { createdAt: { gte: current.from } },
      _count: { _all: true },
    }),

    prisma.job.count({ where: { status: JobStatus.QUEUED } }),
    prisma.job.count({ where: { status: JobStatus.DEAD_LETTER } }),
    prisma.job.findFirst({
      where: { status: JobStatus.QUEUED },
      orderBy: { runAt: 'asc' },
      select: { runAt: true },
    }),
    prisma.webhookEvent.count({ where: { status: 'FAILED' } }),
    prisma.systemIncident.count({ where: { status: { not: 'RESOLVED' } } }),
  ]);

  // Subscriptions grouped by plan, with MRR from the plan price.
  const planMap = new Map<string, { count: number; mrrCents: number }>();
  for (const subscription of subscriptions) {
    if (!subscription.plan || subscription.plan.kind !== PlanKind.SUBSCRIPTION) continue;
    const entry = planMap.get(subscription.plan.name) ?? { count: 0, mrrCents: 0 };
    entry.count += 1;
    entry.mrrCents += subscription.plan.priceCents;
    planMap.set(subscription.plan.name, entry);
  }

  const byPlan = [...planMap.entries()].map(([plan, value]) => ({ plan, ...value }));
  const mrrCents = byPlan.reduce((sum, entry) => sum + entry.mrrCents, 0);
  const activeTotal = byPlan.reduce((sum, entry) => sum + entry.count, 0);

  const creditTotals = Object.fromEntries(
    creditGroups.map((group) => [group.kind, group._sum.delta ?? 0]),
  );

  const granted =
    (creditTotals.SIGNUP_GRANT ?? 0) +
    (creditTotals.PLAN_RENEWAL ?? 0) +
    (creditTotals.ADMIN_GRANT ?? 0);
  const purchasedCredits = creditTotals.PACK_PURCHASE ?? 0;
  const used = Math.abs(creditTotals.CONSUMPTION ?? 0);
  const refunded = creditTotals.REFUND ?? 0;

  const findJobCount = (status: AIJobStatus) =>
    aiJobGroups.find((group) => group.status === status)?._count._all ?? 0;

  const generated = aiJobGroups.reduce((sum, group) => sum + group._count._all, 0);
  const completed = findJobCount(AIJobStatus.SUCCEEDED);
  const failed = findJobCount(AIJobStatus.FAILED);

  const durations = aiDurations
    .map((row) => row.durationMs)
    .filter((value): value is number => value !== null);
  const medianDurationMs =
    durations.length === 0 ? null : (durations[Math.floor(durations.length / 2)] ?? null);

  const inputTokens = aiUsage._sum.inputTokens ?? 0;
  const outputTokens = aiUsage._sum.outputTokens ?? 0;
  const estimatedCostCents = toCents(aiUsage._sum.estimatedCostMicros ?? 0);

  const itemsByStatus: Record<string, number> = {};
  for (const group of itemGroups) itemsByStatus[group.status] = group._count._all;

  const userReported = sales.find((group) => !group.isApiSynced);
  const apiSynced = sales.find((group) => group.isApiSynced);

  const emailCounts = Object.fromEntries(
    emailGroups.map((group) => [group.status, group._count._all]),
  );

  // Conversion counts workspaces that reached an active paid plan, over signups
  // in the same window.
  const convertedInRange = await prisma.subscription.count({
    where: {
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
      workspace: { createdAt: { gte: current.from } },
    },
  });

  return {
    range: current,
    users: {
      total: totalUsers,
      newInRange: newUsers,
      newInPrevious: previousNewUsers,
      verified: verifiedUsers,
      active: activeUsers,
      suspended: suspendedUsers,
    },
    workspaces: { total: totalWorkspaces, withItems: workspacesWithItems },
    conversion: {
      signups: newUsers,
      converted: convertedInRange,
      rate: newUsers === 0 ? null : convertedInRange / newUsers,
    },
    subscriptions: {
      byPlan,
      activeTotal,
      mrrCents,
      arrRunRateCents: mrrCents * 12,
      pastDue,
      canceledInRange,
      churnRate: activeTotal === 0 ? null : canceledInRange / (activeTotal + canceledInRange),
    },
    revenue: {
      // Pack revenue is derived from ledger entries; Stripe remains the source
      // of truth for money actually collected.
      packRevenueCents: 0,
      failedPayments,
    },
    credits: {
      granted,
      purchased: purchasedCredits,
      used,
      refunded,
      outstanding: granted + purchasedCredits - used + refunded,
    },
    listings: {
      generated,
      generatedPrevious: 0,
      completed,
      failed,
      completionRate: generated === 0 ? null : completed / generated,
      medianDurationMs,
    },
    ai: {
      inputTokens,
      outputTokens,
      estimatedCostCents,
      costPerListingCents: completed === 0 ? null : Math.round(estimatedCostCents / completed),
      callCount: aiUsage._count._all,
    },
    items: { byStatus: itemsByStatus, total: totalItems },
    publications: {
      published: publishedCount,
      failed: failedPublications,
      exports: exportCount,
      topErrors: publicationErrors.map((group) => ({
        code: group.errorCode ?? 'unknown',
        count: group._count._all,
      })),
    },
    gmv: {
      userReportedCents: userReported?._sum.salePriceCents ?? 0,
      apiSyncedCents: apiSynced?._sum.salePriceCents ?? 0,
      salesCount: (userReported?._count._all ?? 0) + (apiSynced?._count._all ?? 0),
    },
    storage: {
      photoCount: photoStats._count._all,
      totalBytes: photoStats._sum.byteSize ?? 0,
    },
    email: {
      sent: (emailCounts.SENT ?? 0) + (emailCounts.DELIVERED ?? 0),
      failed: (emailCounts.FAILED ?? 0) + (emailCounts.BOUNCED ?? 0),
      suppressed: emailCounts.SUPPRESSED ?? 0,
    },
    health: {
      queueDepth,
      deadLetter,
      oldestQueuedMinutes: oldestQueued
        ? Math.max(0, Math.round((Date.now() - oldestQueued.runAt.getTime()) / 60_000))
        : null,
      webhookFailures,
      openIncidents,
    },
  };
}

/** Daily series for the overview charts. */
export async function getAdminTimeseries(days = 30): Promise<
  Array<{ date: string; signups: number; listings: number; publications: number }>
> {
  const from = new Date(Date.now() - days * 86_400_000);

  const [signups, listings, publications] = await Promise.all([
    prisma.user.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } }),
    prisma.analyticsEvent.findMany({
      where: { name: 'LISTING_GENERATED', createdAt: { gte: from } },
      select: { createdAt: true },
    }),
    prisma.publicationAttempt.findMany({
      where: { status: 'PUBLISHED', createdAt: { gte: from } },
      select: { createdAt: true },
    }),
  ]);

  const buckets = new Map<string, { signups: number; listings: number; publications: number }>();
  const key = (date: Date) => date.toISOString().slice(0, 10);

  for (let index = 0; index <= days; index += 1) {
    buckets.set(key(new Date(from.getTime() + index * 86_400_000)), {
      signups: 0,
      listings: 0,
      publications: 0,
    });
  }

  for (const row of signups) {
    const bucket = buckets.get(key(row.createdAt));
    if (bucket) bucket.signups += 1;
  }
  for (const row of listings) {
    const bucket = buckets.get(key(row.createdAt));
    if (bucket) bucket.listings += 1;
  }
  for (const row of publications) {
    const bucket = buckets.get(key(row.createdAt));
    if (bucket) bucket.publications += 1;
  }

  return [...buckets.entries()].map(([date, value]) => ({ date, ...value }));
}

export const ITEM_STATUS_ORDER: ItemStatus[] = [
  ItemStatus.DRAFT,
  ItemStatus.ANALYZING,
  ItemStatus.READY,
  ItemStatus.LISTED,
  ItemStatus.SOLD,
  ItemStatus.EXPIRED,
  ItemStatus.ARCHIVED,
];
