import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, ImageIcon } from 'lucide-react';
import {
  Alert, Badge, Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui';
import { ItemThumbnail } from '@/components/app/item-thumbnail';
import { ItemStatusBadge } from '@/components/app/status-badge';
import { StudioTabs } from '@/components/studio/studio-tabs';
import { FactReview } from '@/components/studio/fact-review';
import { PricePanel } from '@/components/studio/price-panel';
import { ItemActions } from '@/components/studio/item-actions';
import { GenerationStep } from '@/components/wizard/generation-step';
import { prisma } from '@/lib/db';
import { requireWorkspace } from '@/server/session';
import { getPlatformStatuses } from '@/server/marketplace';
import { PLATFORM_NAMES } from '@/server/marketplace/registry';
import { validateMaster } from '@/server/listings/validation';
import { relativeTime } from '@/lib/utils';
import type { PlatformCapabilityInfo, VariantData } from '@/components/studio/variant-editor';

export const metadata: Metadata = { title: 'Item' };

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ generated?: string }>;
}) {
  const context = await requireWorkspace();
  const { id } = await params;
  const query = await searchParams;

  const item = await prisma.item.findFirst({
    where: { id, workspaceId: context.workspace.id, deletedAt: null },
    include: {
      photos: { orderBy: { position: 'asc' } },
      facts: { orderBy: { key: 'asc' } },
      listing: { include: { variants: true, revisions: { orderBy: { createdAt: 'desc' }, take: 10 } } },
      priceSuggestions: true,
      statusEvents: { orderBy: { createdAt: 'desc' }, take: 12 },
      aiJobs: { orderBy: { createdAt: 'desc' }, take: 5 },
      publications: { orderBy: { createdAt: 'desc' }, take: 10 },
      externalListings: true,
      saleRecord: true,
    },
  });

  if (!item) notFound();

  const [platformStatuses, templates] = await Promise.all([
    getPlatformStatuses(context.workspace.id),
    prisma.platformTemplate.findMany({
      where: { isActive: true },
      include: { platform: { select: { key: true, sellerUrl: true } } },
      orderBy: { version: 'desc' },
    }),
  ]);

  const runningJob = item.aiJobs.find(
    (job) => job.status === 'QUEUED' || job.status === 'RUNNING',
  );

  // A generation in flight takes over the page — there is nothing to edit yet.
  if (runningJob || item.status === 'ANALYZING') {
    return (
      <div className="mx-auto max-w-3xl">
        <Link
          href="/app"
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Dashboard
        </Link>
        <Card>
          <CardContent className="p-6">
            <GenerationStep itemId={item.id} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const processedPhotos = item.photos.filter((photo) => photo.status === 'PROCESSED');
  const balancedPrice = item.priceSuggestions.find(
    (suggestion) => suggestion.strategy === 'BALANCED',
  );

  const unconfirmed = item.facts.filter((fact) => fact.source === 'AI_INFERENCE').length;
  const hasConfirmedCondition = item.facts.some(
    (fact) => fact.key === 'condition' && fact.confirmed,
  );

  const masterIssues = item.listing
    ? validateMaster({
        title: item.listing.title,
        description: item.listing.description,
        conditionSummary: item.listing.conditionSummary,
        hasPhotos: processedPhotos.length > 0,
        hasPrice: Boolean(balancedPrice),
        hasConfirmedCondition,
        unconfirmedInferences: unconfirmed,
      })
    : [];

  const capabilities: Record<string, PlatformCapabilityInfo> = Object.fromEntries(
    platformStatuses.map((status) => [
      status.key,
      {
        canPublish: status.capabilities.canPublish && status.state === 'CONNECTED',
        state: status.state,
        badge: status.badge,
        statusMessage: status.statusMessage,
        setupIssues: status.setupIssues,
        connectionId: status.connectionId,
      },
    ]),
  );

  const variants: VariantData[] = (item.listing?.variants ?? [])
    .map((variant) => {
      const template = templates.find((entry) => entry.platform.key === variant.platform);
      return {
        platform: variant.platform,
        platformName: PLATFORM_NAMES[variant.platform],
        sellerUrl: template?.platform.sellerUrl ?? '#',
        title: variant.title,
        description: variant.description,
        fields: (variant.fields ?? {}) as Record<string, string | string[]>,
        issues: Array.isArray(variant.issues)
          ? (variant.issues as unknown as VariantData['issues'])
          : [],
        isComplete: variant.isComplete,
        titleMaxLength: template?.titleMaxLength ?? 80,
        descriptionMaxLength: template?.descriptionMaxLength ?? 4000,
        maxHashtags: template?.maxHashtags ?? 0,
        requiredFields: Array.isArray(template?.requiredFields)
          ? (template.requiredFields as string[])
          : [],
        guidance: template?.guidance ?? null,
      };
    })
    .sort((a, b) => a.platformName.localeCompare(b.platformName));

  const ebayTemplate = templates.find((entry) => entry.platform.key === 'EBAY');

  return (
    <div className="space-y-5">
      {query.generated ? (
        <Alert tone="success" title="Your drafts are ready">
          Review anything marked as needing confirmation, then publish or export.
        </Alert>
      ) : null}

      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link
          href="/app/inventory"
          className="inline-flex items-center gap-1.5 self-start text-[13px] text-muted hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Inventory
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-4">
            <ItemThumbnail
              objectKey={processedPhotos[0]?.thumbnailKey ?? null}
              alt=""
              size={64}
              className="hidden sm:block"
            />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">
                {item.title}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <ItemStatusBadge status={item.status} />
                <Badge tone="neutral">{item.sku}</Badge>
                <span className="text-[12px] text-muted">
                  Updated {relativeTime(item.updatedAt)}
                </span>
              </div>
            </div>
          </div>

          <ItemActions
            itemId={item.id}
            status={item.status}
            currency={item.currency}
            hasSaleRecord={Boolean(item.saleRecord)}
          />
        </div>
      </div>

      {!item.listing ? (
        <Alert tone="neutral" title="No drafts yet">
          This item has photos and details but has not been generated. Open it in the wizard to
          generate the listings.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Studio */}
        <div className="min-w-0 space-y-6">
          {item.listing ? (
            <Card>
              <CardContent className="p-5">
                <StudioTabs
                  itemId={item.id}
                  master={{
                    title: item.listing.title,
                    description: item.listing.description,
                    conditionSummary: item.listing.conditionSummary,
                    defectDisclosure: item.listing.defectDisclosure ?? '',
                    includedItems: item.listing.includedItems ?? '',
                    measurements: item.listing.measurements ?? '',
                    attributes: (item.listing.attributes ?? {}) as Record<string, string>,
                    searchTerms: Array.isArray(item.listing.searchTerms)
                      ? (item.listing.searchTerms as string[])
                      : [],
                  }}
                  variants={variants}
                  capabilities={capabilities}
                  tone={item.listing.tone}
                  photoCount={processedPhotos.length}
                  hasPrice={Boolean(balancedPrice)}
                />
              </CardContent>
            </Card>
          ) : null}

          {/* Photos */}
          <Card>
            <CardHeader>
              <CardTitle>Photos ({processedPhotos.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {processedPhotos.length === 0 ? (
                <p className="flex items-center gap-2 text-[13px] text-muted">
                  <ImageIcon className="size-4" aria-hidden="true" />
                  No processed photos.
                </p>
              ) : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {processedPhotos.map((photo, index) => (
                    <li key={photo.id}>
                      <ItemThumbnail
                        objectKey={photo.thumbnailKey}
                        alt={`Photo ${index + 1} of ${item.title}`}
                        size={120}
                        className="aspect-square w-full"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Side rail */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Price suggestions</CardTitle>
            </CardHeader>
            <CardContent>
              <PricePanel
                itemId={item.id}
                currency={item.currency}
                acquisitionCostCents={item.acquisitionCostCents}
                feePercentBps={ebayTemplate?.feePercentBps ?? 0}
                feeFixedCents={ebayTemplate?.feeFixedCents ?? 0}
                prices={item.priceSuggestions.map((suggestion) => ({
                  strategy: suggestion.strategy,
                  amountCents: suggestion.amountCents,
                  lowCents: suggestion.lowCents,
                  highCents: suggestion.highCents,
                  currency: suggestion.currency,
                  source: suggestion.source,
                  confidence: suggestion.confidence,
                  explanation: suggestion.explanation,
                  comparableCount: suggestion.comparableCount,
                  observedAt: suggestion.observedAt,
                  userEdited: suggestion.userEdited,
                }))}
              />
            </CardContent>
          </Card>

          {masterIssues.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Before you publish</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {masterIssues.map((issue) => (
                    <li key={issue.message} className="flex gap-2 text-[13px] leading-relaxed">
                      <span
                        className={
                          issue.level === 'error'
                            ? 'mt-1.5 size-1.5 shrink-0 rounded-full bg-danger'
                            : 'mt-1.5 size-1.5 shrink-0 rounded-full bg-warning'
                        }
                        aria-hidden="true"
                      />
                      <span className="text-muted">{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Item facts</CardTitle>
            </CardHeader>
            <CardContent>
              <FactReview
                itemId={item.id}
                facts={item.facts.map((fact) => ({
                  key: fact.key,
                  value: fact.value,
                  source: fact.source,
                  confidence: fact.confidence,
                  evidence: fact.evidence,
                  confirmed: fact.confirmed,
                }))}
              />
            </CardContent>
          </Card>

          {/* History */}
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {item.publications.slice(0, 4).map((attempt) => (
                  <li key={attempt.id} className="flex gap-2.5">
                    <Clock className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-[12px] text-ink">
                        {PLATFORM_NAMES[attempt.platform]} publish —{' '}
                        {attempt.status.toLowerCase()}
                      </p>
                      {attempt.errorMessage ? (
                        <p className="text-[11px] leading-snug text-danger">
                          {attempt.errorMessage}
                        </p>
                      ) : null}
                      <p className="text-[11px] text-subtle">
                        {relativeTime(attempt.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}

                {item.statusEvents.map((event) => (
                  <li key={event.id} className="flex gap-2.5">
                    <Clock className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-[12px] text-ink">
                        {event.note ?? `Marked ${event.toStatus.toLowerCase()}`}
                      </p>
                      <p className="text-[11px] text-subtle">{relativeTime(event.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
