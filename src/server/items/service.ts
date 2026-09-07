/**
 * Item lifecycle.
 *
 * Every function takes an explicit `workspaceId` and scopes its query by it.
 * There is no code path that loads an item by id alone.
 */
import {
  FactSource,
  ItemStatus,
  JobType,
  PhotoStatus,
  Tone,
  AIJobKind,
} from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { generateSku, idempotencyKey } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { consumeCredits, InsufficientCreditsError, LISTING_CREDIT_COST } from '@/server/credits';
import { enqueueJob } from '@/server/jobs/queue';
import { getSettings } from '@/server/settings';
import { getStorage, buildPhotoKey, assertKeyInWorkspace } from '@/server/storage';
import { EXTENSION_BY_TYPE, isAllowedImageType, type AllowedImageType } from '@/server/storage/images';
import { factsFromSellerInput, type SellerFacts } from './facts';

/**
 * True for a PostgreSQL unique-constraint violation, whatever shape the driver
 * adapter reports it in. Prisma surfaces these as `P2002`.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export class ItemServiceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ItemServiceError';
    this.code = code;
  }
}

/** Allocates a workspace-unique SKU, retrying on the astronomically rare clash. */
async function allocateSku(workspaceId: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const sku = generateSku();
    const existing = await prisma.item.findUnique({
      where: { workspaceId_sku: { workspaceId, sku } },
      select: { id: true },
    });
    if (!existing) return sku;
  }
  return `RS-${Date.now().toString(36).toUpperCase()}`;
}

export async function createDraftItem(input: {
  workspaceId: string;
  userId: string;
  currency: string;
  country: string;
}): Promise<{ id: string; sku: string }> {
  const sku = await allocateSku(input.workspaceId);

  const item = await prisma.item.create({
    data: {
      workspaceId: input.workspaceId,
      createdById: input.userId,
      sku,
      title: 'Untitled item',
      status: ItemStatus.DRAFT,
      currency: input.currency,
      country: input.country,
    },
    select: { id: true, sku: true },
  });

  await prisma.analyticsEvent.create({
    data: { name: 'ITEM_CREATED', workspaceId: input.workspaceId, userId: input.userId },
  });

  return item;
}

export interface UploadTicket {
  photoId: string;
  objectKey: string;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

/**
 * Issues a direct-to-bucket upload ticket.
 *
 * The object key is built server-side from the workspace and item, so a client
 * cannot choose where its bytes land. Large files never pass through the
 * Next.js process.
 */
export async function createUploadTicket(input: {
  workspaceId: string;
  itemId: string;
  contentType: string;
  byteSize: number;
}): Promise<UploadTicket> {
  const settings = await getSettings();

  if (!isAllowedImageType(input.contentType)) {
    throw new ItemServiceError(
      'unsupported_type',
      'Photos must be JPEG, PNG or WebP.',
    );
  }
  if (input.byteSize <= 0 || input.byteSize > settings.maxUploadBytes) {
    throw new ItemServiceError(
      'too_large',
      `Each photo must be under ${Math.round(settings.maxUploadBytes / 1024 / 1024)}MB.`,
    );
  }

  const item = await prisma.item.findFirst({
    where: { id: input.itemId, workspaceId: input.workspaceId, deletedAt: null },
    select: { id: true, _count: { select: { photos: true } } },
  });
  if (!item) throw new ItemServiceError('not_found', 'That item could not be found.');

  if (item._count.photos >= settings.maxPhotosPerItem) {
    throw new ItemServiceError(
      'too_many_photos',
      `You can upload up to ${settings.maxPhotosPerItem} photos per item.`,
    );
  }

  const extension = EXTENSION_BY_TYPE[input.contentType as AllowedImageType];
  const objectKey = buildPhotoKey(input.workspaceId, input.itemId, extension);

  const photo = await prisma.itemPhoto.create({
    data: {
      itemId: input.itemId,
      status: PhotoStatus.PENDING,
      objectKey,
      contentType: input.contentType,
      byteSize: input.byteSize,
      position: item._count.photos,
    },
    select: { id: true },
  });

  const signed = await getStorage().createSignedUpload({
    objectKey,
    contentType: input.contentType,
    maxBytes: input.byteSize,
  });

  return {
    photoId: photo.id,
    objectKey,
    url: signed.url,
    method: signed.method,
    headers: signed.headers,
  };
}

/**
 * Marks an upload as landed and queues processing.
 *
 * Processing is what actually validates the bytes, strips EXIF and builds the
 * thumbnail — the client's word is never taken for any of it.
 */
export async function confirmUpload(input: {
  workspaceId: string;
  itemId: string;
  photoId: string;
}): Promise<void> {
  const photo = await prisma.itemPhoto.findFirst({
    where: { id: input.photoId, item: { id: input.itemId, workspaceId: input.workspaceId } },
    select: { id: true, objectKey: true },
  });
  if (!photo) throw new ItemServiceError('not_found', 'That photo could not be found.');

  assertKeyInWorkspace(photo.objectKey, input.workspaceId);

  await prisma.itemPhoto.update({
    where: { id: photo.id },
    data: { status: PhotoStatus.UPLOADED },
  });

  await enqueueJob({
    type: JobType.PROCESS_PHOTO,
    workspaceId: input.workspaceId,
    payload: { photoId: photo.id },
    priority: 50,
    idempotencyKey: idempotencyKey('process_photo', photo.id),
  });

  await prisma.analyticsEvent.create({
    data: { name: 'PHOTOS_UPLOADED', workspaceId: input.workspaceId, properties: { itemId: input.itemId } },
  });
}

export async function deletePhoto(input: {
  workspaceId: string;
  itemId: string;
  photoId: string;
}): Promise<void> {
  const photo = await prisma.itemPhoto.findFirst({
    where: { id: input.photoId, item: { id: input.itemId, workspaceId: input.workspaceId } },
    select: { id: true, objectKey: true, thumbnailKey: true },
  });
  if (!photo) return;

  const keys = [photo.objectKey, photo.thumbnailKey].filter((key): key is string => Boolean(key));
  await getStorage()
    .deleteObjects(keys)
    .catch((error) => logger.warn('Could not delete photo objects', { error }));

  await prisma.itemPhoto.delete({ where: { id: photo.id } });
  await resequencePhotos(input.itemId);
}

export async function reorderPhotos(input: {
  workspaceId: string;
  itemId: string;
  orderedPhotoIds: string[];
}): Promise<void> {
  const photos = await prisma.itemPhoto.findMany({
    where: { item: { id: input.itemId, workspaceId: input.workspaceId } },
    select: { id: true },
  });

  const owned = new Set(photos.map((photo) => photo.id));
  const ordered = input.orderedPhotoIds.filter((id) => owned.has(id));

  await prisma.$transaction(
    ordered.map((id, index) =>
      prisma.itemPhoto.update({ where: { id }, data: { position: index } }),
    ),
  );

  const cover = ordered[0];
  if (cover) {
    await prisma.item.update({ where: { id: input.itemId }, data: { coverPhotoId: cover } });
  }
}

async function resequencePhotos(itemId: string): Promise<void> {
  const photos = await prisma.itemPhoto.findMany({
    where: { itemId },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  await prisma.$transaction(
    photos.map((photo, index) =>
      prisma.itemPhoto.update({ where: { id: photo.id }, data: { position: index } }),
    ),
  );
}

/** Persists the wizard's seller-facts step. Confirmed facts are authoritative. */
export async function saveSellerFacts(input: {
  workspaceId: string;
  itemId: string;
  facts: SellerFacts;
}): Promise<void> {
  const item = await prisma.item.findFirst({
    where: { id: input.itemId, workspaceId: input.workspaceId, deletedAt: null },
    select: { id: true },
  });
  if (!item) throw new ItemServiceError('not_found', 'That item could not be found.');

  const records = factsFromSellerInput(input.facts);

  await prisma.$transaction([
    prisma.item.update({
      where: { id: input.itemId },
      data: {
        categoryHint: input.facts.category ?? null,
        quantity: input.facts.quantity,
        acquisitionCostCents: input.facts.acquisitionCostCents ?? null,
        desiredMinPriceCents: input.facts.desiredMinPriceCents ?? null,
        shippingPreference: input.facts.shippingPreference,
        country: input.facts.country,
        notes: input.facts.notes ?? null,
        ...(input.facts.name ? { title: input.facts.name } : {}),
      },
    }),
    // A key the seller cleared should stop being a confirmed fact.
    prisma.itemFact.deleteMany({
      where: {
        itemId: input.itemId,
        source: FactSource.SELLER_CONFIRMED,
        key: { notIn: records.map((record) => record.key) },
      },
    }),
    ...records.map((record) =>
      prisma.itemFact.upsert({
        where: { itemId_key: { itemId: input.itemId, key: record.key } },
        create: {
          itemId: input.itemId,
          key: record.key,
          value: record.value,
          source: FactSource.SELLER_CONFIRMED,
          confirmed: true,
        },
        update: {
          value: record.value,
          source: FactSource.SELLER_CONFIRMED,
          confirmed: true,
          confidence: null,
          evidence: null,
        },
      }),
    ),
  ]);
}

/**
 * Accepts, edits or clears an AI inference.
 *
 * Accepting promotes it to `SELLER_CONFIRMED` — the only way a guess ever
 * becomes a fact in this system.
 */
export async function resolveInference(input: {
  workspaceId: string;
  itemId: string;
  key: string;
  action: 'accept' | 'edit' | 'clear';
  value?: string;
}): Promise<void> {
  const fact = await prisma.itemFact.findFirst({
    where: { itemId: input.itemId, key: input.key, item: { workspaceId: input.workspaceId } },
  });
  if (!fact) throw new ItemServiceError('not_found', 'That field could not be found.');

  if (input.action === 'clear') {
    await prisma.itemFact.delete({ where: { id: fact.id } });
    return;
  }

  const value = input.action === 'edit' ? (input.value ?? '').trim() : fact.value;
  if (!value) {
    await prisma.itemFact.delete({ where: { id: fact.id } });
    return;
  }

  await prisma.itemFact.update({
    where: { id: fact.id },
    data: { value, source: FactSource.SELLER_CONFIRMED, confirmed: true, confidence: null },
  });
}

export interface StartGenerationResult {
  aiJobId: string;
  jobId: string;
  creditsRemaining: number;
}

/**
 * Starts a full generation run.
 *
 * Order matters: the job record is created first, then the credit is debited
 * against that job id, then the queue entry is written. If the debit fails
 * nothing is queued; if the queue write fails the credit is refundable through
 * the same job. A credit is never taken before the work is accepted.
 */
export async function startGeneration(input: {
  workspaceId: string;
  itemId: string;
  tone?: Tone;
}): Promise<StartGenerationResult> {
  const settings = await getSettings();
  if (!settings.aiGenerationEnabled) {
    throw new ItemServiceError(
      'ai_disabled',
      'Listing generation is paused right now. Please try again shortly.',
    );
  }

  const item = await prisma.item.findFirst({
    where: { id: input.itemId, workspaceId: input.workspaceId, deletedAt: null },
    select: {
      id: true,
      status: true,
      photos: { where: { status: PhotoStatus.PROCESSED }, select: { id: true } },
      aiJobs: {
        where: { status: { in: ['QUEUED', 'RUNNING'] } },
        select: { id: true },
      },
    },
  });

  if (!item) throw new ItemServiceError('not_found', 'That item could not be found.');
  if (item.photos.length === 0) {
    throw new ItemServiceError(
      'no_photos',
      'Your photos are still being processed. Give it a moment and try again.',
    );
  }
  if (item.aiJobs.length > 0) {
    throw new ItemServiceError('already_running', 'A generation is already running for this item.');
  }

  // The check above is racy on its own: two requests milliseconds apart both
  // read "nothing running" and both charge. The partial unique index
  // `ai_job_one_active_per_item` is the authority, and creating the job before
  // touching credits means the loser of the race is rejected having paid
  // nothing.
  let aiJob;
  try {
    aiJob = await prisma.aIJob.create({
      data: {
        kind: AIJobKind.ANALYZE,
        workspaceId: input.workspaceId,
        itemId: input.itemId,
        status: 'QUEUED',
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ItemServiceError(
        'already_running',
        'A generation is already running for this item.',
      );
    }
    throw error;
  }

  let creditsRemaining: number;
  try {
    const consumption = await consumeCredits({
      workspaceId: input.workspaceId,
      amount: LISTING_CREDIT_COST,
      itemId: input.itemId,
      aiJobId: aiJob.id,
      idempotencyKey: idempotencyKey('generation', aiJob.id),
      reason: 'Listing generation',
    });
    creditsRemaining = consumption.balance.total;

    await prisma.aIJob.update({
      where: { id: aiJob.id },
      data: { creditEntryId: consumption.entryIds[0] ?? null },
    });
  } catch (error) {
    // No credit was taken, so the job record must not linger as a phantom.
    await prisma.aIJob.delete({ where: { id: aiJob.id } }).catch(() => undefined);
    if (error instanceof InsufficientCreditsError) throw error;
    throw error;
  }

  const { job } = await enqueueJob({
    type: JobType.GENERATE_LISTING,
    workspaceId: input.workspaceId,
    payload: { itemId: input.itemId, aiJobId: aiJob.id, tone: input.tone ?? Tone.STRAIGHTFORWARD },
    priority: 10,
    idempotencyKey: idempotencyKey('generate', aiJob.id),
  });

  await prisma.$transaction([
    prisma.aIJob.update({ where: { id: aiJob.id }, data: { jobId: job.id } }),
    prisma.item.update({ where: { id: input.itemId }, data: { status: ItemStatus.ANALYZING } }),
    prisma.analyticsEvent.create({
      data: {
        name: 'ANALYSIS_STARTED',
        workspaceId: input.workspaceId,
        properties: { itemId: input.itemId },
      },
    }),
  ]);

  return { aiJobId: aiJob.id, jobId: job.id, creditsRemaining };
}

export async function softDeleteItem(input: { workspaceId: string; itemId: string }): Promise<void> {
  await prisma.item.updateMany({
    where: { id: input.itemId, workspaceId: input.workspaceId },
    data: { deletedAt: new Date() },
  });
}

export async function restoreItem(input: { workspaceId: string; itemId: string }): Promise<void> {
  await prisma.item.updateMany({
    where: { id: input.itemId, workspaceId: input.workspaceId },
    data: { deletedAt: null },
  });
}

export async function changeItemStatus(input: {
  workspaceId: string;
  itemId: string;
  status: ItemStatus;
  actorId: string;
  note?: string;
}): Promise<void> {
  const item = await prisma.item.findFirst({
    where: { id: input.itemId, workspaceId: input.workspaceId },
    select: { status: true },
  });
  if (!item) throw new ItemServiceError('not_found', 'That item could not be found.');

  const now = new Date();
  await prisma.$transaction([
    prisma.item.update({
      where: { id: input.itemId },
      data: {
        status: input.status,
        listedAt: input.status === ItemStatus.LISTED ? now : undefined,
        soldAt: input.status === ItemStatus.SOLD ? now : undefined,
        archivedAt: input.status === ItemStatus.ARCHIVED ? now : undefined,
      },
    }),
    prisma.listingStatusEvent.create({
      data: {
        itemId: input.itemId,
        fromStatus: item.status,
        toStatus: input.status,
        actorId: input.actorId,
        source: 'user',
        note: input.note,
      },
    }),
  ]);
}
