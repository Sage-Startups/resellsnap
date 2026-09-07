import { Slot } from './slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * The lime accent is reserved for the single most important action on a screen.
 * Everything else is ink, outline or ghost — which is what makes the accent
 * mean something.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background-color,color,border-color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-lime text-ink shadow-hair hover:bg-lime-deep active:bg-lime-deep border border-transparent',
        ink: 'bg-ink text-bone hover:bg-ink-soft border border-transparent',
        outline:
          'border border-stone-300 bg-paper text-ink hover:bg-stone-50 hover:border-stone-400',
        ghost: 'border border-transparent text-ink-soft hover:bg-stone-100 hover:text-ink',
        danger: 'bg-danger text-white hover:opacity-90 border border-transparent',
        link: 'text-ink underline underline-offset-4 hover:text-muted border border-transparent',
      },
      size: {
        sm: 'h-8 px-3 text-[13px] [&_svg]:size-4',
        md: 'h-10 px-4 text-sm [&_svg]:size-4',
        lg: 'h-12 px-6 text-[15px] [&_svg]:size-5',
        icon: 'h-9 w-9 [&_svg]:size-4',
      },
      full: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'outline', size: 'md', full: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  full,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      className={cn(buttonVariants({ variant, size, full }), className)}
      // An unspecified <button> inside a form defaults to submit, which causes
      // a lot of accidental submissions. Be explicit.
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  );
}

export { buttonVariants };
