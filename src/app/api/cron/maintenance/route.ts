import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { logger, sanitizeError } from '@/lib/logger';
import { safeEqual } from '@/lib/crypto';
import { runMaintenance } from '@/server/jobs/maintenance';

/**
 * HTTP entry point for scheduled maintenance.
 *
 * The Railway Cron service normally runs `pnpm maintenance` directly, which
 * needs no secret at all. This route exists for platforms that can only make an
 * HTTP call, and is protected by `CRON_SECRET` compared in constant time.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();

  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured; this endpoint is disabled.' },
      { status: 503 },
    );
  }

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!provided || !safeEqual(provided, env.CRON_SECRET)) {
    logger.warn('Rejected an unauthorised maintenance trigger');
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  try {
    const report = await runMaintenance();
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    logger.error('Scheduled maintenance failed', { error });
    return NextResponse.json(
      { ok: false, error: sanitizeError(error, 'Maintenance failed') },
      { status: 500 },
    );
  }
}
