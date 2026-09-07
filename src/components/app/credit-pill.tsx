import Link from 'next/link';
import { Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Credits are the product's unit of value, so the balance is always visible and
 * always one click from a top-up.
 */
export function CreditPill({
  monthly,
  purchased,
  className,
}: {
  monthly: number;
  purchased: number;
  className?: string;
}) {
  const total = monthly + purchased;
  const low = total <= 3;

  return (
    <Link
      href="/app/billing"
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors',
        low
          ? 'border-warning/30 bg-warning-wash hover:border-warning/50'
          : 'border-stone-200 bg-stone-50 hover:border-stone-300',
        className,
      )}
    >
      <span className="flex items-center gap-2">
        <Coins className={cn('size-4', low ? 'text-warning' : 'text-muted')} aria-hidden="true" />
        <span className="text-[13px] font-medium text-ink">
          {total} {total === 1 ? 'credit' : 'credits'}
        </span>
      </span>
      <span className="text-[11px] text-muted">
        {monthly > 0 && purchased > 0
          ? `${monthly} plan · ${purchased} packs`
          : low
            ? 'Top up'
            : 'Manage'}
      </span>
    </Link>
  );
}
