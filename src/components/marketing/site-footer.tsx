import Link from 'next/link';
import { Wordmark } from '@/components/brand/logo';
import { FOOTER_NAV, NON_AFFILIATION_NOTICE, SITE } from '@/lib/site';

export function SiteFooter({ supportEmail }: { supportEmail: string }) {
  return (
    <footer className="border-t border-stone-200 bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Wordmark />
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-muted">
              {SITE.shortDescription}
            </p>
            <p className="mt-3 text-[13px] text-muted">
              <a href={`mailto:${supportEmail}`} className="underline underline-offset-4 hover:text-ink">
                {supportEmail}
              </a>
            </p>
          </div>

          {FOOTER_NAV.map((group) => (
            <nav key={group.heading} aria-label={group.heading}>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink">
                {group.heading}
              </h2>
              <ul className="mt-3 space-y-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-muted transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 border-t border-stone-200 pt-6">
          <p className="max-w-4xl text-[12px] leading-relaxed text-subtle">{NON_AFFILIATION_NOTICE}</p>
          <p className="mt-3 text-[12px] text-subtle">
            © {new Date().getFullYear()} {SITE.name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
