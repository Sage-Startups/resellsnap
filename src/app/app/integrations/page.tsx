import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, ShieldCheck } from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardContent, PageHeader,
} from '@/components/ui';
import { ConnectButton, DisconnectButton } from './integration-buttons';
import { IntegrationBanner } from './integration-banner';
import { requireWorkspace } from '@/server/session';
import { getPlatformStatuses } from '@/server/marketplace';
import { getEntitlements } from '@/server/entitlements';
import { NON_AFFILIATION_NOTICE } from '@/lib/site';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Integrations' };

const BADGE_TONE = {
  DIRECT_PUBLISHING: 'accent',
  EXPORT_WORKFLOW: 'neutral',
  APPROVED_ACCESS_REQUIRED: 'warning',
  TEMPORARILY_UNAVAILABLE: 'danger',
} as const;

const BADGE_LABEL = {
  DIRECT_PUBLISHING: 'Direct publishing available',
  EXPORT_WORKFLOW: 'Export workflow',
  APPROVED_ACCESS_REQUIRED: 'Approved access required',
  TEMPORARILY_UNAVAILABLE: 'Temporarily unavailable',
} as const;

export default async function IntegrationsPage() {
  const context = await requireWorkspace();
  const [statuses, entitlements] = await Promise.all([
    getPlatformStatuses(context.workspace.id),
    getEntitlements(context.workspace.id),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Integrations"
        description="What each marketplace lets us do for you, and what it does not. Every badge below is derived from live capability, not marketing copy."
      />

      <Suspense fallback={null}>
        <IntegrationBanner />
      </Suspense>

      <ul className="space-y-4">
        {statuses.map((status) => {
          const connected = status.state === 'CONNECTED';
          const canConnect = status.capabilities.canConnect && !connected;
          const blockedByPlan = status.key === 'EBAY' && !entitlements.ebayConnection;

          return (
            <li key={status.key}>
              <Card>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[15px] font-semibold text-ink">{status.name}</h2>
                        <Badge tone={BADGE_TONE[status.badge]}>{BADGE_LABEL[status.badge]}</Badge>
                        {connected ? (
                          <Badge tone="success">
                            <CheckCircle2 className="size-3" aria-hidden="true" />
                            Connected
                          </Badge>
                        ) : null}
                        {status.environment ? (
                          <Badge tone="neutral">{status.environment}</Badge>
                        ) : null}
                      </div>

                      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
                        {status.statusMessage}
                      </p>

                      {status.externalUsername ? (
                        <p className="mt-1.5 text-[12px] text-muted">
                          Account: <span className="font-medium text-ink">{status.externalUsername}</span>
                        </p>
                      ) : null}

                      {status.expiresAt ? (
                        <p className="mt-1 text-[12px] text-muted">
                          Authorisation valid until {formatDate(status.expiresAt)}
                        </p>
                      ) : null}

                      {status.lastError ? (
                        <p className="mt-1.5 text-[12px] text-danger">{status.lastError}</p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {blockedByPlan ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href="/app/billing">Upgrade to connect</Link>
                        </Button>
                      ) : canConnect ? (
                        <ConnectButton platform={status.key} platformName={status.name} />
                      ) : null}

                      {connected ? (
                        <DisconnectButton platform={status.key} platformName={status.name} />
                      ) : null}

                      <Button asChild variant="ghost" size="sm">
                        <a href={status.sellerUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink />
                          Open {status.name}
                        </a>
                      </Button>
                    </div>
                  </div>

                  {status.setupIssues.length > 0 ? (
                    <Alert tone="warning" className="mt-4">
                      <p className="font-medium">
                        {status.name} needs a few things set up on your account before publishing:
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {status.setupIssues.map((issue) => (
                          <li key={issue} className="flex gap-2">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </Alert>
                  ) : null}

                  {/* Capability matrix — derived, never hard-coded */}
                  <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-stone-200 pt-4 sm:grid-cols-4">
                    {(
                      [
                        ['Connect account', status.capabilities.canConnect],
                        ['Publish', status.capabilities.canPublish],
                        ['Update or end', status.capabilities.canUpdate],
                        ['Read orders', status.capabilities.canReadOrders],
                      ] as const
                    ).map(([label, enabled]) => (
                      <div key={label} className="flex items-center justify-between gap-2">
                        <dt className="text-[12px] text-muted">{label}</dt>
                        <dd
                          className={
                            enabled ? 'text-[12px] font-medium text-ink' : 'text-[12px] text-subtle'
                          }
                        >
                          {enabled ? 'Yes' : 'No'}
                        </dd>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-[12px] text-muted">Export workflow</dt>
                      <dd className="text-[12px] font-medium text-ink">Always</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <Card>
        <CardContent className="flex gap-3 p-5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
          <div className="space-y-2 text-[12px] leading-relaxed text-muted">
            <p>
              We never ask for a marketplace password. Where a connection exists it uses that
              platform&rsquo;s own OAuth screen with the narrowest scopes the job needs, and you can
              revoke it from either side at any time. Access and refresh tokens are encrypted at
              rest and never leave the server.
            </p>
            <p>{NON_AFFILIATION_NOTICE}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
