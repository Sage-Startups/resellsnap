import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Badge, Card, CardContent, PageHeader, StatTile } from '@/components/ui';
import { ModerationControls } from './moderation-controls';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/server/session';
import { relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Moderation' };

const REASON_LABELS: Record<string, string> = {
  PROHIBITED_CATEGORY: 'Prohibited category',
  SUSPECTED_COUNTERFEIT: 'Suspected counterfeit',
  UNSAFE_CONTENT: 'Unsafe content',
  USER_REPORTED_OUTPUT: 'Reported by a seller',
  OTHER: 'Other',
};

export default async function AdminModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const status = params.status ?? 'OPEN';

  const [flags, counts] = await Promise.all([
    prisma.moderationFlag.findMany({
      where: status === 'ALL' ? {} : { status: status as never },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: {
        workspace: { select: { name: true } },
        item: { select: { id: true, sku: true, title: true, deletedAt: true } },
      },
    }),
    prisma.moderationFlag.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const countFor = (value: string) =>
    counts.find((group) => group.status === value)?._count._all ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Moderation"
        description="Safety flags raised by the AI analysis, plus outputs sellers have reported. Every resolution is recorded in the audit log."
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Open" value={countFor('OPEN')} tone={countFor('OPEN') > 0 ? 'accent' : 'neutral'} />
        <StatTile label="Reviewing" value={countFor('REVIEWING')} />
        <StatTile label="Actioned" value={countFor('ACTIONED')} />
        <StatTile label="Dismissed" value={countFor('DISMISSED')} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {['OPEN', 'REVIEWING', 'ACTIONED', 'DISMISSED', 'ALL'].map((value) => (
          <Link
            key={value}
            href={`/admin/moderation?status=${value}`}
            className={
              status === value
                ? 'rounded-full border border-ink bg-ink px-3 py-1.5 text-[12px] font-medium text-bone'
                : 'rounded-full border border-stone-200 bg-paper px-3 py-1.5 text-[12px] font-medium text-muted hover:text-ink'
            }
          >
            {value.toLowerCase()}
          </Link>
        ))}
      </div>

      {flags.length === 0 ? (
        <Alert tone="success">Nothing to review.</Alert>
      ) : (
        <ul className="space-y-3">
          {flags.map((flag) => (
            <li key={flag.id}>
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={
                            flag.reason === 'SUSPECTED_COUNTERFEIT' ||
                            flag.reason === 'PROHIBITED_CATEGORY'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {REASON_LABELS[flag.reason] ?? flag.reason}
                        </Badge>
                        <Badge tone="neutral">{flag.raisedBy.replace('_', ' ')}</Badge>
                        <Badge tone={flag.status === 'OPEN' ? 'warning' : 'neutral'}>
                          {flag.status.toLowerCase()}
                        </Badge>
                      </div>

                      <p className="mt-2 text-[13px] leading-relaxed text-ink">{flag.detail}</p>

                      <p className="mt-1.5 text-[12px] text-muted">
                        {flag.item ? (
                          <>
                            <Link
                              href={`/admin/items?q=${encodeURIComponent(flag.item.sku)}`}
                              className="hover:text-ink hover:underline"
                            >
                              {flag.item.title} ({flag.item.sku})
                            </Link>
                            {flag.item.deletedAt ? ' · already removed' : ''}
                            {' · '}
                          </>
                        ) : null}
                        {flag.workspace.name} · {relativeTime(flag.createdAt)}
                      </p>

                      {flag.resolution ? (
                        <p className="mt-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-[12px] text-muted">
                          Resolved: {flag.resolution}
                        </p>
                      ) : null}
                    </div>

                    {flag.status === 'OPEN' || flag.status === 'REVIEWING' ? (
                      <ModerationControls
                        flagId={flag.id}
                        itemId={flag.item?.id ?? null}
                        itemLabel={flag.item ? `${flag.item.title} (${flag.item.sku})` : ''}
                        itemDeleted={Boolean(flag.item?.deletedAt)}
                      />
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
