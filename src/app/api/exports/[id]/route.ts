import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { requireApiWorkspace } from '@/server/session';
import { assertKeyInWorkspace, getStorage } from '@/server/storage';

/**
 * Streams a generated export artifact to its owner.
 *
 * Ownership is checked against the session's workspace, and the artifact's
 * expiry is honoured even if the cleanup job has not yet swept it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const context = await requireApiWorkspace();
    const { id } = await params;

    const artifact = await prisma.downloadArtifact.findFirst({
      where: { id, exportJob: { workspaceId: context.workspace.id } },
      select: { objectKey: true, filename: true, contentType: true, expiresAt: true },
    });

    if (!artifact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (artifact.expiresAt < new Date()) {
      return NextResponse.json({ error: 'This download has expired' }, { status: 410 });
    }

    assertKeyInWorkspace(artifact.objectKey, context.workspace.id);
    const body = await getStorage().getObject(artifact.objectKey);

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': artifact.contentType,
        'Content-Length': String(body.byteLength),
        'Content-Disposition': `attachment; filename="${artifact.filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logger.warn('Export download denied', { error });
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }
}
