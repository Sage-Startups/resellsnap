/**
 * eBay environment configuration.
 *
 * Endpoints verified against eBay's official developer documentation:
 *   • OAuth authorization-code grant — the `auth.ebay.com` / `auth.sandbox.ebay.com`
 *     authorize host and the `identity/v1/oauth2/token` token endpoint.
 *   • Sell Inventory API v1 under the `api.ebay.com` / `api.sandbox.ebay.com` host.
 *
 * One subtlety that bites every eBay integration: the `redirect_uri` parameter
 * is NOT a URL. It is the *RuName* ("Redirect URL name") generated in the eBay
 * developer console, which itself points at the real callback URL. That is why
 * `EBAY_REDIRECT_URI` holds a RuName and is not validated as a URL.
 */
import { getEnv } from '@/lib/env';

export interface EbayEndpoints {
  authorizeUrl: string;
  tokenUrl: string;
  apiBase: string;
  webBase: string;
}

const ENDPOINTS: Record<'sandbox' | 'production', EbayEndpoints> = {
  sandbox: {
    authorizeUrl: 'https://auth.sandbox.ebay.com/oauth2/authorize',
    tokenUrl: 'https://api.sandbox.ebay.com/identity/v1/oauth2/token',
    apiBase: 'https://api.sandbox.ebay.com',
    webBase: 'https://www.sandbox.ebay.com',
  },
  production: {
    authorizeUrl: 'https://auth.ebay.com/oauth2/authorize',
    tokenUrl: 'https://api.ebay.com/identity/v1/oauth2/token',
    apiBase: 'https://api.ebay.com',
    webBase: 'https://www.ebay.com',
  },
};

export function ebayEndpoints(): EbayEndpoints {
  return ENDPOINTS[getEnv().EBAY_ENVIRONMENT];
}

/**
 * Least-privilege scope set.
 *
 * `sell.inventory` is the only write scope requested — enough to create and
 * publish offers, and nothing more. Account and fulfilment are read-only, used
 * to discover business policies and to reconcile orders. Scope strings always
 * use the `api.ebay.com` host, including in sandbox.
 */
export const EBAY_SCOPES = [
  // Base scope, required for the Taxonomy API category/aspect lookups.
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
] as const;

export function ebayScopeString(): string {
  return EBAY_SCOPES.join(' ');
}

/** Basic credential for the token endpoint. */
export function ebayBasicAuth(): string {
  const env = getEnv();
  return Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`).toString('base64');
}

export function ebayMarketplaceId(): string {
  return getEnv().EBAY_MARKETPLACE_ID;
}

/** Content-Language required by the Inventory API, derived from the marketplace. */
export function ebayContentLanguage(marketplaceId: string = ebayMarketplaceId()): string {
  const map: Record<string, string> = {
    EBAY_US: 'en-US',
    EBAY_GB: 'en-GB',
    EBAY_AU: 'en-AU',
    EBAY_CA: 'en-CA',
    EBAY_DE: 'de-DE',
    EBAY_FR: 'fr-FR',
    EBAY_IT: 'it-IT',
    EBAY_ES: 'es-ES',
  };
  return map[marketplaceId] ?? 'en-US';
}

export function ebayListingUrl(listingId: string): string {
  return `${ebayEndpoints().webBase}/itm/${listingId}`;
}
