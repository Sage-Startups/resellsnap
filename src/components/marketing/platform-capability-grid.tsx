import { Badge } from '@/components/ui';
import type { CapabilityBadge } from '@/server/marketplace/types';

/**
 * The platform capability table.
 *
 * This component exists because the honest answer is more complicated than
 * "works with 4 marketplaces". It states exactly what each platform permits and
 * why, so a visitor knows before signing up rather than after.
 */
export const BADGE_COPY: Record<CapabilityBadge, { label: string; tone: 'accent' | 'neutral' | 'warning' | 'danger' }> = {
  DIRECT_PUBLISHING: { label: 'Direct publishing available', tone: 'accent' },
  EXPORT_WORKFLOW: { label: 'Export workflow', tone: 'neutral' },
  APPROVED_ACCESS_REQUIRED: { label: 'Approved access required', tone: 'warning' },
  TEMPORARILY_UNAVAILABLE: { label: 'Temporarily unavailable', tone: 'danger' },
};

export interface PlatformCapabilityRow {
  name: string;
  badge: CapabilityBadge;
  summary: string;
  detail: string;
}

export const MARKETING_PLATFORM_ROWS: PlatformCapabilityRow[] = [
  {
    name: 'eBay',
    badge: 'DIRECT_PUBLISHING',
    summary: 'Connect your seller account and publish from ResellSnap AI.',
    detail:
      'Uses the official eBay Sell APIs with an OAuth connection you authorise and can revoke. You review every listing and press publish yourself — nothing goes live automatically. Your eBay business policies and inventory location must be set up first; we check and tell you if anything is missing.',
  },
  {
    name: 'Vinted',
    badge: 'EXPORT_WORKFLOW',
    summary: 'Listing prepared for a fast copy-and-paste.',
    detail:
      'Vinted does not offer a public seller API that permits third-party applications to create listings for you. We generate Vinted-shaped copy, per-field copy buttons, a photo ZIP and a short checklist so posting takes under a minute.',
  },
  {
    name: 'Depop',
    badge: 'EXPORT_WORKFLOW',
    summary: 'Listing prepared for a fast copy-and-paste.',
    detail:
      'Depop does not publish an open seller API for third-party listing creation. We generate Depop-style copy with restrained, relevant hashtags, plus a photo ZIP ready to upload.',
  },
  {
    name: 'Facebook Marketplace',
    badge: 'EXPORT_WORKFLOW',
    summary: 'Listing prepared for a fast copy-and-paste.',
    detail:
      'Meta does not grant third-party applications permission to create consumer Marketplace listings. Facebook Login, social sharing and commerce catalog access are different products, and none of them authorises this. We prepare the listing for you to post.',
  },
];

export function PlatformCapabilityGrid({ rows = MARKETING_PLATFORM_ROWS }: { rows?: PlatformCapabilityRow[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {rows.map((row) => {
        const badge = BADGE_COPY[row.badge];
        return (
          <li
            key={row.name}
            className="rounded-xl border border-stone-200 bg-paper p-5 shadow-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-semibold text-ink">{row.name}</h3>
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </div>
            <p className="mt-2 text-[13px] font-medium text-ink-soft">{row.summary}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{row.detail}</p>
          </li>
        );
      })}
    </ul>
  );
}
