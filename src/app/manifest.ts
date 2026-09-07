import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: 'ResellSnap',
    description: SITE.shortDescription,
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#faf9f5',
    theme_color: '#faf9f5',
    orientation: 'portrait-primary',
    categories: ['business', 'productivity', 'shopping'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
