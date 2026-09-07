import type { Metadata } from 'next';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, StatTile } from '@/components/ui';
import { EmailTemplateEditor } from './email-editor';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/server/session';
import { Role } from '@/generated/prisma/enums';
import { getEmailProvider } from '@/server/email';
import { EMAIL_DEFINITIONS } from '@/server/email/templates';
import { relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Emails' };

export default async function AdminEmailsPage() {
  await requireStaff(Role.ADMIN);

  const [templates, logs, statusCounts] = await Promise.all([
    prisma.emailTemplate.findMany({ orderBy: { key: 'asc' } }),
    prisma.emailLog.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.emailLog.groupBy({
      by: ['status'],
      where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      _count: { _all: true },
    }),
  ]);

  const provider = getEmailProvider();
  const countFor = (status: string) =>
    statusCounts.find((group) => group.status === status)?._count._all ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Emails"
        description="Templates, previews, test sends and the delivery log."
      />

      {!provider.isConfigured() ? (
        <Alert tone="danger" title="No email provider is configured">
          Verification and password reset emails will fail, which means nobody can complete sign-up.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Sent (7d)" value={countFor('SENT') + countFor('DELIVERED')} />
        <StatTile label="Failed" value={countFor('FAILED') + countFor('BOUNCED')} />
        <StatTile label="Suppressed" value={countFor('SUPPRESSED')} hint="Blocked by preference" />
        <StatTile label="Provider" value={provider.name} />
      </div>

      <div className="space-y-3">
        {templates.map((template) => {
          const definition = EMAIL_DEFINITIONS.find((entry) => entry.key === template.key);
          return (
            <EmailTemplateEditor
              key={template.key}
              template={{
                key: template.key,
                name: template.name,
                subject: template.subject,
                body: template.body,
                isActive: template.isActive,
                isEssential: template.isEssential,
                tokens: definition?.tokens ?? [],
              }}
            />
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent delivery log</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-[13px] text-muted">Nothing sent yet.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {logs.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center gap-3 py-2">
                  <Badge
                    tone={
                      log.status === 'SENT' || log.status === 'DELIVERED'
                        ? 'success'
                        : log.status === 'SUPPRESSED'
                          ? 'neutral'
                          : 'danger'
                    }
                  >
                    {log.status.toLowerCase()}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-ink">{log.subject}</span>
                    <span className="block text-[11px] text-muted">
                      {log.templateKey} · {maskEmail(log.toEmail)}
                    </span>
                  </span>
                  <span className="text-[11px] text-subtle">{relativeTime(log.createdAt)}</span>
                  {log.error ? (
                    <span className="w-full text-[11px] text-danger">{log.error}</span>
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

/** Support staff rarely need the full address; the domain is usually enough. */
function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}
