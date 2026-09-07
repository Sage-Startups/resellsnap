import { afterAll, beforeAll, afterEach, describe, expect, it } from 'vitest';
import { CreditBucket, CreditEntryKind } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import {
  adminAdjustCredits, consumeCredits, getCreditBalance, grantCredits,
  InsufficientCreditsError, recomputeBalanceFromLedger, refundCreditsForAIJob,
  resetMonthlyCredits,
} from '@/server/credits';
import {
  createTestWorkspace, destroyTestWorkspace, ensureReferenceData, type TestWorkspace,
} from '../helpers/db';

let workspace: TestWorkspace;
const created: TestWorkspace[] = [];

async function freshWorkspace(options?: { monthlyCredits?: number; purchasedCredits?: number }) {
  const next = await createTestWorkspace(options);
  created.push(next);
  return next;
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

describe('granting credits', () => {
  it('increases the balance and records the ledger entry', async () => {
    workspace = await freshWorkspace();

    const result = await grantCredits({
      workspaceId: workspace.workspaceId,
      amount: 10,
      bucket: CreditBucket.PURCHASED,
      kind: CreditEntryKind.PACK_PURCHASE,
      idempotencyKey: `test-grant-${workspace.workspaceId}`,
      reason: '10-credit pack',
    });

    expect(result.applied).toBe(true);
    expect(result.balance.purchased).toBe(10);
    expect(result.balance.total).toBe(10);

    const ledger = await recomputeBalanceFromLedger(workspace.workspaceId);
    expect(ledger.total).toBe(10);
  });

  it('is idempotent: the same key never grants twice', async () => {
    workspace = await freshWorkspace();
    const key = `duplicate-${workspace.workspaceId}`;

    const first = await grantCredits({
      workspaceId: workspace.workspaceId,
      amount: 20,
      bucket: CreditBucket.PURCHASED,
      kind: CreditEntryKind.PACK_PURCHASE,
      idempotencyKey: key,
    });
    const second = await grantCredits({
      workspaceId: workspace.workspaceId,
      amount: 20,
      bucket: CreditBucket.PURCHASED,
      kind: CreditEntryKind.PACK_PURCHASE,
      idempotencyKey: key,
    });

    expect(first.applied).toBe(true);
    // This is what protects against a replayed Stripe webhook.
    expect(second.applied).toBe(false);
    expect((await getCreditBalance(workspace.workspaceId)).total).toBe(20);
  });

  it('refuses a non-positive grant', async () => {
    workspace = await freshWorkspace();
    await expect(
      grantCredits({
        workspaceId: workspace.workspaceId,
        amount: 0,
        bucket: CreditBucket.PURCHASED,
        kind: CreditEntryKind.PACK_PURCHASE,
        idempotencyKey: 'zero',
      }),
    ).rejects.toThrow();
  });
});

describe('consuming credits', () => {
  it('spends monthly credits before purchased ones', async () => {
    workspace = await freshWorkspace({ monthlyCredits: 5, purchasedCredits: 10 });

    const result = await consumeCredits({
      workspaceId: workspace.workspaceId,
      amount: 3,
      idempotencyKey: `consume-${workspace.workspaceId}`,
    });

    // Purchased credits do not expire, so spending them first would cost the
    // seller money they did not need to spend.
    expect(result.balance.monthly).toBe(2);
    expect(result.balance.purchased).toBe(10);
  });

  it('spills into purchased credits only once monthly is exhausted', async () => {
    workspace = await freshWorkspace({ monthlyCredits: 2, purchasedCredits: 10 });

    const result = await consumeCredits({
      workspaceId: workspace.workspaceId,
      amount: 5,
      idempotencyKey: `spill-${workspace.workspaceId}`,
    });

    expect(result.balance.monthly).toBe(0);
    expect(result.balance.purchased).toBe(7);
    expect(result.entryIds).toHaveLength(2);
  });

  it('throws rather than going negative', async () => {
    workspace = await freshWorkspace({ purchasedCredits: 1 });

    await expect(
      consumeCredits({
        workspaceId: workspace.workspaceId,
        amount: 5,
        idempotencyKey: `over-${workspace.workspaceId}`,
      }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);

    expect((await getCreditBalance(workspace.workspaceId)).total).toBe(1);
  });

  it('is idempotent: a retried debit does not charge twice', async () => {
    workspace = await freshWorkspace({ purchasedCredits: 10 });
    const key = `retry-${workspace.workspaceId}`;

    await consumeCredits({ workspaceId: workspace.workspaceId, amount: 1, idempotencyKey: key });
    const second = await consumeCredits({
      workspaceId: workspace.workspaceId,
      amount: 1,
      idempotencyKey: key,
    });

    expect(second.applied).toBe(false);
    expect((await getCreditBalance(workspace.workspaceId)).total).toBe(9);
  });

  it('never over-spends under concurrent requests', async () => {
    // The real-world case: a seller double-clicks Generate, or two tabs fire at
    // once. Only as many as the balance allows may succeed.
    workspace = await freshWorkspace({ purchasedCredits: 3 });

    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        consumeCredits({
          workspaceId: workspace.workspaceId,
          amount: 1,
          idempotencyKey: `concurrent-${workspace.workspaceId}-${index}`,
        }),
      ),
    );

    const succeeded = attempts.filter((attempt) => attempt.status === 'fulfilled').length;
    const balance = await getCreditBalance(workspace.workspaceId);

    expect(succeeded).toBe(3);
    expect(balance.total).toBe(0);

    const ledger = await recomputeBalanceFromLedger(workspace.workspaceId);
    expect(ledger.total).toBe(balance.total);
  });

  it('keeps the cached balance and the ledger in agreement', async () => {
    workspace = await freshWorkspace({ monthlyCredits: 4, purchasedCredits: 6 });

    await consumeCredits({ workspaceId: workspace.workspaceId, amount: 6, idempotencyKey: 'a' });
    await grantCredits({
      workspaceId: workspace.workspaceId,
      amount: 5,
      bucket: CreditBucket.PURCHASED,
      kind: CreditEntryKind.PACK_PURCHASE,
      idempotencyKey: 'b',
    });

    const cached = await getCreditBalance(workspace.workspaceId);
    const ledger = await recomputeBalanceFromLedger(workspace.workspaceId);

    // The ledger is authoritative; the cache must never diverge from it.
    expect(cached.monthly).toBe(ledger.monthly);
    expect(cached.purchased).toBe(ledger.purchased);
  });
});

describe('refunding a failed generation', () => {
  async function setupFailedJob(startingCredits: number) {
    const local = await freshWorkspace({ purchasedCredits: startingCredits });

    const item = await prisma.item.create({
      data: { workspaceId: local.workspaceId, sku: `SKU-${Date.now()}`, title: 'Test item' },
    });

    const aiJob = await prisma.aIJob.create({
      data: { kind: 'ANALYZE', workspaceId: local.workspaceId, itemId: item.id, status: 'QUEUED' },
    });

    const consumption = await consumeCredits({
      workspaceId: local.workspaceId,
      amount: 1,
      aiJobId: aiJob.id,
      itemId: item.id,
      idempotencyKey: `generation:${aiJob.id}`,
    });

    await prisma.aIJob.update({
      where: { id: aiJob.id },
      data: { creditEntryId: consumption.entryIds[0] },
    });

    return { workspace: local, aiJobId: aiJob.id };
  }

  it('returns the credit exactly once', async () => {
    const { workspace: local, aiJobId } = await setupFailedJob(5);

    expect((await getCreditBalance(local.workspaceId)).total).toBe(4);

    const first = await refundCreditsForAIJob(aiJobId, 'Provider timed out');
    const second = await refundCreditsForAIJob(aiJobId, 'Provider timed out');

    expect(first).toBe(true);
    // Guarded by `AIJob.creditRefunded` and the ledger's unique key.
    expect(second).toBe(false);
    expect((await getCreditBalance(local.workspaceId)).total).toBe(5);
  });

  it('refunds each bucket it took from', async () => {
    const local = await freshWorkspace({ monthlyCredits: 1, purchasedCredits: 5 });

    const item = await prisma.item.create({
      data: { workspaceId: local.workspaceId, sku: `SKU-${Date.now()}-b`, title: 'Test item' },
    });
    const aiJob = await prisma.aIJob.create({
      data: { kind: 'ANALYZE', workspaceId: local.workspaceId, itemId: item.id, status: 'QUEUED' },
    });

    const consumption = await consumeCredits({
      workspaceId: local.workspaceId,
      amount: 3,
      aiJobId: aiJob.id,
      idempotencyKey: `generation:${aiJob.id}`,
    });
    await prisma.aIJob.update({
      where: { id: aiJob.id },
      data: { creditEntryId: consumption.entryIds[0] },
    });

    expect(await refundCreditsForAIJob(aiJob.id, 'failed')).toBe(true);

    const balance = await getCreditBalance(local.workspaceId);
    expect(balance.monthly).toBe(1);
    expect(balance.purchased).toBe(5);
  });

  it('does nothing for a job that was never charged', async () => {
    const local = await freshWorkspace({ purchasedCredits: 5 });
    const aiJob = await prisma.aIJob.create({
      data: { kind: 'ANALYZE', workspaceId: local.workspaceId, status: 'QUEUED' },
    });

    expect(await refundCreditsForAIJob(aiJob.id)).toBe(false);
    expect((await getCreditBalance(local.workspaceId)).total).toBe(5);
  });
});

describe('billing period renewal', () => {
  it('replaces the monthly bucket rather than adding to it', async () => {
    workspace = await freshWorkspace({ monthlyCredits: 12, purchasedCredits: 4 });

    const result = await resetMonthlyCredits({
      workspaceId: workspace.workspaceId,
      credits: 50,
      periodStart: new Date('2026-02-01T00:00:00Z'),
    });

    // Unused plan credits must not roll over — that is what "resets each
    // billing period" means.
    expect(result.balance.monthly).toBe(50);
    expect(result.balance.purchased).toBe(4);
  });

  it('is idempotent per billing period', async () => {
    workspace = await freshWorkspace({ monthlyCredits: 0 });
    const periodStart = new Date('2026-03-01T00:00:00Z');

    const first = await resetMonthlyCredits({
      workspaceId: workspace.workspaceId,
      credits: 50,
      periodStart,
    });
    const second = await resetMonthlyCredits({
      workspaceId: workspace.workspaceId,
      credits: 50,
      periodStart,
    });

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect((await getCreditBalance(workspace.workspaceId)).monthly).toBe(50);
  });

  it('grants again for a new period', async () => {
    workspace = await freshWorkspace();

    await resetMonthlyCredits({
      workspaceId: workspace.workspaceId,
      credits: 50,
      periodStart: new Date('2026-04-01T00:00:00Z'),
    });
    await consumeCredits({ workspaceId: workspace.workspaceId, amount: 20, idempotencyKey: 'use' });
    const next = await resetMonthlyCredits({
      workspaceId: workspace.workspaceId,
      credits: 50,
      periodStart: new Date('2026-05-01T00:00:00Z'),
    });

    expect(next.applied).toBe(true);
    expect(next.balance.monthly).toBe(50);
  });
});

describe('admin adjustments', () => {
  it('records a grant with its reason and actor', async () => {
    workspace = await freshWorkspace();

    await adminAdjustCredits({
      workspaceId: workspace.workspaceId,
      actorId: workspace.userId,
      amount: 25,
      bucket: CreditBucket.PURCHASED,
      reason: 'Goodwill after a support issue',
    });

    const entry = await prisma.creditLedger.findFirst({
      where: { workspaceId: workspace.workspaceId, kind: CreditEntryKind.ADMIN_GRANT },
    });

    expect(entry?.reason).toBe('Goodwill after a support issue');
    expect(entry?.actorId).toBe(workspace.userId);
  });

  it('refuses an adjustment without a reason', async () => {
    workspace = await freshWorkspace();

    await expect(
      adminAdjustCredits({
        workspaceId: workspace.workspaceId,
        actorId: workspace.userId,
        amount: 5,
        bucket: CreditBucket.PURCHASED,
        reason: '   ',
      }),
    ).rejects.toThrow(/reason/i);
  });

  it('clamps a reversal at zero rather than going negative', async () => {
    workspace = await freshWorkspace({ purchasedCredits: 3 });

    const result = await adminAdjustCredits({
      workspaceId: workspace.workspaceId,
      actorId: workspace.userId,
      amount: -10,
      bucket: CreditBucket.PURCHASED,
      reason: 'Reversing a mistaken grant',
    });

    expect(result.balance.purchased).toBe(0);
    expect((await recomputeBalanceFromLedger(workspace.workspaceId)).purchased).toBe(0);
  });
});
