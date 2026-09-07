'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { UserStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { getEnv } from '@/lib/env';
import { sanitizeError } from '@/lib/logger';
import { requireApiUser, requireApiWorkspace, requestMetadata } from '@/server/session';
import { recordAudit, AUDIT_ACTIONS } from '@/server/audit';
import { EMAIL_KEYS, sendTemplateEmail } from '@/server/email';
import { getSettings } from '@/server/settings';

export interface AccountActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

const ProfileSchema = z.object({
  name: z.string().trim().min(1, 'Please enter a name.').max(120),
  timezone: z.string().trim().max(60),
  locale: z.string().trim().max(20),
  defaultTone: z.enum(['STRAIGHTFORWARD', 'FRIENDLY', 'VINTAGE', 'MINIMAL']),
  brandVoice: z.string().trim().max(600).nullable().optional(),
  measurementUnit: z.enum(['in', 'cm']),
});

export async function updateProfileAction(raw: unknown): Promise<AccountActionResult> {
  try {
    const user = await requireApiUser();
    const data = ProfileSchema.parse(raw);

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { name: data.name } }),
      prisma.userPreference.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          timezone: data.timezone,
          locale: data.locale,
          defaultTone: data.defaultTone,
          brandVoice: data.brandVoice || null,
          measurementUnit: data.measurementUnit,
        },
        update: {
          timezone: data.timezone,
          locale: data.locale,
          defaultTone: data.defaultTone,
          brandVoice: data.brandVoice || null,
          measurementUnit: data.measurementUnit,
        },
      }),
    ]);

    revalidatePath('/app/settings');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: sanitizeError(error, 'Could not save your profile.') };
  }
}

const NotificationSchema = z.object({
  emailGenerationComplete: z.boolean(),
  emailGenerationFailed: z.boolean(),
  emailLowCredits: z.boolean(),
  emailProductUpdates: z.boolean(),
  inAppEnabled: z.boolean(),
});

export async function updateNotificationsAction(raw: unknown): Promise<AccountActionResult> {
  try {
    const user = await requireApiUser();
    const data = NotificationSchema.parse(raw);

    await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });

    revalidatePath('/app/settings');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: sanitizeError(error, 'Could not save your preferences.') };
  }
}

export async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions: boolean;
}): Promise<AccountActionResult> {
  try {
    await requireApiUser();

    if (input.newPassword.length < 10) {
      return { ok: false, error: 'Use at least 10 characters.' };
    }

    // Better Auth verifies the current password itself; we never handle the
    // hash directly.
    await auth.api.changePassword({
      headers: await headers(),
      body: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: input.revokeOtherSessions,
      },
    });

    return { ok: true };
  } catch {
    return { ok: false, error: 'That current password is not correct.' };
  }
}

export async function revokeOtherSessionsAction(): Promise<AccountActionResult> {
  try {
    await requireApiUser();
    await auth.api.revokeOtherSessions({ headers: await headers() });
    revalidatePath('/app/settings');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: sanitizeError(error, 'Could not revoke those sessions.') };
  }
}

/**
 * Machine-readable export of everything we hold for this account.
 *
 * Photos are referenced by object key rather than embedded — a JSON document
 * with a hundred base64 images is not a useful export.
 */
export async function exportAccountDataAction(): Promise<AccountActionResult<{ json: string }>> {
  try {
    const context = await requireApiWorkspace();

    const [user, workspace] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: context.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          createdAt: true,
          preference: true,
          notificationPref: true,
        },
      }),
      prisma.workspace.findUniqueOrThrow({
        where: { id: context.workspace.id },
        select: {
          id: true,
          name: true,
          slug: true,
          currency: true,
          createdAt: true,
          monthlyCredits: true,
          purchasedCredits: true,
          items: {
            where: { deletedAt: null },
            select: {
              sku: true,
              title: true,
              status: true,
              categoryHint: true,
              quantity: true,
              currency: true,
              acquisitionCostCents: true,
              notes: true,
              createdAt: true,
              facts: { select: { key: true, value: true, source: true, confirmed: true } },
              photos: { select: { objectKey: true, contentType: true, byteSize: true } },
              listing: {
                select: {
                  title: true,
                  description: true,
                  conditionSummary: true,
                  variants: {
                    select: { platform: true, title: true, description: true, fields: true },
                  },
                },
              },
              priceSuggestions: {
                select: { strategy: true, amountCents: true, source: true, explanation: true },
              },
              saleRecord: true,
            },
          },
          creditLedger: {
            select: { kind: true, bucket: true, delta: true, balanceAfter: true, createdAt: true },
          },
        },
      }),
    ]);

    await recordAudit({
      actorId: context.user.id,
      action: AUDIT_ACTIONS.USER_EXPORTED,
      targetType: 'user',
      targetId: context.user.id,
      reason: 'Self-service data export',
      ...(await requestMetadata()),
    });

    return {
      ok: true,
      data: {
        json: JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            note: 'Photos are referenced by storage key. Download the originals from each item, or from a photo ZIP export.',
            user,
            workspace,
          },
          null,
          2,
        ),
      },
    };
  } catch (error) {
    return { ok: false, error: sanitizeError(error, 'Could not build your export.') };
  }
}

export async function requestAccountDeletionAction(reason: string): Promise<AccountActionResult> {
  try {
    const user = await requireApiUser();
    const settings = await getSettings();

    await prisma.user.update({
      where: { id: user.id },
      data: { status: UserStatus.DELETION_REQUESTED, deletionRequested: new Date() },
    });

    await recordAudit({
      actorId: user.id,
      action: AUDIT_ACTIONS.USER_DELETION_REQUESTED,
      targetType: 'user',
      targetId: user.id,
      reason: reason.slice(0, 300) || 'No reason given',
      ...(await requestMetadata()),
    });

    await sendTemplateEmail({
      key: EMAIL_KEYS.ACCOUNT_DELETION_REQUESTED,
      to: user.email,
      userId: user.id,
      tokens: {
        name: user.name || 'there',
        retentionDays: settings.deletedItemRetentionDays,
        actionUrl: `${getEnv().APP_URL}/app/settings`,
      },
    });

    revalidatePath('/app/settings');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: sanitizeError(error, 'Could not record that request.') };
  }
}

export async function cancelAccountDeletionAction(): Promise<AccountActionResult> {
  try {
    const user = await requireApiUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { status: UserStatus.ACTIVE, deletionRequested: null },
    });
    revalidatePath('/app/settings');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: sanitizeError(error, 'Could not cancel that request.') };
  }
}
