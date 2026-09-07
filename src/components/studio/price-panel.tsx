'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Info, Pencil } from 'lucide-react';
import { Alert, Badge, Button, Input } from '@/components/ui';
import { updatePriceAction } from '@/server/items/actions';
import { formatMoney, parseMoneyToCents, calculateFees } from '@/lib/money';
import { cn } from '@/lib/utils';

export interface PriceRow {
  strategy: 'QUICK_SALE' | 'BALANCED' | 'MAXIMISE_RETURN';
  amountCents: number;
  lowCents: number | null;
  highCents: number | null;
  currency: string;
  source: string;
  confidence: string;
  explanation: string;
  comparableCount: number;
  observedAt: Date | null;
  userEdited: boolean;
}

const STRATEGY_LABELS = {
  QUICK_SALE: { label: 'Quick sale', hint: 'Priced to move within days' },
  BALANCED: { label: 'Balanced', hint: 'A fair price with a reasonable wait' },
  MAXIMISE_RETURN: { label: 'Maximise return', hint: 'Highest price, longest wait' },
} as const;

const SOURCE_LABELS: Record<string, string> = {
  MARKETPLACE_API: 'Official marketplace data',
  USER_HISTORY: 'Your own sales history',
  ADMIN_HEURISTIC: 'Category guideline',
  AI_ESTIMATE: 'AI estimate — no sales data',
};

const CONFIDENCE_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  HIGH: 'success',
  MEDIUM: 'warning',
  LOW: 'danger',
};

/**
 * Every suggestion states its source, confidence and basis. When no comparables
 * exist, the panel says so plainly rather than dressing an estimate up as market
 * data.
 */
export function PricePanel({
  itemId,
  prices,
  currency,
  acquisitionCostCents,
  feePercentBps,
  feeFixedCents,
  unavailableReason,
}: {
  itemId: string;
  prices: PriceRow[];
  currency: string;
  acquisitionCostCents: number | null;
  feePercentBps: number;
  feeFixedCents: number;
  unavailableReason?: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();

  if (prices.length === 0) {
    return (
      <Alert tone="neutral" title="No price suggestion">
        {unavailableReason ??
          'We could not price this item from the details available, so we have not guessed. Set your own price — you know your market better than we do.'}
      </Alert>
    );
  }

  function save(strategy: string) {
    const cents = parseMoneyToCents(draft);
    if (cents === null) return;
    startTransition(async () => {
      await updatePriceAction(itemId, { strategy, amountCents: cents });
      setEditing(null);
      router.refresh();
    });
  }

  const balanced = prices.find((price) => price.strategy === 'BALANCED') ?? prices[0];
  const fees = balanced
    ? calculateFees({
        grossCents: balanced.amountCents,
        feePercentBps,
        feeFixedCents,
        acquisitionCostCents: acquisitionCostCents ?? 0,
      })
    : null;

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {prices.map((price) => {
          const meta = STRATEGY_LABELS[price.strategy];
          const isEditing = editing === price.strategy;

          return (
            <li
              key={price.strategy}
              className={cn(
                'rounded-lg border p-3',
                price.strategy === 'BALANCED'
                  ? 'border-ink/20 bg-lime-wash/30'
                  : 'border-stone-200 bg-paper',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-ink">{meta.label}</p>
                  <p className="text-[11px] text-muted">{meta.hint}</p>
                </div>

                <div className="text-right">
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={draft}
                        autoFocus
                        inputMode="decimal"
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') save(price.strategy);
                          if (event.key === 'Escape') setEditing(null);
                        }}
                        className="h-8 w-28 text-right"
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={pending}
                        onClick={() => save(price.strategy)}
                      >
                        Save
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(price.strategy);
                        setDraft((price.amountCents / 100).toFixed(2));
                      }}
                      className="group inline-flex items-center gap-1.5"
                    >
                      <span className="text-[17px] font-semibold tabular-nums text-ink">
                        {formatMoney(price.amountCents, price.currency)}
                      </span>
                      <Pencil
                        className="size-3 text-subtle opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    </button>
                  )}

                  {price.lowCents !== null && price.highCents !== null && !isEditing ? (
                    <p className="text-[11px] tabular-nums text-muted">
                      {formatMoney(price.lowCents, currency)} – {formatMoney(price.highCents, currency)}
                    </p>
                  ) : null}
                </div>
              </div>

              {price.userEdited ? (
                <Badge tone="neutral" className="mt-2">
                  Your price — we will not overwrite it
                </Badge>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Basis — the honesty layer */}
      {balanced ? (
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Info className="size-3.5 text-muted" aria-hidden="true" />
            <span className="text-[12px] font-medium text-ink">
              {SOURCE_LABELS[balanced.source] ?? balanced.source}
            </span>
            <Badge tone={CONFIDENCE_TONE[balanced.confidence] ?? 'neutral'}>
              {balanced.confidence.toLowerCase()} confidence
            </Badge>
            {balanced.comparableCount > 0 ? (
              <Badge tone="neutral">{balanced.comparableCount} comparables</Badge>
            ) : null}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">{balanced.explanation}</p>
          {balanced.observedAt ? (
            <p className="mt-1 text-[11px] text-subtle">
              Most recent observation: {new Date(balanced.observedAt).toLocaleDateString()}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Net proceeds */}
      {fees ? (
        <div className="rounded-lg border border-stone-200 bg-paper p-3">
          <p className="text-[12px] font-semibold text-ink">
            If it sells at the balanced price
          </p>
          <dl className="mt-2 space-y-1">
            {(
              [
                ['Sale price', fees.grossCents, false],
                ['Estimated marketplace fee', -fees.marketplaceFeeCents, false],
                ['Net proceeds', fees.netProceedsCents, true],
                ...(acquisitionCostCents
                  ? ([
                      ['What you paid', -fees.acquisitionCostCents, false],
                      ['Your margin', fees.marginCents, true],
                    ] as const)
                  : []),
              ] as Array<[string, number, boolean]>
            ).map(([label, value, strong]) => (
              <div key={label} className="flex items-baseline justify-between gap-4">
                <dt className={cn('text-[12px]', strong ? 'font-medium text-ink' : 'text-muted')}>
                  {label}
                </dt>
                <dd
                  className={cn(
                    'text-[12px] tabular-nums',
                    strong ? 'font-semibold text-ink' : 'text-muted',
                  )}
                >
                  {formatMoney(value, currency)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] leading-relaxed text-subtle">
            Fees are estimates from the platform template and exclude payment processing, promoted
            listings and postage you pay separately.
          </p>
        </div>
      ) : null}
    </div>
  );
}
