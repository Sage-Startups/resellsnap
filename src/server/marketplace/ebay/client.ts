/**
 * Thin HTTP client for the eBay Sell APIs.
 *
 * Responsibilities kept deliberately narrow: attach a valid token, set the
 * required marketplace headers, map eBay's error envelope onto our error types,
 * and return sanitised metadata the rest of the app can persist safely.
 */
import { correlationId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { MarketplaceApiError, MarketplaceAuthError } from '../types';
import { ebayContentLanguage, ebayEndpoints, ebayMarketplaceId } from './config';
import { getValidAccessToken, markReauthRequired } from './tokens';

export interface EbayRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  marketplaceId?: string;
  /** Sent as `Content-Language`, required by the Inventory API for writes. */
  contentLanguage?: string;
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
}

export interface EbayResponse<T> {
  data: T;
  status: number;
  /** Safe to store and show to an admin: no tokens, no customer data. */
  metadata: {
    correlationId: string;
    ebayRequestId: string | null;
    status: number;
    path: string;
    durationMs: number;
  };
}

interface EbayErrorEnvelope {
  errors?: Array<{
    errorId?: number;
    domain?: string;
    category?: string;
    message?: string;
    longMessage?: string;
    parameters?: Array<{ name?: string; value?: string }>;
  }>;
}

/** eBay error ids that mean "the seller must fix something", not "retry". */
const NON_RETRYABLE_CATEGORIES = new Set(['REQUEST']);

export function describeEbayErrors(envelope: EbayErrorEnvelope): { code: string; message: string } {
  const first = envelope.errors?.[0];
  if (!first) return { code: 'unknown', message: 'eBay returned an unspecified error.' };

  const parameterDetail = first.parameters?.length
    ? ` (${first.parameters.map((p) => `${p.name}: ${p.value}`).join(', ')})`
    : '';

  return {
    code: String(first.errorId ?? 'unknown'),
    message: `${first.longMessage ?? first.message ?? 'eBay returned an error.'}${parameterDetail}`.slice(0, 500),
  };
}

export async function ebayRequest<T>(
  connectionId: string,
  options: EbayRequestOptions,
): Promise<EbayResponse<T>> {
  const token = await getValidAccessToken(connectionId);
  const marketplaceId = options.marketplaceId ?? ebayMarketplaceId();
  const startedAt = Date.now();
  const correlation = correlationId();

  const url = new URL(`${ebayEndpoints().apiBase}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Language'] = options.contentLanguage ?? ebayContentLanguage(marketplaceId);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    throw new MarketplaceApiError(
      isTimeout ? 'The eBay request timed out.' : 'Could not reach eBay.',
      { code: isTimeout ? 'timeout' : 'network_error', retryable: true },
    );
  }

  const durationMs = Date.now() - startedAt;
  const metadata = {
    correlationId: correlation,
    ebayRequestId: response.headers.get('x-ebay-c-request-id'),
    status: response.status,
    path: options.path,
    durationMs,
  };

  const text = await response.text();

  if (response.status === 401) {
    await markReauthRequired(connectionId, 'eBay rejected the stored credentials.');
    throw new MarketplaceAuthError('Your eBay authorisation is no longer valid. Please reconnect.');
  }

  if (response.status === 429) {
    throw new MarketplaceApiError('eBay rate limit reached. The job will retry shortly.', {
      code: 'rate_limited',
      retryable: true,
      statusCode: 429,
    });
  }

  if (!response.ok) {
    let envelope: EbayErrorEnvelope = {};
    try {
      envelope = JSON.parse(text) as EbayErrorEnvelope;
    } catch {
      // Non-JSON error body — do not echo raw HTML into our logs or UI.
    }

    const { code, message } = describeEbayErrors(envelope);
    const category = envelope.errors?.[0]?.category;
    const retryable = response.status >= 500 || !NON_RETRYABLE_CATEGORIES.has(category ?? '');

    logger.warn('eBay API error', {
      status: response.status,
      path: options.path,
      errorCode: code,
      correlationId: correlation,
    });

    throw new MarketplaceApiError(message, { code, retryable, statusCode: response.status });
  }

  const data = text ? (JSON.parse(text) as T) : ({} as T);
  return { data, status: response.status, metadata };
}
