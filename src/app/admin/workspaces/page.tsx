import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, Input, PageHeader } from '@/components/ui';
import { AdminPagination, AdminTable } from '@/components/admin/admin-table';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/server/session';
import { Prisma } from '@/generated/prisma/client';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Workspaces' };

const PAGE_SIZE = 30;

export default async function AdminWorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const where: Prisma.WorkspaceWhereInput = { deletedAt: null };
  if (params.q?.trim()) {
    where.OR = [
      { name: { contains: params.q.trim(), mode: 'insensitive' } },
      { slug: { contains: params.q.trim(), mode: 'insensitive' } },
    ];
  }

  const [workspaces, total] = await Promise.all([
    prisma.workspace.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        subscription: { include: { plan: { select: { name: true } } } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { items: true, connections: true } },
      },
    }),
    prisma.workspace.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Workspaces"
        description={`${total.toLocaleString()} workspaces. Each account owns one by default; the model supports more members without a migration.`}
      />

      <Card className="p-3">
        <form className="flex gap-2" method="get">
          <Input
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="Search name or slug"
            aria-label="Search workspaces"
            className="flex-1"
          />
          <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-bone">
            Search
          </button>
        </form>
      </Card>

      <AdminTable
        caption="Workspaces"
        rows={workspaces}
        rowKey={(row) => row.id}
        empty="No workspaces match."
        columns={[
          {
            key: 'name',
            header: 'Workspace',
            render: (row) => (
              <span>
                <span className="block font-medium text-ink">{row.name}</span>
                <span className="block text-[11px] text-muted">{row.slug}</span>
              </span>
            ),
          },
          {
            key: 'owner',
            header: 'Owner',
            render: (row) => {
              const owner = row.members.find((member) => member.role === 'OWNER') ?? row.members[0];
              return owner ? (
                <Link
                  href={`/admin/users/${owner.user.id}`}
                  className="text-[12px] text-ink hover:underline"
                >
                  {owner.user.email}
                </Link>
              ) : (
                <span className="text-[12px] text-subtle">no owner</span>
              );
            },
          },
          {
            key: 'members',
            header: 'Members',
            align: 'right',
            render: (row) => <span className="tabular-nums">{row.members.length}</span>,
          },
          {
            key: 'plan',
            header: 'Plan',
            render: (row) => (
              <span className="flex items-center gap-1.5">
                <span className="text-[12px] text-ink">
                  {row.subscription?.plan?.name ?? 'Free'}
                </span>
                {row.subscription && row.subscription.status !== 'NONE' ? (
                  <Badge tone={row.subscription.status === 'ACTIVE' ? 'success' : 'warning'}>
                    {row.subscription.status.toLowerCase()}
                  </Badge>
                ) : null}
              </span>
            ),
          },
          {
            key: 'credits',
            header: 'Credits',
            align: 'right',
            render: (row) => (
              <span className="tabular-nums">{row.monthlyCredits + row.purchasedCredits}</span>
            ),
          },
          {
            key: 'items',
            header: 'Items',
            align: 'right',
            render: (row) => <span className="tabular-nums">{row._count.items}</span>,
          },
          {
            key: 'connections',
            header: 'Connections',
            align: 'right',
            render: (row) => <span className="tabular-nums">{row._count.connections}</span>,
          },
          {
            key: 'created',
            header: 'Created',
            render: (row) => (
              <span className="flex items-center gap-1.5 text-[12px] text-muted">
                {formatDate(row.createdAt)}
                {row.isDemo ? <Badge tone="neutral">sample</Badge> : null}
              </span>
            ),
          },
        ]}
      />

      <AdminPagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        hrefFor={(next) => (next > 1 ? `/admin/workspaces?page=${next}` : '/admin/workspaces')}
      />
    </div>
  );
}
