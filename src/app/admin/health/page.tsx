import type { Metadata } from 'next';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import {
  Alert, Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, StatTile,
} from '@/components/ui';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/server/session';
import { getQueueStats } from '@/server/jobs/queue';
import { runHealthChecks } from '@/server/admin/health';
import { formatNumber, relativeTime } from '@/lib/utils';
import { minutesSince } from '@/lib/time';

export const metadata: Metadata = { title: 'System health' };

export default async function AdminHealthPage() {
  await requireStaff();

  const [checks, queue, incidents, recentErrors] = await Promise.all([
    runHealthChecks(),
    getQueueStats(),
    prisma.systemIncident.findMany({
      where: { status: { not: 'RESOLVED' } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.job.findMany({
      where: { status: 'DEAD_LETTER' },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, type: true, lastError: true, attempts: true, updatedAt: true },
    }),
  ]);

  const failing = checks.filter((check) => !check.ok && check.required);

  return (
    <div className="space-y-4">
      <PageHeader
        title="System health"
        description="Live dependency checks and queue state. Secret values are never displayed — only whether they are present and working."
      />

      {failing.length === 0 ? (
        <Alert tone="success">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Every required dependency is reachable.
          </span>
        </Alert>
      ) : (
        <Alert tone="danger" title={`${failing.length} required dependencies are failing`}>
          <ul className="mt-1 space-y-1">
            {failing.map((check) => (
              <li key={check.name}>
                <strong>{check.name}:</strong> {check.detail}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Queued jobs" value={formatNumber(queue.queued)} />
        <StatTile label="Running" value={formatNumber(queue.running)} />
        <StatTile
          label="Dead-lettered"
          value={formatNumber(queue.deadLetter)}
          hint="Retries exhausted"
          tone={queue.deadLetter > 0 ? 'accent' : 'neutral'}
        />
        <StatTile
          label="Oldest queued"
          value={
            queue.oldestQueuedAt
              ? `${minutesSince(queue.oldestQueuedAt)}m`
              : '—'
          }
          hint="A rising number means the worker is behind or down"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dependencies</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-stone-100">
            {checks.map((check) => (
              <li key={check.name} className="flex items-start justify-between gap-4 py-3">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    {check.ok ? (
                      <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                    ) : check.required ? (
                      <XCircle className="size-4 shrink-0 text-danger" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
                    )}
                    <span className="text-[13px] font-medium text-ink">{check.name}</span>
                    {!check.required ? <Badge tone="neutral">optional</Badge> : null}
                  </span>
                  <span className="mt-1 block pl-6 text-[12px] leading-relaxed text-muted">
                    {check.detail}
                  </span>
                </span>
                {check.latencyMs !== undefined ? (
                  <span className="shrink-0 text-[12px] tabular-nums text-muted">
                    {check.latencyMs}ms
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Queue backlog by type</CardTitle>
          </CardHeader>
          <CardContent>
            {queue.backlogByType.length === 0 ? (
              <p className="text-[13px] text-muted">Nothing waiting.</p>
            ) : (
              <ul className="space-y-1.5">
                {queue.backlogByType.map((row) => (
                  <li key={row.type} className="flex items-center justify-between">
                    <span className="text-[13px] text-ink">{row.type.toLowerCase()}</span>
                    <Badge tone="neutral">{row.count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open incidents</CardTitle>
          </CardHeader>
          <CardContent>
            {incidents.length === 0 ? (
              <p className="text-[13px] text-muted">No open incidents.</p>
            ) : (
              <ul className="space-y-2">
                {incidents.map((incident) => (
                  <li key={incident.id}>
                    <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                      <Badge tone={incident.severity === 'CRITICAL' ? 'danger' : 'warning'}>
                        {incident.severity.toLowerCase()}
                      </Badge>
                      {incident.title}
                    </p>
                    {incident.detail ? (
                      <p className="mt-0.5 text-[12px] text-muted">{incident.detail}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dead-lettered jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {recentErrors.length === 0 ? (
            <p className="text-[13px] text-muted">No dead-lettered jobs.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {recentErrors.map((job) => (
                <li key={job.id} className="py-2.5">
                  <p className="flex items-center gap-2 text-[13px] text-ink">
                    <Badge tone="neutral">{job.type.toLowerCase()}</Badge>
                    <span className="text-[12px] text-muted">
                      {job.attempts} attempts · {relativeTime(job.updatedAt)}
                    </span>
                  </p>
                  {job.lastError ? (
                    <p className="mt-1 text-[12px] leading-relaxed text-danger">{job.lastError}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
