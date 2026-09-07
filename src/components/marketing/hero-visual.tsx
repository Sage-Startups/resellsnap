import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The hero visual: a stack of photos on the left resolving into four
 * platform-specific drafts on the right.
 *
 * Built from real markup rather than a screenshot so it stays crisp at every
 * width and does not need re-exporting when the brand changes.
 */
const PLATFORM_CARDS = [
  {
    name: 'eBay',
    badge: 'Direct',
    title: 'Cream Leather Low-Top Trainers UK 8 US 9',
    body: 'Very good used condition. Light scuffing on the right toe, pictured.',
  },
  {
    name: 'Vinted',
    badge: 'Export',
    title: 'Cream leather low-top trainers, UK 8',
    body: 'Worn a few times. Small scuff on the right toe — shown in the photos.',
  },
  {
    name: 'Depop',
    badge: 'Export',
    title: 'cream leather low tops — UK 8',
    body: 'Clean cream low-tops. Honest bit: light scuff on the right toe.',
  },
  {
    name: 'Facebook',
    badge: 'Export',
    title: 'Cream leather trainers, UK 8',
    body: 'Very good condition. Collection preferred, can post at cost.',
  },
] as const;

export function HeroVisual({ className }: { className?: string }) {
  return (
    <div className={cn('relative', className)} aria-hidden="true">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] sm:items-center">
        {/* Photo stack */}
        <div className="relative mx-auto h-52 w-44 sm:h-60 sm:w-52">
          {(['back', 'detail', 'front'] as const).map((angle, index) => (
            <div
              key={angle}
              className="absolute inset-0 overflow-hidden rounded-xl border border-stone-200 bg-paper shadow-raised"
              style={{
                transform: `rotate(${(index - 1) * 4}deg) translate(${(index - 1) * 8}px, ${(index - 1) * -6}px)`,
                zIndex: index,
              }}
            >
              <Image
                src={`/fixtures/trainers-${angle}.webp`}
                alt=""
                width={480}
                height={480}
                className="size-full object-cover"
                priority={index === 2}
              />
            </div>
          ))}
          <span className="absolute -bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-stone-200 bg-paper px-2.5 py-1 text-[11px] font-medium text-muted shadow-hair">
            6 photos
          </span>
        </div>

        {/* Generated drafts */}
        <div className="grid gap-2.5 sm:grid-cols-2">
          {PLATFORM_CARDS.map((card) => (
            <div
              key={card.name}
              className="rounded-lg border border-stone-200 bg-paper p-3 shadow-card"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-ink">{card.name}</span>
                <span
                  className={cn(
                    'rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
                    card.badge === 'Direct'
                      ? 'border-lime-deep/40 bg-lime-wash text-ink'
                      : 'border-stone-200 bg-stone-50 text-muted',
                  )}
                >
                  {card.badge}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-[11px] font-medium leading-snug text-ink">
                {card.title}
              </p>
              <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
