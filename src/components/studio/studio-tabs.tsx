'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui';
import { VariantEditor, type PlatformCapabilityInfo, type VariantData } from './variant-editor';
import { MasterEditor, type MasterData } from './master-editor';
import type { Tone } from '@/lib/enums';
import { cn } from '@/lib/utils';

/**
 * Master listing plus one tab per marketplace. Each tab carries its own
 * completeness indicator so a seller can see at a glance which drafts still
 * need attention.
 */
export function StudioTabs({
  itemId,
  master,
  variants,
  capabilities,
  tone,
  photoCount,
  hasPrice,
}: {
  itemId: string;
  master: MasterData;
  variants: VariantData[];
  capabilities: Record<string, PlatformCapabilityInfo>;
  tone: Tone;
  photoCount: number;
  hasPrice: boolean;
}) {
  const [active, setActive] = useState('MASTER');

  const tabs = [
    { key: 'MASTER', label: 'Master', complete: true },
    ...variants.map((variant) => ({
      key: variant.platform as string,
      label: variant.platformName,
      complete: variant.isComplete,
    })),
  ];

  const current = variants.find((variant) => variant.platform === active);

  return (
    <div>
      <div
        role="tablist"
        aria-label="Listing drafts"
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-stone-200 px-1 pb-px"
      >
        {tabs.map((tab) => {
          const selected = active === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`panel-${tab.key}`}
              id={`tab-${tab.key}`}
              onClick={() => setActive(tab.key)}
              className={cn(
                'flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors',
                selected
                  ? 'border-ink text-ink'
                  : 'border-transparent text-muted hover:text-ink-soft',
              )}
            >
              {tab.label}
              {!tab.complete ? (
                <span
                  className="size-1.5 rounded-full bg-warning"
                  aria-label="needs attention"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="pt-5">
        {active === 'MASTER' ? (
          <div role="tabpanel" id="panel-MASTER" aria-labelledby="tab-MASTER">
            <div className="mb-4 flex items-start gap-3">
              <Badge tone="neutral">Reusable source</Badge>
              <p className="text-[13px] leading-relaxed text-muted">
                Every platform draft is derived from this. Edit here for changes that should apply
                everywhere, or edit an individual platform tab for changes that should not.
              </p>
            </div>
            <MasterEditor itemId={itemId} master={master} />
          </div>
        ) : null}

        {current ? (
          <div
            role="tabpanel"
            id={`panel-${current.platform}`}
            aria-labelledby={`tab-${current.platform}`}
          >
            <VariantEditor
              itemId={itemId}
              variant={current}
              capability={
                capabilities[current.platform] ?? {
                  canPublish: false,
                  state: 'EXPORT_ONLY',
                  badge: 'EXPORT_WORKFLOW',
                  statusMessage: 'Export workflow',
                  setupIssues: [],
                }
              }
              tone={tone}
              photoCount={photoCount}
              hasPrice={hasPrice}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
