'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { Wordmark } from '@/components/brand/logo';
import { MARKETING_NAV, SITE } from '@/lib/site';
import { cn } from '@/lib/utils';

export function SiteHeader({ demoVisible, signedIn }: { demoVisible: boolean; signedIn: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = demoVisible
    ? [...MARKETING_NAV, { href: '/demo', label: 'Live demo' } as const]
    : MARKETING_NAV;

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-bone/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="shrink-0 rounded-md" aria-label={`${SITE.name} home`}>
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
                  active ? 'text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          {signedIn ? (
            <Button asChild variant="primary" size="sm">
              <Link href="/app">Go to dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild variant="primary" size="sm">
                <Link href="/register">Start free</Link>
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          className="ml-auto rounded-md p-2 text-ink md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div id="mobile-nav" className="border-t border-stone-200 bg-bone md:hidden">
          <nav aria-label="Mobile" className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
            <ul className="space-y-0.5">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-md px-3 py-2.5 text-sm font-medium text-ink hover:bg-stone-100"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-col gap-2 border-t border-stone-200 pt-3">
              {signedIn ? (
                <Button asChild variant="primary" full>
                  <Link href="/app">Go to dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline" full>
                    <Link href="/login">Sign in</Link>
                  </Button>
                  <Button asChild variant="primary" full>
                    <Link href="/register">Start free</Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
