import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Alert, Badge, PageHeader, StatTile } from '@/components/ui';
import { AdminTable } from '@/components/admin/admin-table';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/server/session';
import { isStripeConfigured } from '@/lib/env';
import { isTestMode } from '@/server/billing/stripe';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Subscriptions' };

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  TRIALING: 'success',
  PAST_DUE: 'warning',
  UNPAID: 'danger',
  CANCELED: 'neutral',
  INCOMPLETE: 'warning',
  INCOMPLETE_EXPIRED: 'neutral',
  PAUSED: 'neutral',
  NONE: 'neutral',
};

export default async function AdminSubscriptionsPage() {
  await requireStaff();

  const stripeReady = isStripeConfigured();

  const [subscriptions, counts] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: { not: 'NONE' } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        plan: true,
        workspace: {
          select: {
            name: true,
            members: {
              take: 1,
              select: { user: { select: { id: true, email: true } } },
            },
          },
        },
      },
    }),
    prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const countFor = (status: string) =>
    counts.find((group) => group.status === status)?._count._all ?? 0;

  const mrr = subscriptions
    .filter((subscription) => subscription.status === 'ACTIVE' || subscription.status === 'TRIALING')
    .reduce((sum, subscription) => sum + (subscription.plan?.priceCents ?? 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Subscriptions"
        description="A mirror of Stripe, not a second source of truth. Anything financial should be confirmed in the Stripe dashboard."
      />

      {!stripeReady ? (
        <Alert tone="warning" title="Stripe is not configured">
          No Stripe keys are set on this deployment, so nothing can be charged and no webhooks
          arrive.
        </Alert>
      ) : isTestMode() ? (
        <Alert tone="info">
          Stripe is in <strong>test mode</strong>. No real money moves.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active" value={countFor('ACTIVE') + countFor('TRIALING')} tone="accent" />
        <StatTile label="Past due" value={countFor('PAST_DUE')} hint="Payment failed" />
        <StatTile label="Cancelled" value={countFor('CANCELED')} />
        <StatTile label="MRR (mirrored)" value={formatMoney(mrr)} hint="Confirm in Stripe" />
      </div>

      <AdminTable
        caption="Subscriptions"
        rows={subscriptions}
        rowKey={(row) => row.id}
        empty="No subscriptions yet."
        columns={[
          {
            key: 'workspace',
            header: 'Workspace',
            render: (row) => (
              <span>
                <span className="block font-medium text-ink">{row.workspace.name}</span>
                <span className="block text-[11px] text-muted">
                  {row.workspace.members[0]?.user.email ?? '—'}
                </span>
              </span>
            ),
          },
          {
            key: 'plan',
            header: 'Plan',
            render: (row) => <span className="text-[12px]">{row.plan?.name ?? '—'}</span>,
          },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <span className="flex flex-wrap gap-1">
                <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>
                  {row.status.replace('_', ' ').toLowerCase()}
                </Badge>
                {row.cancelAtPeriodEnd ? <Badge tone="warning">ending</Badge> : null}
              </span>
            ),
          },
          {
            key: 'period',
            header: 'Current period',
            render: (row) => (
              <span className="text-[12px] text-muted">
                {row.currentPeriodEnd ? `ends ${formatDate(row.currentPeriodEnd)}` : '—'}
              </span>
            ),
          },
          {
            key: 'stripe',
            header: 'Stripe',
            align: 'right',
            render: (row) =>
              row.stripeSubscriptionId ? (
                <a
                  href={`https://dashboard.stripe.com/${isTestMode() ? 'test/' : ''}subscriptions/${row.stripeSubscriptionId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink"
                >
                  Open
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : (
                <span className="text-[12px] text-subtle">—</span>
              ),
          },
          {
            key: 'user',
            header: '',
            align: 'right',
            render: (row) =>
              row.workspace.members[0] ? (
                <Link
                  href={`/admin/users/${row.workspace.members[0].user.id}`}
                  className="text-[12px] text-muted hover:text-ink hover:underline"
                >
                  User
                </Link>
              ) : null,
          },
        ]}
      />
    </div>
  );
}
