import { cn } from '@/lib/utils';

/**
 * The ResellSnap AI mark.
 *
 * Code-native and original: an aperture-style square (the "snap") with a
 * corner cut away (the "sell" — something leaving). No external asset, no
 * licence to transfer, and it scales to a 16px favicon without turning to mush.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('size-7', className)}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect x="0" y="0" width="32" height="32" rx="8" fill="currentColor" />
      <path d="M11 10.5h10a2 2 0 0 1 2 2v6l-4-4h-8a2 2 0 0 1 0-4Z" fill="var(--color-lime, #c8f000)" />
      <circle cx="13.5" cy="19.5" r="3.5" fill="none" stroke="var(--color-bone, #faf9f5)" strokeWidth="2" />
    </svg>
  );
}

export function Wordmark({
  className,
  markClassName,
  showAi = true,
}: {
  className?: string;
  markClassName?: string;
  showAi?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={cn('size-7 text-ink', markClassName)} />
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">
        ResellSnap
        {showAi ? <span className="ml-1 font-medium text-muted">AI</span> : null}
      </span>
    </span>
  );
}
