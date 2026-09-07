import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { getCurrentUser } from '@/server/session';
import { getSettings } from '@/server/settings';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [settings, user] = await Promise.all([getSettings(), getCurrentUser()]);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader demoVisible={settings.demoVisible} signedIn={Boolean(user)} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter supportEmail={settings.supportEmail} />
    </div>
  );
}
