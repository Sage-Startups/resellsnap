import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  assertKeyInWorkspace, buildExportKey, buildPhotoKey, workspaceIdFromKey,
} from '@/server/storage';
import { queryInventory } from '@/server/inventory';
import {
  createTestItem, createTestWorkspace, destroyTestWorkspace, ensureReferenceData,
  type TestWorkspace,
} from '../helpers/db';

const created: TestWorkspace[] = [];

async function freshWorkspace() {
  const workspace = await createTestWorkspace({ purchasedCredits: 5 });
  created.push(workspace);
  return workspace;
}

beforeAll(async () => {
  await ensureReferenceData();
});

afterEach(async () => {
  for (const entry of created.splice(0)) await destroyTestWorkspace(entry);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('workspace isolation', () => {
  it('never returns another workspace’s items from inventory', async () => {
    const alice = await freshWorkspace();
    const bob = await freshWorkspace();

    const aliceItem = await createTestItem(alice.workspaceId, { sku: 'ALICE-1' });
    await createTestItem(bob.workspaceId, { sku: 'BOB-1' });

    const aliceView = await queryInventory({ workspaceId: alice.workspaceId });
    const bobView = await queryInventory({ workspaceId: bob.workspaceId });

    expect(aliceView.rows.map((row) => row.id)).toEqual([aliceItem]);
    expect(aliceView.rows.some((row) => row.sku === 'BOB-1')).toBe(false);
    expect(bobView.rows.some((row) => row.sku === 'ALICE-1')).toBe(false);
  });

  it('does not leak another workspace’s items through search', async () => {
    const alice = await freshWorkspace();
    const bob = await freshWorkspace();

    const bobItem = await createTestItem(bob.workspaceId, { sku: 'SECRET-SKU' });
    await prisma.item.update({
      where: { id: bobItem },
      data: { title: 'A very distinctive title' },
    });

    // Searching for the exact title of another tenant's item must find nothing.
    const result = await queryInventory({
      workspaceId: alice.workspaceId,
      search: 'A very distinctive title',
    });

    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('scopes credit ledgers per workspace', async () => {
    const alice = await freshWorkspace();
    const bob = await freshWorkspace();

    const aliceEntries = await prisma.creditLedger.findMany({
      where: { workspaceId: alice.workspaceId },
    });
    const bobEntries = await prisma.creditLedger.findMany({
      where: { workspaceId: bob.workspaceId },
    });

    expect(aliceEntries.length).toBeGreaterThan(0);
    for (const entry of aliceEntries) expect(entry.workspaceId).toBe(alice.workspaceId);
    for (const entry of bobEntries) expect(entry.workspaceId).toBe(bob.workspaceId);
  });

  it('enforces SKU uniqueness per workspace, not globally', async () => {
    const alice = await freshWorkspace();
    const bob = await freshWorkspace();

    // Two tenants may legitimately hold the same SKU.
    await createTestItem(alice.workspaceId, { sku: 'SHARED-SKU' });
    await expect(createTestItem(bob.workspaceId, { sku: 'SHARED-SKU' })).resolves.toBeTruthy();

    // The same tenant may not.
    await expect(createTestItem(alice.workspaceId, { sku: 'SHARED-SKU' })).rejects.toThrow();
  });

  it('cascades a workspace delete to its items and ledger', async () => {
    const workspace = await createTestWorkspace({ purchasedCredits: 3 });
    const itemId = await createTestItem(workspace.workspaceId);

    await destroyTestWorkspace(workspace);

    expect(await prisma.item.findUnique({ where: { id: itemId } })).toBeNull();
    expect(
      await prisma.creditLedger.count({ where: { workspaceId: workspace.workspaceId } }),
    ).toBe(0);
  });
});

describe('storage key authorisation', () => {
  it('builds keys that encode their owning workspace', () => {
    const key = buildPhotoKey('workspace-alice', 'item-1', 'jpg');

    expect(key.startsWith('workspaces/workspace-alice/items/item-1/photos/')).toBe(true);
    expect(workspaceIdFromKey(key)).toBe('workspace-alice');
  });

  it('accepts a key that belongs to the caller', () => {
    const key = buildPhotoKey('workspace-alice', 'item-1', 'jpg');
    expect(() => assertKeyInWorkspace(key, 'workspace-alice')).not.toThrow();
  });

  it('rejects a key belonging to another workspace', () => {
    // This is what makes a leaked object key useless to a different tenant.
    const key = buildPhotoKey('workspace-bob', 'item-9', 'jpg');
    expect(() => assertKeyInWorkspace(key, 'workspace-alice')).toThrow(/does not belong/);
  });

  it('rejects path traversal', () => {
    expect(() =>
      assertKeyInWorkspace('workspaces/alice/../bob/items/x/photos/a.jpg', 'alice'),
    ).toThrow();
    expect(() => assertKeyInWorkspace('/etc/passwd', 'alice')).toThrow();
    expect(() => assertKeyInWorkspace('workspaces/alice/items/x/photos/../../a.jpg', 'alice')).toThrow();
  });

  it('rejects keys with unexpected characters', () => {
    expect(() => assertKeyInWorkspace('workspaces/alice/items/x y/photos/a.jpg', 'alice')).toThrow();
    expect(() => assertKeyInWorkspace('workspaces/alice/items/x/photos/a b.jpg', 'alice')).toThrow();
  });

  it('scopes export artifacts to a workspace too', () => {
    const key = buildExportKey('workspace-alice', 'export-1', 'listing.zip');

    expect(() => assertKeyInWorkspace(key, 'workspace-alice')).not.toThrow();
    expect(() => assertKeyInWorkspace(key, 'workspace-bob')).toThrow();
  });

  it('sanitises a hostile export filename into a single safe segment', () => {
    const key = buildExportKey('workspace-alice', 'export-1', '../../../etc/passwd');

    // The separators are gone, so the filename can no longer escape its
    // directory, and the result still validates against the caller.
    expect(key.startsWith('workspaces/workspace-alice/exports/export-1/')).toBe(true);
    expect(key.split('/')).toHaveLength(5);
    expect(key).not.toContain('..');
    expect(() => assertKeyInWorkspace(key, 'workspace-alice')).not.toThrow();
  });

  it('rejects a dots-only path segment outright', () => {
    expect(() => assertKeyInWorkspace('workspaces/alice/items/./photos/a.jpg', 'alice')).toThrow();
  });
});
