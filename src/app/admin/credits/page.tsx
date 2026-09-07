import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { Alert, Badge, Button, PageHeader, StatTile } from '@/components/ui';
import { AdminPagination, AdminTable } from '@/components/admin/admin-table';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/server/session';
import { formatNumber, relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Credits' };

const PAGE_SIZE = 50;

export default async function AdminCreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const [entries, total, totals, cachedBalances] = await Promise.all([
    prisma.creditLedger.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        workspace: { select: { id: true, name: true } },
        actor: { select: { id: true, name: true } },
      },
    }),
    prisma.creditLedger.count(),
    prisma.creditLedger.groupBy({ by: ['kind'], _sum: { delta: true } }),
    prisma.workspace.aggregate({
      _sum: { monthlyCredits: true, purchasedCredits: true },
    }),
  ]);

  const sumFor = (kind: string) =>
    totals.find((group) => group.kind === kind)?._sum.delta ?? 0;

  const granted = sumFor('SIGNUP_GRANT') + sumFor('PLAN_RENEWAL') + sumFor('ADMIN_GRANT');
  const purchased = sumFor('PACK_PURCHASE');
  const used = Math.abs(sumFor('CONSUMPTION'));
  const refunded = sumFor('REFUND');
  const reversed = Math.abs(sumFor('ADMIN_REVERSAL'));

  const ledgerBalance = granted + purchased - used + refunded - reversed;
  const cachedBalance =
    (cachedBalances._sum.monthlyCredits ?? 0) + (cachedBalances._sum.purchasedCredits ?? 0);
  const reconciles = ledgerBalance === cachedBalance;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Credits"
        description="The append-only ledger. Nothing here is ever edited or deleted — a mistake is corrected with a compensating entry."
        actions={
          <Button asChild variant="outline">
            <a href="/api/admin/credits/export">
              <Download />
              Export CSV
            </a>
          </Button>
        }
      />

      {/* The ledger is authoritative; the cached columns must agree with it. */}
      {reconciles ? (
        <Alert tone="success">
          The ledger and the cached workspace balances agree: {formatNumber(ledgerBalance)} credits
          outstanding.
        </Alert>
      ) : (
        <Alert tone="danger" title="Balances do not reconcile">
          The ledger sums to {formatNumber(ledgerBalance)} but the cached workspace columns total{' '}
          {formatNumber(cachedBalance)}. The ledger is authoritative — investigate before granting
          anything else.
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Granted" value={formatNumber(granted)} hint="Signup, renewal, admin" />
        <StatTile label="Purchased" value={formatNumber(purchased)} hint="Credit packs" />
        <StatTile label="Used" value={formatNumber(used)} />
        <StatTile label="Refunded" value={formatNumber(refunded)} hint="Failed generations" />
        <StatTile
          label="Outstanding"
          value={formatNumber(ledgerBalance)}
          hint="Unspent liability"
          tone="accent"
        />
      </div>

      <AdminTable
        caption="Credit ledger"
        rows={entries}
        rowKey={(row) => row.id}
        empty="No ledger entries yet."
        columns={[
          {
            key: 'workspace',
            header: 'Workspace',
            render: (row) => (
              <Link
                href={`/admin/workspaces?q=${encodeURIComponent(row.workspace.name)}`}
                className="text-[12px] font-medium text-ink hover:underline"
              >
                {row.workspace.name}
              </Link>
            ),
          },
          {
            key: 'kind',
            header: 'Kind',
            render: (row) => (
              <Badge
                tone={
                  row.kind === 'CONSUMPTION'
                    ? 'neutral'
                    : row.kind.startsWith('ADMIN')
                      ? 'warning'
                      : 'success'
                }
              >
                {row.kind.replace(/_/g, ' ').toLowerCase()}
              </Badge>
            ),
          },
          {
            key: 'bucket',
            header: 'Bucket',
            render: (row) => (
              <span className="text-[12px] text-muted">
                {row.bucket === 'MONTHLY' ? 'plan' : 'purchased'}
              </span>
            ),
          },
          {
            key: 'delta',
            header: 'Change',
            align: 'right',
            render: (row) => (
              <span
                className={
                  row.delta >= 0
                    ? 'font-medium tabular-nums text-success'
                    : 'font-medium tabular-nums text-ink'
                }
              >
                {row.delta > 0 ? '+' : ''}
                {row.delta}
              </span>
            ),
          },
          {
            key: 'after',
            header: 'After',
            align: 'right',
            render: (row) => <span className="tabular-nums text-muted">{row.balanceAfter}</span>,
          },
          {
            key: 'reason',
            header: 'Reason',
            render: (row) => (
              <span className="text-[12px] text-muted">
                {row.reason ?? '—'}
                {row.actor ? (
                  <span className="block text-[11px] text-subtle">by {row.actor.name}</span>
                ) : null}
              </span>
            ),
          },
          {
            key: 'when',
            header: 'When',
            render: (row) => (
              <span className="text-[12px] text-muted">{relativeTime(row.createdAt)}</span>
            ),
          },
        ]}
      />

      <AdminPagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        hrefFor={(next) => (next > 1 ? `/admin/credits?page=${next}` : '/admin/credits')}
      />
    </div>
  );
}
