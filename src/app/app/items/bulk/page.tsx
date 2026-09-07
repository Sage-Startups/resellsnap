import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Button, PageHeader } from '@/components/ui';
import { BulkWorkflow } from './bulk-workflow';
import { requireWorkspace } from '@/server/session';
import { getEntitlements } from '@/server/entitlements';
import { getSettings } from '@/server/settings';

export const metadata: Metadata = { title: 'Bulk listings' };

export default async function BulkPage() {
  const context = await requireWorkspace();
  const [entitlements, settings] = await Promise.all([
    getEntitlements(context.workspace.id),
    getSettings(),
  ]);

  const credits = context.workspace.monthlyCredits + context.workspace.purchasedCredits;

  // Entitlement is enforced here on the server, and again in the action layer.
  if (!entitlements.bulkWorkflow) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <PageHeader
          title="Bulk listings"
          description="Process several items in one pass."
        />
        <Alert tone="neutral" title="Bulk mode is a Pro feature">
          <p>
            The Pro plan adds bulk processing, a saved brand voice, advanced analytics and priority
            in the generation queue.
          </p>
          <Button asChild variant="primary" size="sm" className="mt-3">
            <Link href="/app/billing">See plans</Link>
          </Button>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Bulk listings"
        description="Group photos by item, add the minimum each one needs, and generate them together."
        actions={
          <Button asChild variant="outline">
            <Link href="/app/items/new">Single item instead</Link>
          </Button>
        }
      />

      <BulkWorkflow
        maxPhotos={settings.maxPhotosPerItem}
        maxBytes={settings.maxUploadBytes}
        creditsAvailable={credits}
      />
    </div>
  );
}
