import type { NextConfig } from 'next';

/**
 * Content Security Policy.
 *
 * Kept practical: no remote script hosts, no remote image hosts. Everything the
 * app renders is either bundled or served from our own origin / our private
 * storage bucket via signed URLs (which is why the bucket origin is allowed for
 * `img-src` and `connect-src` when configured).
 */
function buildCsp(): string {
  const bucketOrigin = (() => {
    const endpoint = process.env.S3_ENDPOINT;
    if (!endpoint) return '';
    try {
      return new URL(endpoint).origin;
    } catch {
      return '';
    }
  })();

  const isDev = process.env.NODE_ENV !== 'production';

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // Next.js injects inline bootstrap scripts; 'unsafe-eval' is only needed by
    // the dev-mode React refresh runtime.
    'script-src': ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', bucketOrigin].filter(Boolean),
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", bucketOrigin, ...(isDev ? ['ws:'] : [])].filter(Boolean),
    'frame-src': ["'self'", 'https://js.stripe.com', 'https://checkout.stripe.com'],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'worker-src': ["'self'", 'blob:'],
  };

  if (!isDev) directives['upgrade-insecure-requests'] = [];

  return Object.entries(directives)
    .map(([key, values]) => (values.length ? `${key} ${values.join(' ')}` : key))
    .join('; ');
}

const securityHeaders = [
  { key: 'Content-Security-Policy', value: buildCsp() },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  // `standalone` produces a minimal, traced server bundle. The shipped image
  // does not use it — that image also runs the worker, which executes
  // TypeScript from `src/` and needs the full production dependency tree — but
  // it stays available for anyone deploying the web service on its own. It is
  // opt-in because it is incompatible with `next start`, which local
  // development, CI and the image itself all rely on.
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  // Development only: the dev server refuses cross-origin HMR requests, which
  // breaks local testing against 127.0.0.1 rather than localhost.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['sharp', '@prisma/client'],
  experimental: {
    // Server Actions are only ever invoked from our own origin.
    serverActions: { bodySizeLimit: '2mb' },
  },
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
