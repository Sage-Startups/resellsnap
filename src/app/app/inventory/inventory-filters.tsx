'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { CATEGORY_HINTS } from '@/server/items/facts';
import { cn } from '@/lib/utils';

const STATUS_TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'READY', label: 'Ready' },
  { value: 'LISTED', label: 'Listed' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'ARCHIVED', label: 'Archived' },
  { value: 'DELETED', label: 'Deleted' },
] as const;

export function InventoryFilters({ statusCounts }: { statusCounts: Record<string, number> }) {
  const router = useRouter();
  const params = useSearchParams();

  const status = params.get('status') ?? 'ALL';
  const search = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'recent';

  // Every filter change resets to page 1; keeping a stale page number is the
  // classic way to show an empty results screen for no reason.
  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      next.delete('page');
      router.push(`/app/inventory?${next.toString()}`);
    },
    [params, router],
  );

  const hasFilters = Boolean(search || category || status !== 'ALL' || sort !== 'recent');

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Filter by status"
        className="-mx-1 flex gap-1 overflow-x-auto px-1"
      >
        {STATUS_TABS.map((tab) => {
          const active = status === tab.value;
          const count = statusCounts[tab.value];
          return (
            <button
              key={tab.value}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => update({ status: tab.value === 'ALL' ? null : tab.value })}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                active
                  ? 'border-ink bg-ink text-bone'
                  : 'border-stone-200 bg-paper text-muted hover:border-stone-300 hover:text-ink',
              )}
            >
              {tab.label}
              {count !== undefined && tab.value !== 'DELETED' ? (
                <span className={active ? 'text-bone/70' : 'text-subtle'}>{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <form
          className="relative flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            const value = String(new FormData(event.currentTarget).get('q') ?? '');
            update({ q: value || null });
          }}
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
            aria-hidden="true"
          />
          <Input
            name="q"
            defaultValue={search}
            placeholder="Search title, SKU, notes or item details"
            aria-label="Search inventory"
            className="pl-9"
          />
        </form>

        <Select
          value={category}
          onChange={(event) => update({ category: event.target.value || null })}
          aria-label="Filter by category"
          className="sm:w-48"
        >
          <option value="">All categories</option>
          {CATEGORY_HINTS.map((hint) => (
            <option key={hint.value} value={hint.value}>
              {hint.label}
            </option>
          ))}
        </Select>

        <Select
          value={sort}
          onChange={(event) => update({ sort: event.target.value })}
          aria-label="Sort"
          className="sm:w-44"
        >
          <option value="recent">Recently updated</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title A–Z</option>
          <option value="value_high">Cost, high to low</option>
          <option value="value_low">Cost, low to high</option>
        </Select>

        {hasFilters ? (
          <Button
            variant="ghost"
            onClick={() => router.push('/app/inventory')}
            aria-label="Clear filters"
          >
            <X />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
