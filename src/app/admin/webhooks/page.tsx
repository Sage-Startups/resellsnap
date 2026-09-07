import type { Metadata } from 'next';
import { Alert, Badge, PageHeader, StatTile } from '@/components/ui';
import { AdminPagination, AdminTable } from '@/components/admin/admin-table';
import { WebhookReplay } from './webhook-replay';
import { prisma } from '@/lib/db';
import { hasRole, requireStaff } from '@/server/session';
import { Role } from '@/generated/prisma/enums';
import { relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Webhooks' };

const PAGE_SIZE = 40;

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  PROCESSED: 'success',
  RECEIVED: 'neutral',
  IGNORED: 'neutral',
  FAILED: 'danger',
};

export default async function AdminWebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await requireStaff();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const [events, total, counts] = await Promise.all([
    prisma.webhookEvent.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.webhookEvent.count(),
    prisma.webhookEvent.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const countFor = (status: string) =>
    counts.find((group) => group.status === status)?._count._all ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Webhooks"
        description="Inbound events from Stripe and marketplace notifications. Signatures are verified against the raw body before any handler runs."
      />

      {countFor('FAILED') > 0 ? (
        <Alert tone="warning" title={`${countFor('FAILED')} failed events`}>
          A failed event usually means a handler threw. Replaying re-fetches the event from the
          provider — we never replay our own stored summary, which is deliberately incomplete.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Processed" value={countFor('PROCESSED')} />
        <StatTile label="Ignored" value={countFor('IGNORED')} hint="Event types we do not act on" />
        <StatTile label="Failed" value={countFor('FAILED')} />
        <StatTile label="Total received" value={total} />
      </div>

      <AdminTable
        caption="Webhook events"
        rows={events}
        rowKey={(row) => row.id}
        empty="No webhook events yet."
        columns={[
          { key: 'source', header: 'Source', render: (row) => <Badge tone="neutral">{row.source}</Badge> },
          {
            key: 'type',
            header: 'Event type',
            render: (row) => <span className="font-mono text-[12px] text-ink">{row.eventType}</span>,
          },
          {
            key: 'id',
            header: 'Event ID',
            render: (row) => (
              <span className="font-mono text-[11px] text-subtle">{row.eventId}</span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>{row.status.toLowerCase()}</Badge>
            ),
          },
          {
            key: 'attempts',
            header: 'Attempts',
            align: 'right',
            render: (row) => <span className="tabular-nums text-muted">{row.attempts}</span>,
          },
          {
            key: 'error',
            header: 'Error',
            render: (row) =>
              row.error ? (
                <span className="block max-w-64 truncate text-[12px] text-danger" title={row.error}>
                  {row.error}
                </span>
              ) : (
                <span className="text-[12px] text-subtle">—</span>
              ),
          },
          {
            key: 'payload',
            header: 'Metadata',
            render: (row) => (
              <details className="text-[11px]">
                <summary className="cursor-pointer text-muted hover:text-ink">view</summary>
                <pre className="mt-1 max-w-64 overflow-auto rounded border border-stone-200 bg-stone-50 p-2 text-[10px]">
                  {JSON.stringify(row.payloadSummary, null, 2)}
                </pre>
              </details>
            ),
          },
          {
            key: 'when',
            header: 'Received',
            render: (row) => (
              <span className="text-[12px] text-muted">{relativeTime(row.createdAt)}</span>
            ),
          },
          {
            key: 'replay',
            header: '',
            align: 'right',
            render: (row) =>
              hasRole(actor, Role.SUPER_ADMIN) && row.source === 'STRIPE' ? (
                <WebhookReplay
                  webhookEventId={row.id}
                  eventType={row.eventType}
                  eventId={row.eventId}
                />
              ) : null,
          },
        ]}
      />

      <AdminPagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        hrefFor={(next) => (next > 1 ? `/admin/webhooks?page=${next}` : '/admin/webhooks')}
      />
    </div>
  );
}
