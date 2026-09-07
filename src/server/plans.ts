/**
 * Plan and credit-pack catalogue.
 *
 * These are the *seed* values. Once seeded, names, prices, credit allowances,
 * features, visibility and Stripe Price IDs are all editable in the admin
 * console — Stripe remains the source of truth for what is actually charged.
 */
import { PlanKind } from '@/generated/prisma/enums';

export interface PlanSeed {
  key: string;
  name: string;
  kind: PlanKind;
  tagline: string;
  description: string;
  priceCents: number;
  interval: 'month' | null;
  creditsGranted: number;
  /** Environment variable holding the Stripe Price ID for this offer. */
  stripePriceEnv: string | null;
  isDefault: boolean;
  sortOrder: number;
  features: string[];
  entitlements: Record<string, boolean | number | string>;
}

export const PLAN_SEEDS: PlanSeed[] = [
  {
    key: 'free',
    name: 'Free',
    kind: PlanKind.FREE,
    tagline: 'Try it on three real items',
    description: 'Everything you need to see whether the drafts are good enough to publish.',
    priceCents: 0,
    interval: null,
    creditsGranted: 3,
    stripePriceEnv: null,
    isDefault: true,
    sortOrder: 0,
    features: [
      '3 one-time listing credits',
      'All four platform templates',
      'Interactive live demo',
      'Copy and export workflows',
      'No card required',
    ],
    entitlements: {
      bulkWorkflow: false,
      savedBrandVoice: false,
      advancedAnalytics: false,
      priorityQueue: false,
      ebayConnection: false,
      inventoryHistoryDays: 30,
    },
  },
  {
    key: 'starter',
    name: 'Starter',
    kind: PlanKind.SUBSCRIPTION,
    tagline: 'For a steady side hustle',
    description: 'Fifty listings a month, direct eBay publishing and full inventory history.',
    priceCents: 1500,
    interval: 'month',
    creditsGranted: 50,
    stripePriceEnv: 'STRIPE_PRICE_STARTER_MONTHLY',
    isDefault: false,
    sortOrder: 1,
    features: [
      '50 listing credits every billing period',
      'Platform exports for all four marketplaces',
      'Direct eBay connection and publishing',
      'Full inventory and sales history',
      'Standard analytics',
    ],
    entitlements: {
      bulkWorkflow: false,
      savedBrandVoice: false,
      advancedAnalytics: false,
      priorityQueue: false,
      ebayConnection: true,
      inventoryHistoryDays: 3650,
    },
  },
  {
    key: 'pro',
    name: 'Pro',
    kind: PlanKind.SUBSCRIPTION,
    tagline: 'For high-volume resellers',
    description: 'Bulk processing, a saved brand voice and priority in the generation queue.',
    priceCents: 2900,
    interval: 'month',
    creditsGranted: 200,
    stripePriceEnv: 'STRIPE_PRICE_PRO_MONTHLY',
    isDefault: false,
    sortOrder: 2,
    features: [
      '200 listing credits every billing period',
      'Bulk workflow for multiple items at once',
      'Saved brand voice applied to every listing',
      'Advanced analytics and CSV exports',
      'Priority generation queue',
      'Everything in Starter',
    ],
    entitlements: {
      bulkWorkflow: true,
      savedBrandVoice: true,
      advancedAnalytics: true,
      priorityQueue: true,
      ebayConnection: true,
      inventoryHistoryDays: 3650,
    },
  },
  {
    key: 'pack_20',
    name: '20-credit pack',
    kind: PlanKind.CREDIT_PACK,
    tagline: 'Top up when you need it',
    description: 'Twenty listing credits that do not expire.',
    priceCents: 700,
    interval: null,
    creditsGranted: 20,
    stripePriceEnv: 'STRIPE_PRICE_PACK_20',
    isDefault: false,
    sortOrder: 10,
    features: ['20 listing credits', 'Never expires', 'Works with any plan'],
    entitlements: {},
  },
  {
    key: 'pack_75',
    name: '75-credit pack',
    kind: PlanKind.CREDIT_PACK,
    tagline: 'Best for a big clear-out',
    description: 'Seventy-five listing credits that do not expire.',
    priceCents: 1900,
    interval: null,
    creditsGranted: 75,
    stripePriceEnv: 'STRIPE_PRICE_PACK_75',
    isDefault: false,
    sortOrder: 11,
    features: ['75 listing credits', 'Never expires', 'Works with any plan'],
    entitlements: {},
  },
  {
    key: 'pack_200',
    name: '200-credit pack',
    kind: PlanKind.CREDIT_PACK,
    tagline: 'Lowest cost per listing',
    description: 'Two hundred listing credits that do not expire.',
    priceCents: 3900,
    interval: null,
    creditsGranted: 200,
    stripePriceEnv: 'STRIPE_PRICE_PACK_200',
    isDefault: false,
    sortOrder: 12,
    features: ['200 listing credits', 'Never expires', 'Works with any plan'],
    entitlements: {},
  },
];

export function findPlanSeed(key: string): PlanSeed | undefined {
  return PLAN_SEEDS.find((plan) => plan.key === key);
}

export const ENTITLEMENT_KEYS = [
  'bulkWorkflow',
  'savedBrandVoice',
  'advancedAnalytics',
  'priorityQueue',
  'ebayConnection',
  'inventoryHistoryDays',
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

export const ENTITLEMENT_LABELS: Record<EntitlementKey, string> = {
  bulkWorkflow: 'Bulk listing workflow',
  savedBrandVoice: 'Saved brand voice',
  advancedAnalytics: 'Advanced analytics',
  priorityQueue: 'Priority generation queue',
  ebayConnection: 'Direct eBay connection',
  inventoryHistoryDays: 'Inventory history (days)',
};
