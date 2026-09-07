import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, Input, PageHeader, Select } from '@/components/ui';
import { AdminPagination, AdminTable } from '@/components/admin/admin-table';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/server/session';
import { type Prisma, type Role, type UserStatus } from '@/generated/prisma/client';
import { formatDate, relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Users' };

const PAGE_SIZE = 30;

const ROLE_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'danger'> = {
  USER: 'neutral',
  SUPPORT: 'info',
  ADMIN: 'warning',
  SUPER_ADMIN: 'danger',
};

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: Date;
  lastSeenAt: Date | null;
  workspaceName: string | null;
  credits: number;
  itemCount: number;
  plan: string | null;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const where: Prisma.UserWhereInput = {};
  if (params.q?.trim()) {
    where.OR = [
      { email: { contains: params.q.trim(), mode: 'insensitive' } },
      { name: { contains: params.q.trim(), mode: 'insensitive' } },
    ];
  }
  if (params.role) where.role = params.role as Role;
  if (params.status) where.status = params.status as UserStatus;
  if (params.verified === 'no') where.emailVerified = false;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        emailVerified: true,
        createdAt: true,
        lastSeenAt: true,
        memberships: {
          take: 1,
          select: {
            workspace: {
              select: {
                name: true,
                monthlyCredits: true,
                purchasedCredits: true,
                subscription: { select: { plan: { select: { name: true } }, status: true } },
                _count: { select: { items: true } },
              },
            },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const rows: UserRow[] = users.map((user) => {
    const workspace = user.memberships[0]?.workspace;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
      workspaceName: workspace?.name ?? null,
      credits: (workspace?.monthlyCredits ?? 0) + (workspace?.purchasedCredits ?? 0),
      itemCount: workspace?._count.items ?? 0,
      plan: workspace?.subscription?.plan?.name ?? null,
    };
  });

  const hrefFor = (nextPage: number) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([key, value]) => key !== 'page' && Boolean(value)) as [
        string,
        string,
      ][],
    );
    if (nextPage > 1) query.set('page', String(nextPage));
    const text = query.toString();
    return text ? `/admin/users?${text}` : '/admin/users';
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Users" description={`${total.toLocaleString()} accounts.`} />

      <Card className="p-3">
        <form className="flex flex-col gap-2 sm:flex-row" method="get">
          <Input
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="Search name or email"
            aria-label="Search users"
            className="flex-1"
          />
          <Select name="role" defaultValue={params.role ?? ''} aria-label="Role" className="sm:w-44">
            <option value="">All roles</option>
            <option value="USER">User</option>
            <option value="SUPPORT">Support</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super admin</option>
          </Select>
          <Select
            name="status"
            defaultValue={params.status ?? ''}
            aria-label="Status"
            className="sm:w-44"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DELETION_REQUESTED">Deletion requested</option>
          </Select>
          <button
            type="submit"
            className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-bone"
          >
            Filter
          </button>
        </form>
      </Card>

      <AdminTable
        caption="Users"
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `/admin/users/${row.id}`}
        empty="No users match those filters."
        columns={[
          {
            key: 'user',
            header: 'User',
            render: (row) => (
              <span>
                <span className="block font-medium text-ink">{row.name}</span>
                <span className="block text-[11px] text-muted">{row.email}</span>
              </span>
            ),
          },
          {
            key: 'role',
            header: 'Role',
            render: (row) => <Badge tone={ROLE_TONE[row.role]}>{row.role.replace('_', ' ')}</Badge>,
          },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <span className="flex flex-wrap gap-1">
                <Badge tone={row.status === 'ACTIVE' ? 'success' : 'warning'}>
                  {row.status.replace('_', ' ').toLowerCase()}
                </Badge>
                {!row.emailVerified ? <Badge tone="warning">unverified</Badge> : null}
              </span>
            ),
          },
          {
            key: 'plan',
            header: 'Plan',
            render: (row) => <span className="text-[12px] text-muted">{row.plan ?? 'Free'}</span>,
          },
          {
            key: 'credits',
            header: 'Credits',
            align: 'right',
            render: (row) => <span className="tabular-nums">{row.credits}</span>,
          },
          {
            key: 'items',
            header: 'Items',
            align: 'right',
            render: (row) => <span className="tabular-nums">{row.itemCount}</span>,
          },
          {
            key: 'seen',
            header: 'Last seen',
            render: (row) => (
              <span className="text-[12px] text-muted">
                {row.lastSeenAt ? relativeTime(row.lastSeenAt) : 'never'}
              </span>
            ),
          },
          {
            key: 'joined',
            header: 'Joined',
            render: (row) => (
              <span className="text-[12px] text-muted">{formatDate(row.createdAt)}</span>
            ),
          },
          {
            key: 'open',
            header: '',
            align: 'right',
            render: (row) => (
              <Link
                href={`/admin/users/${row.id}`}
                className="text-[12px] text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                Open
              </Link>
            ),
          },
        ]}
      />

      <AdminPagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        hrefFor={hrefFor}
      />
    </div>
  );
}
