import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Badge, PageHeader, StatTile } from '@/components/ui';
import { AdminPagination, AdminTable } from '@/components/admin/admin-table';
import { AIJobControls } from './ai-job-controls';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/server/session';
import { getSettings } from '@/server/settings';
import { getQueueStats } from '@/server/jobs/queue';
import { getEnv, isAIConfigured } from '@/lib/env';
import { formatMoney } from '@/lib/money';
import { formatNumber, relativeTime } from '@/lib/utils';
import { hoursAgo, startOfToday } from '@/lib/time';
import type { AIJobStatus } from '@/generated/prisma/enums';

export const metadata: Metadata = { title: 'AI operations' };

const PAGE_SIZE = 40;

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  SUCCEEDED: 'success',
  RUNNING: 'info',
  QUEUED: 'neutral',
  FAILED: 'danger',
  CANCELLED: 'neutral',
};

export default async function AdminAIPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const env = getEnv();

  const where = params.status ? { status: params.status as AIJobStatus } : {};

  const [jobs, total, queue, usage, settings, todaySpend] = await Promise.all([
    prisma.aIJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        workspace: { select: { name: true } },
        item: { select: { id: true, sku: true, title: true } },
        promptVersion: {
          select: { version: true, template: { select: { key: true } } },
        },
        usage: { select: { inputTokens: true, outputTokens: true, estimatedCostMicros: true } },
      },
    }),
    prisma.aIJob.count({ where }),
    getQueueStats(),
    prisma.aIUsage.aggregate({
      where: { createdAt: { gte: hoursAgo(24) } },
      _sum: { inputTokens: true, outputTokens: true, estimatedCostMicros: true },
      _count: { _all: true },
    }),
    getSettings(),
    prisma.aIUsage.aggregate({
      where: { createdAt: { gte: startOfToday() } },
      _sum: { estimatedCostMicros: true },
    }),
  ]);

  const todayCents = Math.round((todaySpend._sum.estimatedCostMicros ?? 0) / 10_000);
  const limitCents = settings.aiDailyCostLimitCents;
  const breakerTripped = limitCents > 0 && todayCents >= limitCents;

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI operations"
        description="Every generation job, what it cost, and what to do about the ones that failed."
      />

      {!settings.aiGenerationEnabled ? (
        <Alert tone="danger" title="Generation is globally disabled">
          No new AI jobs will run until this is turned back on in{' '}
          <Link href="/admin/settings" className="underline underline-offset-4">
            settings
          </Link>
          .
        </Alert>
      ) : null}

      {!isAIConfigured() ? (
        <Alert tone="warning" title="No AI provider is configured">
          Customers will see a clear unavailable state rather than fixture content.
        </Alert>
      ) : null}

      {breakerTripped ? (
        <Alert tone="danger" title="Daily cost limit reached">
          Estimated spend today is {formatMoney(todayCents)} against a limit of{' '}
          {formatMoney(limitCents)}.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Queue depth"
          value={queue.queued}
          hint={`${queue.running} running · ${queue.deadLetter} dead-lettered`}
        />
        <StatTile
          label="Spend today"
          value={formatMoney(todayCents)}
          hint={limitCents > 0 ? `Limit ${formatMoney(limitCents)}` : 'No limit set'}
          tone={breakerTripped ? 'accent' : 'neutral'}
        />
        <StatTile
          label="Calls (24h)"
          value={formatNumber(usage._count._all)}
          hint={`${formatNumber(usage._sum.inputTokens ?? 0)} in · ${formatNumber(usage._sum.outputTokens ?? 0)} out`}
        />
        <StatTile
          label="Provider"
          value={env.AI_PROVIDER}
          hint={
            env.AI_PROVIDER === 'fake'
              ? 'Deterministic fixtures — development only'
              : env.OPENAI_VISION_MODEL
          }
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {['', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'].map((status) => (
          <Link
            key={status || 'all'}
            href={status ? `/admin/ai?status=${status}` : '/admin/ai'}
            className={
              (params.status ?? '') === status
                ? 'rounded-full border border-ink bg-ink px-3 py-1.5 text-[12px] font-medium text-bone'
                : 'rounded-full border border-stone-200 bg-paper px-3 py-1.5 text-[12px] font-medium text-muted hover:text-ink'
            }
          >
            {status ? status.toLowerCase() : 'all'}
          </Link>
        ))}
      </div>

      <AdminTable
        caption="AI jobs"
        rows={jobs}
        rowKey={(row) => row.id}
        empty="No AI jobs match."
        columns={[
          {
            key: 'item',
            header: 'Item',
            render: (row) => (
              <span>
                {row.item ? (
                  <Link
                    href={`/admin/items?q=${encodeURIComponent(row.item.sku)}`}
                    className="block font-medium text-ink hover:underline"
                  >
                    {row.item.title}
                  </Link>
                ) : (
                  <span className="block text-muted">—</span>
                )}
                <span className="block text-[11px] text-muted">{row.workspace.name}</span>
              </span>
            ),
          },
          {
            key: 'kind',
            header: 'Kind',
            render: (row) => (
              <span className="text-[12px] text-muted">{row.kind.toLowerCase()}</span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <span className="flex flex-wrap gap-1">
                <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>
                  {row.status.toLowerCase()}
                </Badge>
                {row.creditRefunded ? <Badge tone="neutral">refunded</Badge> : null}
              </span>
            ),
          },
          {
            key: 'prompt',
            header: 'Prompt',
            render: (row) => (
              <span className="text-[12px] text-muted">
                {row.promptVersion
                  ? `${row.promptVersion.template.key} v${row.promptVersion.version}`
                  : '—'}
              </span>
            ),
          },
          {
            key: 'duration',
            header: 'Duration',
            align: 'right',
            render: (row) => (
              <span className="tabular-nums text-muted">
                {row.durationMs ? `${(row.durationMs / 1000).toFixed(1)}s` : '—'}
              </span>
            ),
          },
          {
            key: 'cost',
            header: 'Est. cost',
            align: 'right',
            render: (row) => {
              const micros = row.usage.reduce(
                (sum, entry) => sum + entry.estimatedCostMicros,
                0,
              );
              return (
                <span className="tabular-nums text-muted">
                  {micros === 0 ? '—' : formatMoney(Math.round(micros / 10_000))}
                </span>
              );
            },
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
            key: 'when',
            header: 'When',
            render: (row) => (
              <span className="text-[12px] text-muted">{relativeTime(row.createdAt)}</span>
            ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (row) => <AIJobControls aiJobId={row.id} status={row.status} />,
          },
        ]}
      />

      <AdminPagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        hrefFor={(next) =>
          `/admin/ai?${new URLSearchParams({
            ...(params.status ? { status: params.status } : {}),
            ...(next > 1 ? { page: String(next) } : {}),
          }).toString()}`
        }
      />
    </div>
  );
}
