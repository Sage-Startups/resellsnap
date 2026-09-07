/**
 * Dependency health checks.
 *
 * Reports whether each service is configured and reachable — never the value of
 * a secret. "Configured" and "working" are different questions and both are
 * answered separately.
 */
import { prisma } from '@/lib/db';
import {
  getEnv, isEbayConfigured, isGoogleOAuthConfigured, isOpenAIConfigured, isStripeConfigured,
} from '@/lib/env';
import { sanitizeError } from '@/lib/logger';
import { getStorage } from '@/server/storage';
import { getAIProvider } from '@/server/ai';
import { stripeHealthCheck } from '@/server/billing/stripe';
import { getEmailProvider } from '@/server/email';

export interface HealthCheck {
  name: string;
  ok: boolean;
  required: boolean;
  detail: string;
  latencyMs?: number;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const startedAt = Date.now();
  const result = await fn();
  return { result, latencyMs: Date.now() - startedAt };
}

export async function runHealthChecks(): Promise<HealthCheck[]> {
  const env = getEnv();
  const checks: HealthCheck[] = [];

  // Database
  try {
    const { latencyMs } = await timed(() => prisma.$queryRaw`SELECT 1`);
    checks.push({
      name: 'PostgreSQL',
      ok: true,
      required: true,
      detail: 'Connected and responding',
      latencyMs,
    });
  } catch (error) {
    checks.push({
      name: 'PostgreSQL',
      ok: false,
      required: true,
      detail: sanitizeError(error, 'Unreachable'),
    });
  }

  // Storage
  try {
    const { result, latencyMs } = await timed(() => getStorage().healthCheck());
    checks.push({
      name: `Object storage (${getStorage().name})`,
      ok: result.ok,
      required: true,
      detail: result.detail,
      latencyMs,
    });
  } catch (error) {
    checks.push({
      name: 'Object storage',
      ok: false,
      required: true,
      detail: sanitizeError(error, 'Unreachable'),
    });
  }

  // AI
  if (isOpenAIConfigured() || env.AI_PROVIDER === 'fake') {
    try {
      const { result, latencyMs } = await timed(() => getAIProvider().healthCheck());
      checks.push({
        name: `AI provider (${env.AI_PROVIDER})`,
        ok: result.ok,
        required: true,
        detail: result.detail,
        latencyMs,
      });
    } catch (error) {
      checks.push({
        name: 'AI provider',
        ok: false,
        required: true,
        detail: sanitizeError(error, 'Unreachable'),
      });
    }
  } else {
    checks.push({
      name: 'AI provider',
      ok: false,
      required: true,
      detail: 'OPENAI_API_KEY is not set. Customers see an unavailable state rather than fixtures.',
    });
  }

  // Stripe
  if (isStripeConfigured()) {
    const { result, latencyMs } = await timed(() => stripeHealthCheck());
    checks.push({
      name: 'Stripe',
      ok: result.ok,
      required: false,
      detail: result.detail,
      latencyMs,
    });
  } else {
    checks.push({
      name: 'Stripe',
      ok: false,
      required: false,
      detail: 'Not configured. Plans and credit packs cannot be purchased.',
    });
  }

  // Email
  const emailProvider = getEmailProvider();
  checks.push({
    name: `Email (${emailProvider.name})`,
    ok: emailProvider.isConfigured(),
    required: true,
    detail: emailProvider.isConfigured()
      ? 'Provider configured'
      : 'RESEND_API_KEY is not set. Verification and reset emails will fail.',
  });

  // eBay
  checks.push({
    name: 'eBay API',
    ok: isEbayConfigured(),
    required: false,
    detail: isEbayConfigured()
      ? `Credentials present (${env.EBAY_ENVIRONMENT} environment, marketplace ${env.EBAY_MARKETPLACE_ID})`
      : 'Not configured. Sellers get the export workflow instead of direct publishing.',
  });

  // Google OAuth
  checks.push({
    name: 'Google sign-in',
    ok: isGoogleOAuthConfigured(),
    required: false,
    detail: isGoogleOAuthConfigured()
      ? 'Configured; the button is shown on sign-in'
      : 'Not configured; the button is hidden',
  });

  // Worker liveness, inferred from recent job completion.
  try {
    const recent = await prisma.job.findFirst({
      where: { finishedAt: { gte: new Date(Date.now() - 15 * 60_000) } },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true },
    });
    const queued = await prisma.job.count({ where: { status: 'QUEUED' } });

    checks.push({
      name: 'Background worker',
      // No recent completions is only a problem if work is waiting.
      ok: recent !== null || queued === 0,
      required: true,
      detail: recent
        ? `Last job finished ${Math.round((Date.now() - recent.finishedAt!.getTime()) / 60_000)} minutes ago`
        : queued === 0
          ? 'Idle with an empty queue'
          : `${queued} jobs are waiting and nothing has completed in 15 minutes — is the worker service running?`,
    });
  } catch {
    checks.push({
      name: 'Background worker',
      ok: false,
      required: true,
      detail: 'Could not read queue state',
    });
  }

  // Sentry
  checks.push({
    name: 'Error reporting',
    ok: Boolean(env.SENTRY_DSN),
    required: false,
    detail: env.SENTRY_DSN ? 'SENTRY_DSN is configured' : 'Not configured (optional)',
  });

  return checks;
}
