/**
 * eBay token lifecycle.
 *
 * Access tokens live ~2 hours; refresh tokens ~18 months. Both are stored
 * AES-256-GCM encrypted in `encrypted_token` and are never logged, never sent
 * to the browser, and never included in audit snapshots.
 *
 * Refresh is serialised per connection with a PostgreSQL advisory lock so two
 * concurrent publish jobs cannot both burn the refresh token and race to write
 * conflicting results.
 */
import { ConnectionState, PlatformKey } from '@/generated/prisma/enums';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { getEnv, isEbayConfigured } from '@/lib/env';
import { logger, sanitizeError } from '@/lib/logger';
import { MarketplaceAuthError } from '../types';
import { ebayBasicAuth, ebayEndpoints, ebayScopeString } from './config';

export interface EbayTokenSet {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken?: string;
  refreshTokenExpiresAt?: Date;
}

interface RawTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type: string;
}

/** Refresh this far before actual expiry so an in-flight call never 401s. */
const EXPIRY_SKEW_MS = 5 * 60_000;

/** How long a refresh will queue behind another process's refresh. */
const REFRESH_LOCK_WAIT_MS = 10_000;

/** Upper bound on holding the lock: one eBay token round trip, plus slack. */
const REFRESH_LOCK_TIMEOUT_MS = 20_000;

async function postToken(body: URLSearchParams): Promise<RawTokenResponse> {
  const response = await fetch(ebayEndpoints().tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${ebayBasicAuth()}`,
      Accept: 'application/json',
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });

  const text = await response.text();

  if (!response.ok) {
    // eBay returns {"error":"invalid_grant","error_description":"..."}.
    let code = `http_${response.status}`;
    let description = 'The eBay token request was rejected.';
    try {
      const parsed = JSON.parse(text) as { error?: string; error_description?: string };
      if (parsed.error) code = parsed.error;
      if (parsed.error_description) description = parsed.error_description;
    } catch {
      // Non-JSON body: keep the generic message rather than leaking HTML.
    }
    throw new MarketplaceAuthError(
      `eBay rejected the token request (${code}): ${description}`,
      code === 'invalid_grant',
    );
  }

  return JSON.parse(text) as RawTokenResponse;
}

function toTokenSet(raw: RawTokenResponse): EbayTokenSet {
  const now = Date.now();
  return {
    accessToken: raw.access_token,
    accessTokenExpiresAt: new Date(now + raw.expires_in * 1000),
    refreshToken: raw.refresh_token,
    refreshTokenExpiresAt: raw.refresh_token_expires_in
      ? new Date(now + raw.refresh_token_expires_in * 1000)
      : undefined,
  };
}

/** Exchanges an authorization code for the initial token pair. */
export async function exchangeAuthorizationCode(code: string): Promise<EbayTokenSet> {
  if (!isEbayConfigured()) {
    throw new MarketplaceAuthError('eBay is not configured on this deployment', false);
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    // eBay expects the RuName here, not the literal callback URL.
    redirect_uri: getEnv().EBAY_REDIRECT_URI as string,
  });

  return toTokenSet(await postToken(body));
}

async function refreshAccessToken(refreshToken: string): Promise<EbayTokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: ebayScopeString(),
  });
  return toTokenSet(await postToken(body));
}

export async function storeTokens(connectionId: string, tokens: EbayTokenSet): Promise<void> {
  const access = encryptSecret(tokens.accessToken);

  await prisma.encryptedToken.upsert({
    where: { connectionId_kind: { connectionId, kind: 'access' } },
    create: {
      connectionId,
      kind: 'access',
      ciphertext: access.ciphertext,
      iv: access.iv,
      authTag: access.authTag,
      keyVersion: access.keyVersion,
      expiresAt: tokens.accessTokenExpiresAt,
    },
    update: {
      ciphertext: access.ciphertext,
      iv: access.iv,
      authTag: access.authTag,
      keyVersion: access.keyVersion,
      expiresAt: tokens.accessTokenExpiresAt,
    },
  });

  // eBay only returns a refresh token on the initial exchange; a refresh
  // response usually omits it, and overwriting it with undefined would break
  // the connection.
  if (tokens.refreshToken) {
    const refresh = encryptSecret(tokens.refreshToken);
    await prisma.encryptedToken.upsert({
      where: { connectionId_kind: { connectionId, kind: 'refresh' } },
      create: {
        connectionId,
        kind: 'refresh',
        ciphertext: refresh.ciphertext,
        iv: refresh.iv,
        authTag: refresh.authTag,
        keyVersion: refresh.keyVersion,
        expiresAt: tokens.refreshTokenExpiresAt,
      },
      update: {
        ciphertext: refresh.ciphertext,
        iv: refresh.iv,
        authTag: refresh.authTag,
        keyVersion: refresh.keyVersion,
        expiresAt: tokens.refreshTokenExpiresAt,
      },
    });
  }

  await prisma.platformConnection.update({
    where: { id: connectionId },
    data: {
      state: ConnectionState.CONNECTED,
      expiresAt: tokens.refreshTokenExpiresAt ?? tokens.accessTokenExpiresAt,
      lastError: null,
    },
  });
}

async function readToken(connectionId: string, kind: 'access' | 'refresh') {
  const record = await prisma.encryptedToken.findUnique({
    where: { connectionId_kind: { connectionId, kind } },
  });
  if (!record) return null;
  return {
    value: decryptSecret({
      ciphertext: record.ciphertext,
      iv: record.iv,
      authTag: record.authTag,
      keyVersion: record.keyVersion,
    }),
    expiresAt: record.expiresAt,
  };
}

/**
 * Serialises token refreshes for one connection across every process.
 *
 * The lock is **transaction scoped** (`pg_advisory_xact_lock`), not session
 * scoped. Prisma talks to PostgreSQL through a connection pool, so a session
 * lock can be taken on one pooled connection and released on another: the
 * release silently fails and the lock then survives for the life of the
 * pooled connection, deadlocking every later refresh. A transaction lock is
 * released by the commit or rollback, so it cannot leak even if `fn` throws
 * or the process dies mid-refresh.
 *
 * `fn` deliberately runs on the ordinary pooled client rather than inside the
 * transaction. Exclusion is what we need here, not atomicity: the lock is held
 * for as long as `fn` runs, so no other backend can refresh the same
 * connection concurrently, while `fn`'s own writes commit independently.
 *
 * The lock is wrapped in a CTE because `pg_advisory_xact_lock` returns `void`,
 * which the driver adapter cannot deserialise as a result column.
 */
async function withConnectionLock<T>(connectionId: string, fn: () => Promise<T>): Promise<T> {
  const lockKey = BigInt.asIntN(
    64,
    BigInt(
      `0x${Buffer.from(connectionId).subarray(0, 8).toString('hex').padEnd(16, '0')}`,
    ),
  );

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`
        WITH lock AS (SELECT pg_advisory_xact_lock(${lockKey}::bigint))
        SELECT 1 AS locked FROM lock
      `;
      return fn();
    },
    {
      // Long enough to cover waiting for the lock plus one bounded eBay round
      // trip, short enough that a wedged refresh cannot pin a connection.
      maxWait: REFRESH_LOCK_WAIT_MS,
      timeout: REFRESH_LOCK_TIMEOUT_MS,
    },
  );
}

/**
 * Returns a usable access token, refreshing it if necessary.
 *
 * Marks the connection `REAUTH_REQUIRED` when the refresh token itself has
 * expired or been revoked — the UI then shows a reconnect prompt instead of
 * failing publishes silently.
 */
export async function getValidAccessToken(connectionId: string): Promise<string> {
  const access = await readToken(connectionId, 'access');

  if (access && access.expiresAt && access.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now()) {
    return access.value;
  }

  return withConnectionLock(connectionId, async () => {
    // Another worker may have refreshed while we waited for the lock.
    const fresh = await readToken(connectionId, 'access');
    if (fresh && fresh.expiresAt && fresh.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now()) {
      return fresh.value;
    }

    const refresh = await readToken(connectionId, 'refresh');
    if (!refresh) {
      await markReauthRequired(connectionId, 'No refresh token is stored for this connection.');
      throw new MarketplaceAuthError('This eBay connection needs to be re-authorised.');
    }

    if (refresh.expiresAt && refresh.expiresAt.getTime() <= Date.now()) {
      await markReauthRequired(connectionId, 'The eBay refresh token has expired.');
      throw new MarketplaceAuthError('Your eBay authorisation has expired. Please reconnect.');
    }

    try {
      const tokens = await refreshAccessToken(refresh.value);
      await storeTokens(connectionId, tokens);
      logger.info('Refreshed eBay access token', { connectionId });
      return tokens.accessToken;
    } catch (error) {
      const requiresReauth = error instanceof MarketplaceAuthError ? error.requiresReauth : false;
      if (requiresReauth) {
        await markReauthRequired(connectionId, sanitizeError(error, 'Token refresh failed'));
      } else {
        await prisma.platformConnection.update({
          where: { id: connectionId },
          data: { state: ConnectionState.ERROR, lastError: sanitizeError(error, 'Token refresh failed') },
        });
      }
      throw error;
    }
  });
}

export async function markReauthRequired(connectionId: string, reason: string): Promise<void> {
  await prisma.platformConnection.update({
    where: { id: connectionId },
    data: { state: ConnectionState.REAUTH_REQUIRED, lastError: reason },
  });
}

/** Revokes locally: deletes stored tokens and resets the connection. */
export async function clearTokens(connectionId: string): Promise<void> {
  await prisma.encryptedToken.deleteMany({ where: { connectionId } });
  await prisma.platformConnection.update({
    where: { id: connectionId },
    data: {
      state: isEbayConfigured() ? ConnectionState.AVAILABLE : ConnectionState.NOT_CONFIGURED,
      externalAccountId: null,
      externalUsername: null,
      expiresAt: null,
      lastError: null,
      setupMetadata: {},
    },
  });
}

export const EBAY_PLATFORM_KEY = PlatformKey.EBAY;
