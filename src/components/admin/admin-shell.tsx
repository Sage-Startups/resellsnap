'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Activity, ArrowLeft, BadgeCheck, Bot, Boxes, Coins, CreditCard, FileText, Flag,
  Gauge, LayoutGrid, Mail, Menu, Package, ScrollText, Settings2, ShieldAlert,
  Sparkles, ToggleLeft, Users, Webhook, X,
} from 'lucide-react';
import { LogoMark } from '@/components/brand/logo';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

const SECTIONS = [
  {
    heading: 'Overview',
    links: [{ href: '/admin', label: 'Dashboard', icon: LayoutGrid, exact: true }],
  },
  {
    heading: 'People',
    links: [
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/workspaces', label: 'Workspaces', icon: Boxes },
    ],
  },
  {
    heading: 'Money',
    links: [
      { href: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
      { href: '/admin/credits', label: 'Credits', icon: Coins },
      { href: '/admin/plans', label: 'Plans', icon: BadgeCheck },
    ],
  },
  {
    heading: 'Product',
    links: [
      { href: '/admin/items', label: 'Items', icon: Package },
      { href: '/admin/ai', label: 'AI operations', icon: Bot },
      { href: '/admin/prompts', label: 'Prompt studio', icon: Sparkles },
      { href: '/admin/templates', label: 'Platform templates', icon: FileText },
      { href: '/admin/integrations', label: 'Integrations', icon: Activity },
    ],
  },
  {
    heading: 'Operations',
    links: [
      { href: '/admin/moderation', label: 'Moderation', icon: Flag },
      { href: '/admin/health', label: 'System health', icon: Gauge },
      { href: '/admin/webhooks', label: 'Webhooks', icon: Webhook },
      { href: '/admin/audit', label: 'Audit log', icon: ScrollText },
    ],
  },
  {
    heading: 'Configuration',
    links: [
      { href: '/admin/content', label: 'Content', icon: FileText },
      { href: '/admin/emails', label: 'Emails', icon: Mail },
      { href: '/admin/flags', label: 'Feature flags', icon: ToggleLeft },
      { href: '/admin/settings', label: 'Settings', icon: Settings2 },
    ],
  },
] as const;

/**
 * The admin shell is deliberately a different colour from the customer app:
 * an operator should never be a moment's doubt about which one they are
 * looking at when they click something destructive.
 */
export function AdminShell({
  children,
  actorName,
  actorRole,
  environment,
}: {
  children: React.ReactNode;
  actorName: string;
  actorRole: string;
  environment: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const nav = (
    <div className="space-y-5">
      {SECTIONS.map((section) => (
        <div key={section.heading}>
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-bone/40">
            {section.heading}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {section.links.map((link) => {
              const active = isActive(link.href, 'exact' in link ? link.exact : false);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors',
                      active
                        ? 'bg-bone text-ink font-medium'
                        : 'text-bone/70 hover:bg-bone/10 hover:text-bone',
                    )}
                  >
                    <link.icon className="size-3.5 shrink-0" aria-hidden="true" />
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-stone-50 lg:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col bg-ink lg:flex">
        <div className="flex items-center gap-2 border-b border-bone/10 px-5 py-4">
          <LogoMark className="size-6 text-bone" />
          <div>
            <p className="text-[13px] font-semibold text-bone">Admin console</p>
            <p className="text-[10px] uppercase tracking-wider text-bone/40">{environment}</p>
          </div>
        </div>

        <nav aria-label="Admin" className="flex-1 overflow-y-auto p-3">
          {nav}
        </nav>

        <div className="border-t border-bone/10 p-3">
          <p className="px-3 text-[12px] font-medium text-bone">{actorName}</p>
          <p className="px-3 text-[10px] uppercase tracking-wider text-bone/40">{actorRole}</p>
          <Link
            href="/app"
            className="mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] text-bone/70 hover:bg-bone/10 hover:text-bone"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to the app
          </Link>
        </div>
      </aside>

      <div className="sticky top-0 z-40 flex h-14 items-center justify-between bg-ink px-4 lg:hidden">
        <span className="flex items-center gap-2">
          <LogoMark className="size-5 text-bone" />
          <span className="text-[13px] font-semibold text-bone">Admin</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="rounded-md p-2 text-bone"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <nav aria-label="Admin" className="bg-ink px-3 pb-4 lg:hidden">
          {nav}
        </nav>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-stone-200 bg-warning-wash px-4 py-1.5 sm:px-6">
          <ShieldAlert className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-[12px] text-warning">
            You are in the admin console. Actions here affect real customer accounts and are
            recorded in the audit log.
          </p>
          <Badge tone="warning" className="ml-auto hidden sm:inline-flex">
            {environment}
          </Badge>
        </div>

        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
