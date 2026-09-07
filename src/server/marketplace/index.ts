/**
 * Marketplace facade.
 *
 * One place resolves "which adapter handles this platform" and "what may this
 * workspace actually do right now". Components never branch on a platform name.
 */
import { PlatformKey } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { ebayAdapter } from './ebay/adapter';
import { ExportOnlyAdapter } from './export-adapter';
import { ALL_PLATFORM_KEYS } from './registry';
import type { MarketplaceAdapter, PlatformStatus } from './types';

export * from './types';
export * from './registry';

const adapters: Record<PlatformKey, MarketplaceAdapter> = {
  [PlatformKey.EBAY]: ebayAdapter,
  [PlatformKey.VINTED]: new ExportOnlyAdapter(PlatformKey.VINTED),
  [PlatformKey.DEPOP]: new ExportOnlyAdapter(PlatformKey.DEPOP),
  [PlatformKey.FACEBOOK_MARKETPLACE]: new ExportOnlyAdapter(PlatformKey.FACEBOOK_MARKETPLACE),
};

export function getAdapter(key: PlatformKey): MarketplaceAdapter {
  return adapters[key];
}

export function getAllAdapters(): MarketplaceAdapter[] {
  return ALL_PLATFORM_KEYS.map((key) => adapters[key]);
}

/** Status for every platform, for the integrations page and the item workspace. */
export async function getPlatformStatuses(workspaceId: string): Promise<PlatformStatus[]> {
  return Promise.all(getAllAdapters().map((adapter) => adapter.getStatus(workspaceId)));
}

export async function getPlatformStatus(
  workspaceId: string,
  key: PlatformKey,
): Promise<PlatformStatus> {
  return getAdapter(key).getStatus(workspaceId);
}

/**
 * The single question the UI asks before rendering a publish button.
 * Everything else — badges, disabled states, tooltips — derives from this.
 */
export async function canPublishDirectly(workspaceId: string, key: PlatformKey): Promise<boolean> {
  const status = await getPlatformStatus(workspaceId, key);
  return (
    status.capabilities.canPublish &&
    status.state === 'CONNECTED' &&
    status.setupIssues.length === 0
  );
}

export async function getActiveTemplate(key: PlatformKey) {
  const platform = await prisma.platform.findUnique({
    where: { key },
    include: { templates: { where: { isActive: true }, orderBy: { version: 'desc' }, take: 1 } },
  });
  return platform?.templates[0] ?? null;
}
