/**
 * Audit log.
 *
 * Every privileged mutation writes one row: who, what, which target, why, and
 * a before/after snapshot with sensitive values stripped. Writing the log must
 * never fail the operation it is describing, so errors here are logged and
 * swallowed.
 */
import { prisma } from '@/lib/db';
import { logger, redact } from '@/lib/logger';

export const AUDIT_ACTIONS = {
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_SUSPENDED: 'user.suspended',
  USER_REACTIVATED: 'user.reactivated',
  USER_PASSWORD_RESET_SENT: 'user.password_reset_sent',
  USER_DELETION_REQUESTED: 'user.deletion_requested',
  USER_EXPORTED: 'user.exported',
  CREDITS_ADJUSTED: 'credits.adjusted',
  ITEM_SOFT_DELETED: 'item.soft_deleted',
  ITEM_RESTORED: 'item.restored',
  ITEM_CONTENT_REMOVED: 'item.content_removed',
  PROMPT_VERSION_PUBLISHED: 'prompt.version_published',
  PROMPT_VERSION_ROLLED_BACK: 'prompt.version_rolled_back',
  PLATFORM_TEMPLATE_UPDATED: 'platform.template_updated',
  PLATFORM_CAPABILITY_UPDATED: 'platform.capability_updated',
  PLAN_UPDATED: 'plan.updated',
  SETTINGS_UPDATED: 'settings.updated',
  FEATURE_FLAG_UPDATED: 'feature_flag.updated',
  CONTENT_UPDATED: 'content.updated',
  EMAIL_TEMPLATE_UPDATED: 'email_template.updated',
  EMAIL_TEST_SENT: 'email.test_sent',
  MODERATION_RESOLVED: 'moderation.resolved',
  WEBHOOK_REPLAYED: 'webhook.replayed',
  AI_JOB_RETRIED: 'ai_job.retried',
  AI_JOB_CANCELLED: 'ai_job.cancelled',
  INTEGRATION_KILL_SWITCH: 'integration.kill_switch',
  IMPERSONATION_STARTED: 'impersonation.started',
  IMPERSONATION_ENDED: 'impersonation.ended',
  CONNECTION_DISCONNECTED: 'connection.disconnected',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditInput {
  actorId?: string | null;
  action: AuditAction | string;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  before?: unknown;
  after?: unknown;
}

function snapshot(value: unknown): object | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') return { value: String(value) };
  return redact(value as Record<string, unknown>);
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        reason: input.reason ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent?.slice(0, 400) ?? null,
        beforeData: snapshot(input.before) as never,
        afterData: snapshot(input.after) as never,
      },
    });
  } catch (error) {
    logger.error('Failed to write audit log entry', { action: input.action, error });
  }
}
