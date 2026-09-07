import { NextResponse } from 'next/server';
import { Role } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { requireApiStaff } from '@/server/session';

/** CSV of the credit ledger for finance reconciliation. Admin and above. */
export async function GET(): Promise<Response> {
  try {
    await requireApiStaff(Role.ADMIN);

    const entries = await prisma.creditLedger.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20_000,
      include: {
        workspace: { select: { name: true, slug: true } },
        actor: { select: { email: true } },
      },
    });

    const escape = (value: string | number | null): string => {
      if (value === null || value === undefined) return '';
      const text = String(value);
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };

    const header = [
      'created_at', 'workspace', 'workspace_slug', 'kind', 'bucket',
      'delta', 'balance_after', 'reason', 'actor', 'idempotency_key',
    ];

    const lines = [header.join(',')];
    for (const entry of entries) {
      lines.push(
        [
          entry.createdAt.toISOString(),
          entry.workspace.name,
          entry.workspace.slug,
          entry.kind,
          entry.bucket,
          entry.delta,
          entry.balanceAfter,
          entry.reason ?? '',
          entry.actor?.email ?? '',
          entry.idempotencyKey,
        ]
          .map(escape)
          .join(','),
      );
    }

    return new NextResponse(`${lines.join('\n')}\n`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="credit-ledger-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    logger.warn('Credit export denied', { error });
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }
}
