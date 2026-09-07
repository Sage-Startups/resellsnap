import Link from 'next/link';
import { Wordmark } from '@/components/brand/logo';
import { SITE } from '@/lib/site';
import { getSettings } from '@/server/settings';

/**
 * Auth screens get their own quiet shell: no marketing navigation to distract
 * from the one thing the visitor is here to do.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();

  return (
    <div className="flex min-h-dvh flex-col bg-bone">
      <header className="px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Link href="/" aria-label={`${SITE.name} home`} className="inline-block rounded-md">
            <Wordmark />
          </Link>
        </div>
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-subtle">
          <Link href="/legal/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/legal/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <a href={`mailto:${settings.supportEmail}`} className="hover:text-ink">
            {settings.supportEmail}
          </a>
        </div>
      </footer>
    </div>
  );
}
