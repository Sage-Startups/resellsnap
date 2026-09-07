import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isAIConfigured, isStorageConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Readiness probe for the Railway health check.
 *
 * Verifies the dependencies a request actually needs. Returns 503 when the
 * database is unreachable so the platform stops routing traffic here; optional
 * integrations are reported but never fail the check.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const checks: Record<string, { ok: boolean; detail: string }> = {};
  let ready = true;

  try {
    const startedAt = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true, detail: `${Date.now() - startedAt}ms` };
  } catch (error) {
    ready = false;
    checks.database = { ok: false, detail: 'unreachable' };
    logger.error('Readiness check failed: database unreachable', { error });
  }

  const storageConfigured = isStorageConfigured();
  checks.storage = {
    ok: storageConfigured,
    detail: storageConfigured ? 'configured' : 'not configured',
  };
  if (!storageConfigured) ready = false;

  // AI is reported but does not gate readiness: the app is still useful for
  // inventory, exports and billing while a provider is down.
  checks.ai = { ok: isAIConfigured(), detail: isAIConfigured() ? 'configured' : 'not configured' };

  return NextResponse.json(
    { status: ready ? 'ready' : 'not_ready', checks, timestamp: new Date().toISOString() },
    { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
