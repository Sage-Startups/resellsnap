'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  BarChart3, Boxes, CreditCard, LayoutDashboard, Menu, Plug, Settings, Tags, X,
} from 'lucide-react';
import { Wordmark } from '@/components/brand/logo';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/app', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/app/inventory', label: 'Inventory', icon: Boxes },
  { href: '/app/listings', label: 'Listings', icon: Tags },
  { href: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/app/integrations', label: 'Integrations', icon: Plug },
  { href: '/app/billing', label: 'Billing', icon: CreditCard },
  { href: '/app/settings', label: 'Settings', icon: Settings },
] as const;

export function AppNav({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const links = (
    <ul className="space-y-0.5">
      {NAV.map((item) => {
        const active = isActive(item.href, 'exact' in item ? item.exact : false);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                active ? 'bg-ink text-bone' : 'text-ink-soft hover:bg-stone-100',
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-stone-200 bg-paper lg:flex lg:flex-col">
        <div className="border-b border-stone-200 px-5 py-4">
          <Link href="/app" className="inline-block rounded-md">
            <Wordmark />
          </Link>
        </div>
        <nav aria-label="Application" className="flex-1 overflow-y-auto p-3">
          {links}
        </nav>
        {children ? <div className="border-t border-stone-200 p-3">{children}</div> : null}
      </aside>

      {/* Mobile bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-stone-200 bg-paper px-4 lg:hidden">
        <Link href="/app" className="rounded-md">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="primary" size="sm">
            <Link href="/app/items/new">New listing</Link>
          </Button>
          <button
            type="button"
            className="rounded-md p-2 text-ink"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="app-mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="app-mobile-nav"
          className="sticky top-14 z-30 border-b border-stone-200 bg-paper px-4 py-3 lg:hidden"
        >
          <nav aria-label="Application">{links}</nav>
          {children ? <div className="mt-3 border-t border-stone-200 pt-3">{children}</div> : null}
        </div>
      ) : null}
    </>
  );
}
