'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type CreditBucket, type ModerationStatus, Role, UserStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { sanitizeError } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/rate-limit';
import { adminAdjustCredits } from '@/server/credits';
import { recordAudit, AUDIT_ACTIONS } from '@/server/audit';
import { requireApiStaff, requestMetadata } from '@/server/session';
import { invalidateSettingsCache, updateSettings, type AppSettings } from '@/server/settings';
import { previewTemplateEmail, sendTemplateEmail } from '@/server/email';
import { retryJob, cancelJob } from '@/server/jobs/queue';
import { processStripeEvent } from '@/server/billing/service';

export interface AdminActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * Every admin mutation runs through this wrapper: role check, rate limit,
 * audit entry. A mutation that forgets one of the three is a bug, and this is
 * the single place that prevents it.
 */
async function adminAction<T>(
  minimumRole: Role,
  fn: (actor: { id: string; name: string; email: string; role: Role }) => Promise<T>,
): Promise<AdminActionResult<T>> {
  try {
    const actor = await requireApiStaff(minimumRole);
    await enforceRateLimit('adminMutation', actor.id);
    return { ok: true, data: await fn(actor) };
  } catch (error) {
    return { ok: false, error: sanitizeError(error, 'That action could not be completed.') };
  }
}

// --- Users -----------------------------------------------------------------

export async function setUserRoleAction(input: {
  userId: string;
  role: Role;
  reason: string;
}): Promise<AdminActionResult> {
  return adminAction(Role.SUPER_ADMIN, async (actor) => {
    if (!input.reason.trim()) throw new Error('A reason is required to change a role.');
    if (input.userId === actor.id) throw new Error('You cannot change your own role.');

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { role: true, email: true },
    });

    await prisma.user.update({ where: { id: input.userId }, data: { role: input.role } });

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
      targetType: 'user',
      targetId: input.userId,
      reason: input.reason,
      before: { role: before.role },
      after: { role: input.role },
      ...(await requestMetadata()),
    });

    revalidatePath(`/admin/users/${input.userId}`);
    return undefined;
  });
}

export async function setUserStatusAction(input: {
  userId: string;
  status: UserStatus;
  reason: string;
}): Promise<AdminActionResult> {
  return adminAction(Role.ADMIN, async (actor) => {
    if (!input.reason.trim()) throw new Error('A reason is required.');
    if (input.userId === actor.id) throw new Error('You cannot suspend your own account.');

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { status: true },
    });

    const suspending = input.status === UserStatus.SUSPENDED;

    await prisma.user.update({
      where: { id: input.userId },
      data: {
        status: input.status,
        suspendedAt: suspending ? new Date() : null,
        suspendedReason: suspending ? input.reason.slice(0, 300) : null,
      },
    });

    // A suspension that leaves live sessions running is not a suspension.
    if (suspending) {
      await prisma.session.deleteMany({ where: { userId: input.userId } });
    }

    await recordAudit({
      actorId: actor.id,
      action: suspending ? AUDIT_ACTIONS.USER_SUSPENDED : AUDIT_ACTIONS.USER_REACTIVATED,
      targetType: 'user',
      targetId: input.userId,
      reason: input.reason,
      before: { status: before.status },
      after: { status: input.status },
      ...(await requestMetadata()),
    });

    revalidatePath(`/admin/users/${input.userId}`);
    return undefined;
  });
}

export async function sendPasswordResetAction(userId: string): Promise<AdminActionResult> {
  return adminAction(Role.SUPPORT, async (actor) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });

    // Better Auth mints and mails the token; the admin never sees it.
    await auth.api.requestPasswordReset({
      body: { email: user.email, redirectTo: '/reset-password' },
    });

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET_SENT,
      targetType: 'user',
      targetId: userId,
      reason: 'Support-initiated password reset',
      ...(await requestMetadata()),
    });

    return undefined;
  });
}

export async function addSupportNoteAction(input: {
  userId: string;
  body: string;
}): Promise<AdminActionResult> {
  return adminAction(Role.SUPPORT, async (actor) => {
    if (!input.body.trim()) throw new Error('A note cannot be empty.');
    await prisma.supportNote.create({
      data: { subjectUserId: input.userId, authorId: actor.id, body: input.body.slice(0, 2000) },
    });
    revalidatePath(`/admin/users/${input.userId}`);
    return undefined;
  });
}

// --- Credits ---------------------------------------------------------------

const CreditAdjustSchema = z.object({
  workspaceId: z.string().min(1),
  amount: z.number().int().refine((value) => value !== 0, 'Enter a non-zero amount.'),
  bucket: z.enum(['MONTHLY', 'PURCHASED']),
  reason: z.string().trim().min(3, 'A reason is required.').max(300),
});

export async function adjustCreditsAction(raw: unknown): Promise<AdminActionResult> {
  return adminAction(Role.ADMIN, async (actor) => {
    const input = CreditAdjustSchema.parse(raw);

    const result = await adminAdjustCredits({
      workspaceId: input.workspaceId,
      actorId: actor.id,
      amount: input.amount,
      bucket: input.bucket as CreditBucket,
      reason: input.reason,
    });

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.CREDITS_ADJUSTED,
      targetType: 'workspace',
      targetId: input.workspaceId,
      reason: input.reason,
      after: { amount: input.amount, bucket: input.bucket, balance: result.balance.total },
      ...(await requestMetadata()),
    });

    revalidatePath('/admin/credits');
    revalidatePath(`/admin/workspaces/${input.workspaceId}`);
    return undefined;
  });
}

// --- Items and moderation --------------------------------------------------

export async function adminRestoreItemAction(itemId: string): Promise<AdminActionResult> {
  return adminAction(Role.ADMIN, async (actor) => {
    await prisma.item.update({ where: { id: itemId }, data: { deletedAt: null } });
    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.ITEM_RESTORED,
      targetType: 'item',
      targetId: itemId,
      reason: 'Restored from the admin console',
      ...(await requestMetadata()),
    });
    revalidatePath('/admin/items');
    return undefined;
  });
}

export async function removeItemContentAction(input: {
  itemId: string;
  reason: string;
}): Promise<AdminActionResult> {
  return adminAction(Role.ADMIN, async (actor) => {
    if (!input.reason.trim()) throw new Error('A reason is required to remove content.');

    await prisma.item.update({
      where: { id: input.itemId },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.ITEM_CONTENT_REMOVED,
      targetType: 'item',
      targetId: input.itemId,
      reason: input.reason,
      ...(await requestMetadata()),
    });

    revalidatePath('/admin/items');
    revalidatePath('/admin/moderation');
    return undefined;
  });
}

export async function resolveModerationAction(input: {
  flagId: string;
  status: ModerationStatus;
  resolution: string;
}): Promise<AdminActionResult> {
  return adminAction(Role.SUPPORT, async (actor) => {
    if (!input.resolution.trim()) throw new Error('Describe how this was resolved.');

    await prisma.moderationFlag.update({
      where: { id: input.flagId },
      data: {
        status: input.status,
        resolution: input.resolution.slice(0, 500),
        resolvedBy: actor.id,
        resolvedAt: new Date(),
      },
    });

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.MODERATION_RESOLVED,
      targetType: 'moderation_flag',
      targetId: input.flagId,
      reason: input.resolution,
      after: { status: input.status },
      ...(await requestMetadata()),
    });

    revalidatePath('/admin/moderation');
    return undefined;
  });
}

// --- AI operations ---------------------------------------------------------

export async function retryAIJobAction(aiJobId: string): Promise<AdminActionResult> {
  return adminAction(Role.ADMIN, async (actor) => {
    const job = await prisma.aIJob.findUniqueOrThrow({
      where: { id: aiJobId },
      select: { jobId: true },
    });

    if (!job.jobId) throw new Error('That job has no queue entry to retry.');
    await retryJob(job.jobId);
    await prisma.aIJob.update({
      where: { id: aiJobId },
      data: { status: 'QUEUED', error: null },
    });

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.AI_JOB_RETRIED,
      targetType: 'ai_job',
      targetId: aiJobId,
      reason: 'Retried from the admin console',
      ...(await requestMetadata()),
    });

    revalidatePath('/admin/ai');
    return undefined;
  });
}

export async function cancelAIJobAction(aiJobId: string): Promise<AdminActionResult> {
  return adminAction(Role.ADMIN, async (actor) => {
    const job = await prisma.aIJob.findUniqueOrThrow({
      where: { id: aiJobId },
      select: { jobId: true },
    });

    if (job.jobId) await cancelJob(job.jobId);
    await prisma.aIJob.update({ where: { id: aiJobId }, data: { status: 'CANCELLED' } });

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.AI_JOB_CANCELLED,
      targetType: 'ai_job',
      targetId: aiJobId,
      reason: 'Cancelled from the admin console',
      ...(await requestMetadata()),
    });

    revalidatePath('/admin/ai');
    return undefined;
  });
}

// --- Prompt studio ---------------------------------------------------------

const PromptDraftSchema = z.object({
  templateId: z.string().min(1),
  versionId: z.string().optional(),
  systemPrompt: z.string().min(20).max(20_000),
  userTemplate: z.string().min(5).max(10_000),
  notes: z.string().max(1000).optional(),
});

export async function savePromptDraftAction(
  raw: unknown,
): Promise<AdminActionResult<{ versionId: string; version: number }>> {
  return adminAction(Role.ADMIN, async () => {
    const input = PromptDraftSchema.parse(raw);

    if (input.versionId) {
      const existing = await prisma.promptVersion.findUniqueOrThrow({
        where: { id: input.versionId },
      });
      // A published version is immutable — that is what makes attribution work.
      if (existing.isPublished) {
        throw new Error('A published version cannot be edited. Create a new draft instead.');
      }

      const updated = await prisma.promptVersion.update({
        where: { id: input.versionId },
        data: {
          systemPrompt: input.systemPrompt,
          userTemplate: input.userTemplate,
          notes: input.notes,
        },
      });
      return { versionId: updated.id, version: updated.version };
    }

    const latest = await prisma.promptVersion.findFirst({
      where: { templateId: input.templateId },
      orderBy: { version: 'desc' },
      select: { version: true, outputSchema: true },
    });

    const created = await prisma.promptVersion.create({
      data: {
        templateId: input.templateId,
        version: (latest?.version ?? 0) + 1,
        systemPrompt: input.systemPrompt,
        userTemplate: input.userTemplate,
        outputSchema: (latest?.outputSchema ?? {}) as never,
        notes: input.notes,
        isPublished: false,
      },
    });

    revalidatePath('/admin/prompts');
    return { versionId: created.id, version: created.version };
  });
}

export async function publishPromptVersionAction(input: {
  versionId: string;
  reason: string;
}): Promise<AdminActionResult> {
  return adminAction(Role.SUPER_ADMIN, async (actor) => {
    if (!input.reason.trim()) throw new Error('A reason is required to publish a prompt.');

    const version = await prisma.promptVersion.findUniqueOrThrow({
      where: { id: input.versionId },
      include: { template: { select: { id: true, key: true, publishedVersionId: true } } },
    });

    await prisma.$transaction([
      prisma.promptVersion.update({
        where: { id: input.versionId },
        data: { isPublished: true, publishedAt: new Date(), publishedBy: actor.id },
      }),
      prisma.promptTemplate.update({
        where: { id: version.template.id },
        data: { publishedVersionId: input.versionId },
      }),
    ]);

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.PROMPT_VERSION_PUBLISHED,
      targetType: 'prompt_version',
      targetId: input.versionId,
      reason: input.reason,
      before: { publishedVersionId: version.template.publishedVersionId },
      after: { publishedVersionId: input.versionId, key: version.template.key },
      ...(await requestMetadata()),
    });

    revalidatePath('/admin/prompts');
    return undefined;
  });
}

export async function rollbackPromptVersionAction(input: {
  templateId: string;
  versionId: string;
  reason: string;
}): Promise<AdminActionResult> {
  return adminAction(Role.SUPER_ADMIN, async (actor) => {
    if (!input.reason.trim()) throw new Error('A reason is required to roll back.');

    const template = await prisma.promptTemplate.findUniqueOrThrow({
      where: { id: input.templateId },
      select: { publishedVersionId: true },
    });

    await prisma.promptTemplate.update({
      where: { id: input.templateId },
      data: { publishedVersionId: input.versionId },
    });

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.PROMPT_VERSION_ROLLED_BACK,
      targetType: 'prompt_template',
      targetId: input.templateId,
      reason: input.reason,
      before: { publishedVersionId: template.publishedVersionId },
      after: { publishedVersionId: input.versionId },
      ...(await requestMetadata()),
    });

    revalidatePath('/admin/prompts');
    return undefined;
  });
}

/** Runs a draft prompt against a fixture. Never touches customer data. */
export async function testPromptAction(input: {
  versionId: string;
  fixtureId: string;
}): Promise<AdminActionResult<{ output: string; durationMs: number }>> {
  return adminAction(Role.ADMIN, async () => {
    const { runPromptFixtureTest } = await import('./prompt-testing');
    return runPromptFixtureTest(input.versionId, input.fixtureId);
  });
}

// --- Platform templates and capabilities -----------------------------------

const TemplateSchema = z.object({
  templateId: z.string().min(1),
  titleMaxLength: z.number().int().min(10).max(500),
  descriptionMaxLength: z.number().int().min(100).max(1_000_000),
  maxPhotos: z.number().int().min(1).max(50),
  maxHashtags: z.number().int().min(0).max(30),
  toneRules: z.string().min(10).max(4000),
  feePercentBps: z.number().int().min(0).max(10_000),
  feeFixedCents: z.number().int().min(0).max(100_000),
  guidance: z.string().max(2000).nullable().optional(),
});

export async function updatePlatformTemplateAction(raw: unknown): Promise<AdminActionResult> {
  return adminAction(Role.ADMIN, async (actor) => {
    const input = TemplateSchema.parse(raw);
    const { templateId, ...data } = input;

    const before = await prisma.platformTemplate.findUniqueOrThrow({ where: { id: templateId } });
    await prisma.platformTemplate.update({ where: { id: templateId }, data });

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.PLATFORM_TEMPLATE_UPDATED,
      targetType: 'platform_template',
      targetId: templateId,
      reason: 'Template updated from the admin console',
      before: { titleMaxLength: before.titleMaxLength, feePercentBps: before.feePercentBps },
      after: data,
      ...(await requestMetadata()),
    });

    revalidatePath('/admin/templates');
    return undefined;
  });
}

export async function updatePlatformCapabilityAction(input: {
  capabilityId: string;
  patch: Record<string, boolean | string | null>;
  reason: string;
}): Promise<AdminActionResult> {
  return adminAction(Role.SUPER_ADMIN, async (actor) => {
    if (!input.reason.trim()) throw new Error('A reason is required to change a capability.');

    const before = await prisma.platformCapability.findUniqueOrThrow({
      where: { id: input.capabilityId },
    });

    await prisma.platformCapability.update({
      where: { id: input.capabilityId },
      data: input.patch as never,
    });

    await recordAudit({
      actorId: actor.id,
      action: input.patch.killSwitch !== undefined
        ? AUDIT_ACTIONS.INTEGRATION_KILL_SWITCH
        : AUDIT_ACTIONS.PLATFORM_CAPABILITY_UPDATED,
      targetType: 'platform_capability',
      targetId: input.capabilityId,
      reason: input.reason,
      before: { canPublish: before.canPublish, killSwitch: before.killSwitch },
      after: input.patch,
      ...(await requestMetadata()),
    });

    revalidatePath('/admin/integrations');
    return undefined;
  });
}

// --- Plans -----------------------------------------------------------------

const PlanSchema = z.object({
  planId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(160).nullable().optional(),
  description: z.string().trim().max(600).nullable().optional(),
  creditsGranted: z.number().int().min(0).max(100_000),
  stripePriceId: z.string().trim().max(120).nullable().optional(),
  isVisible: z.boolean(),
  features: z.array(z.string().max(200)).max(12),
});

export async function updatePlanAction(raw: unknown): Promise<AdminActionResult> {
  return adminAction(Role.SUPER_ADMIN, async (actor) => {
    const input = PlanSchema.parse(raw);
    const { planId, features, ...rest } = input;

    const before = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });

    await prisma.plan.update({
      where: { id: planId },
      data: { ...rest, features: features as never },
    });

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.PLAN_UPDATED,
      targetType: 'plan',
      targetId: planId,
      reason: 'Plan updated from the admin console',
      before: { name: before.name, creditsGranted: before.creditsGranted, isVisible: before.isVisible },
      after: rest,
      ...(await requestMetadata()),
    });

    revalidatePath('/admin/plans');
    revalidatePath('/pricing');
    return undefined;
  });
}

// --- Content, emails, flags, settings --------------------------------------

export async function updateContentBlockAction(input: {
  key: string;
  title: string | null;
  body: string;
  isActive: boolean;
}): Promise<AdminActionResult> {
  return adminAction(Role.ADMIN, async (actor) => {
    const before = await prisma.contentBlock.findUnique({ where: { key: input.key } });

    await prisma.contentBlock.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        title: input.title,
        body: input.body,
        isActive: input.isActive,
        category: 'announcement',
      },
      update: {
        title: input.title,
        body: input.body,
        isActive: input.isActive,
        version: { increment: 1 },
      },
    });

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.CONTENT_UPDATED,
      targetType: 'content_block',
      targetId: input.key,
      reason: 'Content updated from the admin console',
      before: { isActive: before?.isActive },
      after: { isActive: input.isActive },
      ...(await requestMetadata()),
    });

    revalidatePath('/');
    revalidatePath('/admin/content');
    return undefined;
  });
}

export async function updateEmailTemplateAction(input: {
  key: string;
  subject: string;
  body: string;
  isActive: boolean;
}): Promise<AdminActionResult> {
  return adminAction(Role.ADMIN, async (actor) => {
    await prisma.emailTemplate.update({
      where: { key: input.key },
      data: { subject: input.subject, body: input.body, isActive: input.isActive },
    });

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.EMAIL_TEMPLATE_UPDATED,
      targetType: 'email_template',
      targetId: input.key,
      reason: 'Email template updated',
      ...(await requestMetadata()),
    });

    revalidatePath('/admin/emails');
    return undefined;
  });
}

export async function previewEmailAction(
  key: string,
): Promise<AdminActionResult<{ subject: string; html: string }>> {
  return adminAction(Role.SUPPORT, async () => {
    const rendered = await previewTemplateEmail(key as never);
    if (!rendered) throw new Error('That template does not exist.');
    return { subject: rendered.subject, html: rendered.html };
  });
}

export async function sendTestEmailAction(key: string): Promise<AdminActionResult> {
  return adminAction(Role.ADMIN, async (actor) => {
    // Test mail only ever goes to the admin performing the action.
    const result = await sendTemplateEmail({
      key: key as never,
      to: actor.email,
      userId: actor.id,
      force: true,
      tokens: { name: actor.name, actionUrl: `${process.env.APP_URL ?? ''}/app` },
    });

    if (!result.ok) throw new Error(result.error ?? 'The test email failed to send.');

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.EMAIL_TEST_SENT,
      targetType: 'email_template',
      targetId: key,
      reason: `Test email sent to ${actor.email}`,
      ...(await requestMetadata()),
    });

    return undefined;
  });
}

export async function updateFeatureFlagAction(input: {
  key: string;
  enabled: boolean;
  planKeys: string[];
}): Promise<AdminActionResult> {
  return adminAction(Role.ADMIN, async (actor) => {
    const before = await prisma.featureFlag.findUniqueOrThrow({ where: { key: input.key } });

    await prisma.featureFlag.update({
      where: { key: input.key },
      data: { enabled: input.enabled, planKeys: input.planKeys as never },
    });

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.FEATURE_FLAG_UPDATED,
      targetType: 'feature_flag',
      targetId: input.key,
      reason: 'Feature flag updated',
      before: { enabled: before.enabled },
      after: { enabled: input.enabled, planKeys: input.planKeys },
      ...(await requestMetadata()),
    });

    revalidatePath('/admin/flags');
    return undefined;
  });
}

export async function updateAppSettingsAction(
  patch: Partial<AppSettings>,
): Promise<AdminActionResult> {
  return adminAction(Role.SUPER_ADMIN, async (actor) => {
    const before = await import('@/server/settings').then((module) => module.getSettings());
    await updateSettings(patch);
    invalidateSettingsCache();

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.SETTINGS_UPDATED,
      targetType: 'app_settings',
      targetId: 'global',
      reason: 'Settings updated from the admin console',
      before: Object.fromEntries(
        Object.keys(patch).map((key) => [key, before[key as keyof AppSettings]]),
      ),
      after: patch,
      ...(await requestMetadata()),
    });

    revalidatePath('/admin/settings');
    revalidatePath('/');
    return undefined;
  });
}

// --- Webhooks --------------------------------------------------------------

export async function replayWebhookAction(input: {
  webhookEventId: string;
  reason: string;
}): Promise<AdminActionResult> {
  return adminAction(Role.SUPER_ADMIN, async (actor) => {
    if (!input.reason.trim()) throw new Error('A reason is required to replay a webhook.');

    const record = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: input.webhookEventId },
    });

    if (record.source !== 'STRIPE') {
      throw new Error('Only Stripe events can be replayed from here.');
    }

    // Re-fetch from Stripe rather than replaying a stored payload: our stored
    // summary is sanitised and deliberately incomplete.
    const { getStripe } = await import('@/server/billing/stripe');
    const event = await getStripe().events.retrieve(record.eventId);

    // Clear the processed marker so the handler runs again.
    await prisma.stripeEvent.updateMany({
      where: { stripeEventId: record.eventId },
      data: { status: 'RECEIVED', processedAt: null },
    });

    const outcome = await processStripeEvent(event);

    await recordAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.WEBHOOK_REPLAYED,
      targetType: 'webhook_event',
      targetId: input.webhookEventId,
      reason: input.reason,
      after: { status: outcome.status, detail: outcome.detail },
      ...(await requestMetadata()),
    });

    revalidatePath('/admin/webhooks');
    return undefined;
  });
}
