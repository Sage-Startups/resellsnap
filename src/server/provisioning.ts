/**
 * New-account provisioning.
 *
 * Runs once per user, immediately after Better Auth creates the record: a
 * personal workspace, preferences, and the one-time free credit grant. Written
 * to be idempotent because auth hooks can, in rare retry scenarios, fire twice.
 */
import { CreditBucket, CreditEntryKind, Role } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { slugify } from '@/lib/utils';
import { grantCredits } from './credits';
import { getSettings } from './settings';

function workspaceNameFor(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed) return `${trimmed.split(/\s+/)[0]}'s workspace`;
  return `${email.split('@')[0]}'s workspace`;
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'workspace';
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const existing = await prisma.workspace.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export async function provisionUser(user: { id: string; email: string; name: string }): Promise<void> {
  try {
    const existing = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    if (existing) return;

    const settings = await getSettings();
    const name = workspaceNameFor(user.name, user.email);
    const slug = await uniqueSlug(name);

    const workspace = await prisma.workspace.create({
      data: {
        name,
        slug,
        currency: settings.defaultCurrency,
        members: { create: { userId: user.id, role: 'OWNER' } },
        subscription: { create: { status: 'NONE' } },
      },
    });

    await prisma.userPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, currency: settings.defaultCurrency },
      update: {},
    });
    await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    if (settings.signupFreeCredits > 0) {
      await grantCredits({
        workspaceId: workspace.id,
        amount: settings.signupFreeCredits,
        bucket: CreditBucket.PURCHASED,
        kind: CreditEntryKind.SIGNUP_GRANT,
        idempotencyKey: `signup:${workspace.id}`,
        reason: 'Free listing credits for a new account',
      });
    }

    await prisma.analyticsEvent.create({
      data: { name: 'SIGNUP_COMPLETED', workspaceId: workspace.id, userId: user.id },
    });

    // The first super admin is bootstrapped from SUPER_ADMIN_EMAIL. Doing it
    // here as well as in the CLI means the very first signup on a fresh
    // deployment lands correctly without a manual step.
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    if (superAdminEmail && user.email.trim().toLowerCase() === superAdminEmail) {
      await prisma.user.update({ where: { id: user.id }, data: { role: Role.SUPER_ADMIN } });
      logger.info('Bootstrapped super admin from SUPER_ADMIN_EMAIL', { userId: user.id });
    }

    logger.info('Provisioned new workspace', { userId: user.id, workspaceId: workspace.id });
  } catch (error) {
    logger.error('Failed to provision user', { userId: user.id, error });
    throw error;
  }
}
