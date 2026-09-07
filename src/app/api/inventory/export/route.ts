import { NextResponse } from 'next/server';
import { requireApiWorkspace } from '@/server/session';
import { exportInventoryCsv, type InventorySort } from '@/server/inventory';
import { enforceRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import type { ItemStatus } from '@/generated/prisma/enums';

/** CSV of the caller's current inventory filter. Scoped to their workspace. */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiWorkspace();
    await enforceRateLimit('export', context.workspace.id);

    const params = new URL(request.url).searchParams;

    const csv = await exportInventoryCsv({
      workspaceId: context.workspace.id,
      search: params.get('q') ?? undefined,
      status: (params.get('status') as ItemStatus | 'ALL' | 'DELETED' | null) ?? 'ALL',
      category: params.get('category') ?? undefined,
      sort: (params.get('sort') as InventorySort | null) ?? 'recent',
    });

    const filename = `resellsnap-inventory-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    logger.warn('Inventory export denied', { error });
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }
}
