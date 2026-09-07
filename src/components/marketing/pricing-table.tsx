import Link from 'next/link';
import { Check } from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { PublicPlan } from '@/server/public-data';
import { cn } from '@/lib/utils';

export function PricingTable({
  plans,
  ctaHref = '/register',
  ctaLabel = 'Start free',
}: {
  plans: PublicPlan[];
  ctaHref?: string;
  ctaLabel?: string;
}) {
  const subscriptions = plans.filter((plan) => plan.kind !== 'CREDIT_PACK');
  const packs = plans.filter((plan) => plan.kind === 'CREDIT_PACK');

  return (
    <div className="space-y-10">
      <div className="grid gap-5 md:grid-cols-3">
        {subscriptions.map((plan) => {
          const featured = plan.key === 'starter';
          return (
            <Card
              key={plan.key}
              className={cn(
                'flex flex-col',
                featured && 'border-ink shadow-raised ring-1 ring-ink/5',
              )}
            >
              <CardContent className="flex flex-1 flex-col p-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-ink">{plan.name}</h3>
                  {featured ? <Badge tone="accent">Most popular</Badge> : null}
                </div>

                {plan.tagline ? (
                  <p className="mt-1 text-[13px] text-muted">{plan.tagline}</p>
                ) : null}

                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-3xl font-semibold tracking-tight text-ink">
                    {plan.priceCents === 0 ? 'Free' : formatMoney(plan.priceCents, plan.currency)}
                  </span>
                  {plan.interval ? (
                    <span className="text-[13px] text-muted">/ {plan.interval}</span>
                  ) : null}
                </p>

                <p className="mt-2 text-[13px] font-medium text-ink-soft">
                  {plan.creditsGranted} listing credits
                  {plan.interval ? ' each billing period' : ' one time'}
                </p>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-soft">
                      <Check className="mt-0.5 size-4 shrink-0 text-lime-deep" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={featured ? 'primary' : 'outline'}
                  full
                  className="mt-6"
                >
                  <Link href={ctaHref}>{plan.priceCents === 0 ? ctaLabel : `Choose ${plan.name}`}</Link>
                </Button>

                {!plan.purchasable && plan.priceCents > 0 ? (
                  <p className="mt-2 text-center text-[11px] text-muted">
                    Checkout becomes available once billing is configured.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {packs.length > 0 ? (
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Top-up credit packs</h3>
          <p className="mt-1 text-[13px] text-muted">
            One-off purchases that never expire and work alongside any plan.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {packs.map((pack) => (
              <div
                key={pack.key}
                className="flex items-center justify-between rounded-lg border border-stone-200 bg-paper px-4 py-3.5"
              >
                <div>
                  <p className="text-[13px] font-semibold text-ink">
                    {pack.creditsGranted} credits
                  </p>
                  <p className="text-[12px] text-muted">
                    {formatMoney(Math.round(pack.priceCents / pack.creditsGranted), pack.currency)} each
                  </p>
                </div>
                <span className="text-[15px] font-semibold tabular-nums text-ink">
                  {formatMoney(pack.priceCents, pack.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
