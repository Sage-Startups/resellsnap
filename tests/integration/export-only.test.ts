/**
 * Export-only behaviour integration tests.
 *
 * The product rule is blunt: a "Publish" action exists only where an approved
 * official API and valid credentials support it. Everywhere else the seller
 * gets an export they paste themselves, and the server refuses to publish even
 * if the request is crafted by hand.
 *
 * These tests therefore go straight at the server action and the adapters,
 * bypassing the UI entirely — because the UI is not the boundary.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ExportFormat, ItemStatus, PlatformKey, PhotoStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';

let sessionUserId: string | null = null;

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'user-agent': 'vitest-export-suite' }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () => (sessionUserId ? { user: { id: sessionUserId } } : null),
    },
  },
}));

const { publishToMarketplaceAction } = await import('@/server/marketplace/actions');
const { getAdapter, getPlatformStatuses, canPublishDirectly, getActiveTemplate } = await import(
  '@/server/marketplace'
);
const { buildExportArtifact } = await import('@/server/exports');
const { createTestItem, createTestWorkspace, destroyTestWorkspace, ensureReferenceData } =
  await import('../helpers/db');

type TestWorkspace = Awaited<ReturnType<typeof createTestWorkspace>>;
const created: TestWorkspace[] = [];

/** Every marketplace that has no approved publishing API on this deployment. */
const EXPORT_ONLY: PlatformKey[] = [
  PlatformKey.VINTED,
  PlatformKey.DEPOP,
  PlatformKey.FACEBOOK_MARKETPLACE,
];

beforeAll(async () => {
  await ensureReferenceData();
});

afterEach(async () => {
  sessionUserId = null;
  await prisma.rateLimit.deleteMany({});
  await Promise.all(created.splice(0).map(destroyTestWorkspace));
});

async function freshWorkspace() {
  const workspace = await createTestWorkspace({ purchasedCredits: 5 });
  created.push(workspace);
  return workspace;
}

/** An item complete enough to export: photo, listing, variant and a price. */
async function listedReadyItem(workspaceId: string, platform: PlatformKey) {
  const itemId = await createTestItem(workspaceId, { status: 'READY' });

  await prisma.itemPhoto.create({
    data: {
      itemId,
      status: PhotoStatus.PROCESSED,
      objectKey: `workspaces/${workspaceId}/items/${itemId}/photos/a.jpg`,
      contentType: 'image/jpeg',
      byteSize: 1024,
      position: 0,
    },
  });

  const listing = await prisma.listing.create({
    data: {
      itemId,
      title: 'Navy wool overcoat size M',
      description: 'Good used condition, one small mark on the left cuff.',
      conditionSummary: 'Good used condition',
    },
  });

  await prisma.listingVariant.create({
    data: {
      listingId: listing.id,
      platform,
      title: 'Navy Wool Overcoat Size M',
      description: 'Good used condition, one small mark on the left cuff.',
      fields: { hashtags: ['#vintage', '#wool'] },
      isComplete: true,
    },
  });

  await prisma.priceSuggestion.create({
    data: {
      itemId,
      strategy: 'BALANCED',
      amountCents: 4500,
      source: 'ADMIN_HEURISTIC',
      confidence: 'LOW',
      explanation: 'Category guideline',
    },
  });

  return itemId;
}

describe('platforms without an approved publishing API', () => {
  it.each(EXPORT_ONLY)('%s declares that it cannot publish, and says why', async (platform) => {
    const adapter = getAdapter(platform);
    const workspace = await freshWorkspace();
    const status = await adapter.getStatus(workspace.workspaceId);

    expect(status.capabilities.canPublish).toBe(false);
    // "Never pretend an integration exists" — the seller is told the reason.
    expect(status.statusMessage.trim()).not.toBe('');
    // …and is given the route that does work: an export they paste themselves.
    const template = await getActiveTemplate(platform);
    const formats = (template?.exportFormats ?? []) as unknown[];
    expect(formats.length).toBeGreaterThan(0);
  });

  it.each(EXPORT_ONLY)('%s throws rather than pretending to publish', async (platform) => {
    const workspace = await freshWorkspace();
    const itemId = await listedReadyItem(workspace.workspaceId, platform);
    const adapter = getAdapter(platform);

    // Calling it directly, bypassing every check above it, must still refuse.
    await expect(
      adapter.publish?.({
        itemId,
        workspaceId: workspace.workspaceId,
        connectionId: 'anything',
        idempotencyKey: 'direct-call',
        confirmedByUser: true,
      }),
    ).rejects.toThrow();
  });

  it.each(EXPORT_ONLY)('%s refuses a hand-crafted publish request', async (platform) => {
    const workspace = await freshWorkspace();
    sessionUserId = workspace.userId;
    const itemId = await listedReadyItem(workspace.workspaceId, platform);

    const result = await publishToMarketplaceAction({
      itemId,
      platform,
      connectionId: 'anything-i-like',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('not_supported');

    // The item must not be marked as listed off the back of a refused publish.
    const item = await prisma.item.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.status).toBe(ItemStatus.READY);
    expect(await prisma.externalListing.count({ where: { itemId } })).toBe(0);
  });

  it('reports canPublishDirectly as false for every export-only platform', async () => {
    const workspace = await freshWorkspace();
    for (const platform of EXPORT_ONLY) {
      expect(await canPublishDirectly(workspace.workspaceId, platform)).toBe(false);
    }
  });

  it('shows an export-only state rather than a dead Connect button', async () => {
    const workspace = await freshWorkspace();
    const statuses = await getPlatformStatuses(workspace.workspaceId);

    for (const platform of EXPORT_ONLY) {
      const status = statuses.find((entry) => entry.key === platform);
      expect(status?.state).toBe('EXPORT_ONLY');
      expect(status?.capabilities.canPublish).toBe(false);
    }
  });
});

describe('eBay without credentials behaves as export-only', () => {
  it('refuses to publish and reports why, rather than offering a broken Connect', async () => {
    const workspace = await freshWorkspace();
    sessionUserId = workspace.userId;
    const itemId = await listedReadyItem(workspace.workspaceId, PlatformKey.EBAY);

    // This suite runs with no EBAY_CLIENT_ID / EBAY_CLIENT_SECRET set.
    const status = await getAdapter(PlatformKey.EBAY).getStatus(workspace.workspaceId);
    expect(status.state).toBe('NOT_CONFIGURED');
    expect(await canPublishDirectly(workspace.workspaceId, PlatformKey.EBAY)).toBe(false);

    const result = await publishToMarketplaceAction({
      itemId,
      platform: PlatformKey.EBAY,
      connectionId: 'no-such-connection',
    });

    expect(result.ok).toBe(false);
    expect(['not_supported', 'not_connected']).toContain(result.code);
    expect(
      (await prisma.item.findUniqueOrThrow({ where: { id: itemId } })).status,
    ).toBe(ItemStatus.READY);
  });
});

describe('the export path an export-only platform actually uses', () => {
  it.each(EXPORT_ONLY)('produces a copy-paste text export for %s', async (platform) => {
    const workspace = await freshWorkspace();
    const itemId = await listedReadyItem(workspace.workspaceId, platform);

    const artifact = await buildExportArtifact({ itemId, platform, format: ExportFormat.TEXT });

    expect(artifact).not.toBeNull();
    const body = artifact!.body.toString('utf8');
    expect(body).toContain('Navy Wool Overcoat Size M');
    expect(body).toContain('Good used condition');
    expect(artifact!.contentType).toContain('text/plain');
  });

  it('produces structured JSON that labels the price as an estimate', async () => {
    const workspace = await freshWorkspace();
    const itemId = await listedReadyItem(workspace.workspaceId, PlatformKey.DEPOP);

    const artifact = await buildExportArtifact({
      itemId,
      platform: PlatformKey.DEPOP,
      format: ExportFormat.JSON,
    });

    const parsed = JSON.parse(artifact!.body.toString('utf8'));
    expect(JSON.stringify(parsed)).toContain('Navy Wool Overcoat Size M');
    // A price must never travel as an unqualified number.
    expect(JSON.stringify(parsed).toLowerCase()).toContain('estimate');
  });

  it('produces a CSV whose fields are quoted safely', async () => {
    const workspace = await freshWorkspace();
    const itemId = await listedReadyItem(workspace.workspaceId, PlatformKey.VINTED);

    const artifact = await buildExportArtifact({
      itemId,
      platform: PlatformKey.VINTED,
      format: ExportFormat.CSV,
    });

    const body = artifact!.body.toString('utf8');
    const lines = body.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    // A description containing a comma must not split into extra columns.
    expect(body).toContain('"');
  });

  it('returns nothing for an item that does not exist', async () => {
    const artifact = await buildExportArtifact({
      itemId: 'does-not-exist',
      platform: PlatformKey.VINTED,
      format: ExportFormat.TEXT,
    });
    expect(artifact).toBeNull();
  });
});
