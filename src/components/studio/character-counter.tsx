import { cn } from '@/lib/utils';

/** Counts against the *platform's* limit, so the number always means something. */
export function CharacterCounter({
  value,
  max,
  className,
}: {
  value: string;
  max: number;
  className?: string;
}) {
  const length = value.length;
  const over = length > max;
  const close = !over && length > max * 0.9;

  return (
    <span
      className={cn(
        'text-[11px] tabular-nums',
        over ? 'font-semibold text-danger' : close ? 'text-warning' : 'text-subtle',
        className,
      )}
      aria-live={over ? 'polite' : 'off'}
    >
      {length.toLocaleString()} / {max.toLocaleString()}
      {over ? ` · ${(length - max).toLocaleString()} over` : ''}
    </span>
  );
}
