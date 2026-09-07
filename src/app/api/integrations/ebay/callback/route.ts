import { NextResponse } from 'next/server';
import { PlatformKey } from '@/generated/prisma/enums';
import { logger, sanitizeError } from '@/lib/logger';
import { getEnv } from '@/lib/env';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getAdapter } from '@/server/marketplace';

/**
 * eBay OAuth callback.
 *
 * eBay redirects here after the seller authorises (or declines). The `state`
 * parameter is single-use and bound to a workspace, which is what makes this
 * safe against a forged callback.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const appUrl = getEnv().APP_URL;

  const redirect = (path: string, params: Record<string, string> = {}) => {
    const target = new URL(path, appUrl);
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
    return NextResponse.redirect(target);
  };

  try {
    const forwarded = request.headers.get('x-forwarded-for');
    await enforceRateLimit(
      'oauthCallback',
      forwarded?.split(',')[0]?.trim() ?? 'unknown',
    );
  } catch {
    return redirect('/app/integrations', { error: 'rate_limited' });
  }

  // The seller pressed "decline" on eBay's screen. Not an error worth alarming
  // them about — just take them back.
  const declined = url.searchParams.get('error');
  if (declined) {
    logger.info('eBay authorisation declined by the user', { reason: declined });
    return redirect('/app/integrations', { error: 'declined' });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return redirect('/app/integrations', { error: 'invalid_callback' });
  }

  try {
    const adapter = getAdapter(PlatformKey.EBAY);
    if (!adapter.handleAuthorizationCallback) {
      return redirect('/app/integrations', { error: 'not_supported' });
    }

    const result = await adapter.handleAuthorizationCallback({ code, state });
    logger.info('eBay account connected', { connectionId: result.connectionId });

    return redirect(result.redirectTo ?? '/app/integrations', { connected: 'ebay' });
  } catch (error) {
    logger.warn('eBay callback failed', { reason: sanitizeError(error, 'callback failed') });
    return redirect('/app/integrations', { error: 'connection_failed' });
  }
}
