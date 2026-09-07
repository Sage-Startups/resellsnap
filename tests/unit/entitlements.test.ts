import { describe, expect, it } from 'vitest';
import { hasRole, isStaff } from '@/server/session';
import { Role } from '@/generated/prisma/enums';
import { ENTITLEMENT_KEYS, findPlanSeed, PLAN_SEEDS } from '@/server/plans';

describe('role hierarchy', () => {
  it('treats roles as a ladder, not a set', () => {
    expect(hasRole({ role: Role.SUPER_ADMIN }, Role.ADMIN)).toBe(true);
    expect(hasRole({ role: Role.ADMIN }, Role.SUPPORT)).toBe(true);
    expect(hasRole({ role: Role.SUPPORT }, Role.USER)).toBe(true);
  });

  it('never promotes a lower role', () => {
    expect(hasRole({ role: Role.USER }, Role.SUPPORT)).toBe(false);
    expect(hasRole({ role: Role.SUPPORT }, Role.ADMIN)).toBe(false);
    expect(hasRole({ role: Role.ADMIN }, Role.SUPER_ADMIN)).toBe(false);
  });

  it('excludes ordinary users from staff', () => {
    expect(isStaff({ role: Role.USER })).toBe(false);
    expect(isStaff({ role: Role.SUPPORT })).toBe(true);
    expect(isStaff({ role: Role.SUPER_ADMIN })).toBe(true);
  });
});

describe('plan catalogue', () => {
  it('gives the free plan no paid entitlements', () => {
    const free = findPlanSeed('free');
    expect(free?.entitlements.bulkWorkflow).toBe(false);
    expect(free?.entitlements.ebayConnection).toBe(false);
    expect(free?.entitlements.advancedAnalytics).toBe(false);
  });

  it('unlocks eBay on paid plans only', () => {
    expect(findPlanSeed('starter')?.entitlements.ebayConnection).toBe(true);
    expect(findPlanSeed('pro')?.entitlements.ebayConnection).toBe(true);
    expect(findPlanSeed('free')?.entitlements.ebayConnection).toBe(false);
  });

  it('reserves bulk mode for Pro', () => {
    expect(findPlanSeed('pro')?.entitlements.bulkWorkflow).toBe(true);
    expect(findPlanSeed('starter')?.entitlements.bulkWorkflow).toBe(false);
  });

  it('declares every entitlement key on the subscription plans', () => {
    for (const key of ENTITLEMENT_KEYS) {
      expect(findPlanSeed('free')?.entitlements).toHaveProperty(key);
      expect(findPlanSeed('starter')?.entitlements).toHaveProperty(key);
      expect(findPlanSeed('pro')?.entitlements).toHaveProperty(key);
    }
  });

  it('matches the published pricing', () => {
    expect(findPlanSeed('starter')?.priceCents).toBe(1500);
    expect(findPlanSeed('starter')?.creditsGranted).toBe(50);
    expect(findPlanSeed('pro')?.priceCents).toBe(2900);
    expect(findPlanSeed('pro')?.creditsGranted).toBe(200);
    expect(findPlanSeed('free')?.creditsGranted).toBe(3);
  });

  it('matches the published credit pack pricing', () => {
    expect(findPlanSeed('pack_20')).toMatchObject({ priceCents: 700, creditsGranted: 20 });
    expect(findPlanSeed('pack_75')).toMatchObject({ priceCents: 1900, creditsGranted: 75 });
    expect(findPlanSeed('pack_200')).toMatchObject({ priceCents: 3900, creditsGranted: 200 });
  });

  it('gets cheaper per credit as the pack gets bigger', () => {
    const packs = PLAN_SEEDS.filter((plan) => plan.kind === 'CREDIT_PACK').sort(
      (a, b) => a.creditsGranted - b.creditsGranted,
    );

    for (let index = 1; index < packs.length; index += 1) {
      const previous = packs[index - 1]!;
      const current = packs[index]!;
      expect(current.priceCents / current.creditsGranted).toBeLessThan(
        previous.priceCents / previous.creditsGranted,
      );
    }
  });

  it('maps every paid offer to a Stripe price environment variable', () => {
    for (const plan of PLAN_SEEDS) {
      if (plan.priceCents > 0) expect(plan.stripePriceEnv).toBeTruthy();
      else expect(plan.stripePriceEnv).toBeNull();
    }
  });
});
