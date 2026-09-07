import type { Metadata } from 'next';
import Link from 'next/link';
import { AppNav } from '@/components/app/app-nav';
import { AccountMenu } from '@/components/app/account-menu';
import { CreditPill } from '@/components/app/credit-pill';
import { Alert } from '@/components/ui';
import { requireWorkspace, isStaff } from '@/server/session';
import { getSettings } from '@/server/settings';

export const metadata: Metadata = {
  title: { default: 'Dashboard', template: '%s · ResellSnap AI' },
  robots: { index: false, follow: false },
};

/**
 * Every route under `/app` passes through `requireWorkspace`, which redirects
 * an unauthenticated, unverified or suspended visitor before any child renders.
 * The guard is server-side; nothing here relies on the client hiding a link.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [context, settings] = await Promise.all([requireWorkspace(), getSettings()]);

  return (
    <div className="flex min-h-dvh flex-col bg-bone lg:flex-row">
      <AppNav>
        <div className="space-y-2">
          <CreditPill
            monthly={context.workspace.monthlyCredits}
            purchased={context.workspace.purchasedCredits}
          />
          <AccountMenu
            name={context.user.name}
            email={context.user.email}
            isStaff={isStaff(context.user)}
          />
        </div>
      </AppNav>

      <div className="flex min-w-0 flex-1 flex-col">
        {settings.maintenanceMode ? (
          <div className="border-b border-warning/25 bg-warning-wash px-4 py-2.5 text-center text-[13px] text-warning">
            {settings.maintenanceMessage}
          </div>
        ) : null}

        {context.workspace.isDemo ? (
          <div className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-center text-[12px] text-muted">
            This is the sample workspace. Everything in it is <strong>sample data</strong>.
          </div>
        ) : null}

        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>

        <footer className="border-t border-stone-200 px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-[12px] text-subtle">
            <p>
              Generated copy and prices are suggestions, not guarantees. You remain responsible for
              the accuracy of what you publish.
            </p>
            <div className="flex gap-4">
              <Link href="/help" className="hover:text-ink">
                Help
              </Link>
              <Link href="/legal/terms" className="hover:text-ink">
                Terms
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
