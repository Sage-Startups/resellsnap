import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

/**
 * Application, admin, auth and API routes are kept out of search results.
 * `/demo` is deliberately indexable — it is a marketing surface.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/app/',
          '/admin/',
          '/api/',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          '/verify-email',
        ],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
