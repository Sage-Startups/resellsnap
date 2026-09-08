/**
 * Read-only queries for the public marketing site.
 *
 * Deliberately narrow: these run unauthenticated, so they select only fields
 * that are safe to render to anyone and never touch customer data.
 */
import { PlanKind } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { PLAN_SEEDS } from './plans';

/**
 * Marketing content changes when an admin edits it — a few times a month at
 * most — but every visitor to every public page was re-reading it from the
 * database. That is invisible when the database is a millisecond away and the
 * dominant cost when it is not, which is exactly the position a deployment is
 * in when its database sits behind a public proxy or in another region.
 *
 * One minute of staleness, held per container, in exchange for serving the
 * marketing site without touching the database at all. Admin edits call
 * `invalidatePublicDataCache` so they still appear immediately.
 */
const CACHE_TTL_MS = 60_000;

const caches = new Map<string, { value: unknown; expires: number }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = caches.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const value = await load();
  caches.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Called by the admin actions that change plans or content blocks. */
export function invalidatePublicDataCache(): void {
  caches.clear();
}

export interface PublicPlan {
  key: string;
  name: string;
  kind: PlanKind;
  tagline: string | null;
  description: string | null;
  priceCents: number;
  currency: string;
  interval: string | null;
  creditsGranted: number;
  features: string[];
  isDefault: boolean;
  /** False when no Stripe Price ID is configured; the UI says so rather than 404ing. */
  purchasable: boolean;
}

export async function getVisiblePlans(): Promise<PublicPlan[]> {
  return cached('plans', loadVisiblePlans);
}

async function loadVisiblePlans(): Promise<PublicPlan[]> {
  try {
    const plans = await prisma.plan.findMany({
      where: { isVisible: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (plans.length > 0) {
      return plans.map((plan) => ({
        key: plan.key,
        name: plan.name,
        kind: plan.kind,
        tagline: plan.tagline,
        description: plan.description,
        priceCents: plan.priceCents,
        currency: plan.currency,
        interval: plan.interval,
        creditsGranted: plan.creditsGranted,
        features: Array.isArray(plan.features) ? (plan.features as string[]) : [],
        isDefault: plan.isDefault,
        purchasable: plan.kind === PlanKind.FREE || Boolean(plan.stripePriceId),
      }));
    }
  } catch (error) {
    logger.error('Could not load plans from the database; using seed values', { error });
  }

  // The pricing page must render even before the first seed run.
  return PLAN_SEEDS.map((plan) => ({
    key: plan.key,
    name: plan.name,
    kind: plan.kind,
    tagline: plan.tagline,
    description: plan.description,
    priceCents: plan.priceCents,
    currency: 'USD',
    interval: plan.interval,
    creditsGranted: plan.creditsGranted,
    features: plan.features,
    isDefault: plan.isDefault,
    purchasable: plan.kind === PlanKind.FREE,
  }));
}

export interface PublicFaqEntry {
  key: string;
  question: string;
  answer: string;
}

export async function getPublicFaq(): Promise<PublicFaqEntry[]> {
  return cached('faq', loadPublicFaq);
}

async function loadPublicFaq(): Promise<PublicFaqEntry[]> {
  try {
    const blocks = await prisma.contentBlock.findMany({
      where: { category: 'faq', isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return blocks.map((block) => ({
      key: block.key,
      question: block.title ?? '',
      answer: block.body,
    }));
  } catch (error) {
    logger.error('Could not load FAQ content', { error });
    return [];
  }
}

export async function getAnnouncement(): Promise<string | null> {
  return cached('announcement', loadAnnouncement);
}

async function loadAnnouncement(): Promise<string | null> {
  try {
    const block = await prisma.contentBlock.findUnique({ where: { key: 'homepage_announcement' } });
    return block?.isActive && block.body.trim() ? block.body : null;
  } catch {
    return null;
  }
}
