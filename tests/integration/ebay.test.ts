import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionState, PlatformKey, PublicationStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { resetEnvCacheForTests } from '@/lib/env';
import { decryptSecret } from '@/lib/crypto';
import { EbayAdapter } from '@/server/marketplace/ebay/adapter';
import { getValidAccessToken, storeTokens } from '@/server/marketplace/ebay/tokens';
import { MarketplaceAuthError } from '@/server/marketplace/types';
import {
  createTestItem, createTestWorkspace, destroyTestWorkspace, ensureReferenceData,
  type TestWorkspace,
} from '../helpers/db';

const created: TestWorkspace[] = [];
const originalFetch = globalThis.fetch;

/** Shapes taken from eBay's documented responses, not invented. */
const TOKEN_RESPONSE = {
  access_token: 'v^1.1#i^1#access-token-value',
  expires_in: 7200,
  refresh_token: 'v^1.1#i^1#refresh-token-value',
  refresh_token_expires_in: 47_304_000,
  token_type: 'User Access Token',
};

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    return handler(url, init);
  }) as typeof fetch;
}

async function freshWorkspace() {
  const workspace = await createTestWorkspace({ purchasedCredits: 5 });
  created.push(workspace);
  return workspace;
}

async function createConnection(workspaceId: string) {
  const platform = await prisma.platform.findUniqueOrThrow({ where: { key: PlatformKey.EBAY } });
  return prisma.platformConnection.create({
    data: {
      workspaceId,
      platformId: platform.id,
      state: ConnectionState.CONNECTED,
      environment: 'sandbox',
      marketplaceId: 'EBAY_US',
      setupMetadata: {
        fulfillmentPolicyId: 'f1',
        paymentPolicyId: 'p1',
        returnPolicyId: 'r1',
        merchantLocationKey: 'loc1',
        categoryTreeId: '0',
      },
    },
  });
}

beforeAll(async () => {
  await ensureReferenceData();
});

beforeEach(() => {
  process.env.EBAY_CLIENT_ID = 'test-client-id';
  process.env.EBAY_CLIENT_SECRET = 'test-client-secret';
  process.env.EBAY_REDIRECT_URI = 'Test-RuName-Value';
  process.env.EBAY_ENVIRONMENT = 'sandbox';
  resetEnvCacheForTests();
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  for (const entry of created.splice(0)) await destroyTestWorkspace(entry);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('eBay OAuth', () => {
  it('builds an authorization URL with a single-use state', async () => {
    const workspace = await freshWorkspace();
    const adapter = new EbayAdapter();

    const { url, state } = await adapter.buildAuthorizationUrl({
      workspaceId: workspace.workspaceId,
      userId: workspace.userId,
    });

    const parsed = new URL(url);
    expect(parsed.host).toBe('auth.sandbox.ebay.com');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('test-client-id');
    // eBay expects the RuName here, not a literal callback URL.
    expect(parsed.searchParams.get('redirect_uri')).toBe('Test-RuName-Value');
    expect(parsed.searchParams.get('state')).toBe(state);
    expect(parsed.searchParams.get('scope')).toContain('sell.inventory');

    const record = await prisma.oAuthState.findUnique({ where: { state } });
    expect(record?.workspaceId).toBe(workspace.workspaceId);
    expect(record?.consumedAt).toBeNull();
  });

  it('exchanges the code and stores tokens encrypted', async () => {
    const workspace = await freshWorkspace();
    const adapter = new EbayAdapter();
    const { state } = await adapter.buildAuthorizationUrl({
      workspaceId: workspace.workspaceId,
      userId: workspace.userId,
    });

    mockFetch((url) => {
      if (url.includes('/identity/v1/oauth2/token')) {
        return new Response(JSON.stringify(TOKEN_RESPONSE), { status: 200 });
      }
      // Setup discovery calls: not the subject of this test.
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const result = await adapter.handleAuthorizationCallback({ code: 'auth-code', state });
    expect(result.workspaceId).toBe(workspace.workspaceId);

    const tokens = await prisma.encryptedToken.findMany({
      where: { connectionId: result.connectionId },
    });
    expect(tokens.map((token) => token.kind).sort()).toEqual(['access', 'refresh']);

    // The stored row must not contain the token in the clear.
    for (const token of tokens) {
      expect(token.ciphertext).not.toContain('access-token-value');
      expect(token.ciphertext).not.toContain('refresh-token-value');
    }

    const access = tokens.find((token) => token.kind === 'access')!;
    expect(decryptSecret(access)).toBe(TOKEN_RESPONSE.access_token);
  });

  it('refuses a replayed state', async () => {
    const workspace = await freshWorkspace();
    const adapter = new EbayAdapter();
    const { state } = await adapter.buildAuthorizationUrl({
      workspaceId: workspace.workspaceId,
      userId: workspace.userId,
    });

    mockFetch(() => new Response(JSON.stringify(TOKEN_RESPONSE), { status: 200 }));

    await adapter.handleAuthorizationCallback({ code: 'code-1', state });

    // Consuming the state is what makes a forged or replayed callback useless.
    await expect(
      adapter.handleAuthorizationCallback({ code: 'code-2', state }),
    ).rejects.toBeInstanceOf(MarketplaceAuthError);
  });

  it('refuses an unknown state', async () => {
    const adapter = new EbayAdapter();
    await expect(
      adapter.handleAuthorizationCallback({ code: 'code', state: 'never-issued' }),
    ).rejects.toBeInstanceOf(MarketplaceAuthError);
  });

  it('refuses an expired state', async () => {
    const workspace = await freshWorkspace();
    const adapter = new EbayAdapter();
    const { state } = await adapter.buildAuthorizationUrl({
      workspaceId: workspace.workspaceId,
      userId: workspace.userId,
    });

    await prisma.oAuthState.update({
      where: { state },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      adapter.handleAuthorizationCallback({ code: 'code', state }),
    ).rejects.toBeInstanceOf(MarketplaceAuthError);
  });
});

describe('eBay token refresh', () => {
  it('returns a cached token that is still valid', async () => {
    const workspace = await freshWorkspace();
    const connection = await createConnection(workspace.workspaceId);

    await storeTokens(connection.id, {
      accessToken: 'still-valid',
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      refreshToken: 'refresh',
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
    });

    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;

    expect(await getValidAccessToken(connection.id)).toBe('still-valid');
    // No network call: refreshing a valid token wastes a request and risks a
    // race for no benefit.
    expect(spy).not.toHaveBeenCalled();
  });

  it('refreshes an expired access token', async () => {
    const workspace = await freshWorkspace();
    const connection = await createConnection(workspace.workspaceId);

    await storeTokens(connection.id, {
      accessToken: 'expired',
      accessTokenExpiresAt: new Date(Date.now() - 1000),
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
    });

    let refreshCalls = 0;
    mockFetch((url, init) => {
      if (url.includes('/identity/v1/oauth2/token')) {
        refreshCalls += 1;
        expect(String(init?.body)).toContain('grant_type=refresh_token');
        return new Response(
          JSON.stringify({ access_token: 'freshly-minted', expires_in: 7200, token_type: 'User Access Token' }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    });

    expect(await getValidAccessToken(connection.id)).toBe('freshly-minted');
    expect(refreshCalls).toBe(1);
  });

  it('keeps the refresh token when eBay omits it from a refresh response', async () => {
    const workspace = await freshWorkspace();
    const connection = await createConnection(workspace.workspaceId);

    await storeTokens(connection.id, {
      accessToken: 'expired',
      accessTokenExpiresAt: new Date(Date.now() - 1000),
      refreshToken: 'long-lived-refresh',
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
    });

    mockFetch(() =>
      new Response(
        JSON.stringify({ access_token: 'new-access', expires_in: 7200, token_type: 'User Access Token' }),
        { status: 200 },
      ),
    );

    await getValidAccessToken(connection.id);

    // Overwriting the refresh token with undefined would break the connection
    // permanently, and eBay routinely omits it on refresh.
    const refresh = await prisma.encryptedToken.findFirst({
      where: { connectionId: connection.id, kind: 'refresh' },
    });
    expect(decryptSecret(refresh!)).toBe('long-lived-refresh');
  });

  it('marks the connection for re-authorisation when the refresh token is rejected', async () => {
    const workspace = await freshWorkspace();
    const connection = await createConnection(workspace.workspaceId);

    await storeTokens(connection.id, {
      accessToken: 'expired',
      accessTokenExpiresAt: new Date(Date.now() - 1000),
      refreshToken: 'revoked',
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
    });

    mockFetch(() =>
      new Response(
        JSON.stringify({ error: 'invalid_grant', error_description: 'the refresh token is invalid' }),
        { status: 400 },
      ),
    );

    await expect(getValidAccessToken(connection.id)).rejects.toBeInstanceOf(MarketplaceAuthError);

    const updated = await prisma.platformConnection.findUniqueOrThrow({
      where: { id: connection.id },
    });
    expect(updated.state).toBe(ConnectionState.REAUTH_REQUIRED);
  });

  it('does not refresh concurrently for the same connection', async () => {
    const workspace = await freshWorkspace();
    const connection = await createConnection(workspace.workspaceId);

    await storeTokens(connection.id, {
      accessToken: 'expired',
      accessTokenExpiresAt: new Date(Date.now() - 1000),
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
    });

    let refreshCalls = 0;
    mockFetch(async () => {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return new Response(
        JSON.stringify({ access_token: `token-${refreshCalls}`, expires_in: 7200, token_type: 'User Access Token' }),
        { status: 200 },
      );
    });

    const tokens = await Promise.all([
      getValidAccessToken(connection.id),
      getValidAccessToken(connection.id),
      getValidAccessToken(connection.id),
    ]);

    // The advisory lock means one refresh; the others reuse its result. More
    // than one would race to burn the refresh token.
    expect(refreshCalls).toBe(1);
    expect(new Set(tokens).size).toBe(1);
  });
});

describe('eBay publish state machine', () => {
  async function readyItem(workspaceId: string) {
    const itemId = await createTestItem(workspaceId, { status: 'READY' });

    await prisma.itemPhoto.create({
      data: {
        itemId,
        status: 'PROCESSED',
        objectKey: `workspaces/${workspaceId}/items/${itemId}/photos/a.jpg`,
        contentType: 'image/jpeg',
        byteSize: 1000,
        position: 0,
      },
    });

    const listing = await prisma.listing.create({
      data: {
        itemId,
        title: 'Cream leather trainers UK 8',
        description: 'Very good used condition with light scuffing on the right toe.',
        conditionSummary: 'Very good used condition',
      },
    });

    await prisma.listingVariant.create({
      data: {
        listingId: listing.id,
        platform: PlatformKey.EBAY,
        title: 'Cream Leather Trainers UK 8 Very Good Condition',
        description: 'Very good used condition with light scuffing on the right toe.',
        fields: { categoryId: '15709', conditionDescriptor: 'USED_VERY_GOOD', itemSpecifics: ['Colour: Cream'] },
        isComplete: true,
      },
    });

    await prisma.priceSuggestion.create({
      data: {
        itemId,
        strategy: 'BALANCED',
        amountCents: 3200,
        source: 'ADMIN_HEURISTIC',
        confidence: 'LOW',
        explanation: 'Category guideline',
      },
    });

    return itemId;
  }

  it('publishes only after eBay returns a listing id', async () => {
    const workspace = await freshWorkspace();
    const connection = await createConnection(workspace.workspaceId);
    const itemId = await readyItem(workspace.workspaceId);

    await storeTokens(connection.id, {
      accessToken: 'valid',
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      refreshToken: 'refresh',
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
    });

    const calls: string[] = [];
    mockFetch((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);

      if (url.includes('/inventory_item/')) return new Response(null, { status: 204 });
      if (url.includes('/offer/') && url.endsWith('/publish')) {
        return new Response(JSON.stringify({ listingId: '110512345678' }), { status: 200 });
      }
      if (url.includes('/sell/inventory/v1/offer') && init?.method === 'POST') {
        return new Response(JSON.stringify({ offerId: 'offer-123' }), { status: 201 });
      }
      // The pre-flight "does an offer already exist for this SKU" lookup.
      if (url.includes('/sell/inventory/v1/offer')) {
        return new Response(JSON.stringify({ offers: [] }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    const adapter = new EbayAdapter();
    const result = await adapter.publish({
      itemId,
      workspaceId: workspace.workspaceId,
      connectionId: connection.id,
      idempotencyKey: `publish:${itemId}:test-1`,
      confirmedByUser: true,
    });

    expect(result.status).toBe(PublicationStatus.PUBLISHED);
    expect(result.externalListingId).toBe('110512345678');
    expect(result.externalUrl).toContain('110512345678');

    // The documented three-call sequence, in order.
    expect(calls.some((call) => call.startsWith('PUT /sell/inventory/v1/inventory_item/'))).toBe(true);
    expect(calls).toContain('POST /sell/inventory/v1/offer');
    expect(calls.some((call) => call.includes('/publish'))).toBe(true);

    const external = await prisma.externalListing.findFirst({ where: { itemId } });
    expect(external?.externalId).toBe('110512345678');
  });

  it('does NOT report success when eBay returns no listing id', async () => {
    const workspace = await freshWorkspace();
    const connection = await createConnection(workspace.workspaceId);
    const itemId = await readyItem(workspace.workspaceId);

    await storeTokens(connection.id, {
      accessToken: 'valid',
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      refreshToken: 'refresh',
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
    });

    mockFetch((url, init) => {
      if (url.includes('/inventory_item/')) return new Response(null, { status: 204 });
      // A 200 with warnings but no listingId: the item is NOT live.
      if (url.endsWith('/publish')) {
        return new Response(JSON.stringify({ warnings: [{ message: 'something' }] }), { status: 200 });
      }
      if (url.includes('/sell/inventory/v1/offer') && init?.method === 'POST') {
        return new Response(JSON.stringify({ offerId: 'offer-123' }), { status: 201 });
      }
      return new Response(JSON.stringify({ offers: [] }), { status: 200 });
    });

    const adapter = new EbayAdapter();
    const result = await adapter.publish({
      itemId,
      workspaceId: workspace.workspaceId,
      connectionId: connection.id,
      idempotencyKey: `publish:${itemId}:test-2`,
      confirmedByUser: true,
    });

    expect(result.status).toBe(PublicationStatus.FAILED);
    expect(result.errorCode).toBe('no_listing_id');
    expect(await prisma.externalListing.count({ where: { itemId } })).toBe(0);
  });

  it('is idempotent: the same key never creates a second listing', async () => {
    const workspace = await freshWorkspace();
    const connection = await createConnection(workspace.workspaceId);
    const itemId = await readyItem(workspace.workspaceId);

    await storeTokens(connection.id, {
      accessToken: 'valid',
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      refreshToken: 'refresh',
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
    });

    let publishCalls = 0;
    mockFetch((url, init) => {
      if (url.includes('/inventory_item/')) return new Response(null, { status: 204 });
      if (url.endsWith('/publish')) {
        publishCalls += 1;
        return new Response(JSON.stringify({ listingId: '110599999999' }), { status: 200 });
      }
      if (url.includes('/sell/inventory/v1/offer') && init?.method === 'POST') {
        return new Response(JSON.stringify({ offerId: 'offer-999' }), { status: 201 });
      }
      return new Response(JSON.stringify({ offers: [] }), { status: 200 });
    });

    const adapter = new EbayAdapter();
    const key = `publish:${itemId}:same-key`;

    const first = await adapter.publish({
      itemId, workspaceId: workspace.workspaceId, connectionId: connection.id,
      idempotencyKey: key, confirmedByUser: true,
    });
    const second = await adapter.publish({
      itemId, workspaceId: workspace.workspaceId, connectionId: connection.id,
      idempotencyKey: key, confirmedByUser: true,
    });

    expect(first.status).toBe(PublicationStatus.PUBLISHED);
    expect(second.status).toBe(PublicationStatus.PUBLISHED);
    // Two live eBay listings for one physical item would be a real problem for
    // the seller, so the second call must short-circuit.
    expect(publishCalls).toBe(1);
    expect(await prisma.publicationAttempt.count({ where: { itemId } })).toBe(1);
  });

  it('records a sanitised error and never a token', async () => {
    const workspace = await freshWorkspace();
    const connection = await createConnection(workspace.workspaceId);
    const itemId = await readyItem(workspace.workspaceId);

    await storeTokens(connection.id, {
      accessToken: 'super-secret-token',
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      refreshToken: 'refresh',
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
    });

    mockFetch(() =>
      new Response(
        JSON.stringify({
          errors: [
            {
              errorId: 25002,
              category: 'REQUEST',
              longMessage: 'A user error has occurred. The SKU is already in use.',
            },
          ],
        }),
        { status: 400 },
      ),
    );

    const adapter = new EbayAdapter();
    const result = await adapter.publish({
      itemId, workspaceId: workspace.workspaceId, connectionId: connection.id,
      idempotencyKey: `publish:${itemId}:err`, confirmedByUser: true,
    });

    expect(result.status).toBe(PublicationStatus.FAILED);
    expect(result.errorMessage).toContain('SKU is already in use');

    const attempt = await prisma.publicationAttempt.findFirstOrThrow({ where: { itemId } });
    const serialised = JSON.stringify(attempt);
    expect(serialised).not.toContain('super-secret-token');
  });

  it('blocks a publish that fails validation before calling eBay', async () => {
    const workspace = await freshWorkspace();
    const connection = await createConnection(workspace.workspaceId);
    // No listing, no photos, no price.
    const itemId = await createTestItem(workspace.workspaceId);

    await storeTokens(connection.id, {
      accessToken: 'valid',
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      refreshToken: 'refresh',
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
    });

    const spy = vi.fn(async () => new Response('{}', { status: 200 }));
    globalThis.fetch = spy as unknown as typeof fetch;

    const adapter = new EbayAdapter();
    const result = await adapter.publish({
      itemId, workspaceId: workspace.workspaceId, connectionId: connection.id,
      idempotencyKey: `publish:${itemId}:invalid`, confirmedByUser: true,
    });

    expect(result.status).toBe(PublicationStatus.FAILED);
    expect(result.errorCode).toBe('validation_failed');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('eBay capability reporting', () => {
  it('reports NOT_CONFIGURED without credentials', async () => {
    delete process.env.EBAY_CLIENT_ID;
    resetEnvCacheForTests();

    const workspace = await freshWorkspace();
    const status = await new EbayAdapter().getStatus(workspace.workspaceId);

    expect(status.state).toBe(ConnectionState.NOT_CONFIGURED);
    expect(status.capabilities.canPublish).toBe(false);
    expect(status.badge).toBe('APPROVED_ACCESS_REQUIRED');
  });

  it('reports AVAILABLE when configured but not yet connected', async () => {
    const workspace = await freshWorkspace();
    const status = await new EbayAdapter().getStatus(workspace.workspaceId);

    expect(status.state).toBe(ConnectionState.AVAILABLE);
    expect(status.badge).toBe('DIRECT_PUBLISHING');
  });

  it('lists missing business policies as setup issues', async () => {
    const workspace = await freshWorkspace();
    const platform = await prisma.platform.findUniqueOrThrow({ where: { key: PlatformKey.EBAY } });

    await prisma.platformConnection.create({
      data: {
        workspaceId: workspace.workspaceId,
        platformId: platform.id,
        state: ConnectionState.CONNECTED,
        environment: 'sandbox',
        setupMetadata: {},
      },
    });

    const status = await new EbayAdapter().getStatus(workspace.workspaceId);

    // eBay refuses to publish without these, so telling the seller up front
    // turns a cryptic API failure into a checklist.
    expect(status.setupIssues.length).toBe(4);
    expect(status.setupIssues.join(' ')).toContain('payment business policy');
    expect(status.setupIssues.join(' ')).toContain('inventory location');
  });

  it('removes every capability when the kill switch is thrown', async () => {
    const workspace = await freshWorkspace();
    const platform = await prisma.platform.findUniqueOrThrow({ where: { key: PlatformKey.EBAY } });

    await prisma.platformCapability.update({
      where: { platformId: platform.id },
      data: { killSwitch: true, unavailableReason: 'Paused during an incident' },
    });

    const status = await new EbayAdapter().getStatus(workspace.workspaceId);

    expect(status.capabilities.canPublish).toBe(false);
    expect(status.capabilities.canConnect).toBe(false);
    expect(status.badge).toBe('TEMPORARILY_UNAVAILABLE');
    expect(status.statusMessage).toContain('Paused during an incident');

    await prisma.platformCapability.update({
      where: { platformId: platform.id },
      data: { killSwitch: false, unavailableReason: null },
    });
  });
});
