import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, PageHeader, StatTile,
} from '@/components/ui';
import { BarChart, BreakdownBars } from '@/components/charts/bar-chart';
import { requireStaff } from '@/server/session';
import { getAdminOverview, getAdminTimeseries } from '@/server/admin/stats';
import { formatMoney, formatMoneyCompact } from '@/lib/money';
import { formatNumber, formatPercent, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Overview' };

const RANGES = [7, 30, 90] as const;

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const days = RANGES.includes(Number(params.days) as never) ? Number(params.days) : 30;

  const [overview, series] = await Promise.all([
    getAdminOverview(days),
    getAdminTimeseries(days),
  ]);

  const signupDelta =
    overview.users.newInPrevious === 0
      ? null
      : (overview.users.newInRange - overview.users.newInPrevious) / overview.users.newInPrevious;

  const healthIssues = [
    overview.health.deadLetter > 0 && `${overview.health.deadLetter} dead-lettered jobs`,
    overview.health.webhookFailures > 0 && `${overview.health.webhookFailures} failed webhooks`,
    overview.health.openIncidents > 0 && `${overview.health.openIncidents} open incidents`,
    (overview.health.oldestQueuedMinutes ?? 0) > 15 &&
      `Oldest queued job is ${overview.health.oldestQueuedMinutes} minutes old`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={`Live figures from the database for the ${overview.range.label.toLowerCase()}.`}
        actions={
          <div className="flex gap-1">
            {RANGES.map((range) => (
              <Button key={range} asChild variant={days === range ? 'ink' : 'outline'} size="sm">
                <Link href={`/admin?days=${range}`}>{range}d</Link>
              </Button>
            ))}
          </div>
        }
      />

      {healthIssues.length > 0 ? (
        <Alert tone="warning" title="Needs attention">
          <ul className="mt-1 space-y-1">
            {healthIssues.map((issue) => (
              <li key={issue} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {issue}
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/admin/health">Open system health</Link>
          </Button>
        </Alert>
      ) : (
        <Alert tone="success">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Queue, webhooks and incidents are all clear.
          </span>
        </Alert>
      )}

      {/* Growth */}
      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted">
          Growth
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Total users"
            value={formatNumber(overview.users.total)}
            hint={`${overview.users.verified} verified · ${overview.users.suspended} suspended`}
          />
          <StatTile
            label="New signups"
            value={formatNumber(overview.users.newInRange)}
            hint={
              signupDelta === null
                ? 'No prior period'
                : `${signupDelta >= 0 ? '+' : ''}${formatPercent(signupDelta, 0)} vs previous`
            }
          />
          <StatTile
            label="Active users"
            value={formatNumber(overview.users.active)}
            hint="Signed in during this window"
          />
          <StatTile
            label="Signup → paid"
            value={
              overview.conversion.rate === null ? '—' : formatPercent(overview.conversion.rate, 1)
            }
            hint={`${overview.conversion.converted} of ${overview.conversion.signups}`}
          />
        </div>
      </section>

      {/* Revenue */}
      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted">
          Revenue
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="MRR"
            value={formatMoney(overview.subscriptions.mrrCents)}
            hint={`${overview.subscriptions.activeTotal} active subscriptions`}
            tone="accent"
          />
          <StatTile
            label="ARR run rate"
            value={formatMoneyCompact(overview.subscriptions.arrRunRateCents)}
            hint="MRR × 12, not a forecast"
          />
          <StatTile
            label="Failed payments"
            value={formatNumber(overview.revenue.failedPayments)}
            hint={`${overview.subscriptions.pastDue} accounts past due`}
          />
          <StatTile
            label="Churn"
            value={
              overview.subscriptions.churnRate === null
                ? '—'
                : formatPercent(overview.subscriptions.churnRate, 1)
            }
            hint={`${overview.subscriptions.canceledInRange} cancellations`}
          />
        </div>

        {overview.subscriptions.byPlan.length > 0 ? (
          <Card className="mt-3">
            <CardHeader>
              <CardTitle>Subscriptions by plan</CardTitle>
            </CardHeader>
            <CardContent>
              <BreakdownBars
                caption="Active subscriptions by plan"
                data={overview.subscriptions.byPlan.map((row) => ({
                  label: row.plan,
                  value: row.mrrCents,
                  formatted: `${row.count} · ${formatMoney(row.mrrCents)} MRR`,
                }))}
              />
            </CardContent>
          </Card>
        ) : null}
      </section>

      {/* Product */}
      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted">
          Product
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Listings generated"
            value={formatNumber(overview.listings.generated)}
            hint={`${overview.listings.failed} failed`}
          />
          <StatTile
            label="Completion rate"
            value={
              overview.listings.completionRate === null
                ? '—'
                : formatPercent(overview.listings.completionRate, 1)
            }
          />
          <StatTile
            label="Median job duration"
            value={
              overview.listings.medianDurationMs === null
                ? '—'
                : `${(overview.listings.medianDurationMs / 1000).toFixed(1)}s`
            }
          />
          <StatTile
            label="Cost per listing"
            value={
              overview.ai.costPerListingCents === null
                ? '—'
                : formatMoney(overview.ai.costPerListingCents)
            }
            hint={`${formatMoney(overview.ai.estimatedCostCents)} estimated AI spend`}
          />
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Daily activity</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                caption="Listings generated per day"
                valueLabel="Listings"
                compareLabel="Signups"
                data={series.map((row) => ({
                  label: row.date.slice(5),
                  value: row.listings,
                  compare: row.signups,
                }))}
              />
              <div className="mt-3 flex gap-4 text-[11px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm bg-ink" aria-hidden="true" />
                  Listings
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm bg-stone-300" aria-hidden="true" />
                  Signups
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Items by status</CardTitle>
            </CardHeader>
            <CardContent>
              <BreakdownBars
                caption="Items by status"
                data={Object.entries(overview.items.byStatus).map(([status, count]) => ({
                  label: titleCase(status),
                  value: count,
                  formatted: formatNumber(count),
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* AI and credits */}
      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted">
          AI usage and credit liability
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="AI calls"
            value={formatNumber(overview.ai.callCount)}
            hint={`${formatNumber(overview.ai.inputTokens)} in · ${formatNumber(overview.ai.outputTokens)} out`}
          />
          <StatTile
            label="Credits used"
            value={formatNumber(overview.credits.used)}
            hint={`${overview.credits.refunded} refunded`}
          />
          <StatTile
            label="Credits granted"
            value={formatNumber(overview.credits.granted + overview.credits.purchased)}
            hint={`${overview.credits.purchased} purchased`}
          />
          <StatTile
            label="Outstanding liability"
            value={formatNumber(overview.credits.outstanding)}
            hint="Unspent credits across all workspaces"
          />
        </div>
      </section>

      {/* Marketplace and GMV */}
      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted">
          Marketplace activity
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Direct publications"
            value={formatNumber(overview.publications.published)}
            hint={`${overview.publications.failed} failed`}
          />
          <StatTile label="Exports built" value={formatNumber(overview.publications.exports)} />
          <StatTile
            label="Seller-reported GMV"
            value={formatMoneyCompact(overview.gmv.userReportedCents)}
            hint={`${overview.gmv.salesCount} recorded sales`}
          />
          <StatTile
            label="API-synced GMV"
            value={formatMoneyCompact(overview.gmv.apiSyncedCents)}
            hint="From connected marketplace APIs only"
          />
        </div>

        {overview.publications.topErrors.length > 0 ? (
          <Card className="mt-3">
            <CardHeader>
              <CardTitle>Top publication errors</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {overview.publications.topErrors.map((error) => (
                  <li key={error.code} className="flex items-center justify-between gap-3">
                    <code className="text-[12px] text-ink">{error.code}</code>
                    <Badge tone="danger">{error.count}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </section>

      {/* Infrastructure */}
      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted">
          Infrastructure
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Queue depth"
            value={formatNumber(overview.health.queueDepth)}
            hint={
              overview.health.oldestQueuedMinutes === null
                ? 'Nothing waiting'
                : `Oldest ${overview.health.oldestQueuedMinutes}m`
            }
          />
          <StatTile
            label="Dead-lettered"
            value={formatNumber(overview.health.deadLetter)}
            hint="Exhausted every retry"
          />
          <StatTile
            label="Storage"
            value={`${(overview.storage.totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB`}
            hint={`${formatNumber(overview.storage.photoCount)} photos`}
          />
          <StatTile
            label="Email"
            value={formatNumber(overview.email.sent)}
            hint={`${overview.email.failed} failed · ${overview.email.suppressed} suppressed`}
          />
        </div>
      </section>

      <p className="flex items-center gap-2 text-[12px] text-muted">
        {signupDelta !== null && signupDelta >= 0 ? (
          <ArrowUpRight className="size-3.5 text-success" aria-hidden="true" />
        ) : (
          <ArrowDownRight className="size-3.5 text-muted" aria-hidden="true" />
        )}
        Every figure on this page is queried live. Business events come from a fixed event
        vocabulary — page views are never counted as activity.
      </p>
    </div>
  );
}
