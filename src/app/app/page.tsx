import Link from 'next/link';
import type { Metadata } from 'next';
import {
  AlertCircle, ArrowRight, Camera, CheckCircle2, Circle, Plug, Plus, RefreshCw,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, StatTile,
} from '@/components/ui';
import { ItemThumbnail } from '@/components/app/item-thumbnail';
import { ItemStatusBadge } from '@/components/app/status-badge';
import { RetryGenerationButton } from '@/components/app/retry-generation-button';
import { requireWorkspace } from '@/server/session';
import { getDashboardSummary } from '@/server/dashboard';
import { getPlatformStatuses } from '@/server/marketplace';
import { formatMoney } from '@/lib/money';
import { relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const context = await requireWorkspace();
  const [summary, platforms] = await Promise.all([
    getDashboardSummary(context.workspace.id),
    getPlatformStatuses(context.workspace.id),
  ]);

  const hasItems = Object.values(summary.statusCounts).some((count) => count > 0);
  const failures = summary.activity.filter((entry) => entry.status === 'FAILED');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            {greeting()}, {context.user.name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            {hasItems
              ? `${summary.listingsThisMonth} ${summary.listingsThisMonth === 1 ? 'listing' : 'listings'} created this month.`
              : 'Photograph an item and you will have four marketplace drafts in a few minutes.'}
          </p>
        </div>

        <Button asChild variant="primary" size="lg" className="shrink-0">
          <Link href="/app/items/new">
            <Plus />
            New listing
          </Link>
        </Button>
      </div>

      {failures.length > 0 ? (
        <Alert tone="warning" title={`${failures.length} generation ${failures.length === 1 ? 'failure' : 'failures'}`}>
          <p>
            Credits for failed generations have already been returned to your balance. You can retry
            from the item, or from the activity list below.
          </p>
        </Alert>
      ) : null}

      {/* Key figures */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Credits available"
          value={summary.credits.total}
          hint={
            summary.credits.monthly > 0
              ? `${summary.credits.monthly} from your plan · ${summary.credits.purchased} purchased`
              : `${summary.credits.purchased} purchased`
          }
          tone={summary.credits.total <= 3 ? 'accent' : 'neutral'}
        />
        <StatTile label="Created this month" value={summary.listingsThisMonth} hint="New items" />
        <StatTile
          label="Ready to list"
          value={summary.statusCounts.READY}
          hint={`${summary.statusCounts.DRAFT} still in draft`}
        />
        <StatTile
          label="Inventory value"
          value={formatMoney(summary.inventoryValueCents, context.workspace.currency)}
          hint={
            summary.inventoryValueBasis === 'user_confirmed'
              ? 'Based on prices you confirmed'
              : 'Based on suggested prices — confirm them for an accurate figure'
          }
        />
      </div>

      {/*
        `min-w-0` on both columns: a grid item's min-width defaults to `auto`,
        so its widest content sets the track size and the column grows past the
        grid — which pushed the dashboard sideways on a phone.
      */}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-6">
          {/* Onboarding */}
          {!summary.onboarding.complete ? (
            <Card>
              <CardHeader>
                <CardTitle>Get set up</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2.5">
                  {summary.onboarding.steps.map((step) => (
                    <li key={step.key}>
                      <Link
                        href={step.href}
                        className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-stone-50"
                      >
                        {step.done ? (
                          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                        ) : (
                          <Circle className="size-4 shrink-0 text-stone-300" aria-hidden="true" />
                        )}
                        {/*
                          `min-w-0 flex-1` lets the label shrink. Without it a
                          flex item refuses to go below its content width, and a
                          long step label pushed this row — and the whole page —
                          wider than a phone screen.
                        */}
                        <span
                          className={
                            step.done
                              ? 'min-w-0 flex-1 text-[13px] text-muted line-through'
                              : 'min-w-0 flex-1 text-[13px] font-medium text-ink'
                          }
                        >
                          {step.label}
                        </span>
                        {!step.done ? (
                          <ArrowRight className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : null}

          {/* Recent items */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Recent items</CardTitle>
              {hasItems ? (
                <Link
                  href="/app/inventory"
                  className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  View all
                </Link>
              ) : null}
            </CardHeader>
            <CardContent>
              {summary.recentItems.length === 0 ? (
                <EmptyState
                  icon={<Camera className="size-7" />}
                  title="No items yet"
                  description="Upload a few photos of something you want to sell and we will write the listings."
                  action={
                    <Button asChild variant="primary">
                      <Link href="/app/items/new">Create my first listing</Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y divide-stone-200">
                  {summary.recentItems.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/app/items/${item.id}`}
                        className="flex items-center gap-3 py-3 transition-colors hover:bg-stone-50"
                      >
                        <ItemThumbnail objectKey={item.thumbnailKey} alt="" size={48} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-ink">{item.title}</p>
                          <p className="mt-0.5 text-[12px] text-muted">
                            {item.sku} · updated {relativeTime(item.updatedAt)}
                          </p>
                        </div>
                        <ItemStatusBadge status={item.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          {/* Status breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>By status</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2">
                {(
                  [
                    ['Draft', summary.statusCounts.DRAFT],
                    ['Ready', summary.statusCounts.READY],
                    ['Listed', summary.statusCounts.LISTED],
                    ['Sold', summary.statusCounts.SOLD],
                    ['Archived', summary.statusCounts.ARCHIVED],
                  ] as const
                ).map(([label, count]) => (
                  <div key={label} className="flex items-center justify-between">
                    <dt className="text-[13px] text-muted">{label}</dt>
                    <dd className="text-[13px] font-medium tabular-nums text-ink">{count}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          {/* Platform status */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Platforms</CardTitle>
              <Link
                href="/app/integrations"
                className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                Manage
              </Link>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {platforms.map((platform) => (
                  <li key={platform.key} className="flex items-center justify-between gap-2">
                    <span className="text-[13px] text-ink">{platform.name}</span>
                    <Badge
                      tone={
                        platform.state === 'CONNECTED'
                          ? 'success'
                          : platform.state === 'EXPORT_ONLY'
                            ? 'neutral'
                            : platform.state === 'REAUTH_REQUIRED' || platform.state === 'EXPIRED'
                              ? 'warning'
                              : 'neutral'
                      }
                    >
                      {platform.state === 'CONNECTED'
                        ? 'Connected'
                        : platform.state === 'EXPORT_ONLY'
                          ? 'Export ready'
                          : platform.state === 'AVAILABLE'
                            ? 'Not connected'
                            : platform.state === 'REAUTH_REQUIRED'
                              ? 'Reconnect'
                              : platform.state === 'EXPIRED'
                                ? 'Expired'
                                : 'Unavailable'}
                    </Badge>
                  </li>
                ))}
              </ul>
              {platforms.every((platform) => platform.state !== 'CONNECTED') ? (
                <Button asChild variant="outline" size="sm" full className="mt-4">
                  <Link href="/app/integrations">
                    <Plug />
                    Connect a marketplace
                  </Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {/* Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Generation activity</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.activity.length === 0 ? (
                <p className="text-[13px] text-muted">No generations yet.</p>
              ) : (
                <ul className="space-y-3">
                  {summary.activity.map((entry) => (
                    <li key={entry.id} className="flex items-start gap-2.5">
                      {entry.status === 'FAILED' ? (
                        <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
                      ) : entry.status === 'SUCCEEDED' ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                      ) : (
                        <RefreshCw className="mt-0.5 size-4 shrink-0 animate-spin text-info" aria-hidden="true" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-ink">
                          {entry.itemTitle ?? 'Item'}
                        </p>
                        <p className="text-[12px] text-muted">
                          {entry.status === 'FAILED' && entry.error
                            ? entry.error
                            : relativeTime(entry.createdAt)}
                        </p>
                        {entry.canRetry && entry.itemId ? (
                          <RetryGenerationButton itemId={entry.itemId} />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
