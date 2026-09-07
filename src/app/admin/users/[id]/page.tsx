import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, StatTile,
} from '@/components/ui';
import { UserControls } from './user-controls';
import { prisma } from '@/lib/db';
import { hasRole, requireStaff } from '@/server/session';
import { Role } from '@/generated/prisma/enums';
import { formatMoney } from '@/lib/money';
import { formatDateTime, relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'User' };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      preference: true,
      notificationPref: true,
      supportNotes: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { author: { select: { name: true } } },
      },
      memberships: {
        include: {
          workspace: {
            include: {
              subscription: { include: { plan: true } },
              _count: { select: { items: true } },
              connections: { include: { platform: { select: { key: true, name: true } } } },
              creditLedger: { orderBy: { createdAt: 'desc' }, take: 15 },
            },
          },
        },
      },
      sessions: { where: { expiresAt: { gt: new Date() } }, select: { id: true } },
    },
  });

  if (!user) notFound();

  const workspace = user.memberships[0]?.workspace ?? null;

  const [itemCount, saleTotal] = workspace
    ? await Promise.all([
        prisma.item.count({ where: { workspaceId: workspace.id, deletedAt: null } }),
        prisma.saleRecord.aggregate({
          where: { workspaceId: workspace.id },
          _sum: { salePriceCents: true },
          _count: { _all: true },
        }),
      ])
    : [0, { _sum: { salePriceCents: null }, _count: { _all: 0 } }];

  return (
    <div className="space-y-5">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />
        Users
      </Link>

      <PageHeader
        title={user.name}
        description={user.email}
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge tone={user.status === 'ACTIVE' ? 'success' : 'warning'}>
              {user.status.replace('_', ' ').toLowerCase()}
            </Badge>
            <Badge tone={user.role === 'USER' ? 'neutral' : 'warning'}>
              {user.role.replace('_', ' ').toLowerCase()}
            </Badge>
            {user.emailVerified ? (
              <Badge tone="success">verified</Badge>
            ) : (
              <Badge tone="warning">unverified</Badge>
            )}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Credits"
          value={(workspace?.monthlyCredits ?? 0) + (workspace?.purchasedCredits ?? 0)}
          hint={`${workspace?.monthlyCredits ?? 0} plan · ${workspace?.purchasedCredits ?? 0} purchased`}
        />
        <StatTile label="Items" value={itemCount} />
        <StatTile
          label="Recorded sales"
          value={formatMoney(saleTotal._sum.salePriceCents ?? 0)}
          hint={`${saleTotal._count._all} sales`}
        />
        <StatTile label="Active sessions" value={user.sessions.length} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {(
                  [
                    ['User ID', user.id],
                    ['Joined', formatDateTime(user.createdAt)],
                    ['Last seen', user.lastSeenAt ? relativeTime(user.lastSeenAt) : 'never'],
                    ['Workspace', workspace?.name ?? '—'],
                    ['Plan', workspace?.subscription?.plan?.name ?? 'Free'],
                    ['Subscription', workspace?.subscription?.status ?? 'NONE'],
                    ['Timezone', user.preference?.timezone ?? 'UTC'],
                    [
                      'Deletion requested',
                      user.deletionRequested ? formatDateTime(user.deletionRequested) : 'no',
                    ],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4">
                    <dt className="text-[12px] text-muted">{label}</dt>
                    <dd className="truncate text-right text-[12px] font-medium text-ink">
                      {String(value)}
                    </dd>
                  </div>
                ))}
              </dl>

              {user.suspendedReason ? (
                <p className="mt-3 rounded-lg border border-warning/25 bg-warning-wash px-3 py-2 text-[12px] text-warning">
                  Suspended: {user.suspendedReason}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {workspace ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Marketplace connections</CardTitle>
                </CardHeader>
                <CardContent>
                  {workspace.connections.length === 0 ? (
                    <p className="text-[13px] text-muted">No connections.</p>
                  ) : (
                    <ul className="space-y-2">
                      {workspace.connections.map((connection) => (
                        <li
                          key={connection.id}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="text-[13px] text-ink">{connection.platform.name}</span>
                          <span className="flex items-center gap-2">
                            <Badge tone="neutral">{connection.environment}</Badge>
                            <Badge
                              tone={connection.state === 'CONNECTED' ? 'success' : 'neutral'}
                            >
                              {connection.state.replace('_', ' ').toLowerCase()}
                            </Badge>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent credit movements</CardTitle>
                </CardHeader>
                <CardContent>
                  {workspace.creditLedger.length === 0 ? (
                    <p className="text-[13px] text-muted">No credit history.</p>
                  ) : (
                    <ul className="divide-y divide-stone-100">
                      {workspace.creditLedger.map((entry) => (
                        <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                          <span className="min-w-0">
                            <span className="block text-[12px] text-ink">
                              {entry.kind.replace(/_/g, ' ').toLowerCase()}
                            </span>
                            {entry.reason ? (
                              <span className="block truncate text-[11px] text-muted">
                                {entry.reason}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-right">
                            <span
                              className={
                                entry.delta >= 0
                                  ? 'block text-[12px] font-medium tabular-nums text-success'
                                  : 'block text-[12px] font-medium tabular-nums text-ink'
                              }
                            >
                              {entry.delta > 0 ? '+' : ''}
                              {entry.delta}
                            </span>
                            <span className="block text-[11px] text-subtle">
                              {relativeTime(entry.createdAt)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Support notes</CardTitle>
            </CardHeader>
            <CardContent>
              {user.supportNotes.length === 0 ? (
                <p className="text-[13px] text-muted">No notes yet.</p>
              ) : (
                <ul className="space-y-3">
                  {user.supportNotes.map((note) => (
                    <li key={note.id} className="border-l-2 border-stone-200 pl-3">
                      <p className="text-[13px] leading-relaxed text-ink">{note.body}</p>
                      <p className="mt-1 text-[11px] text-subtle">
                        {note.author.name} · {relativeTime(note.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <UserControls
          userId={user.id}
          userName={user.name}
          userEmail={user.email}
          role={user.role}
          status={user.status}
          workspaceId={workspace?.id ?? null}
          canChangeRole={hasRole(actor, Role.SUPER_ADMIN) && actor.id !== user.id}
          canSuspend={hasRole(actor, Role.ADMIN) && actor.id !== user.id}
          canAdjustCredits={hasRole(actor, Role.ADMIN)}
        />
      </div>
    </div>
  );
}
