/**
 * Entitlement resolution.
 *
 * Answers "may this workspace do X?" from the plan attached to its subscription,
 * falling back to the free plan. Always evaluated on the server; the UI reads
 * the result but never decides it.
 */
import { SubscriptionStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { ENTITLEMENT_KEYS, findPlanSeed, type EntitlementKey } from './plans';

export type Entitlements = Record<EntitlementKey, boolean | number>;

const ACTIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
  // A past-due subscription keeps working until Stripe gives up; cutting a
  // paying customer off on the first failed charge is hostile.
  SubscriptionStatus.PAST_DUE,
];

export async function getEntitlements(workspaceId: string): Promise<Entitlements> {
  const subscription = await prisma.subscription.findUnique({
    where: { workspaceId },
    include: { plan: { include: { entitlements: true } } },
  });

  const isActive = subscription ? ACTIVE_STATUSES.includes(subscription.status) : false;
  const plan = isActive ? subscription?.plan : null;

  const defaults = findPlanSeed('free')?.entitlements ?? {};
  const resolved: Record<string, boolean | number> = { ...(defaults as Record<string, boolean | number>) };

  for (const entitlement of plan?.entitlements ?? []) {
    if (entitlement.boolValue !== null) resolved[entitlement.key] = entitlement.boolValue;
    else if (entitlement.intValue !== null) resolved[entitlement.key] = entitlement.intValue;
  }

  // Guarantee every key is present so callers never see undefined.
  for (const key of ENTITLEMENT_KEYS) {
    resolved[key] ??= key === 'inventoryHistoryDays' ? 30 : false;
  }

  return resolved as Entitlements;
}

export async function hasEntitlement(workspaceId: string, key: EntitlementKey): Promise<boolean> {
  const entitlements = await getEntitlements(workspaceId);
  return entitlements[key] === true;
}

export class EntitlementError extends Error {
  readonly entitlement: EntitlementKey;

  constructor(entitlement: EntitlementKey, message: string) {
    super(message);
    this.name = 'EntitlementError';
    this.entitlement = entitlement;
  }
}

export async function requireEntitlement(workspaceId: string, key: EntitlementKey): Promise<void> {
  if (!(await hasEntitlement(workspaceId, key))) {
    const messages: Partial<Record<EntitlementKey, string>> = {
      bulkWorkflow: 'The bulk workflow is available on the Pro plan.',
      savedBrandVoice: 'A saved brand voice is available on the Pro plan.',
      advancedAnalytics: 'Advanced analytics are available on the Pro plan.',
      ebayConnection: 'Connecting eBay is available on the Starter and Pro plans.',
    };
    throw new EntitlementError(key, messages[key] ?? 'This feature is not included in your plan.');
  }
}
