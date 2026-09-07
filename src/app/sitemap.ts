import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';
import { getSettings } from '@/server/settings';

// Reads the runtime `demoVisible` setting, so it is generated per request
// rather than frozen into the build.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getSettings();
  const now = new Date();

  const routes: Array<{ path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }> = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/features', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/platforms', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/how-it-works', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/pricing', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/integrations', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/help', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/contact', priority: 0.5, changeFrequency: 'yearly' },
    { path: '/legal/terms', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/legal/privacy', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/legal/acceptable-use', priority: 0.3, changeFrequency: 'yearly' },
  ];

  if (settings.demoVisible) {
    routes.splice(1, 0, { path: '/demo', priority: 0.9, changeFrequency: 'monthly' });
  }

  return routes.map((route) => ({
    url: `${SITE.url}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
