import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, Input, PageHeader, Select } from '@/components/ui';
import { AdminPagination, AdminTable } from '@/components/admin/admin-table';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/server/session';
import { AUDIT_ACTIONS } from '@/server/audit';
import { type Prisma } from '@/generated/prisma/client';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Audit log' };

const PAGE_SIZE = 50;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const where: Prisma.AuditLogWhereInput = {};
  if (params.action) where.action = params.action;
  if (params.q?.trim()) {
    where.OR = [
      { targetId: { contains: params.q.trim() } },
      { reason: { contains: params.q.trim(), mode: 'insensitive' } },
    ];
  }

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        description="Every privileged action: who did it, what they touched, why, and what changed. Sensitive values are redacted before they are written."
      />

      <Card className="p-3">
        <form className="flex flex-col gap-2 sm:flex-row" method="get">
          <Input
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="Search target id or reason"
            aria-label="Search audit log"
            className="flex-1"
          />
          <Select
            name="action"
            defaultValue={params.action ?? ''}
            aria-label="Action"
            className="sm:w-64"
          >
            <option value="">All actions</option>
            {Object.values(AUDIT_ACTIONS).map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </Select>
          <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-bone">
            Filter
          </button>
        </form>
      </Card>

      <AdminTable
        caption="Audit log"
        rows={entries}
        rowKey={(row) => row.id}
        empty="No audit entries match."
        columns={[
          {
            key: 'when',
            header: 'When',
            render: (row) => (
              <span className="whitespace-nowrap text-[12px] text-muted">
                {formatDateTime(row.createdAt)}
              </span>
            ),
          },
          {
            key: 'actor',
            header: 'Actor',
            render: (row) =>
              row.actor ? (
                <Link
                  href={`/admin/users/${row.actor.id}`}
                  className="text-[12px] text-ink hover:underline"
                >
                  {row.actor.email}
                </Link>
              ) : (
                <span className="text-[12px] text-subtle">system</span>
              ),
          },
          {
            key: 'action',
            header: 'Action',
            render: (row) => <Badge tone="neutral">{row.action}</Badge>,
          },
          {
            key: 'target',
            header: 'Target',
            render: (row) => (
              <span className="text-[12px] text-muted">
                {row.targetType}
                {row.targetId ? (
                  <span className="block font-mono text-[11px] text-subtle">{row.targetId}</span>
                ) : null}
              </span>
            ),
          },
          {
            key: 'reason',
            header: 'Reason',
            render: (row) => (
              <span className="block max-w-72 text-[12px] leading-snug text-muted">
                {row.reason ?? '—'}
              </span>
            ),
          },
          {
            key: 'change',
            header: 'Change',
            render: (row) =>
              row.beforeData || row.afterData ? (
                <details className="text-[11px]">
                  <summary className="cursor-pointer text-muted hover:text-ink">view</summary>
                  <pre className="mt-1 max-w-72 overflow-auto rounded border border-stone-200 bg-stone-50 p-2 text-[10px]">
                    {JSON.stringify({ before: row.beforeData, after: row.afterData }, null, 2)}
                  </pre>
                </details>
              ) : (
                <span className="text-[12px] text-subtle">—</span>
              ),
          },
          {
            key: 'ip',
            header: 'IP',
            render: (row) => (
              <span className="font-mono text-[11px] text-subtle">{row.ipAddress ?? '—'}</span>
            ),
          },
        ]}
      />

      <AdminPagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        hrefFor={(next) =>
          `/admin/audit?${new URLSearchParams({
            ...(params.q ? { q: params.q } : {}),
            ...(params.action ? { action: params.action } : {}),
            ...(next > 1 ? { page: String(next) } : {}),
          }).toString()}`
        }
      />
    </div>
  );
}
