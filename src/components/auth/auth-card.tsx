import Link from 'next/link';
import { Card, CardContent } from '@/components/ui';

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="shadow-raised">
      <CardContent className="p-6 sm:p-7">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{description}</p>
        ) : null}
        <div className="mt-6">{children}</div>
      </CardContent>
      {footer ? (
        <div className="border-t border-stone-200 px-6 py-4 text-center text-[13px] text-muted sm:px-7">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}

export function AuthFooterLink({
  prompt,
  href,
  label,
}: {
  prompt: string;
  href: string;
  label: string;
}) {
  return (
    <>
      {prompt}{' '}
      <Link href={href} className="font-medium text-ink underline underline-offset-4">
        {label}
      </Link>
    </>
  );
}
