import type { Metadata } from 'next';
import { Alert, Badge, Card, CardContent, PageHeader } from '@/components/ui';
import { CapabilityControls } from './capability-controls';
import { prisma } from '@/lib/db';
import { hasRole, requireStaff } from '@/server/session';
import { Role } from '@/generated/prisma/enums';
import { getEnv, isEbayConfigured } from '@/lib/env';
import { findPlatformSeed } from '@/server/marketplace/registry';

export const metadata: Metadata = { title: 'Integrations' };

export default async function AdminIntegrationsPage() {
  const actor = await requireStaff();
  const env = getEnv();

  const [platforms, connectionCounts] = await Promise.all([
    prisma.platform.findMany({ orderBy: { sortOrder: 'asc' }, include: { capability: true } }),
    prisma.platformConnection.groupBy({
      by: ['platformId', 'state'],
      _count: { _all: true },
    }),
  ]);

  const credentialStatus: Record<string, { present: boolean; detail: string }> = {
    EBAY: {
      present: isEbayConfigured(),
      detail: isEbayConfigured()
        ? `Client ID and secret present · ${env.EBAY_ENVIRONMENT} · marketplace ${env.EBAY_MARKETPLACE_ID} · callback RuName configured`
        : 'EBAY_CLIENT_ID, EBAY_CLIENT_SECRET or EBAY_REDIRECT_URI is missing',
    },
    VINTED: { present: false, detail: 'No approved seller API exists for third-party listing creation' },
    DEPOP: { present: false, detail: 'No approved seller API exists for third-party listing creation' },
    FACEBOOK_MARKETPLACE: {
      present: false,
      detail: 'Meta does not grant third-party applications permission to create Marketplace listings',
    },
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Integrations"
        description="Credential presence, capability flags and kill switches. Secret values are never displayed here or anywhere else in the console."
      />

      <Alert tone="neutral">
        The customer UI derives every button from these flags. Turning off a capability, or throwing
        the kill switch, immediately removes the corresponding action for every workspace — there is
        no cached copy anywhere.
      </Alert>

      <div className="space-y-4">
        {platforms.map((platform) => {
          const seed = findPlatformSeed(platform.key);
          const credentials = credentialStatus[platform.key];
          const counts = connectionCounts.filter((row) => row.platformId === platform.id);

          return (
            <Card key={platform.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-semibold text-ink">{platform.name}</h2>
                      <Badge tone={credentials?.present ? 'success' : 'neutral'}>
                        {credentials?.present ? 'credentials present' : 'no credentials'}
                      </Badge>
                      {platform.capability?.killSwitch ? (
                        <Badge tone="danger">kill switch on</Badge>
                      ) : null}
                    </div>

                    <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-muted">
                      {credentials?.detail}
                    </p>

                    {seed.unavailableReason ? (
                      <p className="mt-2 max-w-2xl rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-[12px] leading-relaxed text-muted">
                        {seed.unavailableReason}
                      </p>
                    ) : null}

                    {platform.key === 'EBAY' ? (
                      <dl className="mt-3 space-y-1 text-[12px]">
                        <div className="flex gap-2">
                          <dt className="text-muted">OAuth callback:</dt>
                          <dd className="font-mono text-[11px] text-ink">
                            {env.APP_URL}/api/integrations/ebay/callback
                          </dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-muted">Environment:</dt>
                          <dd className="text-ink">{env.EBAY_ENVIRONMENT}</dd>
                        </div>
                      </dl>
                    ) : null}

                    {counts.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {counts.map((row) => (
                          <Badge key={row.state} tone="neutral">
                            {row._count._all} {row.state.replace('_', ' ').toLowerCase()}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {platform.capability && hasRole(actor, Role.SUPER_ADMIN) ? (
                    <CapabilityControls
                      capabilityId={platform.capability.id}
                      platformName={platform.name}
                      capability={{
                        canConnect: platform.capability.canConnect,
                        canPublish: platform.capability.canPublish,
                        canUpdate: platform.capability.canUpdate,
                        canEnd: platform.capability.canEnd,
                        canReadOrders: platform.capability.canReadOrders,
                        canFetchComparables: platform.capability.canFetchComparables,
                        killSwitch: platform.capability.killSwitch,
                      }}
                    />
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
