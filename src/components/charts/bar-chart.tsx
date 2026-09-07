import { cn } from '@/lib/utils';

/**
 * Small SVG charts, written by hand rather than pulled from a library.
 *
 * Two reasons: the shapes here are simple enough that a dependency would be
 * more code than the chart, and a buyer inheriting this project can read and
 * change them without learning an API. Every chart also renders an accessible
 * table equivalent for screen readers.
 */
export interface BarDatum {
  label: string;
  value: number;
  /** Optional secondary series drawn behind the primary bar. */
  compare?: number;
  formatted?: string;
}

export function BarChart({
  data,
  height = 160,
  caption,
  compareLabel,
  valueLabel = 'Value',
  className,
}: {
  data: BarDatum[];
  height?: number;
  caption: string;
  compareLabel?: string;
  valueLabel?: string;
  className?: string;
}) {
  if (data.length === 0) {
    return (
      <p className={cn('py-8 text-center text-[13px] text-muted', className)}>
        Not enough data yet.
      </p>
    );
  }

  const max = Math.max(...data.flatMap((d) => [d.value, d.compare ?? 0]), 1);
  const barWidth = 100 / data.length;

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={caption}
        className="w-full"
        style={{ height }}
      >
        {/* Two gridlines: enough to read magnitude, no chart junk. */}
        {[0.5, 1].map((fraction) => (
          <line
            key={fraction}
            x1="0"
            x2="100"
            y1={height - height * fraction * 0.88}
            y2={height - height * fraction * 0.88}
            stroke="var(--color-stone-200)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {data.map((datum, index) => {
          const x = index * barWidth;
          const barHeight = (datum.value / max) * height * 0.88;
          const compareHeight = ((datum.compare ?? 0) / max) * height * 0.88;
          const inset = barWidth * 0.22;

          return (
            <g key={datum.label}>
              {datum.compare !== undefined ? (
                <rect
                  x={x + inset * 0.5}
                  y={height - compareHeight}
                  width={barWidth - inset}
                  height={compareHeight}
                  fill="var(--color-stone-200)"
                  rx="0.6"
                />
              ) : null}
              <rect
                x={x + inset}
                y={height - barHeight}
                width={barWidth - inset * 2}
                height={barHeight}
                fill="var(--color-ink)"
                rx="0.6"
              />
            </g>
          );
        })}

        <line
          x1="0"
          x2="100"
          y1={height}
          y2={height}
          stroke="var(--color-stone-300)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Thin the labels out rather than letting them overlap into mush.
          Roughly eight are readable at any width; the rest are still available
          in the table equivalent below. */}
      <div className="mt-2 flex justify-between text-[11px] text-muted">
        {data.map((datum, index) => {
          const stride = Math.max(1, Math.ceil(data.length / 8));
          const show = index % stride === 0 || index === data.length - 1;
          return (
            <span key={datum.label} className="min-w-0 flex-1 truncate text-center">
              {show ? datum.label : '\u00a0'}
            </span>
          );
        })}
      </div>

      {/* The accessible equivalent. Visually hidden, fully readable. */}
      <figcaption className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">{valueLabel}</th>
              {compareLabel ? <th scope="col">{compareLabel}</th> : null}
            </tr>
          </thead>
          <tbody>
            {data.map((datum) => (
              <tr key={datum.label}>
                <th scope="row">{datum.label}</th>
                <td>{datum.formatted ?? datum.value}</td>
                {compareLabel ? <td>{datum.compare ?? 0}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

/** Horizontal breakdown bars, for platform and category splits. */
export function BreakdownBars({
  data,
  caption,
  className,
}: {
  data: Array<{ label: string; value: number; formatted: string }>;
  caption: string;
  className?: string;
}) {
  if (data.length === 0) {
    return <p className={cn('text-[13px] text-muted', className)}>No data yet.</p>;
  }

  const total = data.reduce((sum, datum) => sum + datum.value, 0) || 1;

  return (
    <ul className={cn('space-y-2.5', className)} aria-label={caption}>
      {data.map((datum) => {
        const percent = (datum.value / total) * 100;
        return (
          <li key={datum.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] text-ink">{datum.label}</span>
              <span className="shrink-0 text-[12px] tabular-nums text-muted">
                {datum.formatted}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-ink"
                style={{ width: `${Math.max(2, percent)}%` }}
                role="presentation"
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
