import { cn } from '@/lib/utils';

export function Section({
  className,
  children,
  tone = 'bone',
  ...props
}: React.HTMLAttributes<HTMLElement> & { tone?: 'bone' | 'paper' | 'ink' }) {
  return (
    <section
      className={cn(
        'px-4 py-16 sm:px-6 sm:py-20',
        tone === 'paper' && 'bg-paper',
        tone === 'ink' && 'bg-ink text-bone',
        className,
      )}
      {...props}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

/**
 * A section heading.
 *
 * `level` exists because a page needs exactly one `h1`: screen readers announce
 * it as the page's title and let users jump between levels, so a page built
 * entirely from `h2`s has no announced title at all. The first heading on a
 * page should be `level={1}`; everything below it keeps the default.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  inverted = false,
  level = 2,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  inverted?: boolean;
  level?: 1 | 2 | 3;
  className?: string;
}) {
  const Heading = `h${level}` as const;
  return (
    <div
      className={cn(
        'max-w-2xl',
        align === 'center' && 'mx-auto text-center',
        className,
      )}
    >
      {eyebrow ? (
        <p
          className={cn(
            'text-[11px] font-semibold uppercase tracking-[0.14em]',
            inverted ? 'text-lime' : 'text-muted',
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <Heading
        className={cn(
          'mt-2 text-2xl font-semibold tracking-tight sm:text-3xl',
          inverted ? 'text-bone' : 'text-ink',
        )}
      >
        {title}
      </Heading>
      {description ? (
        <p
          className={cn(
            'mt-3 text-[15px] leading-relaxed',
            inverted ? 'text-bone/70' : 'text-muted',
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
