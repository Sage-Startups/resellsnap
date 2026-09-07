/**
 * Scheduled maintenance.
 *
 * Run by the Railway Cron service (or `pnpm maintenance`). Every step is
 * bounded and safe to run concurrently with the web and worker processes.
 */
import { ExportStatus, ItemStatus, PhotoStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getStorage } from '@/server/storage';
import { getSettings } from '@/server/settings';
import { reclaimStalledJobs } from './queue';

export interface MaintenanceReport {
  reclaimedJobs: number;
  expiredRateLimits: number;
  expiredOAuthStates: number;
  purgedItems: number;
  purgedPhotos: number;
  expiredExports: number;
  deletedObjects: number;
  syncedConnections: number;
}

export async function runMaintenance(): Promise<MaintenanceReport> {
  const settings = await getSettings();
  const storage = getStorage();
  const now = new Date();

  const report: MaintenanceReport = {
    reclaimedJobs: 0,
    expiredRateLimits: 0,
    expiredOAuthStates: 0,
    purgedItems: 0,
    purgedPhotos: 0,
    expiredExports: 0,
    deletedObjects: 0,
    syncedConnections: 0,
  };

  report.reclaimedJobs = await reclaimStalledJobs();

  const rateLimits = await prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: now } } });
  report.expiredRateLimits = rateLimits.count;

  const oauthStates = await prisma.oAuthState.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { consumedAt: { lt: new Date(now.getTime() - 86_400_000) } }] },
  });
  report.expiredOAuthStates = oauthStates.count;

  // Orphaned uploads: a photo that never finished uploading.
  const staleUploadCutoff = new Date(now.getTime() - settings.failedUploadRetentionHours * 3600_000);
  const stalePhotos = await prisma.itemPhoto.findMany({
    where: {
      status: { in: [PhotoStatus.PENDING, PhotoStatus.REJECTED] },
      createdAt: { lt: staleUploadCutoff },
    },
    select: { id: true, objectKey: true, thumbnailKey: true },
    take: 500,
  });

  if (stalePhotos.length > 0) {
    const keys = stalePhotos.flatMap((photo) =>
      [photo.objectKey, photo.thumbnailKey].filter((key): key is string => Boolean(key)),
    );
    await storage.deleteObjects(keys);
    await prisma.itemPhoto.deleteMany({ where: { id: { in: stalePhotos.map((p) => p.id) } } });
    report.purgedPhotos = stalePhotos.length;
    report.deletedObjects += keys.length;
  }

  // Soft-deleted items past their recovery window.
  const purgeCutoff = new Date(now.getTime() - settings.deletedItemRetentionDays * 86_400_000);
  const purgeableItems = await prisma.item.findMany({
    where: { deletedAt: { lt: purgeCutoff } },
    select: { id: true, photos: { select: { objectKey: true, thumbnailKey: true } } },
    take: 200,
  });

  for (const item of purgeableItems) {
    const keys = item.photos.flatMap((photo) =>
      [photo.objectKey, photo.thumbnailKey].filter((key): key is string => Boolean(key)),
    );
    if (keys.length > 0) {
      await storage.deleteObjects(keys);
      report.deletedObjects += keys.length;
    }
    await prisma.item.delete({ where: { id: item.id } });
    report.purgedItems += 1;
  }

  // Expired export downloads.
  const expiredArtifacts = await prisma.downloadArtifact.findMany({
    where: { expiresAt: { lt: now } },
    select: { id: true, objectKey: true, exportJobId: true },
    take: 500,
  });

  if (expiredArtifacts.length > 0) {
    await storage.deleteObjects(expiredArtifacts.map((artifact) => artifact.objectKey));
    await prisma.downloadArtifact.deleteMany({
      where: { id: { in: expiredArtifacts.map((artifact) => artifact.id) } },
    });
    await prisma.exportJob.updateMany({
      where: { id: { in: expiredArtifacts.map((artifact) => artifact.exportJobId) } },
      data: { status: ExportStatus.EXPIRED },
    });
    report.expiredExports = expiredArtifacts.length;
    report.deletedObjects += expiredArtifacts.length;
  }

  // Trim analytics and audit noise so the tables stay queryable for a buyer.
  await prisma.analyticsEvent.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 400 * 86_400_000) } },
  });
  await prisma.job.deleteMany({
    where: { status: 'SUCCEEDED', finishedAt: { lt: new Date(now.getTime() - 30 * 86_400_000) } },
  });

  // Mark long-idle listed items as expired so inventory stays honest.
  await prisma.item.updateMany({
    where: {
      status: ItemStatus.LISTED,
      listedAt: { lt: new Date(now.getTime() - 120 * 86_400_000) },
    },
    data: { status: ItemStatus.EXPIRED },
  });

  // Refresh connected marketplaces.
  const connections = await prisma.platformConnection.findMany({
    where: { state: 'CONNECTED' },
    select: { id: true, platform: { select: { key: true } } },
    take: 100,
  });

  const { enqueueJob } = await import('./queue');
  for (const connection of connections) {
    await enqueueJob({
      type: 'SYNC_MARKETPLACE',
      payload: { connectionId: connection.id, platform: connection.platform.key },
      idempotencyKey: `sync:${connection.id}:${now.toISOString().slice(0, 13)}`,
      priority: 200,
    });
    report.syncedConnections += 1;
  }

  logger.info('Maintenance complete', { ...report });
  return report;
}
