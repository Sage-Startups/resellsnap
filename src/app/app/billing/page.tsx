import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Check, Info } from 'lucide-react';
import {
  Alert, Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, StatTile,
} from '@/components/ui';
import { CheckoutButton, CheckoutResult, PortalButton } from './billing-buttons';
import { prisma } from '@/lib/db';
import { isStripeConfigured } from '@/lib/env';
import { requireWorkspace } from '@/server/session';
import { getVisiblePlans } from '@/server/public-data';
import { formatMoney } from '@/lib/money';
import { formatDate, relativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Billing' };

const LEDGER_LABELS: Record<string, string> = {
  SIGNUP_GRANT: 'Welcome credits',
  PLAN_RENEWAL: 'Plan renewal',
  PACK_PURCHASE: 'Credit pack',
  ADMIN_GRANT: 'Adjustment by support',
  ADMIN_REVERSAL: 'Reversal by support',
  CONSUMPTION: 'Listing generation',
  REFUND: 'Refund for a failed generation',
  EXPIRY: 'Expired',
};

export default async function BillingPage() {
  const context = await requireWorkspace();

  const [subscription, plans, ledger] = await Promise.all([
    prisma.subscription.findUnique({
      where: { workspaceId: context.workspace.id },
      include: { plan: true },
    }),
    getVisiblePlans(),
    prisma.creditLedger.findMany({
      where: { workspaceId: context.workspace.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);

  const monthly = context.workspace.monthlyCredits;
  const purchased = context.workspace.purchasedCredits;
  const stripeReady = isStripeConfigured();

  const currentPlanKey = subscription?.plan?.key ?? 'free';
  const subscriptions = plans.filter((plan) => plan.kind !== 'CREDIT_PACK');
  const packs = plans.filter((plan) => plan.kind === 'CREDIT_PACK');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Billing"
        description="Your plan, your credits, and every movement in and out of your balance."
      />

      <Suspense fallback={null}>
        <CheckoutResult />
      </Suspense>

      {!stripeReady ? (
        <Alert tone="warning" title="Billing is not configured">
          This deployment has no Stripe keys yet, so plans and credit packs cannot be purchased.
          Everything else works normally.
        </Alert>
      ) : null}

      {/* Current state */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Current plan"
          value={subscription?.plan?.name ?? 'Free'}
          hint={
            subscription?.status === 'PAST_DUE'
              ? 'Payment failed — update your card'
              : subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd
                ? `Ends ${formatDate(subscription.currentPeriodEnd)}`
                : subscription?.currentPeriodEnd
                  ? `Renews ${formatDate(subscription.currentPeriodEnd)}`
                  : 'No card on file'
          }
        />
        <StatTile
          label="Plan credits"
          value={monthly}
          hint={subscription?.plan ? 'Reset each billing period' : 'Subscribe for monthly credits'}
        />
        <StatTile
          label="Purchased credits"
          value={purchased}
          hint="Never expire · spent after plan credits"
          tone="accent"
        />
      </div>

      {subscription?.status === 'PAST_DUE' ? (
        <Alert tone="danger" title="Your last payment failed">
          Your existing credits still work, but the plan will not renew until payment succeeds.
          Update your card in the billing portal.
        </Alert>
      ) : null}

      {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd ? (
        <Alert tone="warning" title="Your plan ends soon">
          {subscription.plan?.name ?? 'Your plan'} runs until{' '}
          {formatDate(subscription.currentPeriodEnd)}. Purchased credits are unaffected and your
          listings stay accessible.
        </Alert>
      ) : null}

      {/* Plans */}
      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {subscriptions.map((plan) => {
              const current = plan.key === currentPlanKey;
              return (
                <div
                  key={plan.key}
                  className={cn(
                    'flex flex-col rounded-xl border p-4',
                    current ? 'border-ink bg-lime-wash/30' : 'border-stone-200',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[14px] font-semibold text-ink">{plan.name}</h3>
                    {current ? <Badge tone="accent">Current</Badge> : null}
                  </div>

                  <p className="mt-3 flex items-baseline gap-1">
                    <span className="text-2xl font-semibold tracking-tight text-ink">
                      {plan.priceCents === 0 ? 'Free' : formatMoney(plan.priceCents, plan.currency)}
                    </span>
                    {plan.interval ? (
                      <span className="text-[12px] text-muted">/ {plan.interval}</span>
                    ) : null}
                  </p>

                  <p className="mt-1 text-[12px] font-medium text-ink-soft">
                    {plan.creditsGranted} credits{plan.interval ? ' per period' : ''}
                  </p>

                  <ul className="mt-4 flex-1 space-y-1.5">
                    {plan.features.slice(0, 4).map((feature) => (
                      <li key={feature} className="flex gap-2 text-[12px] leading-relaxed text-muted">
                        <Check className="mt-0.5 size-3 shrink-0 text-lime-deep" aria-hidden="true" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4">
                    {current ? (
                      subscription?.stripeCustomerId ? (
                        <PortalButton />
                      ) : (
                        <p className="text-center text-[12px] text-muted">Your current plan</p>
                      )
                    ) : plan.priceCents === 0 ? (
                      <p className="text-center text-[12px] text-muted">
                        Downgrade from the billing portal
                      </p>
                    ) : (
                      <CheckoutButton
                        planKey={plan.key}
                        label={`Choose ${plan.name}`}
                        variant={plan.key === 'pro' ? 'primary' : 'outline'}
                        disabled={!stripeReady || !plan.purchasable}
                        full
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Packs */}
      <Card>
        <CardHeader>
          <CardTitle>Top-up credit packs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-[13px] text-muted">
            One-off purchases that never expire. Plan credits are always spent first, so a pack is
            never wasted.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {packs.map((pack) => (
              <div
                key={pack.key}
                className="flex flex-col rounded-lg border border-stone-200 p-4 text-center"
              >
                <p className="text-2xl font-semibold tabular-nums text-ink">
                  {pack.creditsGranted}
                </p>
                <p className="text-[12px] text-muted">credits</p>
                <p className="mt-2 text-[15px] font-semibold text-ink">
                  {formatMoney(pack.priceCents, pack.currency)}
                </p>
                <p className="text-[11px] text-subtle">
                  {formatMoney(Math.round(pack.priceCents / pack.creditsGranted), pack.currency)} each
                </p>
                <div className="mt-3">
                  <CheckoutButton
                    planKey={pack.key}
                    label="Buy"
                    disabled={!stripeReady || !pack.purchasable}
                    full
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Ledger */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Credit history</CardTitle>
          <span className="text-[11px] text-muted">Append-only</span>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-[13px] text-muted">No credit movements yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <caption className="sr-only">Credit ledger</caption>
                <thead>
                  <tr className="border-b border-stone-200">
                    {['When', 'What', 'Bucket', 'Change', 'Balance after'].map((heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="py-2 text-[11px] font-semibold uppercase tracking-wider text-muted"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {ledger.map((entry) => (
                    <tr key={entry.id}>
                      <td className="py-2 text-[12px] text-muted">
                        {relativeTime(entry.createdAt)}
                      </td>
                      <td className="py-2 text-[12px] text-ink">
                        {LEDGER_LABELS[entry.kind] ?? entry.kind}
                        {entry.reason ? (
                          <span className="block text-[11px] text-muted">{entry.reason}</span>
                        ) : null}
                      </td>
                      <td className="py-2 text-[12px] text-muted">
                        {entry.bucket === 'MONTHLY' ? 'Plan' : 'Purchased'}
                      </td>
                      <td
                        className={cn(
                          'py-2 text-[12px] font-medium tabular-nums',
                          entry.delta >= 0 ? 'text-success' : 'text-ink',
                        )}
                      >
                        {entry.delta > 0 ? '+' : ''}
                        {entry.delta}
                      </td>
                      <td className="py-2 text-[12px] tabular-nums text-muted">
                        {entry.balanceAfter}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-[12px] leading-relaxed text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          Payments are processed by Stripe; we never see or store your card details. Invoices and
          receipts live in the billing portal. See{' '}
          <Link href="/legal/terms" className="underline underline-offset-4 hover:text-ink">
            our terms
          </Link>{' '}
          for the full billing policy.
        </span>
      </p>
    </div>
  );
}
