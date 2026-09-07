import { NextResponse } from 'next/server';

/**
 * Liveness probe.
 *
 * Answers one question: is this process running and able to serve a request?
 * It deliberately touches no dependency — a database blip should not cause the
 * platform to restart a perfectly healthy container. Use `/api/ready` for that.
 */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return NextResponse.json(
    { status: 'ok', service: 'web', timestamp: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
