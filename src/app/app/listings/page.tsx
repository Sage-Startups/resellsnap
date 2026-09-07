import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, Tags } from 'lucide-react';
import {
  Badge, Button, Card, CardContent, EmptyState, PageHeader,
} from '@/components/ui';
import { ItemThumbnail } from '@/components/app/item-thumbnail';
import { ItemStatusBadge } from '@/components/app/status-badge';
import { prisma } from '@/lib/db';
import { requireWorkspace } from '@/server/session';
import { PLATFORM_NAMES } from '@/server/marketplace/registry';
import { relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Listings' };

/**
 * Listings is the per-platform view: one row per draft, so a seller can see
 * which marketplaces an item is actually live on and which drafts still need
 * finishing.
 */
export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const context = await requireWorkspace();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const pageSize = 25;

  const [variants, total] = await Promise.all([
    prisma.listingVariant.findMany({
      where: { listing: { item: { workspaceId: context.workspace.id, deletedAt: null } } },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        platform: true,
        title: true,
        isComplete: true,
        updatedAt: true,
        listing: {
          select: {
            item: {
              select: {
                id: true,
                sku: true,
                status: true,
                photos: {
                  where: { status: 'PROCESSED' },
                  orderBy: { position: 'asc' },
                  take: 1,
                  select: { thumbnailKey: true },
                },
                externalListings: { select: { platform: true, url: true, state: true } },
              },
            },
          },
        },
      },
    }),
    prisma.listingVariant.count({
      where: { listing: { item: { workspaceId: context.workspace.id, deletedAt: null } } },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Listings"
        description="One row per marketplace draft. A draft becomes a live listing only when you publish it, or when you post it yourself and mark it as listed."
      />

      {variants.length === 0 ? (
        <EmptyState
          icon={<Tags className="size-7" />}
          title="No drafts yet"
          description="Generate a listing and its four platform drafts will appear here."
          action={
            <Button asChild variant="primary">
              <Link href="/app/items/new">Create a listing</Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-stone-200">
            {variants.map((variant) => {
              const item = variant.listing.item;
              const live = item.externalListings.find(
                (listing) => listing.platform === variant.platform && listing.state === 'ACTIVE',
              );

              return (
                <li key={variant.id}>
                  <div className="flex flex-wrap items-center gap-3 p-3.5 hover:bg-stone-50">
                    <ItemThumbnail
                      objectKey={item.photos[0]?.thumbnailKey ?? null}
                      alt=""
                      size={44}
                    />

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/app/items/${item.id}`}
                        className="block truncate text-[13px] font-medium text-ink hover:underline"
                      >
                        {variant.title}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {item.sku} · updated {relativeTime(variant.updatedAt)}
                      </p>
                    </div>

                    <Badge tone="neutral">{PLATFORM_NAMES[variant.platform]}</Badge>

                    {variant.isComplete ? (
                      <Badge tone="success">Ready</Badge>
                    ) : (
                      <Badge tone="warning">Needs work</Badge>
                    )}

                    <ItemStatusBadge status={item.status} />

                    {live?.url ? (
                      <Button asChild variant="ghost" size="sm">
                        <a href={live.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink />
                          Live
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between pt-2">
          <p className="text-[12px] text-muted">
            Page {page} of {pageCount} · {total} drafts
          </p>
          <div className="flex gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className={page <= 1 ? 'pointer-events-none opacity-40' : ''}
            >
              <Link href={page <= 2 ? '/app/listings' : `/app/listings?page=${page - 1}`}>
                Previous
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className={page >= pageCount ? 'pointer-events-none opacity-40' : ''}
            >
              <Link href={`/app/listings?page=${page + 1}`}>Next</Link>
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
