'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type ExportFormat, ItemStatus, JobType, type PlatformKey, type Tone } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { idempotencyKey } from '@/lib/ids';
import { sanitizeError } from '@/lib/logger';
import { enforceRateLimit, RateLimitError } from '@/lib/rate-limit';
import { InsufficientCreditsError } from '@/server/credits';
import { enqueueJob } from '@/server/jobs/queue';
import { requireApiWorkspace, assertItemInWorkspace } from '@/server/session';
import { getActiveTemplate } from '@/server/marketplace';
import { isVariantComplete, validateVariant } from '@/server/listings/validation';
import { SellerFactsSchema } from './facts';
import {
  changeItemStatus,
  confirmUpload,
  createDraftItem,
  createUploadTicket,
  deletePhoto,
  ItemServiceError,
  reorderPhotos,
  resolveInference,
  restoreItem,
  saveSellerFacts,
  softDeleteItem,
  startGeneration,
  type UploadTicket,
} from './service';

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  code?: string;
  data?: T;
}

/**
 * Wraps every action so a thrown service error becomes a message the UI can
 * render, and an unexpected error never leaks internals to the browser.
 */
async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof ItemServiceError) {
      return { ok: false, error: error.message, code: error.code };
    }
    if (error instanceof InsufficientCreditsError) {
      return { ok: false, error: error.message, code: 'insufficient_credits' };
    }
    if (error instanceof RateLimitError) {
      return { ok: false, error: error.message, code: 'rate_limited' };
    }
    return {
      ok: false,
      error: sanitizeError(error, 'Something went wrong. Please try again.'),
      code: 'unknown',
    };
  }
}

export async function createItemAction(): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const context = await requireApiWorkspace();
    const item = await createDraftItem({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      currency: context.workspace.currency,
      country: context.workspace.country,
    });
    return { id: item.id };
  });
}

const UploadTicketSchema = z.object({
  itemId: z.string().min(1),
  contentType: z.string().min(1).max(80),
  byteSize: z.number().int().positive(),
});

export async function requestUploadTicketAction(
  input: z.infer<typeof UploadTicketSchema>,
): Promise<ActionResult<UploadTicket>> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await enforceRateLimit('uploadRequest', context.workspace.id);
    const parsed = UploadTicketSchema.parse(input);
    await assertItemInWorkspace(parsed.itemId, context.workspace.id);
    return createUploadTicket({ workspaceId: context.workspace.id, ...parsed });
  });
}

export async function confirmUploadAction(input: {
  itemId: string;
  photoId: string;
}): Promise<ActionResult> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(input.itemId, context.workspace.id);
    await confirmUpload({ workspaceId: context.workspace.id, ...input });
    revalidatePath(`/app/items/${input.itemId}`);
    return undefined;
  });
}

export async function deletePhotoAction(input: {
  itemId: string;
  photoId: string;
}): Promise<ActionResult> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(input.itemId, context.workspace.id);
    await deletePhoto({ workspaceId: context.workspace.id, ...input });
    revalidatePath(`/app/items/${input.itemId}`);
    return undefined;
  });
}

export async function reorderPhotosAction(input: {
  itemId: string;
  orderedPhotoIds: string[];
}): Promise<ActionResult> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(input.itemId, context.workspace.id);
    await reorderPhotos({ workspaceId: context.workspace.id, ...input });
    revalidatePath(`/app/items/${input.itemId}`);
    return undefined;
  });
}

/** Polled by the wizard while the worker processes uploads. */
export async function getPhotoStatusesAction(itemId: string): Promise<
  ActionResult<
    Array<{
      id: string;
      status: string;
      thumbnailKey: string | null;
      objectKey: string;
      position: number;
      blurScore: number | null;
      brightness: number | null;
      isDuplicateOf: string | null;
      rejectReason: string | null;
    }>
  >
> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(itemId, context.workspace.id);
    const photos = await prisma.itemPhoto.findMany({
      where: { itemId },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        status: true,
        thumbnailKey: true,
        objectKey: true,
        position: true,
        blurScore: true,
        brightness: true,
        isDuplicateOf: true,
        rejectReason: true,
      },
    });
    return photos;
  });
}

export async function saveSellerFactsAction(
  itemId: string,
  raw: unknown,
): Promise<ActionResult> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(itemId, context.workspace.id);
    const facts = SellerFactsSchema.parse(raw);
    await saveSellerFacts({ workspaceId: context.workspace.id, itemId, facts });
    revalidatePath(`/app/items/${itemId}`);
    return undefined;
  });
}

export async function startGenerationAction(input: {
  itemId: string;
  tone?: Tone;
}): Promise<ActionResult<{ aiJobId: string; creditsRemaining: number }>> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(input.itemId, context.workspace.id);
    // Two limits: a burst guard and an hourly ceiling.
    await enforceRateLimit('aiJobBurst', context.workspace.id);
    await enforceRateLimit('aiJob', context.workspace.id);

    const result = await startGeneration({
      workspaceId: context.workspace.id,
      itemId: input.itemId,
      tone: input.tone,
    });

    revalidatePath('/app');
    revalidatePath(`/app/items/${input.itemId}`);
    return { aiJobId: result.aiJobId, creditsRemaining: result.creditsRemaining };
  });
}

/** Polled by the wizard's progress screen. */
export async function getGenerationStatusAction(itemId: string): Promise<
  ActionResult<{ status: string; itemStatus: ItemStatus; error: string | null; progress: number }>
> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(itemId, context.workspace.id);

    const [job, item, analysisCount, variantCount] = await Promise.all([
      prisma.aIJob.findFirst({
        where: { itemId },
        orderBy: { createdAt: 'desc' },
        select: { status: true, error: true },
      }),
      prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: { status: true } }),
      prisma.aIAnalysis.count({ where: { itemId } }),
      prisma.listingVariant.count({ where: { listing: { itemId } } }),
    ]);

    // Progress is derived from work actually completed, not a timer.
    const progress =
      item.status === ItemStatus.READY
        ? 100
        : Math.min(95, 10 + (analysisCount > 0 ? 35 : 0) + variantCount * 12);

    return {
      status: job?.status ?? 'QUEUED',
      itemStatus: item.status,
      error: job?.error ?? null,
      progress,
    };
  });
}

export async function resolveInferenceAction(input: {
  itemId: string;
  key: string;
  action: 'accept' | 'edit' | 'clear';
  value?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(input.itemId, context.workspace.id);
    await resolveInference({ workspaceId: context.workspace.id, ...input });
    revalidatePath(`/app/items/${input.itemId}`);
    return undefined;
  });
}

const MasterUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(8000),
  conditionSummary: z.string().trim().max(1000),
  defectDisclosure: z.string().trim().max(1500),
  includedItems: z.string().trim().max(800),
  measurements: z.string().trim().max(800),
});

export async function updateMasterListingAction(
  itemId: string,
  raw: unknown,
): Promise<ActionResult> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(itemId, context.workspace.id);
    const data = MasterUpdateSchema.parse(raw);

    const listing = await prisma.listing.findUnique({ where: { itemId }, select: { id: true } });
    if (!listing) throw new ItemServiceError('not_found', 'This item has no listing yet.');

    await prisma.$transaction([
      prisma.listing.update({ where: { id: listing.id }, data }),
      prisma.item.update({ where: { id: itemId }, data: { title: data.title.slice(0, 140) } }),
      prisma.listingRevision.create({
        data: {
          listingId: listing.id,
          authorId: context.user.id,
          origin: 'user',
          summary: 'Master listing edited',
          snapshot: data as never,
        },
      }),
    ]);

    revalidatePath(`/app/items/${itemId}`);
    return undefined;
  });
}

const VariantUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(10_000),
  fields: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
});

export async function updateVariantAction(
  itemId: string,
  platform: PlatformKey,
  raw: unknown,
): Promise<ActionResult<{ issues: unknown[]; isComplete: boolean }>> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(itemId, context.workspace.id);
    const data = VariantUpdateSchema.parse(raw);

    const variant = await prisma.listingVariant.findFirst({
      where: { platform, listing: { itemId } },
      select: { id: true, listingId: true },
    });
    if (!variant) throw new ItemServiceError('not_found', 'That platform draft does not exist yet.');

    const template = await getActiveTemplate(platform);
    if (!template) throw new ItemServiceError('no_template', 'That platform is not configured.');

    // Re-validate on the server. The browser's counters are a convenience; this
    // is what decides whether the variant may be published or exported.
    const issues = validateVariant({
      platform,
      title: data.title,
      description: data.description,
      fields: data.fields,
      template,
    });

    await prisma.$transaction([
      prisma.listingVariant.update({
        where: { id: variant.id },
        data: {
          title: data.title,
          description: data.description,
          fields: data.fields as never,
          issues: issues as never,
          isComplete: isVariantComplete(issues),
        },
      }),
      prisma.listingRevision.create({
        data: {
          listingId: variant.listingId,
          variantId: variant.id,
          platform,
          authorId: context.user.id,
          origin: 'user',
          summary: `${platform} draft edited`,
          snapshot: data as never,
        },
      }),
    ]);

    revalidatePath(`/app/items/${itemId}`);
    return { issues, isComplete: isVariantComplete(issues) };
  });
}

/** Regenerating one platform variant is free — it re-uses the existing analysis. */
export async function regenerateVariantAction(input: {
  itemId: string;
  platform: PlatformKey;
  tone: Tone;
}): Promise<ActionResult> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(input.itemId, context.workspace.id);
    await enforceRateLimit('aiJobBurst', context.workspace.id);

    const listing = await prisma.listing.findUnique({
      where: { itemId: input.itemId },
      select: { id: true },
    });
    if (!listing) throw new ItemServiceError('not_found', 'This item has no listing yet.');

    await enqueueJob({
      type: JobType.REGENERATE_VARIANT,
      workspaceId: context.workspace.id,
      payload: {
        itemId: input.itemId,
        listingId: listing.id,
        platform: input.platform,
        tone: input.tone,
      },
      priority: 20,
      idempotencyKey: idempotencyKey('regen', listing.id, input.platform, Date.now()),
    });

    revalidatePath(`/app/items/${input.itemId}`);
    return undefined;
  });
}

export async function restoreRevisionAction(input: {
  itemId: string;
  revisionId: string;
}): Promise<ActionResult> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(input.itemId, context.workspace.id);

    const revision = await prisma.listingRevision.findFirst({
      where: { id: input.revisionId, listing: { itemId: input.itemId } },
    });
    if (!revision) throw new ItemServiceError('not_found', 'That revision could not be found.');

    const snapshot = revision.snapshot as Record<string, unknown>;

    if (revision.variantId) {
      await prisma.listingVariant.update({
        where: { id: revision.variantId },
        data: {
          title: String(snapshot.title ?? ''),
          description: String(snapshot.description ?? ''),
          fields: (snapshot.fields ?? {}) as never,
        },
      });
    } else {
      await prisma.listing.update({
        where: { id: revision.listingId },
        data: {
          title: String(snapshot.title ?? ''),
          description: String(snapshot.description ?? ''),
          conditionSummary: String(snapshot.conditionSummary ?? ''),
          defectDisclosure: snapshot.defectDisclosure ? String(snapshot.defectDisclosure) : null,
          includedItems: snapshot.includedItems ? String(snapshot.includedItems) : null,
          measurements: snapshot.measurements ? String(snapshot.measurements) : null,
        },
      });
    }

    revalidatePath(`/app/items/${input.itemId}`);
    return undefined;
  });
}

const PriceUpdateSchema = z.object({
  strategy: z.enum(['QUICK_SALE', 'BALANCED', 'MAXIMISE_RETURN']),
  amountCents: z.number().int().min(0).max(100_000_000),
});

export async function updatePriceAction(
  itemId: string,
  raw: unknown,
): Promise<ActionResult> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(itemId, context.workspace.id);
    const data = PriceUpdateSchema.parse(raw);

    await prisma.priceSuggestion.update({
      where: { itemId_strategy: { itemId, strategy: data.strategy } },
      // `userEdited` stops a later regeneration from overwriting the seller's
      // own number.
      data: { amountCents: data.amountCents, userEdited: true },
    });

    revalidatePath(`/app/items/${itemId}`);
    return undefined;
  });
}

export async function changeStatusAction(input: {
  itemId: string;
  status: ItemStatus;
  note?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(input.itemId, context.workspace.id);
    await changeItemStatus({
      workspaceId: context.workspace.id,
      actorId: context.user.id,
      ...input,
    });
    revalidatePath(`/app/items/${input.itemId}`);
    revalidatePath('/app/inventory');
    return undefined;
  });
}

const SaleSchema = z.object({
  platform: z.enum(['EBAY', 'VINTED', 'DEPOP', 'FACEBOOK_MARKETPLACE']),
  salePriceCents: z.number().int().min(0).max(100_000_000),
  feesCents: z.number().int().min(0).max(100_000_000).default(0),
  shippingCents: z.number().int().min(0).max(100_000_000).default(0),
  soldAt: z.string().min(1),
});

export async function recordSaleAction(itemId: string, raw: unknown): Promise<ActionResult> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(itemId, context.workspace.id);
    const data = SaleSchema.parse(raw);

    const soldAt = new Date(data.soldAt);
    if (Number.isNaN(soldAt.getTime())) {
      throw new ItemServiceError('invalid_date', 'That sale date is not valid.');
    }

    await prisma.$transaction([
      prisma.saleRecord.upsert({
        where: { itemId },
        create: {
          itemId,
          workspaceId: context.workspace.id,
          platform: data.platform,
          currency: context.workspace.currency,
          salePriceCents: data.salePriceCents,
          feesCents: data.feesCents,
          shippingCents: data.shippingCents,
          soldAt,
          // Explicitly seller-entered, so analytics can distinguish it from
          // anything an official API later reports.
          isApiSynced: false,
        },
        update: {
          platform: data.platform,
          salePriceCents: data.salePriceCents,
          feesCents: data.feesCents,
          shippingCents: data.shippingCents,
          soldAt,
        },
      }),
      prisma.item.update({
        where: { id: itemId },
        data: { status: ItemStatus.SOLD, soldAt },
      }),
      prisma.listingStatusEvent.create({
        data: {
          itemId,
          toStatus: ItemStatus.SOLD,
          actorId: context.user.id,
          source: 'user',
          note: 'Sale recorded',
        },
      }),
      prisma.analyticsEvent.create({
        data: {
          name: 'ITEM_MARKED_SOLD',
          workspaceId: context.workspace.id,
          properties: { platform: data.platform },
        },
      }),
    ]);

    revalidatePath(`/app/items/${itemId}`);
    revalidatePath('/app/analytics');
    return undefined;
  });
}

export async function deleteItemAction(itemId: string): Promise<ActionResult> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(itemId, context.workspace.id);
    await softDeleteItem({ workspaceId: context.workspace.id, itemId });
    revalidatePath('/app/inventory');
    return undefined;
  });
}

export async function restoreItemAction(itemId: string): Promise<ActionResult> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await restoreItem({ workspaceId: context.workspace.id, itemId });
    revalidatePath('/app/inventory');
    return undefined;
  });
}

export async function createExportAction(input: {
  itemId: string;
  platform: PlatformKey | null;
  format: ExportFormat;
}): Promise<ActionResult<{ exportJobId: string }>> {
  return run(async () => {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(input.itemId, context.workspace.id);
    await enforceRateLimit('export', context.workspace.id);

    const exportJob = await prisma.exportJob.create({
      data: {
        workspaceId: context.workspace.id,
        itemId: input.itemId,
        platform: input.platform,
        format: input.format,
        status: 'QUEUED',
      },
      select: { id: true },
    });

    await enqueueJob({
      type: JobType.BUILD_EXPORT,
      workspaceId: context.workspace.id,
      payload: { exportJobId: exportJob.id },
      priority: 30,
      idempotencyKey: idempotencyKey('export', exportJob.id),
    });

    return { exportJobId: exportJob.id };
  });
}

export async function getExportStatusAction(
  exportJobId: string,
): Promise<ActionResult<{ status: string; downloadUrl: string | null; filename: string | null }>> {
  return run(async () => {
    const context = await requireApiWorkspace();
    const job = await prisma.exportJob.findFirst({
      where: { id: exportJobId, workspaceId: context.workspace.id },
      include: { artifacts: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!job) throw new ItemServiceError('not_found', 'That export could not be found.');

    const artifact = job.artifacts[0];
    return {
      status: job.status,
      downloadUrl: artifact ? `/api/exports/${artifact.id}` : null,
      filename: artifact?.filename ?? null,
    };
  });
}
