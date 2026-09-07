import type { Metadata } from 'next';
import { Alert, PageHeader } from '@/components/ui';
import { PlanEditor } from './plan-editor';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/server/session';
import { Role } from '@/generated/prisma/enums';
import { isStripeConfigured } from '@/lib/env';

export const metadata: Metadata = { title: 'Plans' };

export default async function AdminPlansPage() {
  await requireStaff(Role.SUPER_ADMIN);

  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { entitlements: true, _count: { select: { subscriptions: true } } },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Plans and packs"
        description="Display copy, credit allowances, visibility and Stripe Price IDs. Stripe remains the source of truth for what is actually charged."
      />

      <Alert tone="neutral">
        Changing a price here changes only what is <em>displayed</em>. The amount charged is
        whatever the mapped Stripe Price says, which is why the Price ID is the field that matters.
        {!isStripeConfigured()
          ? ' Stripe is not configured on this deployment, so nothing can be purchased.'
          : ''}
      </Alert>

      <div className="space-y-4">
        {plans.map((plan) => (
          <PlanEditor
            key={plan.id}
            plan={{
              id: plan.id,
              key: plan.key,
              name: plan.name,
              kind: plan.kind,
              tagline: plan.tagline,
              description: plan.description,
              priceCents: plan.priceCents,
              currency: plan.currency,
              interval: plan.interval,
              creditsGranted: plan.creditsGranted,
              stripePriceId: plan.stripePriceId,
              isVisible: plan.isVisible,
              features: Array.isArray(plan.features) ? (plan.features as string[]) : [],
              subscriberCount: plan._count.subscriptions,
              entitlements: plan.entitlements.map((entitlement) => ({
                key: entitlement.key,
                value:
                  entitlement.boolValue !== null
                    ? String(entitlement.boolValue)
                    : String(entitlement.intValue ?? entitlement.stringValue ?? ''),
              })),
            }}
          />
        ))}
      </div>
    </div>
  );
}
