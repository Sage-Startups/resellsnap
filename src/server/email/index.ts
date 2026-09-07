/**
 * Email delivery.
 *
 * `EmailProvider` keeps Resend at arm's length: swapping providers means adding
 * one file, not touching the product. In development the console provider logs
 * safe preview metadata — never a reset token, never a full URL in production.
 */
import { Resend } from 'resend';
import { EmailStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { getEnv, isResendConfigured } from '@/lib/env';
import { logger, sanitizeError } from '@/lib/logger';
import { getSettings } from '../settings';
import { EMAIL_DEFINITIONS, findEmailDefinition, type EmailKey } from './templates';
import { interpolate, renderEmail, type RenderedEmail } from './render';

export * from './templates';
export { renderEmail, interpolate } from './render';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface EmailProvider {
  readonly name: string;
  isConfigured(): boolean;
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

class ResendProvider implements EmailProvider {
  readonly name = 'resend';
  #client: Resend | null = null;

  isConfigured(): boolean {
    return Boolean(getEnv().RESEND_API_KEY);
  }

  #resend(): Resend {
    this.#client ??= new Resend(getEnv().RESEND_API_KEY);
    return this.#client;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Resend is not configured (RESEND_API_KEY missing)' };
    }
    try {
      const response = await this.#resend().emails.send({
        from: getEnv().EMAIL_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      if (response.error) return { ok: false, error: response.error.message };
      return { ok: true, providerMessageId: response.data?.id };
    } catch (error) {
      return { ok: false, error: sanitizeError(error, 'Resend request failed') };
    }
  }
}

/**
 * Development capture. Logs only the recipient domain, subject and a token
 * count so a shoulder-surfer (or a log aggregator) never sees a live reset URL.
 * The full body is written to `.mail/` when `EMAIL_CAPTURE_DIR` is set.
 */
class ConsoleProvider implements EmailProvider {
  readonly name = 'console';

  isConfigured(): boolean {
    return true;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const env = getEnv();
    const id = `console_${Date.now().toString(36)}`;

    if (env.isProduction) {
      // Refuse to silently swallow production mail.
      return { ok: false, error: 'Console email provider is not permitted in production' };
    }

    logger.info('Email captured (console provider)', {
      to: input.to.replace(/^[^@]+/, '***'),
      subject: input.subject,
      provider: 'console',
      messageId: id,
    });

    const dir = process.env.EMAIL_CAPTURE_DIR;
    if (dir) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const path = await import('node:path');
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, `${id}.html`),
        `<!-- to: ${input.to}\n     subject: ${input.subject} -->\n${input.html}`,
        'utf8',
      );
    }

    return { ok: true, providerMessageId: id };
  }
}

let provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (provider) return provider;
  provider = getEnv().EMAIL_PROVIDER === 'console' ? new ConsoleProvider() : new ResendProvider();
  return provider;
}

/** Test seam. */
export function setEmailProviderForTests(next: EmailProvider | null): void {
  provider = next;
}

export function isEmailConfigured(): boolean {
  return isResendConfigured();
}

export interface SendTemplateInput {
  key: EmailKey;
  to: string;
  userId?: string | null;
  tokens?: Record<string, string | number>;
  /** Skips the notification-preference check. Only for previews and tests. */
  force?: boolean;
}

/**
 * Resolves a template (database override first, code definition second),
 * renders it, sends it and records the attempt in `EmailLog`.
 */
export async function sendTemplateEmail(input: SendTemplateInput): Promise<SendEmailResult> {
  const definition = findEmailDefinition(input.key);
  if (!definition) {
    logger.error('Unknown email template requested', { key: input.key });
    return { ok: false, error: `Unknown email template: ${input.key}` };
  }

  const settings = await getSettings();
  const env = getEnv();

  const record = await prisma.emailTemplate.findUnique({ where: { key: input.key } });
  if (record && !record.isActive) {
    logger.info('Email template disabled; skipping send', { key: input.key });
    return { ok: true };
  }

  const isEssential = record?.isEssential ?? definition.isEssential;

  if (!isEssential && !input.force && input.userId) {
    const allowed = await isOptedIn(input.userId, input.key);
    if (!allowed) {
      await log({ ...input, subject: '(suppressed)', status: EmailStatus.SUPPRESSED });
      return { ok: true };
    }
  }

  const tokens: Record<string, string | number> = {
    brandName: settings.brandName,
    supportEmail: settings.supportEmail,
    appUrl: env.APP_URL,
    ...input.tokens,
  };

  const rendered: RenderedEmail = renderEmail({
    subject: interpolate(record?.subject ?? definition.subject, tokens),
    body: interpolate(record?.body ?? definition.body, tokens),
    brandName: settings.brandName,
    appUrl: env.APP_URL,
    supportEmail: settings.supportEmail,
  });

  const result = await getEmailProvider().send({
    to: input.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  await log({
    ...input,
    subject: rendered.subject,
    templateId: record?.id,
    status: result.ok ? EmailStatus.SENT : EmailStatus.FAILED,
    providerMessageId: result.providerMessageId,
    error: result.error,
  });

  if (!result.ok) {
    logger.error('Email send failed', { key: input.key, error: result.error });
  }

  return result;
}

/** Renders a template without sending — used by the admin preview screen. */
export async function previewTemplateEmail(
  key: EmailKey,
  tokens: Record<string, string | number> = {},
): Promise<RenderedEmail | null> {
  const definition = findEmailDefinition(key);
  if (!definition) return null;

  const settings = await getSettings();
  const env = getEnv();
  const record = await prisma.emailTemplate.findUnique({ where: { key } });

  const sampleTokens: Record<string, string | number> = {
    brandName: settings.brandName,
    supportEmail: settings.supportEmail,
    name: 'Sample Seller',
    actionUrl: `${env.APP_URL}/app`,
    itemTitle: 'Cream leather trainers',
    reason: 'The AI provider timed out after 3 attempts',
    credits: 3,
    planName: 'Starter',
    endDate: 'the end of the current period',
    platformName: 'eBay',
    retentionDays: 30,
    ...tokens,
  };

  return renderEmail({
    subject: interpolate(record?.subject ?? definition.subject, sampleTokens),
    body: interpolate(record?.body ?? definition.body, sampleTokens),
    brandName: settings.brandName,
    appUrl: env.APP_URL,
    supportEmail: settings.supportEmail,
  });
}

async function isOptedIn(userId: string, key: EmailKey): Promise<boolean> {
  const preference = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!preference) return true;

  switch (key) {
    case 'generation_complete':
      return preference.emailGenerationComplete;
    case 'generation_failed':
      return preference.emailGenerationFailed;
    case 'low_credits':
      return preference.emailLowCredits;
    case 'welcome':
      return true;
    default:
      return true;
  }
}

async function log(input: {
  key: EmailKey;
  to: string;
  userId?: string | null;
  subject: string;
  templateId?: string;
  status?: EmailStatus;
  providerMessageId?: string;
  error?: string;
}): Promise<void> {
  // Better Auth sends the verification email from inside the sign-up
  // transaction, so the user row may not be visible to this connection yet.
  // Recording the log without the association beats failing the send.
  let userId = input.userId ?? null;
  if (userId) {
    const exists = await prisma.user
      .findUnique({ where: { id: userId }, select: { id: true } })
      .catch(() => null);
    if (!exists) userId = null;
  }

  try {
    await prisma.emailLog.create({
      data: {
        templateKey: input.key,
        templateId: input.templateId,
        userId,
        toEmail: input.to,
        subject: input.subject,
        status: input.status ?? EmailStatus.QUEUED,
        provider: getEmailProvider().name,
        providerMessageId: input.providerMessageId,
        error: input.error,
      },
    });
  } catch (error) {
    logger.error('Failed to write email log', { key: input.key, error });
  }
}

export function allEmailDefinitions() {
  return EMAIL_DEFINITIONS;
}
