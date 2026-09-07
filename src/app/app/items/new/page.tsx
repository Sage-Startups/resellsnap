import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Alert, Button } from '@/components/ui';
import { requireWorkspace } from '@/server/session';
import { getSettings } from '@/server/settings';
import { createDraftItem } from '@/server/items/service';
import { prisma } from '@/lib/db';
import { isAIConfigured } from '@/lib/env';
import { NewListingWizard } from './new-listing-wizard';

export const metadata: Metadata = { title: 'New listing' };

/**
 * A draft item is created on arrival so photos have somewhere to attach before
 * the seller has typed anything. An abandoned draft with no photos is swept by
 * the maintenance job.
 */
export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const context = await requireWorkspace();
  const settings = await getSettings();
  const params = await searchParams;

  if (!params.item) {
    const item = await createDraftItem({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      currency: context.workspace.currency,
      country: context.workspace.country,
    });
    redirect(`/app/items/new?item=${item.id}`);
  }

  const item = await prisma.item.findFirst({
    where: { id: params.item, workspaceId: context.workspace.id, deletedAt: null },
    select: {
      id: true,
      photos: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          status: true,
          objectKey: true,
          thumbnailKey: true,
          position: true,
          blurScore: true,
          brightness: true,
          isDuplicateOf: true,
          rejectReason: true,
        },
      },
    },
  });

  if (!item) redirect('/app/items/new');

  const credits = context.workspace.monthlyCredits + context.workspace.purchasedCredits;
  const aiReady = isAIConfigured() && settings.aiGenerationEnabled;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">New listing</h1>
        <p className="mt-1 text-[13px] text-muted">
          Photos, a few details only you know, and you will have drafts for all four marketplaces.
        </p>
      </div>

      {!aiReady ? (
        <Alert tone="warning" title="Generation is unavailable right now">
          {settings.aiGenerationEnabled
            ? 'This deployment has no AI provider configured, so new listings cannot be generated. Your photos and details will still be saved.'
            : settings.maintenanceMessage}
        </Alert>
      ) : null}

      {credits < 1 ? (
        <Alert tone="warning" title="No listing credits left">
          <p>You can still upload photos and save your details — you just cannot generate yet.</p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/app/billing">Top up credits</Link>
          </Button>
        </Alert>
      ) : null}

      <NewListingWizard
        itemId={item.id}
        maxPhotos={settings.maxPhotosPerItem}
        maxBytes={settings.maxUploadBytes}
        currency={context.workspace.currency}
        creditsAvailable={credits}
        initialPhotos={item.photos}
      />
    </div>
  );
}
