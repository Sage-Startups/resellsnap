import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { requireApiWorkspace } from '@/server/session';
import { assertKeyInWorkspace, getStorage } from '@/server/storage';
import { getSettings } from '@/server/settings';

/**
 * Upload endpoint for the local filesystem storage driver.
 *
 * Production uses presigned direct-to-bucket uploads and never reaches this
 * route; it exists so development and CI can exercise the same wizard without
 * cloud credentials. It refuses to run when the S3 driver is configured, and
 * refuses to run in production at all.
 */
function assertLocalDriver(): void {
  const env = getEnv();
  if (env.isProduction || env.STORAGE_DRIVER !== 'local') {
    throw new Error('The local upload route is only available with the local storage driver.');
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    assertLocalDriver();

    const context = await requireApiWorkspace();
    const key = new URL(request.url).searchParams.get('key');
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

    // The key was minted by the server; this proves it belongs to the caller.
    assertKeyInWorkspace(key, context.workspace.id);

    const settings = await getSettings();
    const body = Buffer.from(await request.arrayBuffer());

    if (body.byteLength === 0) {
      return NextResponse.json({ error: 'Empty body' }, { status: 400 });
    }
    if (body.byteLength > settings.maxUploadBytes) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 });
    }

    await getStorage().putObject(
      key,
      body,
      request.headers.get('content-type') ?? 'application/octet-stream',
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.warn('Local upload rejected', { error });
    return NextResponse.json({ error: 'Upload rejected' }, { status: 403 });
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    assertLocalDriver();

    const context = await requireApiWorkspace();
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

    assertKeyInWorkspace(key, context.workspace.id);

    const body = await getStorage().getObject(key);
    const filename = url.searchParams.get('filename');

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': key.endsWith('.webp')
          ? 'image/webp'
          : key.endsWith('.zip')
            ? 'application/zip'
            : 'image/jpeg',
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'private, no-store',
        ...(filename
          ? { 'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"` }
          : {}),
      },
    });
  } catch (error) {
    logger.warn('Local download rejected', { error });
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }
}
