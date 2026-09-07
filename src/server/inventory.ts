/**
 * Inventory queries.
 *
 * Filtering, sorting and pagination all happen in PostgreSQL. Nothing loads the
 * whole table into memory, and every query is scoped to one workspace.
 */
import { ItemStatus, PlatformKey, Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';

export const INVENTORY_PAGE_SIZE = 24;

export type InventorySort = 'recent' | 'oldest' | 'title' | 'value_high' | 'value_low';

export interface InventoryQuery {
  workspaceId: string;
  search?: string;
  status?: ItemStatus | 'ALL' | 'DELETED';
  category?: string;
  platform?: PlatformKey;
  sort?: InventorySort;
  page?: number;
  pageSize?: number;
}

export interface InventoryRow {
  id: string;
  sku: string;
  title: string;
  status: ItemStatus;
  categoryHint: string | null;
  currency: string;
  thumbnailKey: string | null;
  priceCents: number | null;
  priceIsConfirmed: boolean;
  salePriceCents: number | null;
  soldAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  completeVariants: number;
  totalVariants: number;
  publishedPlatforms: PlatformKey[];
}

export interface InventoryResult {
  rows: InventoryRow[];
  total: number;
  page: number;
  pageCount: number;
  statusCounts: Record<string, number>;
}

function orderBy(sort: InventorySort): Prisma.ItemOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' }];
    case 'title':
      return [{ title: 'asc' }];
    // Value sorting is approximated by acquisition cost, then recency — the
    // suggested price lives on a related table and cannot be ordered on
    // directly without a join that would slow every other query.
    case 'value_high':
      return [{ acquisitionCostCents: 'desc' }, { updatedAt: 'desc' }];
    case 'value_low':
      return [{ acquisitionCostCents: 'asc' }, { updatedAt: 'desc' }];
    default:
      return [{ updatedAt: 'desc' }];
  }
}

export async function queryInventory(query: InventoryQuery): Promise<InventoryResult> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = query.pageSize ?? INVENTORY_PAGE_SIZE;

  const where: Prisma.ItemWhereInput = {
    workspaceId: query.workspaceId,
    deletedAt: query.status === 'DELETED' ? { not: null } : null,
  };

  if (query.status && query.status !== 'ALL' && query.status !== 'DELETED') {
    where.status = query.status;
  }
  if (query.category) where.categoryHint = query.category;
  if (query.platform) {
    where.externalListings = { some: { platform: query.platform } };
  }
  if (query.search?.trim()) {
    const term = query.search.trim();
    where.OR = [
      { title: { contains: term, mode: 'insensitive' } },
      { sku: { contains: term, mode: 'insensitive' } },
      { notes: { contains: term, mode: 'insensitive' } },
      { facts: { some: { value: { contains: term, mode: 'insensitive' } } } },
    ];
  }

  const [items, total, statusGroups] = await Promise.all([
    prisma.item.findMany({
      where,
      orderBy: orderBy(query.sort ?? 'recent'),
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        sku: true,
        title: true,
        status: true,
        categoryHint: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
        soldAt: true,
        deletedAt: true,
        photos: {
          where: { status: 'PROCESSED' },
          orderBy: { position: 'asc' },
          take: 1,
          select: { thumbnailKey: true },
        },
        priceSuggestions: {
          where: { strategy: 'BALANCED' },
          select: { amountCents: true, userEdited: true },
          take: 1,
        },
        saleRecord: { select: { salePriceCents: true } },
        listing: { select: { variants: { select: { isComplete: true } } } },
        externalListings: { select: { platform: true }, where: { state: 'ACTIVE' } },
      },
    }),
    prisma.item.count({ where }),
    prisma.item.groupBy({
      by: ['status'],
      where: { workspaceId: query.workspaceId, deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const statusCounts: Record<string, number> = { ALL: 0 };
  let allCount = 0;
  for (const group of statusGroups) {
    statusCounts[group.status] = group._count._all;
    allCount += group._count._all;
  }
  statusCounts.ALL = allCount;

  return {
    rows: items.map((item) => ({
      id: item.id,
      sku: item.sku,
      title: item.title,
      status: item.status,
      categoryHint: item.categoryHint,
      currency: item.currency,
      thumbnailKey: item.photos[0]?.thumbnailKey ?? null,
      priceCents: item.priceSuggestions[0]?.amountCents ?? null,
      priceIsConfirmed: item.priceSuggestions[0]?.userEdited ?? false,
      salePriceCents: item.saleRecord?.salePriceCents ?? null,
      soldAt: item.soldAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      deletedAt: item.deletedAt,
      completeVariants: item.listing?.variants.filter((variant) => variant.isComplete).length ?? 0,
      totalVariants: item.listing?.variants.length ?? 0,
      publishedPlatforms: item.externalListings.map((listing) => listing.platform),
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    statusCounts,
  };
}

/** CSV export of the current filter, streamed rather than paginated. */
export async function exportInventoryCsv(query: Omit<InventoryQuery, 'page' | 'pageSize'>): Promise<string> {
  const result = await queryInventory({ ...query, page: 1, pageSize: 5000 });

  const header = [
    'sku', 'title', 'status', 'category', 'currency',
    'suggested_price', 'price_confirmed', 'sale_price', 'sold_at',
    'drafts_complete', 'drafts_total', 'created_at', 'updated_at',
  ];

  const escape = (value: string | number | null): string => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    // Neutralise spreadsheet formula injection before quoting.
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };

  const lines = [header.join(',')];
  for (const row of result.rows) {
    lines.push(
      [
        row.sku,
        row.title,
        row.status,
        row.categoryHint ?? '',
        row.currency,
        row.priceCents === null ? '' : (row.priceCents / 100).toFixed(2),
        row.priceIsConfirmed ? 'yes' : 'no',
        row.salePriceCents === null ? '' : (row.salePriceCents / 100).toFixed(2),
        row.soldAt?.toISOString() ?? '',
        row.completeVariants,
        row.totalVariants,
        row.createdAt.toISOString(),
        row.updatedAt.toISOString(),
      ]
        .map(escape)
        .join(','),
    );
  }

  return `${lines.join('\n')}\n`;
}
