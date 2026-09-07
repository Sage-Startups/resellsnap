/**
 * Credit accounting.
 *
 * Rules the rest of the product depends on:
 *   1. `CreditLedger` is append-only and authoritative. The `monthlyCredits` /
 *      `purchasedCredits` columns on `Workspace` are a read cache recomputed
 *      inside the same transaction as every ledger write.
 *   2. Every mutation carries a deterministic `idempotencyKey`. A duplicate key
 *      is a no-op, which is what makes retries, refreshes, webhook replays and
 *      concurrent requests safe.
 *   3. Monthly (plan) credits are always spent before purchased credits, so a
 *      seller never loses a pack credit that would have expired anyway.
 *   4. A failed job refunds exactly once, guarded by `AIJob.creditRefunded`.
 */
import { CreditBucket, CreditEntryKind } from '@/generated/prisma/enums';
import type { PrismaClient } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/** Prisma transaction client (no `$transaction`, `$connect`, …). */
type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

export interface CreditBalance {
  monthly: number;
  purchased: number;
  total: number;
}

export class InsufficientCreditsError extends Error {
  readonly required: number;
  readonly available: number;

  constructor(required: number, available: number) {
    super(
      `This action needs ${required} listing ${required === 1 ? 'credit' : 'credits'} but only ${available} ${
        available === 1 ? 'is' : 'are'
      } available.`,
    );
    this.name = 'InsufficientCreditsError';
    this.required = required;
    this.available = available;
  }
}

/** Cost, in credits, of one full analysis + master + four platform variants. */
export const LISTING_CREDIT_COST = 1;
/** Regenerating a single platform variant is free; a full re-analysis is not. */
export const REGENERATE_VARIANT_CREDIT_COST = 0;
export const REANALYZE_CREDIT_COST = 1;

export async function getCreditBalance(workspaceId: string): Promise<CreditBalance> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { monthlyCredits: true, purchasedCredits: true },
  });
  if (!workspace) return { monthly: 0, purchased: 0, total: 0 };
  return {
    monthly: workspace.monthlyCredits,
    purchased: workspace.purchasedCredits,
    total: workspace.monthlyCredits + workspace.purchasedCredits,
  };
}

/**
 * Recomputes balances from the ledger. Used by the admin console to prove the
 * cache and the ledger agree, and by tests.
 */
export async function recomputeBalanceFromLedger(workspaceId: string): Promise<CreditBalance> {
  const rows = await prisma.creditLedger.groupBy({
    by: ['bucket'],
    where: { workspaceId },
    _sum: { delta: true },
  });

  let monthly = 0;
  let purchased = 0;
  for (const row of rows) {
    if (row.bucket === CreditBucket.MONTHLY) monthly = row._sum.delta ?? 0;
    else purchased = row._sum.delta ?? 0;
  }
  return { monthly, purchased, total: monthly + purchased };
}

/**
 * Locks the workspace row and returns its current balances. Serialising here is
 * what prevents two concurrent generations from both seeing "1 credit left".
 */
async function lockWorkspace(tx: Tx, workspaceId: string): Promise<CreditBalance> {
  const rows = await tx.$queryRaw<Array<{ monthlyCredits: number; purchasedCredits: number }>>`
    SELECT "monthlyCredits", "purchasedCredits"
    FROM "workspace"
    WHERE "id" = ${workspaceId}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new Error(`Workspace ${workspaceId} not found`);
  return {
    monthly: Number(row.monthlyCredits),
    purchased: Number(row.purchasedCredits),
    total: Number(row.monthlyCredits) + Number(row.purchasedCredits),
  };
}

async function findExisting(tx: Tx, idempotencyKey: string) {
  return tx.creditLedger.findUnique({ where: { idempotencyKey } });
}

export interface GrantInput {
  workspaceId: string;
  amount: number;
  bucket: CreditBucket;
  kind: CreditEntryKind;
  idempotencyKey: string;
  reason?: string;
  actorId?: string;
}

export interface GrantResult {
  applied: boolean;
  balance: CreditBalance;
  entryId: string;
}

/** Adds credits. Safe to call twice with the same key. */
export async function grantCredits(input: GrantInput): Promise<GrantResult> {
  if (input.amount <= 0) throw new Error('grantCredits requires a positive amount');

  return prisma.$transaction(async (tx) => {
    const existing = await findExisting(tx, input.idempotencyKey);
    if (existing) {
      return { applied: false, balance: await getBalanceInTx(tx, input.workspaceId), entryId: existing.id };
    }

    const balance = await lockWorkspace(tx, input.workspaceId);
    const isMonthly = input.bucket === CreditBucket.MONTHLY;
    const nextMonthly = isMonthly ? balance.monthly + input.amount : balance.monthly;
    const nextPurchased = isMonthly ? balance.purchased : balance.purchased + input.amount;

    const entry = await tx.creditLedger.create({
      data: {
        workspaceId: input.workspaceId,
        kind: input.kind,
        bucket: input.bucket,
        delta: input.amount,
        balanceAfter: isMonthly ? nextMonthly : nextPurchased,
        reason: input.reason,
        actorId: input.actorId,
        idempotencyKey: input.idempotencyKey,
      },
    });

    await tx.workspace.update({
      where: { id: input.workspaceId },
      data: { monthlyCredits: nextMonthly, purchasedCredits: nextPurchased },
    });

    return {
      applied: true,
      balance: { monthly: nextMonthly, purchased: nextPurchased, total: nextMonthly + nextPurchased },
      entryId: entry.id,
    };
  });
}

async function getBalanceInTx(tx: Tx, workspaceId: string): Promise<CreditBalance> {
  const workspace = await tx.workspace.findUnique({
    where: { id: workspaceId },
    select: { monthlyCredits: true, purchasedCredits: true },
  });
  return {
    monthly: workspace?.monthlyCredits ?? 0,
    purchased: workspace?.purchasedCredits ?? 0,
    total: (workspace?.monthlyCredits ?? 0) + (workspace?.purchasedCredits ?? 0),
  };
}

export interface ConsumeInput {
  workspaceId: string;
  amount?: number;
  idempotencyKey: string;
  reason?: string;
  itemId?: string;
  aiJobId?: string;
}

export interface ConsumeResult {
  applied: boolean;
  balance: CreditBalance;
  /** Ledger entry ids created, in bucket order. Used to drive an exact refund. */
  entryIds: string[];
}

/**
 * Debits credits, draining the monthly bucket first.
 *
 * Called only once a job has been *accepted* — never speculatively — so a
 * rejected request costs the seller nothing.
 */
export async function consumeCredits(input: ConsumeInput): Promise<ConsumeResult> {
  const amount = input.amount ?? LISTING_CREDIT_COST;
  if (amount <= 0) {
    const balance = await getCreditBalance(input.workspaceId);
    return { applied: false, balance, entryIds: [] };
  }

  return prisma.$transaction(async (tx) => {
    const existing = await findExisting(tx, input.idempotencyKey);
    if (existing) {
      // Already debited under this key — return the prior outcome untouched.
      const siblings = await tx.creditLedger.findMany({
        where: { idempotencyKey: { startsWith: input.idempotencyKey } },
        select: { id: true },
      });
      return {
        applied: false,
        balance: await getBalanceInTx(tx, input.workspaceId),
        entryIds: siblings.map((s) => s.id),
      };
    }

    const balance = await lockWorkspace(tx, input.workspaceId);
    if (balance.total < amount) {
      throw new InsufficientCreditsError(amount, balance.total);
    }

    const fromMonthly = Math.min(balance.monthly, amount);
    const fromPurchased = amount - fromMonthly;

    const nextMonthly = balance.monthly - fromMonthly;
    const nextPurchased = balance.purchased - fromPurchased;
    const entryIds: string[] = [];

    if (fromMonthly > 0) {
      const entry = await tx.creditLedger.create({
        data: {
          workspaceId: input.workspaceId,
          kind: CreditEntryKind.CONSUMPTION,
          bucket: CreditBucket.MONTHLY,
          delta: -fromMonthly,
          balanceAfter: nextMonthly,
          reason: input.reason ?? 'Listing generation',
          itemId: input.itemId,
          aiJobId: input.aiJobId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      entryIds.push(entry.id);
    }

    if (fromPurchased > 0) {
      const entry = await tx.creditLedger.create({
        data: {
          workspaceId: input.workspaceId,
          kind: CreditEntryKind.CONSUMPTION,
          bucket: CreditBucket.PURCHASED,
          delta: -fromPurchased,
          balanceAfter: nextPurchased,
          reason: input.reason ?? 'Listing generation',
          itemId: input.itemId,
          aiJobId: input.aiJobId,
          // Suffixed so both rows satisfy the unique index while remaining
          // discoverable from the base key.
          idempotencyKey: fromMonthly > 0 ? `${input.idempotencyKey}:purchased` : input.idempotencyKey,
        },
      });
      entryIds.push(entry.id);
    }

    await tx.workspace.update({
      where: { id: input.workspaceId },
      data: { monthlyCredits: nextMonthly, purchasedCredits: nextPurchased },
    });

    return {
      applied: true,
      balance: { monthly: nextMonthly, purchased: nextPurchased, total: nextMonthly + nextPurchased },
      entryIds,
    };
  });
}

/**
 * Restores credits for a job that ultimately failed.
 *
 * Guarded twice: by `AIJob.creditRefunded` and by the ledger's unique
 * idempotency key, so neither a retry storm nor a manual admin click can
 * double-refund.
 */
export async function refundCreditsForAIJob(aiJobId: string, reason = 'Generation failed'): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.aIJob.findUnique({
      where: { id: aiJobId },
      select: { id: true, workspaceId: true, creditEntryId: true, creditRefunded: true },
    });

    if (!job || job.creditRefunded || !job.creditEntryId) return false;

    const consumed = await tx.creditLedger.findMany({
      where: { aiJobId, kind: CreditEntryKind.CONSUMPTION },
    });
    if (consumed.length === 0) return false;

    const balance = await lockWorkspace(tx, job.workspaceId);
    let nextMonthly = balance.monthly;
    let nextPurchased = balance.purchased;

    for (const entry of consumed) {
      const amount = Math.abs(entry.delta);
      const isMonthly = entry.bucket === CreditBucket.MONTHLY;
      if (isMonthly) nextMonthly += amount;
      else nextPurchased += amount;

      await tx.creditLedger.create({
        data: {
          workspaceId: job.workspaceId,
          kind: CreditEntryKind.REFUND,
          bucket: entry.bucket,
          delta: amount,
          balanceAfter: isMonthly ? nextMonthly : nextPurchased,
          reason,
          aiJobId,
          idempotencyKey: `refund:${entry.id}`,
        },
      });
    }

    await tx.workspace.update({
      where: { id: job.workspaceId },
      data: { monthlyCredits: nextMonthly, purchasedCredits: nextPurchased },
    });
    await tx.aIJob.update({ where: { id: aiJobId }, data: { creditRefunded: true } });

    logger.info('Credits refunded for failed AI job', { aiJobId, workspaceId: job.workspaceId });
    return true;
  });
}

/**
 * Resets the monthly bucket at the start of a billing period.
 *
 * Purchased credits are untouched — they do not expire by default. Keyed on the
 * period start so a duplicate `invoice.paid` webhook cannot grant twice.
 */
export async function resetMonthlyCredits(input: {
  workspaceId: string;
  credits: number;
  periodStart: Date;
  reason?: string;
}): Promise<GrantResult> {
  const key = `plan_renewal:${input.workspaceId}:${input.periodStart.toISOString()}`;

  return prisma.$transaction(async (tx) => {
    const existing = await findExisting(tx, key);
    if (existing) {
      return { applied: false, balance: await getBalanceInTx(tx, input.workspaceId), entryId: existing.id };
    }

    const balance = await lockWorkspace(tx, input.workspaceId);
    // A reset replaces the monthly bucket rather than adding to it, so unused
    // plan credits do not silently roll over.
    const delta = input.credits - balance.monthly;

    const entry = await tx.creditLedger.create({
      data: {
        workspaceId: input.workspaceId,
        kind: CreditEntryKind.PLAN_RENEWAL,
        bucket: CreditBucket.MONTHLY,
        delta,
        balanceAfter: input.credits,
        reason: input.reason ?? 'Billing period renewal',
        idempotencyKey: key,
      },
    });

    await tx.workspace.update({
      where: { id: input.workspaceId },
      data: { monthlyCredits: input.credits },
    });
    await tx.subscription.updateMany({
      where: { workspaceId: input.workspaceId },
      data: { lastCreditResetAt: input.periodStart },
    });

    return {
      applied: true,
      balance: {
        monthly: input.credits,
        purchased: balance.purchased,
        total: input.credits + balance.purchased,
      },
      entryId: entry.id,
    };
  });
}

/** Admin-initiated adjustment. A reason is mandatory and is stored on the entry. */
export async function adminAdjustCredits(input: {
  workspaceId: string;
  actorId: string;
  amount: number;
  bucket: CreditBucket;
  reason: string;
}): Promise<GrantResult> {
  if (!input.reason.trim()) throw new Error('An admin credit adjustment requires a reason');
  if (input.amount === 0) throw new Error('An admin credit adjustment must be non-zero');

  const key = `admin:${input.workspaceId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

  if (input.amount > 0) {
    return grantCredits({
      workspaceId: input.workspaceId,
      amount: input.amount,
      bucket: input.bucket,
      kind: CreditEntryKind.ADMIN_GRANT,
      idempotencyKey: key,
      reason: input.reason,
      actorId: input.actorId,
    });
  }

  // Reversal: never take the balance below zero.
  return prisma.$transaction(async (tx) => {
    const balance = await lockWorkspace(tx, input.workspaceId);
    const isMonthly = input.bucket === CreditBucket.MONTHLY;
    const current = isMonthly ? balance.monthly : balance.purchased;
    const delta = -Math.min(Math.abs(input.amount), current);

    if (delta === 0) {
      return { applied: false, balance, entryId: '' };
    }

    const nextValue = current + delta;
    const entry = await tx.creditLedger.create({
      data: {
        workspaceId: input.workspaceId,
        kind: CreditEntryKind.ADMIN_REVERSAL,
        bucket: input.bucket,
        delta,
        balanceAfter: nextValue,
        reason: input.reason,
        actorId: input.actorId,
        idempotencyKey: key,
      },
    });

    await tx.workspace.update({
      where: { id: input.workspaceId },
      data: isMonthly ? { monthlyCredits: nextValue } : { purchasedCredits: nextValue },
    });

    return {
      applied: true,
      balance: {
        monthly: isMonthly ? nextValue : balance.monthly,
        purchased: isMonthly ? balance.purchased : nextValue,
        total: isMonthly ? nextValue + balance.purchased : balance.monthly + nextValue,
      },
      entryId: entry.id,
    };
  });
}
