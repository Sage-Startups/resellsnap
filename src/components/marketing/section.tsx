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

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  inverted = false,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  inverted?: boolean;
  className?: string;
}) {
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
      <h2
        className={cn(
          'mt-2 text-2xl font-semibold tracking-tight sm:text-3xl',
          inverted ? 'text-bone' : 'text-ink',
        )}
      >
        {title}
      </h2>
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
