/**
 * Site-wide constants used by metadata, navigation and structured data.
 *
 * `SITE.url` is read from `APP_URL` so canonical URLs, sitemaps and Open Graph
 * tags are correct on a Railway preview domain and on a custom domain without
 * a rebuild.
 */
export const SITE = {
  name: 'ResellSnap AI',
  tagline: 'Snap it. List it. Sell it.',
  description:
    'Turn item photos into polished marketplace listings in minutes. ResellSnap AI writes editable eBay, Vinted, Depop and Facebook Marketplace drafts from your photos, with transparent price suggestions you control.',
  shortDescription: 'Turn item photos into polished marketplace listings in minutes.',
  get url(): string {
    return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  },
} as const;

export const MARKETING_NAV = [
  { href: '/features', label: 'Features' },
  { href: '/platforms', label: 'Platforms' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/integrations', label: 'Integrations' },
] as const;

export const FOOTER_NAV = [
  {
    heading: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/platforms', label: 'Platforms' },
      { href: '/how-it-works', label: 'How it works' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/demo', label: 'Live demo' },
    ],
  },
  {
    heading: 'Support',
    links: [
      { href: '/help', label: 'Help centre' },
      { href: '/contact', label: 'Contact' },
      { href: '/integrations', label: 'Integrations' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/legal/terms', label: 'Terms of service' },
      { href: '/legal/privacy', label: 'Privacy policy' },
      { href: '/legal/acceptable-use', label: 'Acceptable use' },
    ],
  },
] as const;

/**
 * Shown in the footer and on every marketplace-facing surface. ResellSnap AI is
 * an independent tool; saying so plainly is both legally correct and the sort
 * of thing that builds seller trust.
 */
export const NON_AFFILIATION_NOTICE =
  'ResellSnap AI is an independent product. It is not endorsed by, affiliated with, or sponsored by eBay, Vinted, Depop, Meta or Facebook. All marketplace names are the trademarks of their respective owners.';

export const AI_DISCLAIMER =
  'Generated listings and price suggestions are drafts, not guarantees or professional valuations. You remain responsible for the accuracy of what you publish and for complying with each marketplace’s policies.';
