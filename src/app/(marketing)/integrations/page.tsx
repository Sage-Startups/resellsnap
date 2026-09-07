import Link from 'next/link';
import type { Metadata } from 'next';
import { Alert, Badge, Button, Card, CardContent } from '@/components/ui';
import { Section, SectionHeading } from '@/components/marketing/section';
import { BADGE_COPY } from '@/components/marketing/platform-capability-grid';
import { getAllAdapters } from '@/server/marketplace';
import { findPlatformSeed } from '@/server/marketplace/registry';
import { isEbayConfigured } from '@/lib/env';
import { NON_AFFILIATION_NOTICE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Integrations',
  description:
    'Live integration status for eBay, Vinted, Depop and Facebook Marketplace, plus the services ResellSnap AI depends on.',
  alternates: { canonical: '/integrations' },
};

const SERVICES = [
  {
    name: 'OpenAI',
    role: 'Image understanding and copy generation',
    detail:
      'Your photos and confirmed facts are sent to generate the analysis and listings. The provider sits behind an abstraction, so a deployment can swap it without changing product behaviour.',
  },
  {
    name: 'Stripe',
    role: 'Subscriptions and credit packs',
    detail:
      'All payment details are handled by Stripe Checkout and the Stripe billing portal. ResellSnap AI never receives or stores card numbers.',
  },
  {
    name: 'Resend',
    role: 'Transactional email',
    detail:
      'Verification, password reset, generation results and billing notices. Behind an abstraction so another provider can be substituted.',
  },
  {
    name: 'Railway',
    role: 'Hosting, PostgreSQL and private object storage',
    detail:
      'The web service, the background worker, the database and your uploaded photos all run on Railway infrastructure. Photo storage is private and served only via short-lived signed links.',
  },
];

export default async function IntegrationsPage() {
  // Public page: report what this deployment is configured for, without
  // touching any workspace data.
  const adapters = getAllAdapters();
  const ebayReady = isEbayConfigured();

  return (
    <>
      <Section>
        <SectionHeading
          level={1}
          eyebrow="Integrations"
          title="What is connected, and what that actually means"
          description="Every badge below is derived from this deployment's real configuration and capability flags, not from a marketing decision."
        />

        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {adapters.map((adapter) => {
            const seed = findPlatformSeed(adapter.key);
            const declared = adapter.declaredCapabilities();
            const badgeKey = declared.canPublish
              ? ebayReady
                ? 'DIRECT_PUBLISHING'
                : 'APPROVED_ACCESS_REQUIRED'
              : 'EXPORT_WORKFLOW';
            const badge = BADGE_COPY[badgeKey];

            return (
              <li key={adapter.key}>
                <Card className="h-full">
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-[15px] font-semibold text-ink">{adapter.name}</h2>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </div>

                    <p className="mt-3 text-[13px] leading-relaxed text-muted">
                      {declared.canPublish
                        ? ebayReady
                          ? 'Direct publishing through the official Sell APIs. Connect your seller account, review each listing, then confirm to publish.'
                          : 'This deployment has not yet been given eBay API credentials. The export workflow is available in the meantime.'
                        : seed.unavailableReason}
                    </p>

                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                      {(
                        [
                          ['Connect account', declared.canConnect && ebayReady],
                          ['Publish listings', declared.canPublish && ebayReady],
                          ['Update / end', declared.canUpdate && ebayReady],
                          ['Read orders', declared.canReadOrders && ebayReady],
                          ['Export workflow', true],
                        ] as const
                      ).map(([label, enabled]) => (
                        <div key={label} className="flex items-center justify-between gap-2">
                          <dt className="text-muted">{label}</dt>
                          <dd className={enabled ? 'font-medium text-ink' : 'text-subtle'}>
                            {enabled ? 'Yes' : 'No'}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>

        <Alert tone="neutral" className="mt-6">
          A ResellSnap AI account is never asked for a marketplace password. eBay access is granted
          through eBay&rsquo;s own OAuth screen and can be revoked by you at any time, from either side.
        </Alert>
      </Section>

      <Section tone="paper">
        <SectionHeading eyebrow="Under the hood" title="Services this product depends on" />
        <div className="mt-8 divide-y divide-stone-200 border-y border-stone-200">
          {SERVICES.map((service) => (
            <div key={service.name} className="grid gap-2 py-5 sm:grid-cols-[200px_1fr] sm:gap-6">
              <div>
                <p className="text-[15px] font-semibold text-ink">{service.name}</p>
                <p className="text-[12px] text-muted">{service.role}</p>
              </div>
              <p className="text-[14px] leading-relaxed text-muted">{service.detail}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-[14px] leading-relaxed text-muted">{NON_AFFILIATION_NOTICE}</p>
          <Button asChild variant="primary">
            <Link href="/register">Start free</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
