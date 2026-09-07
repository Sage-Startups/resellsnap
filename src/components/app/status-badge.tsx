import { Badge } from '@/components/ui';
import type { ItemStatus } from '@/lib/enums';

const STATUS_COPY: Record<
  ItemStatus,
  { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'info' }
> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  ANALYZING: { label: 'Analysing', tone: 'info' },
  READY: { label: 'Ready', tone: 'accent' },
  LISTED: { label: 'Listed', tone: 'info' },
  SOLD: { label: 'Sold', tone: 'success' },
  EXPIRED: { label: 'Expired', tone: 'warning' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
};

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const copy = STATUS_COPY[status];
  return <Badge tone={copy.tone}>{copy.label}</Badge>;
}

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = Object.fromEntries(
  Object.entries(STATUS_COPY).map(([key, value]) => [key, value.label]),
) as Record<ItemStatus, string>;
