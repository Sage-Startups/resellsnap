import { NextResponse } from 'next/server';
import { getStorage, assertKeyInWorkspace } from '@/server/storage';
import { requireApiWorkspace } from '@/server/session';
import { logger } from '@/lib/logger';

/**
 * Serves a private photo to its owner.
 *
 * The workspace is taken from the *session*, never from the request, and the
 * object key must demonstrably belong to it. A key leaked from another tenant
 * is therefore useless.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiWorkspace();
    const key = new URL(request.url).searchParams.get('key');

    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

    assertKeyInWorkspace(key, context.workspace.id);

    const storage = getStorage();
    const info = await storage.head(key);
    if (!info) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await storage.getObject(key);
    const contentType = key.endsWith('.webp')
      ? 'image/webp'
      : key.endsWith('.png')
        ? 'image/png'
        : 'image/jpeg';

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(body.byteLength),
        // Private: a shared cache must never hold another seller's photo.
        'Cache-Control': 'private, max-age=300, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const status =
      error && typeof error === 'object' && 'status' in error ? Number(error.status) : 403;
    logger.warn('Photo request denied', { status });
    return NextResponse.json({ error: 'Not available' }, { status: status === 401 ? 401 : 403 });
  }
}
