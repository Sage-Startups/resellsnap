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
  try {
    const block = await prisma.contentBlock.findUnique({ where: { key: 'homepage_announcement' } });
    return block?.isActive && block.body.trim() ? block.body : null;
  } catch {
    return null;
  }
}
