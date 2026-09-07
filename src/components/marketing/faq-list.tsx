import type { PublicFaqEntry } from '@/server/public-data';

/**
 * Native `<details>` accordion: keyboard accessible, works without JavaScript,
 * and one element rather than a library.
 */
export function FaqList({ entries }: { entries: PublicFaqEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="divide-y divide-stone-200 border-y border-stone-200">
      {entries.map((entry) => (
        <details key={entry.key} className="group py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-ink marker:content-['']">
            {entry.question}
            <span
              className="grid size-6 shrink-0 place-items-center rounded-full border border-stone-300 text-muted transition-transform group-open:rotate-45"
              aria-hidden="true"
            >
              <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 2v8M2 6h8" strokeLinecap="round" />
              </svg>
            </span>
          </summary>
          <p className="mt-3 max-w-2xl pr-10 text-[14px] leading-relaxed text-muted">{entry.answer}</p>
        </details>
      ))}
    </div>
  );
}
