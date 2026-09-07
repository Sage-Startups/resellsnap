import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Boxes, Download, Plus, RotateCcw } from 'lucide-react';
import {
  Badge, Button, Card, CardContent, EmptyState, PageHeader, Skeleton,
} from '@/components/ui';
import { ItemThumbnail } from '@/components/app/item-thumbnail';
import { ItemStatusBadge } from '@/components/app/status-badge';
import { InventoryFilters } from './inventory-filters';
import { RestoreItemButton } from './restore-item-button';
import { requireWorkspace } from '@/server/session';
import { queryInventory, type InventorySort } from '@/server/inventory';
import { formatMoney } from '@/lib/money';
import { relativeTime, titleCase } from '@/lib/utils';
import type { ItemStatus } from '@/lib/enums';

export const metadata: Metadata = { title: 'Inventory' };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const context = await requireWorkspace();
  const params = await searchParams;

  const result = await queryInventory({
    workspaceId: context.workspace.id,
    search: params.q,
    status: (params.status as ItemStatus | 'ALL' | 'DELETED' | undefined) ?? 'ALL',
    category: params.category,
    sort: (params.sort as InventorySort | undefined) ?? 'recent',
    page: Number(params.page ?? 1) || 1,
  });

  const exportQuery = new URLSearchParams(
    Object.entries(params).filter(([, value]) => Boolean(value)) as [string, string][],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory"
        description="Every item you have created, with one internal SKU per physical thing across all four marketplaces."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`/api/inventory/export?${exportQuery.toString()}`}>
                <Download />
                Export CSV
              </a>
            </Button>
            <Button asChild variant="primary">
              <Link href="/app/items/new">
                <Plus />
                New listing
              </Link>
            </Button>
          </>
        }
      />

      <Suspense fallback={<Skeleton className="h-24" />}>
        <InventoryFilters statusCounts={result.statusCounts} />
      </Suspense>

      {result.rows.length === 0 ? (
        <EmptyState
          icon={<Boxes className="size-7" />}
          title={params.q || params.status ? 'Nothing matches those filters' : 'No items yet'}
          description={
            params.q || params.status
              ? 'Try a different search, or clear the filters to see everything.'
              : 'Photograph something you want to sell and we will write the listings for all four marketplaces.'
          }
          action={
            <Button asChild variant="primary">
              <Link href="/app/items/new">Create my first listing</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <caption className="sr-only">
                  Inventory items, {result.total} in total
                </caption>
                <thead className="border-b border-stone-200 bg-stone-50">
                  <tr>
                    {['Item', 'Status', 'Drafts', 'Price', 'Updated', ''].map((heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {result.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-stone-50">
                      <td className="px-4 py-3">
                        <Link href={`/app/items/${row.id}`} className="flex items-center gap-3">
                          <ItemThumbnail objectKey={row.thumbnailKey} alt="" size={40} />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-ink">
                              {row.title}
                            </span>
                            <span className="block text-[11px] text-muted">
                              {row.sku}
                              {row.categoryHint ? ` · ${titleCase(row.categoryHint)}` : ''}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <ItemStatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-[12px] tabular-nums text-muted">
                        {row.totalVariants === 0
                          ? '—'
                          : `${row.completeVariants}/${row.totalVariants}`}
                      </td>
                      <td className="px-4 py-3">
                        {row.salePriceCents !== null ? (
                          <span className="text-[13px] font-medium tabular-nums text-success">
                            {formatMoney(row.salePriceCents, row.currency)}
                          </span>
                        ) : row.priceCents !== null ? (
                          <span className="text-[13px] tabular-nums text-ink">
                            {formatMoney(row.priceCents, row.currency)}
                            {!row.priceIsConfirmed ? (
                              <span className="ml-1 text-[10px] text-subtle">suggested</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-[12px] text-subtle">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-muted">
                        {relativeTime(row.updatedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.deletedAt ? (
                          <RestoreItemButton itemId={row.id} />
                        ) : (
                          <Link
                            href={`/app/items/${row.id}`}
                            className="text-[12px] text-muted underline-offset-4 hover:text-ink hover:underline"
                          >
                            Open
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {result.rows.map((row) => (
              <li key={row.id}>
                <Card>
                  <CardContent className="p-3">
                    <Link href={`/app/items/${row.id}`} className="flex gap-3">
                      <ItemThumbnail objectKey={row.thumbnailKey} alt="" size={56} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">{row.title}</p>
                        <p className="mt-0.5 text-[11px] text-muted">{row.sku}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <ItemStatusBadge status={row.status} />
                          {row.priceCents !== null ? (
                            <Badge tone="neutral">
                              {formatMoney(row.salePriceCents ?? row.priceCents, row.currency)}
                            </Badge>
                          ) : null}
                          {row.totalVariants > 0 ? (
                            <Badge tone="neutral">
                              {row.completeVariants}/{row.totalVariants} drafts
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                    {row.deletedAt ? (
                      <div className="mt-2 border-t border-stone-200 pt-2">
                        <RestoreItemButton itemId={row.id} />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          {result.pageCount > 1 ? (
            <nav
              aria-label="Pagination"
              className="flex items-center justify-between border-t border-stone-200 pt-4"
            >
              <p className="text-[12px] text-muted">
                Page {result.page} of {result.pageCount} · {result.total} items
              </p>
              <div className="flex gap-2">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className={result.page <= 1 ? 'pointer-events-none opacity-40' : ''}
                >
                  <Link href={pageHref(params, result.page - 1)}>Previous</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className={result.page >= result.pageCount ? 'pointer-events-none opacity-40' : ''}
                >
                  <Link href={pageHref(params, result.page + 1)}>Next</Link>
                </Button>
              </div>
            </nav>
          ) : null}
        </>
      )}

      {params.status === 'DELETED' ? (
        <p className="flex items-center gap-2 text-[12px] text-muted">
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Deleted items stay recoverable for a limited period, then they and their photos are
          permanently removed.
        </p>
      ) : null}
    </div>
  );
}

function pageHref(params: Record<string, string | undefined>, page: number): string {
  const next = new URLSearchParams(
    Object.entries(params).filter(([key, value]) => key !== 'page' && Boolean(value)) as [
      string,
      string,
    ][],
  );
  if (page > 1) next.set('page', String(page));
  const query = next.toString();
  return query ? `/app/inventory?${query}` : '/app/inventory';
}
