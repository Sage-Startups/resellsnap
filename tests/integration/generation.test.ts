/**
 * Generation entry-point integration tests.
 *
 * `startGeneration` is where a listing job and a customer's money meet, so the
 * invariant under test throughout is: **the seller is charged once for work
 * that actually gets queued, and never for work that does not.** Every early
 * return must leave the balance untouched and no phantom job behind.
 *
 * The ledger arithmetic itself is covered in `credits.test.ts`; this suite is
 * about the boundary.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AIJobStatus, ItemStatus, JobType, PhotoStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { LISTING_CREDIT_COST } from '@/server/credits';
import { ItemServiceError, startGeneration } from '@/server/items/service';
import { invalidateSettingsCache } from '@/server/settings';
import {
  createTestItem,
  createTestWorkspace,
  destroyTestWorkspace,
  ensureReferenceData,
  type TestWorkspace,
} from '../helpers/db';

const created: TestWorkspace[] = [];

beforeAll(async () => {
  await ensureReferenceData();
});

afterEach(async () => {
  await Promise.all(created.splice(0).map(destroyTestWorkspace));
  await prisma.appSetting.deleteMany({ where: { key: 'aiGenerationEnabled' } });
  invalidateSettingsCache();
});

afterAll(async () => {
  invalidateSettingsCache();
});

async function workspaceWithCredits(credits: number) {
  const workspace = await createTestWorkspace({ monthlyCredits: credits });
  created.push(workspace);
  return workspace;
}

/** An item that is genuinely ready to generate: at least one processed photo. */
async function itemWithPhoto(workspaceId: string) {
  const itemId = await createTestItem(workspaceId);
  await prisma.itemPhoto.create({
    data: {
      itemId,
      status: PhotoStatus.PROCESSED,
      objectKey: `workspaces/${workspaceId}/items/${itemId}/photos/a.jpg`,
      contentType: 'image/jpeg',
      byteSize: 2048,
      position: 0,
    },
  });
  return itemId;
}

async function balanceOf(workspaceId: string) {
  const row = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { monthlyCredits: true, purchasedCredits: true },
  });
  return row.monthlyCredits + row.purchasedCredits;
}

describe('starting a generation', () => {
  it('charges exactly one credit and queues exactly one job', async () => {
    const workspace = await workspaceWithCredits(5);
    const itemId = await itemWithPhoto(workspace.workspaceId);

    const result = await startGeneration({ workspaceId: workspace.workspaceId, itemId });

    expect(result.creditsRemaining).toBe(5 - LISTING_CREDIT_COST);
    expect(await balanceOf(workspace.workspaceId)).toBe(5 - LISTING_CREDIT_COST);

    const jobs = await prisma.job.findMany({
      where: { workspaceId: workspace.workspaceId, type: JobType.GENERATE_LISTING },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe(result.jobId);

    const item = await prisma.item.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.status).toBe(ItemStatus.ANALYZING);
  });

  it('links the debit to the AI job so a refund can find it later', async () => {
    const workspace = await workspaceWithCredits(3);
    const itemId = await itemWithPhoto(workspace.workspaceId);

    const result = await startGeneration({ workspaceId: workspace.workspaceId, itemId });

    const aiJob = await prisma.aIJob.findUniqueOrThrow({ where: { id: result.aiJobId } });
    expect(aiJob.status).toBe(AIJobStatus.QUEUED);
    expect(aiJob.creditEntryId).not.toBeNull();

    const entry = await prisma.creditLedger.findUniqueOrThrow({
      where: { id: aiJob.creditEntryId as string },
    });
    expect(entry.delta).toBe(-LISTING_CREDIT_COST);
    expect(entry.aiJobId).toBe(aiJob.id);
  });

  it('charges nothing when the workspace cannot afford it', async () => {
    const workspace = await workspaceWithCredits(0);
    const itemId = await itemWithPhoto(workspace.workspaceId);

    await expect(
      startGeneration({ workspaceId: workspace.workspaceId, itemId }),
    ).rejects.toThrow();

    expect(await balanceOf(workspace.workspaceId)).toBe(0);
    // A phantom AI job would make the item look busy forever.
    expect(await prisma.aIJob.count({ where: { itemId } })).toBe(0);
    expect(await prisma.job.count({ where: { workspaceId: workspace.workspaceId } })).toBe(0);
    expect(
      (await prisma.item.findUniqueOrThrow({ where: { id: itemId } })).status,
    ).toBe(ItemStatus.DRAFT);
  });

  it('charges nothing when no photo has finished processing', async () => {
    const workspace = await workspaceWithCredits(5);
    const itemId = await createTestItem(workspace.workspaceId);
    await prisma.itemPhoto.create({
      data: {
        itemId,
        status: PhotoStatus.PENDING,
        objectKey: `workspaces/${workspace.workspaceId}/items/${itemId}/photos/a.jpg`,
        contentType: 'image/jpeg',
        byteSize: 2048,
        position: 0,
      },
    });

    await expect(
      startGeneration({ workspaceId: workspace.workspaceId, itemId }),
    ).rejects.toBeInstanceOf(ItemServiceError);

    expect(await balanceOf(workspace.workspaceId)).toBe(5);
    expect(await prisma.aIJob.count({ where: { itemId } })).toBe(0);
  });

  it('charges nothing when generation is switched off globally', async () => {
    const workspace = await workspaceWithCredits(5);
    const itemId = await itemWithPhoto(workspace.workspaceId);

    await prisma.appSetting.upsert({
      where: { key: 'aiGenerationEnabled' },
      create: { key: 'aiGenerationEnabled', value: false },
      update: { value: false },
    });
    invalidateSettingsCache();

    await expect(
      startGeneration({ workspaceId: workspace.workspaceId, itemId }),
    ).rejects.toBeInstanceOf(ItemServiceError);

    expect(await balanceOf(workspace.workspaceId)).toBe(5);
    expect(await prisma.aIJob.count({ where: { itemId } })).toBe(0);
  });

  it('refuses to charge twice for an item that is already generating', async () => {
    const workspace = await workspaceWithCredits(5);
    const itemId = await itemWithPhoto(workspace.workspaceId);

    await startGeneration({ workspaceId: workspace.workspaceId, itemId });

    await expect(
      startGeneration({ workspaceId: workspace.workspaceId, itemId }),
    ).rejects.toBeInstanceOf(ItemServiceError);

    expect(await balanceOf(workspace.workspaceId)).toBe(5 - LISTING_CREDIT_COST);
    expect(await prisma.aIJob.count({ where: { itemId } })).toBe(1);
  });

  it('never charges twice when a seller double-clicks Generate', async () => {
    const workspace = await workspaceWithCredits(5);
    const itemId = await itemWithPhoto(workspace.workspaceId);

    // Three requests genuinely in flight at once — a double-click, or retries
    // from an impatient browser. Before the `ai_job_one_active_per_item`
    // partial unique index existed this charged three credits and queued three
    // generations, because the "already running?" check was a read-then-create
    // race with nothing behind it.
    const results = await Promise.allSettled([
      startGeneration({ workspaceId: workspace.workspaceId, itemId }),
      startGeneration({ workspaceId: workspace.workspaceId, itemId }),
      startGeneration({ workspaceId: workspace.workspaceId, itemId }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.aIJob.count({ where: { itemId } })).toBe(1);
    expect(await balanceOf(workspace.workspaceId)).toBe(5 - LISTING_CREDIT_COST);
    expect(
      await prisma.job.count({
        where: { workspaceId: workspace.workspaceId, type: JobType.GENERATE_LISTING },
      }),
    ).toBe(1);

    // The losers must be the friendly error, not a raw database failure.
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(ItemServiceError);
        expect((result.reason as ItemServiceError).code).toBe('already_running');
      }
    }
  });

  it('allows a fresh generation once the previous one has finished', async () => {
    const workspace = await workspaceWithCredits(5);
    const itemId = await itemWithPhoto(workspace.workspaceId);

    const first = await startGeneration({ workspaceId: workspace.workspaceId, itemId });
    // The index only covers QUEUED and RUNNING, so a finished job must not
    // block the seller from regenerating.
    await prisma.aIJob.update({
      where: { id: first.aiJobId },
      data: { status: AIJobStatus.SUCCEEDED, finishedAt: new Date() },
    });
    await prisma.item.update({ where: { id: itemId }, data: { status: ItemStatus.READY } });

    const second = await startGeneration({ workspaceId: workspace.workspaceId, itemId });
    expect(second.aiJobId).not.toBe(first.aiJobId);
    expect(await balanceOf(workspace.workspaceId)).toBe(5 - LISTING_CREDIT_COST * 2);
  });

  it('refuses an item belonging to another workspace without charging', async () => {
    const owner = await workspaceWithCredits(5);
    const stranger = await workspaceWithCredits(5);
    const itemId = await itemWithPhoto(owner.workspaceId);

    await expect(
      startGeneration({ workspaceId: stranger.workspaceId, itemId }),
    ).rejects.toBeInstanceOf(ItemServiceError);

    expect(await balanceOf(stranger.workspaceId)).toBe(5);
    expect(await balanceOf(owner.workspaceId)).toBe(5);
  });
});
