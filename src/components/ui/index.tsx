import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export { Button, buttonVariants, type ButtonProps } from './button';
export { Slot } from './slot';

// --- Surfaces --------------------------------------------------------------

export function Card({
  className,
  as: Component = 'div',
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType }) {
  return (
    <Component
      className={cn('rounded-xl border border-stone-200 bg-paper shadow-card', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...props} />;
}

export function CardTitle({
  className,
  as: Component = 'h3',
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: React.ElementType }) {
  return (
    <Component className={cn('text-[15px] font-semibold text-ink', className)} {...props} />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[13px] leading-relaxed text-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center gap-2 border-t border-stone-200 px-5 py-3.5', className)}
      {...props}
    />
  );
}

// --- Badges ----------------------------------------------------------------

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-stone-200 bg-stone-50 text-ink-soft',
        accent: 'border-lime-deep/30 bg-lime-wash text-ink',
        success: 'border-success/20 bg-success-wash text-success',
        warning: 'border-warning/20 bg-warning-wash text-warning',
        danger: 'border-danger/20 bg-danger-wash text-danger',
        info: 'border-info/20 bg-info-wash text-info',
        ink: 'border-transparent bg-ink text-bone',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

// --- Form controls ---------------------------------------------------------

export function Label({
  className,
  required,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn('block text-[13px] font-medium text-ink', className)} {...props}>
      {props.children}
      {required ? (
        <span className="ml-0.5 text-danger" aria-hidden="true">
          *
        </span>
      ) : null}
    </label>
  );
}

const fieldStyles =
  'w-full rounded-lg border border-stone-300 bg-paper px-3 py-2 text-sm text-ink transition-colors placeholder:text-subtle hover:border-stone-400 focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-muted aria-[invalid=true]:border-danger';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldStyles, 'h-10', className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldStyles, 'min-h-24 resize-y leading-relaxed', className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        fieldStyles,
        'h-10 appearance-none bg-[length:1rem] bg-[right_0.6rem_center] bg-no-repeat pr-9',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%236f6d63' stroke-width='1.5'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")",
      }}
      {...props}
    />
  );
}

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-4 shrink-0 rounded border-stone-300 text-ink accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        className,
      )}
      {...props}
    />
  );
}

/** Field wrapper that wires label, hint and error to the control for screen readers. */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-[12px] leading-relaxed text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-[12px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// --- Feedback --------------------------------------------------------------

const alertVariants = cva('rounded-lg border px-4 py-3 text-[13px] leading-relaxed', {
  variants: {
    tone: {
      neutral: 'border-stone-200 bg-stone-50 text-ink-soft',
      success: 'border-success/20 bg-success-wash text-success',
      warning: 'border-warning/25 bg-warning-wash text-warning',
      danger: 'border-danger/25 bg-danger-wash text-danger',
      info: 'border-info/20 bg-info-wash text-info',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Alert({
  className,
  tone,
  title,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants> & { title?: string }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    >
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-md', className)} aria-hidden="true" />;
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex', className)}>
      <svg viewBox="0 0 24 24" fill="none" className="size-4 animate-spin" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** Consistent empty state that always offers the next action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50/60 px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? <div className="mb-3 text-subtle">{icon}</div> : null}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

// --- Layout ----------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'neutral' | 'accent';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-stone-200 bg-paper p-4',
        tone === 'accent' && 'border-lime-deep/30 bg-lime-wash/40',
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-ink">{value}</p>
      {hint ? <p className="mt-1 text-[12px] leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

/** Marks anything derived from fixtures rather than real activity. */
export function SampleDataBadge({ className }: { className?: string }) {
  return (
    <Badge tone="neutral" className={cn('font-semibold', className)}>
      Sample data
    </Badge>
  );
}
