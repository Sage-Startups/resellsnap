/**
 * Job handlers.
 *
 * Each handler is idempotent: re-running it after a crash must converge on the
 * same state rather than duplicating work or double-charging.
 */
import { z } from 'zod';
import {
  AIJobStatus,
  ItemStatus,
  JobType,
  NotificationType,
  PhotoStatus,
  type Tone,
} from '@/generated/prisma/enums';
import type { Job } from '@/lib/models';
import { prisma } from '@/lib/db';
import { logger, sanitizeError } from '@/lib/logger';
import { refundCreditsForAIJob } from '@/server/credits';
import { runFullGeneration, generatePlatformVariant } from '@/server/listings/generation';
import { runExportJob } from '@/server/exports';
import { EMAIL_KEYS, sendTemplateEmail } from '@/server/email';
import { getSettings } from '@/server/settings';
import {
  buildDerivativeKey,
  getStorage,
} from '@/server/storage';
import {
  BLUR_WARNING_THRESHOLD,
  DARK_WARNING_THRESHOLD,
  DUPLICATE_HASH_THRESHOLD,
  hashDistance,
  processImage,
  validateImageBuffer,
} from '@/server/storage/images';
import { getAdapter } from '@/server/marketplace';
import { getEnv } from '@/lib/env';

export interface HandlerResult {
  /** When false, `failJob` will dead-letter immediately instead of retrying. */
  retryable?: boolean;
}

export type JobHandler = (job: Job) => Promise<HandlerResult | void>;

// --- Photo processing ------------------------------------------------------

const ProcessPhotoPayload = z.object({ photoId: z.string() });

const processPhoto: JobHandler = async (job) => {
  const { photoId } = ProcessPhotoPayload.parse(job.payload);

  const photo = await prisma.itemPhoto.findUnique({
    where: { id: photoId },
    include: { item: { select: { id: true, workspaceId: true } } },
  });

  if (!photo) return;
  if (photo.status === PhotoStatus.PROCESSED) return; // already done

  const storage = getStorage();
  const settings = await getSettings();

  let buffer: Buffer;
  try {
    buffer = await storage.getObject(photo.objectKey);
  } catch {
    // The upload never landed. Mark it rejected rather than retrying forever.
    await prisma.itemPhoto.update({
      where: { id: photoId },
      data: { status: PhotoStatus.REJECTED, rejectReason: 'The upload did not complete.' },
    });
    return { retryable: false };
  }

  try {
    // Second validation pass — this one reads the actual bytes.
    const validated = await validateImageBuffer(buffer, settings.maxUploadBytes);
    const processed = await processImage(buffer);

    // Re-encoding strips EXIF, so we overwrite the original with the clean copy.
    await storage.putObject(photo.objectKey, processed.sanitized, 'image/jpeg');

    const thumbnailKey = buildDerivativeKey(photo.objectKey, 'thumb');
    await storage.putObject(thumbnailKey, processed.thumbnail, 'image/webp');

    // Duplicate detection against this item's other photos.
    const siblings = await prisma.itemPhoto.findMany({
      where: { itemId: photo.itemId, id: { not: photoId }, status: PhotoStatus.PROCESSED },
      select: { id: true, checksumSha256: true },
    });

    let duplicateOf: string | null = null;
    for (const sibling of siblings) {
      if (sibling.checksumSha256 && hashDistance(sibling.checksumSha256, processed.perceptualHash) <= DUPLICATE_HASH_THRESHOLD) {
        duplicateOf = sibling.id;
        break;
      }
    }

    await prisma.itemPhoto.update({
      where: { id: photoId },
      data: {
        status: PhotoStatus.PROCESSED,
        thumbnailKey,
        contentType: 'image/jpeg',
        byteSize: processed.sanitized.byteLength,
        width: processed.width,
        height: processed.height,
        // We store the perceptual hash here; the SHA-256 of the original is not
        // useful once we have re-encoded the file.
        checksumSha256: processed.perceptualHash,
        blurScore: processed.blurScore,
        brightness: processed.brightness,
        isDuplicateOf: duplicateOf,
        exifStripped: true,
        rejectReason: null,
      },
    });

    logger.debug('Processed photo', {
      photoId,
      width: validated.width,
      height: validated.height,
      blurry: processed.blurScore < BLUR_WARNING_THRESHOLD,
      dark: processed.brightness < DARK_WARNING_THRESHOLD,
    });
  } catch (error) {
    await prisma.itemPhoto.update({
      where: { id: photoId },
      data: {
        status: PhotoStatus.REJECTED,
        rejectReason: sanitizeError(error, 'This photo could not be processed.'),
      },
    });
    // A bad file will not become good on retry.
    return { retryable: false };
  }
};

// --- Listing generation ----------------------------------------------------

const GenerateListingPayload = z.object({
  itemId: z.string(),
  aiJobId: z.string(),
  tone: z.enum(['STRAIGHTFORWARD', 'FRIENDLY', 'VINTAGE', 'MINIMAL']).default('STRAIGHTFORWARD'),
});

const generateListing: JobHandler = async (job) => {
  const payload = GenerateListingPayload.parse(job.payload);

  const settings = await getSettings();
  if (!settings.aiGenerationEnabled) {
    throw new Error('AI generation is currently disabled by the operator.');
  }

  const aiJob = await prisma.aIJob.findUnique({
    where: { id: payload.aiJobId },
    include: { workspace: { select: { id: true } } },
  });
  if (!aiJob) return { retryable: false };
  if (aiJob.status === AIJobStatus.SUCCEEDED) return; // idempotent replay

  const startedAt = Date.now();
  await prisma.aIJob.update({
    where: { id: payload.aiJobId },
    data: { status: AIJobStatus.RUNNING, startedAt: new Date() },
  });
  await prisma.item.update({
    where: { id: payload.itemId },
    data: { status: ItemStatus.ANALYZING },
  });

  try {
    const outcome = await runFullGeneration({
      itemId: payload.itemId,
      aiJobId: payload.aiJobId,
      tone: payload.tone as Tone,
      onUsage: async (usage) => {
        await prisma.aIUsage.create({
          data: {
            aiJobId: payload.aiJobId,
            provider: usage.provider,
            model: usage.model,
            operation: usage.operation,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            imageCount: usage.imageCount ?? 0,
            estimatedCostMicros: usage.estimatedCostMicros,
            durationMs: usage.durationMs,
          },
        });
      },
    });

    await prisma.aIJob.update({
      where: { id: payload.aiJobId },
      data: {
        status: AIJobStatus.SUCCEEDED,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
      },
    });

    if (outcome.blocked) {
      // A blocked item still consumed real analysis work, but the seller got no
      // listing — refund and tell them why.
      await refundCreditsForAIJob(payload.aiJobId, 'Item flagged as prohibited; no listing produced');
      await notifyOwners(payload.itemId, {
        type: NotificationType.GENERATION_FAILED,
        title: 'We stopped generating this listing',
        body:
          outcome.blockReason ??
          'This item appears to fall into a prohibited category, so we did not produce a listing. Your credit has been returned.',
      });
      return;
    }

    await prisma.analyticsEvent.create({
      data: {
        name: 'LISTING_GENERATED',
        workspaceId: aiJob.workspaceId,
        properties: { itemId: payload.itemId },
      },
    });

    await notifyOwners(payload.itemId, {
      type: NotificationType.GENERATION_COMPLETE,
      title: 'Your listing drafts are ready',
      body: 'Review the master listing and the four platform drafts before publishing.',
      emailKey: EMAIL_KEYS.GENERATION_COMPLETE,
    });

    await maybeWarnLowCredits(aiJob.workspaceId);
  } catch (error) {
    const message = sanitizeError(error, 'Listing generation failed');

    await prisma.aIJob.update({
      where: { id: payload.aiJobId },
      data: {
        status: job.attempts >= job.maxAttempts ? AIJobStatus.FAILED : AIJobStatus.QUEUED,
        error: message,
        durationMs: Date.now() - startedAt,
      },
    });

    // Only refund once every retry is exhausted; an intermediate failure will
    // be retried and should keep its credit reserved.
    if (job.attempts >= job.maxAttempts) {
      await prisma.item.update({ where: { id: payload.itemId }, data: { status: ItemStatus.DRAFT } });
      await refundCreditsForAIJob(payload.aiJobId, message);
      await notifyOwners(payload.itemId, {
        type: NotificationType.GENERATION_FAILED,
        title: 'Listing generation failed',
        body: `${message} Your listing credit has been returned.`,
        emailKey: EMAIL_KEYS.GENERATION_FAILED,
        emailTokens: { reason: message },
      });
    }

    throw error;
  }
};

// --- Variant regeneration --------------------------------------------------

const RegenerateVariantPayload = z.object({
  itemId: z.string(),
  listingId: z.string(),
  platform: z.enum(['EBAY', 'VINTED', 'DEPOP', 'FACEBOOK_MARKETPLACE']),
  tone: z.enum(['STRAIGHTFORWARD', 'FRIENDLY', 'VINTAGE', 'MINIMAL']).default('STRAIGHTFORWARD'),
  aiJobId: z.string().optional(),
});

const regenerateVariant: JobHandler = async (job) => {
  const payload = RegenerateVariantPayload.parse(job.payload);

  if (payload.aiJobId) {
    await prisma.aIJob.update({
      where: { id: payload.aiJobId },
      data: { status: AIJobStatus.RUNNING, startedAt: new Date() },
    });
  }

  try {
    const result = await generatePlatformVariant({
      itemId: payload.itemId,
      listingId: payload.listingId,
      platform: payload.platform,
      tone: payload.tone as Tone,
    });

    if (payload.aiJobId) {
      await prisma.aIUsage.create({
        data: {
          aiJobId: payload.aiJobId,
          provider: result.usage.provider,
          model: result.usage.model,
          operation: `variant_${payload.platform.toLowerCase()}`,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          estimatedCostMicros: result.usage.estimatedCostMicros,
          durationMs: result.usage.durationMs,
        },
      });
      await prisma.aIJob.update({
        where: { id: payload.aiJobId },
        data: { status: AIJobStatus.SUCCEEDED, finishedAt: new Date() },
      });
    }

    const item = await prisma.item.findUnique({
      where: { id: payload.itemId },
      select: { workspaceId: true },
    });
    if (item) {
      await prisma.analyticsEvent.create({
        data: {
          name: 'VARIANT_REGENERATED',
          workspaceId: item.workspaceId,
          properties: { platform: payload.platform },
        },
      });
    }
  } catch (error) {
    if (payload.aiJobId && job.attempts >= job.maxAttempts) {
      await prisma.aIJob.update({
        where: { id: payload.aiJobId },
        data: { status: AIJobStatus.FAILED, error: sanitizeError(error), finishedAt: new Date() },
      });
    }
    throw error;
  }
};

// --- Exports ---------------------------------------------------------------

const ExportPayload = z.object({ exportJobId: z.string() });

const buildExport: JobHandler = async (job) => {
  const { exportJobId } = ExportPayload.parse(job.payload);
  await runExportJob(exportJobId);
};

// --- Email -----------------------------------------------------------------

const EmailPayload = z.object({
  key: z.string(),
  to: z.string(),
  userId: z.string().nullable().optional(),
  tokens: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
});

const sendEmail: JobHandler = async (job) => {
  const payload = EmailPayload.parse(job.payload);
  const result = await sendTemplateEmail({
    key: payload.key as never,
    to: payload.to,
    userId: payload.userId ?? null,
    tokens: payload.tokens,
  });
  if (!result.ok) throw new Error(result.error ?? 'Email send failed');
};

// --- Marketplace sync ------------------------------------------------------

const SyncPayload = z.object({ connectionId: z.string(), platform: z.string() });

const syncMarketplace: JobHandler = async (job) => {
  const payload = SyncPayload.parse(job.payload);
  const adapter = getAdapter(payload.platform as never);
  if (!adapter.syncListings) return { retryable: false };
  const result = await adapter.syncListings(payload.connectionId);
  logger.info('Marketplace sync complete', { connectionId: payload.connectionId, ...result });
};

// --- Cleanup ---------------------------------------------------------------

const cleanup: JobHandler = async () => {
  const { runMaintenance } = await import('./maintenance');
  await runMaintenance();
};

// --- Shared helpers --------------------------------------------------------

async function notifyOwners(
  itemId: string,
  input: {
    type: NotificationType;
    title: string;
    body: string;
    emailKey?: string;
    emailTokens?: Record<string, string | number>;
  },
): Promise<void> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      title: true,
      workspaceId: true,
      workspace: {
        select: { members: { select: { user: { select: { id: true, email: true, name: true } } } } },
      },
    },
  });

  if (!item) return;

  const href = `/app/items/${item.id}`;

  for (const member of item.workspace.members) {
    await prisma.notification.create({
      data: {
        workspaceId: item.workspaceId,
        userId: member.user.id,
        type: input.type,
        title: input.title,
        body: input.body,
        href,
      },
    });

    if (input.emailKey) {
      await sendTemplateEmail({
        key: input.emailKey as never,
        to: member.user.email,
        userId: member.user.id,
        tokens: {
          name: member.user.name || 'there',
          itemTitle: item.title,
          actionUrl: `${getEnv().APP_URL}${href}`,
          ...input.emailTokens,
        },
      });
    }
  }
}

async function maybeWarnLowCredits(workspaceId: string): Promise<void> {
  const settings = await getSettings();
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      monthlyCredits: true,
      purchasedCredits: true,
      members: { select: { user: { select: { id: true, email: true, name: true } } } },
    },
  });

  if (!workspace) return;
  const total = workspace.monthlyCredits + workspace.purchasedCredits;
  if (total > settings.lowCreditThreshold) return;

  for (const member of workspace.members) {
    // Once per day at most, keyed on the date.
    const key = `low_credits:${workspaceId}:${new Date().toISOString().slice(0, 10)}`;
    const already = await prisma.job.findUnique({ where: { idempotencyKey: key } });
    if (already) return;

    await prisma.notification.create({
      data: {
        workspaceId,
        userId: member.user.id,
        type: NotificationType.LOW_CREDITS,
        title: `${total} listing ${total === 1 ? 'credit' : 'credits'} left`,
        body: 'Top up or change plan to keep generating listings.',
        href: '/app/billing',
      },
    });

    const { enqueueJob } = await import('./queue');
    await enqueueJob({
      type: JobType.SEND_EMAIL,
      workspaceId,
      idempotencyKey: key,
      payload: {
        key: EMAIL_KEYS.LOW_CREDITS,
        to: member.user.email,
        userId: member.user.id,
        tokens: {
          name: member.user.name || 'there',
          credits: total,
          actionUrl: `${getEnv().APP_URL}/app/billing`,
        },
      },
    });
  }
}

export const HANDLERS: Record<JobType, JobHandler> = {
  [JobType.PROCESS_PHOTO]: processPhoto,
  [JobType.ANALYZE_ITEM]: generateListing,
  [JobType.GENERATE_LISTING]: generateListing,
  [JobType.REGENERATE_VARIANT]: regenerateVariant,
  [JobType.BUILD_EXPORT]: buildExport,
  [JobType.SEND_EMAIL]: sendEmail,
  [JobType.SYNC_MARKETPLACE]: syncMarketplace,
  [JobType.CLEANUP]: cleanup,
};
