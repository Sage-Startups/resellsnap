import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth';

/**
 * Better Auth mounts every auth endpoint here. CSRF protection comes from
 * origin checking against `trustedOrigins`, and session cookies are HTTP-only
 * and secure in production.
 */
export const { GET, POST } = toNextJsHandler(auth.handler);
