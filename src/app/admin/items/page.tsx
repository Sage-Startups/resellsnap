import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, Input, PageHeader, Select } from '@/components/ui';
import { AdminPagination, AdminTable } from '@/components/admin/admin-table';
import { ItemModerationControls } from './item-controls';
import { prisma } from '@/lib/db';
import { hasRole, requireStaff } from '@/server/session';
import { type Prisma } from '@/generated/prisma/client';
import { Role, type ItemStatus } from '@/generated/prisma/enums';
import { relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Items' };

const PAGE_SIZE = 40;

export default async function AdminItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requireStaff();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const where: Prisma.ItemWhereInput =
    params.deleted === 'yes' ? { deletedAt: { not: null } } : { deletedAt: null };

  if (params.status) where.status = params.status as ItemStatus;
  if (params.q?.trim()) {
    where.OR = [
      { sku: { contains: params.q.trim(), mode: 'insensitive' } },
      { title: { contains: params.q.trim(), mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        sku: true,
        title: true,
        status: true,
        deletedAt: true,
        updatedAt: true,
        workspace: { select: { id: true, name: true } },
        _count: { select: { photos: true, moderationFlags: true, aiJobs: true } },
        aiJobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true, error: true },
        },
      },
    }),
    prisma.item.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Items"
        description="Inspect metadata and generation failures. Photographs are never displayed here — an operator does not need to see a customer's pictures to diagnose a job."
      />

      <Card className="p-3">
        <form className="flex flex-col gap-2 sm:flex-row" method="get">
          <Input
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="Search SKU or title"
            aria-label="Search items"
            className="flex-1"
          />
          <Select name="status" defaultValue={params.status ?? ''} aria-label="Status" className="sm:w-44">
            <option value="">All statuses</option>
            {['DRAFT', 'ANALYZING', 'READY', 'LISTED', 'SOLD', 'EXPIRED', 'ARCHIVED'].map((status) => (
              <option key={status} value={status}>
                {status.toLowerCase()}
              </option>
            ))}
          </Select>
          <Select
            name="deleted"
            defaultValue={params.deleted ?? ''}
            aria-label="Deleted"
            className="sm:w-44"
          >
            <option value="">Active only</option>
            <option value="yes">Soft-deleted</option>
          </Select>
          <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-bone">
            Filter
          </button>
        </form>
      </Card>

      <AdminTable
        caption="Items"
        rows={items}
        rowKey={(row) => row.id}
        empty="No items match."
        columns={[
          {
            key: 'item',
            header: 'Item',
            render: (row) => (
              <span>
                <span className="block font-medium text-ink">{row.title}</span>
                <span className="block font-mono text-[11px] text-muted">{row.sku}</span>
              </span>
            ),
          },
          {
            key: 'workspace',
            header: 'Workspace',
            render: (row) => (
              <Link
                href={`/admin/workspaces?q=${encodeURIComponent(row.workspace.name)}`}
                className="text-[12px] text-muted hover:text-ink hover:underline"
              >
                {row.workspace.name}
              </Link>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <span className="flex flex-wrap gap-1">
                <Badge tone={row.deletedAt ? 'danger' : 'neutral'}>
                  {row.deletedAt ? 'deleted' : row.status.toLowerCase()}
                </Badge>
                {row._count.moderationFlags > 0 ? (
                  <Badge tone="warning">{row._count.moderationFlags} flags</Badge>
                ) : null}
              </span>
            ),
          },
          {
            key: 'photos',
            header: 'Photos',
            align: 'right',
            render: (row) => <span className="tabular-nums text-muted">{row._count.photos}</span>,
          },
          {
            key: 'jobs',
            header: 'Last job',
            render: (row) => {
              const job = row.aiJobs[0];
              if (!job) return <span className="text-[12px] text-subtle">none</span>;
              return (
                <span>
                  <Badge tone={job.status === 'FAILED' ? 'danger' : 'neutral'}>
                    {job.status.toLowerCase()}
                  </Badge>
                  {job.error ? (
                    <span
                      className="mt-0.5 block max-w-56 truncate text-[11px] text-danger"
                      title={job.error}
                    >
                      {job.error}
                    </span>
                  ) : null}
                </span>
              );
            },
          },
          {
            key: 'updated',
            header: 'Updated',
            render: (row) => (
              <span className="text-[12px] text-muted">{relativeTime(row.updatedAt)}</span>
            ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (row) =>
              hasRole(actor, Role.ADMIN) ? (
                <ItemModerationControls
                  itemId={row.id}
                  label={`${row.title} (${row.sku})`}
                  isDeleted={Boolean(row.deletedAt)}
                />
              ) : null,
          },
        ]}
      />

      <AdminPagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        hrefFor={(next) =>
          `/admin/items?${new URLSearchParams({
            ...(params.q ? { q: params.q } : {}),
            ...(params.status ? { status: params.status } : {}),
            ...(params.deleted ? { deleted: params.deleted } : {}),
            ...(next > 1 ? { page: String(next) } : {}),
          }).toString()}`
        }
      />
    </div>
  );
}
