/**
 * Integration-test database helpers.
 *
 * Each suite creates its own workspace, so tests never interfere even though
 * they share one database. Cleanup is by workspace id, which cascades.
 */
import { randomUUID } from 'node:crypto';
import { CreditBucket, CreditEntryKind } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { grantCredits } from '@/server/credits';
import { PLATFORM_SEEDS } from '@/server/marketplace/registry';
import { PLAN_SEEDS } from '@/server/plans';

export interface TestWorkspace {
  workspaceId: string;
  userId: string;
  email: string;
}

export async function createTestWorkspace(
  options: { monthlyCredits?: number; purchasedCredits?: number } = {},
): Promise<TestWorkspace> {
  const suffix = randomUUID().slice(0, 8);
  const email = `test-${suffix}@example.test`;

  const user = await prisma.user.create({
    data: { name: `Test ${suffix}`, email, emailVerified: true },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: `Test workspace ${suffix}`,
      slug: `test-workspace-${suffix}`,
      members: { create: { userId: user.id, role: 'OWNER' } },
      subscription: { create: { status: 'NONE' } },
    },
  });

  // Grant through the ledger rather than writing the cached columns directly,
  // so a fixture never creates a state the product itself cannot produce.
  if (options.monthlyCredits) {
    await grantCredits({
      workspaceId: workspace.id,
      amount: options.monthlyCredits,
      bucket: CreditBucket.MONTHLY,
      kind: CreditEntryKind.PLAN_RENEWAL,
      idempotencyKey: `fixture-monthly:${workspace.id}`,
      reason: 'Test fixture',
    });
  }
  if (options.purchasedCredits) {
    await grantCredits({
      workspaceId: workspace.id,
      amount: options.purchasedCredits,
      bucket: CreditBucket.PURCHASED,
      kind: CreditEntryKind.PACK_PURCHASE,
      idempotencyKey: `fixture-purchased:${workspace.id}`,
      reason: 'Test fixture',
    });
  }

  return { workspaceId: workspace.id, userId: user.id, email };
}

export async function destroyTestWorkspace(workspace: TestWorkspace): Promise<void> {
  await prisma.workspace.deleteMany({ where: { id: workspace.workspaceId } });
  await prisma.user.deleteMany({ where: { id: workspace.userId } });
}

/** Ensures the reference data integration tests depend on exists. */
export async function ensureReferenceData(): Promise<void> {
  for (const seed of PLATFORM_SEEDS) {
    const platform = await prisma.platform.upsert({
      where: { key: seed.key },
      create: {
        key: seed.key,
        name: seed.name,
        sellerUrl: seed.sellerUrl,
        sortOrder: seed.sortOrder,
      },
      update: {},
    });

    await prisma.platformCapability.upsert({
      where: { platformId: platform.id },
      create: {
        platformId: platform.id,
        ...seed.capabilities,
        unavailableReason: seed.unavailableReason,
      },
      update: {},
    });

    const existing = await prisma.platformTemplate.findFirst({
      where: { platformId: platform.id, version: 1 },
    });
    if (!existing) {
      await prisma.platformTemplate.create({
        data: {
          platformId: platform.id,
          version: 1,
          isActive: true,
          titleMaxLength: seed.template.titleMaxLength,
          descriptionMaxLength: seed.template.descriptionMaxLength,
          maxPhotos: seed.template.maxPhotos,
          maxHashtags: seed.template.maxHashtags,
          requiredFields: seed.template.requiredFields,
          toneRules: seed.template.toneRules,
          feePercentBps: seed.template.feePercentBps,
          feeFixedCents: seed.template.feeFixedCents,
          exportFormats: seed.template.exportFormats,
          regions: seed.template.regions,
          guidance: seed.template.guidance,
        },
      });
    }
  }

  for (const plan of PLAN_SEEDS) {
    await prisma.plan.upsert({
      where: { key: plan.key },
      create: {
        key: plan.key,
        name: plan.name,
        kind: plan.kind,
        priceCents: plan.priceCents,
        interval: plan.interval,
        creditsGranted: plan.creditsGranted,
        sortOrder: plan.sortOrder,
        features: plan.features,
      },
      update: {},
    });
  }
}

export async function createTestItem(
  workspaceId: string,
  overrides: { sku?: string; status?: 'DRAFT' | 'READY' | 'LISTED' | 'SOLD' } = {},
): Promise<string> {
  const item = await prisma.item.create({
    data: {
      workspaceId,
      sku: overrides.sku ?? `TEST-${randomUUID().slice(0, 8).toUpperCase()}`,
      title: 'Test item',
      status: overrides.status ?? 'DRAFT',
    },
  });
  return item.id;
}
