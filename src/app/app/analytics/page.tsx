import type { Metadata } from 'next';
import Link from 'next/link';
import { Info } from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, PageHeader, StatTile,
} from '@/components/ui';
import { BarChart, BreakdownBars } from '@/components/charts/bar-chart';
import { requireWorkspace } from '@/server/session';
import { getCustomerAnalytics } from '@/server/dashboard';
import { getEntitlements } from '@/server/entitlements';
import { PLATFORM_NAMES } from '@/server/marketplace/registry';
import { formatMoney } from '@/lib/money';
import { formatPercent, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Analytics' };

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
] as const;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const context = await requireWorkspace();
  const params = await searchParams;
  const days = [30, 90, 365].includes(Number(params.days)) ? Number(params.days) : 90;

  const [analytics, entitlements] = await Promise.all([
    getCustomerAnalytics(context.workspace.id, days),
    getEntitlements(context.workspace.id),
  ]);

  const currency = context.workspace.currency;
  const hours = Math.round(analytics.timeSavedMinutes / 6) / 10;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics"
        description="What you have generated, what sold, and what you actually kept."
        actions={
          <div className="flex gap-1">
            {RANGES.map((range) => (
              <Button
                key={range.days}
                asChild
                variant={days === range.days ? 'ink' : 'outline'}
                size="sm"
              >
                <Link href={`/app/analytics?days=${range.days}`}>{range.label}</Link>
              </Button>
            ))}
          </div>
        }
      />

      {/* Provenance note — the difference between typed and synced data matters */}
      <Alert tone="neutral">
        <span className="flex items-start gap-2">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {analytics.hasApiSyncedData
              ? 'Sales below include figures synced from a connected marketplace API as well as figures you entered. Synced rows are marked on each platform breakdown.'
              : 'Every sale figure below was entered by you. Nothing here is synced from a marketplace API, because no connected marketplace on this account reports order data.'}
          </span>
        </span>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Listings generated" value={analytics.listingsGenerated} />
        <StatTile
          label="Published or exported"
          value={analytics.publishedOrExported}
          hint="Publish and export events"
        />
        <StatTile
          label="Sell-through rate"
          value={
            analytics.sellThroughRate === null ? '—' : formatPercent(analytics.sellThroughRate, 0)
          }
          hint={`${analytics.itemsSold} sold`}
        />
        <StatTile
          label="Avg. days to sale"
          value={analytics.averageDaysToSale ?? '—'}
          hint="From creation to sale"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Gross sales" value={formatMoney(analytics.grossSalesCents, currency)} />
        <StatTile
          label="Estimated fees"
          value={formatMoney(analytics.estimatedFeesCents, currency)}
          hint="As you recorded them"
        />
        <StatTile
          label="Net proceeds"
          value={formatMoney(analytics.netProceedsCents, currency)}
          tone="accent"
          hint="Gross less fees and shipping"
        />
        <StatTile
          label="Average order value"
          value={
            analytics.averageOrderValueCents === null
              ? '—'
              : formatMoney(analytics.averageOrderValueCents, currency)
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Activity by month</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              caption="Listings generated and items sold by month"
              valueLabel="Generated"
              compareLabel="Sold"
              data={analytics.monthly.map((row) => ({
                label: row.month.slice(5),
                value: row.generated,
                compare: row.sold,
              }))}
            />
            <div className="mt-3 flex gap-4 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-ink" aria-hidden="true" />
                Generated
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-stone-300" aria-hidden="true" />
                Sold
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gross sales by month</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              caption="Gross sales by month"
              valueLabel="Gross sales"
              data={analytics.monthly.map((row) => ({
                label: row.month.slice(5),
                value: row.grossCents,
                formatted: formatMoney(row.grossCents, currency),
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>By platform</CardTitle>
            {analytics.hasApiSyncedData ? <Badge tone="info">Includes synced</Badge> : null}
          </CardHeader>
          <CardContent>
            <BreakdownBars
              caption="Gross sales by platform"
              data={analytics.byPlatform.map((row) => ({
                label: `${PLATFORM_NAMES[row.platform]}${row.apiSynced > 0 ? ` · ${row.apiSynced} synced` : ''}`,
                value: row.grossCents,
                formatted: `${formatMoney(row.grossCents, currency)} · ${row.sold} sold`,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By category</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownBars
              caption="Gross sales by category"
              data={analytics.byCategory.slice(0, 8).map((row) => ({
                label: titleCase(row.category),
                value: row.grossCents,
                formatted: `${formatMoney(row.grossCents, currency)} · ${row.sold}/${row.listed}`,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estimated time saved</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums text-ink">
            {hours} {hours === 1 ? 'hour' : 'hours'}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {analytics.timeSavedAssumption} This is a stated assumption, not a measurement — adjust
            it mentally to whatever a marketplace listing genuinely costs you.
          </p>
        </CardContent>
      </Card>

      {!entitlements.advancedAnalytics ? (
        <Alert tone="neutral" title="More on Pro">
          <p>
            The Pro plan adds cohort views, per-platform fee reconciliation and scheduled CSV
            exports.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/app/billing">See plans</Link>
          </Button>
        </Alert>
      ) : null}
    </div>
  );
}
