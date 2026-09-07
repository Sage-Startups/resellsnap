'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut, ShieldCheck, User } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

export function AccountMenu({
  name,
  email,
  isStaff,
}: {
  name: string;
  email: string;
  isStaff: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || email[0]?.toUpperCase() || '?';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-stone-100"
      >
        <span
          className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-semibold text-bone"
          aria-hidden="true"
        >
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">{name}</span>
          <span className="block truncate text-[11px] text-muted">{email}</span>
        </span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute bottom-full left-0 z-20 mb-2 w-full min-w-52 overflow-hidden rounded-lg border border-stone-200 bg-paper shadow-float"
          >
            <Link
              href="/app/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-ink-soft hover:bg-stone-50"
            >
              <User className="size-4" aria-hidden="true" />
              Account settings
            </Link>

            {isStaff ? (
              <Link
                href="/admin"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 border-t border-stone-200 px-3 py-2.5 text-[13px] text-ink-soft hover:bg-stone-50"
              >
                <ShieldCheck className="size-4" aria-hidden="true" />
                Admin console
              </Link>
            ) : null}

            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                await authClient.signOut();
                router.push('/');
                router.refresh();
              }}
              className={cn(
                'flex w-full items-center gap-2.5 border-t border-stone-200 px-3 py-2.5 text-left text-[13px] text-ink-soft hover:bg-stone-50',
                signingOut && 'opacity-50',
              )}
            >
              <LogOut className="size-4" aria-hidden="true" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
