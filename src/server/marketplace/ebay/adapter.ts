/**
 * eBay marketplace adapter — the one genuine direct integration in this release.
 *
 * Publish is a deliberate state machine, not a single call:
 *   PENDING → VALIDATING → PUBLISHING → PUBLISHED | FAILED
 * Each transition is persisted on a `PublicationAttempt` row keyed by an
 * idempotency key, so a refresh, a retry or a double-click can never create two
 * eBay listings. We report success only when eBay returns a listing id.
 */
import { randomUUID } from 'node:crypto';
import { ConnectionState, PlatformKey, PublicationStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { getEnv, isEbayConfigured } from '@/lib/env';
import { logger, sanitizeError } from '@/lib/logger';
import { getStorage } from '@/server/storage';
import {
  MarketplaceApiError,
  MarketplaceAuthError,
  MarketplaceNotSupportedError,
  type MarketplaceAdapter,
  type MarketplaceCapabilities,
  type PlatformStatus,
  type PublishInput,
  type PublishResult,
} from '../types';
import { findPlatformSeed } from '../registry';
import { ebayEndpoints, ebayListingUrl, ebayMarketplaceId, ebayScopeString } from './config';
import { ebayRequest } from './client';
import { clearTokens, exchangeAuthorizationCode, storeTokens } from './tokens';
import { buildInventoryItem, buildOffer, toEbaySku } from './mapping';

const SEED = findPlatformSeed(PlatformKey.EBAY);

interface EbayPolicySummary {
  fulfillmentPolicyId?: string;
  paymentPolicyId?: string;
  returnPolicyId?: string;
  merchantLocationKey?: string;
  categoryTreeId?: string;
  username?: string;
}

export class EbayAdapter implements MarketplaceAdapter {
  readonly key = PlatformKey.EBAY;
  readonly name = SEED.name;
  readonly sellerUrl = SEED.sellerUrl;

  isConfigured(): boolean {
    return isEbayConfigured();
  }

  declaredCapabilities(): MarketplaceCapabilities {
    return { ...SEED.capabilities };
  }

  async getStatus(workspaceId: string): Promise<PlatformStatus> {
    const platform = await prisma.platform.findUnique({
      where: { key: PlatformKey.EBAY },
      include: { capability: true },
    });

    const adminCapabilities = platform?.capability;
    const killed = adminCapabilities?.killSwitch ?? false;

    // Effective capability = what the adapter can do ∩ what an admin allows.
    const declared = this.declaredCapabilities();
    const capabilities: MarketplaceCapabilities = killed
      ? {
          canConnect: false,
          canCreateDraft: false,
          canPublish: false,
          canUpdate: false,
          canEnd: false,
          canReadListings: false,
          canReadOrders: false,
          canFetchComparables: false,
        }
      : {
          canConnect: declared.canConnect && (adminCapabilities?.canConnect ?? true),
          canCreateDraft: declared.canCreateDraft && (adminCapabilities?.canCreateDraft ?? true),
          canPublish: declared.canPublish && (adminCapabilities?.canPublish ?? true),
          canUpdate: declared.canUpdate && (adminCapabilities?.canUpdate ?? true),
          canEnd: declared.canEnd && (adminCapabilities?.canEnd ?? true),
          canReadListings: declared.canReadListings && (adminCapabilities?.canReadListings ?? true),
          canReadOrders: declared.canReadOrders && (adminCapabilities?.canReadOrders ?? true),
          canFetchComparables: false,
        };

    const connection = platform
      ? await prisma.platformConnection.findUnique({
          where: { workspaceId_platformId: { workspaceId, platformId: platform.id } },
        })
      : null;

    if (killed) {
      return {
        key: this.key,
        name: this.name,
        sellerUrl: this.sellerUrl,
        state: ConnectionState.ERROR,
        badge: 'TEMPORARILY_UNAVAILABLE',
        capabilities,
        statusMessage:
          adminCapabilities?.unavailableReason ??
          'eBay publishing is temporarily paused by the operator. Exports are unaffected.',
        setupIssues: [],
      };
    }

    if (!this.isConfigured()) {
      return {
        key: this.key,
        name: this.name,
        sellerUrl: this.sellerUrl,
        state: ConnectionState.NOT_CONFIGURED,
        badge: 'APPROVED_ACCESS_REQUIRED',
        capabilities: { ...capabilities, canConnect: false, canPublish: false },
        statusMessage:
          'eBay API credentials have not been added to this deployment yet. You can still use the export workflow.',
        setupIssues: [],
      };
    }

    if (!connection || connection.state === ConnectionState.AVAILABLE || connection.state === ConnectionState.NOT_CONFIGURED) {
      return {
        key: this.key,
        name: this.name,
        sellerUrl: this.sellerUrl,
        state: ConnectionState.AVAILABLE,
        badge: 'DIRECT_PUBLISHING',
        capabilities,
        statusMessage: `Connect your eBay seller account to publish directly (${getEnv().EBAY_ENVIRONMENT} environment).`,
        setupIssues: [],
      };
    }

    const metadata = (connection.setupMetadata ?? {}) as EbayPolicySummary;
    const setupIssues = describeSetupIssues(metadata);

    const badge =
      connection.state === ConnectionState.CONNECTED && setupIssues.length === 0
        ? 'DIRECT_PUBLISHING'
        : connection.state === ConnectionState.CONNECTED
          ? 'DIRECT_PUBLISHING'
          : 'APPROVED_ACCESS_REQUIRED';

    return {
      key: this.key,
      name: this.name,
      sellerUrl: this.sellerUrl,
      state: connection.state,
      badge,
      capabilities,
      connectionId: connection.id,
      externalUsername: connection.externalUsername,
      environment: connection.environment,
      expiresAt: connection.expiresAt,
      lastError: connection.lastError,
      statusMessage: describeConnectionState(connection.state, connection.environment),
      setupIssues,
    };
  }

  // --- OAuth ---------------------------------------------------------------

  async buildAuthorizationUrl(input: {
    workspaceId: string;
    userId: string;
    redirectTo?: string;
  }): Promise<{ url: string; state: string }> {
    if (!this.isConfigured()) {
      throw new MarketplaceAuthError('eBay is not configured on this deployment.', false);
    }

    // eBay's authorization-code grant authenticates the client with a secret at
    // the token endpoint and does not support PKCE, so `state` is the CSRF
    // control. It is single-use, short-lived and bound to the workspace.
    const state = randomUUID();

    await prisma.oAuthState.create({
      data: {
        state,
        workspaceId: input.workspaceId,
        userId: input.userId,
        platform: PlatformKey.EBAY,
        redirectTo: input.redirectTo ?? '/app/integrations',
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });

    const url = new URL(ebayEndpoints().authorizeUrl);
    url.searchParams.set('client_id', getEnv().EBAY_CLIENT_ID as string);
    url.searchParams.set('response_type', 'code');
    // eBay expects the RuName here, not the literal callback URL.
    url.searchParams.set('redirect_uri', getEnv().EBAY_REDIRECT_URI as string);
    url.searchParams.set('scope', ebayScopeString());
    url.searchParams.set('state', state);

    return { url: url.toString(), state };
  }

  async handleAuthorizationCallback(input: {
    code: string;
    state: string;
  }): Promise<{ connectionId: string; workspaceId: string; redirectTo: string | null }> {
    // Consume the state atomically: a replayed callback finds nothing.
    const consumed = await prisma.oAuthState.updateMany({
      where: {
        state: input.state,
        platform: PlatformKey.EBAY,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });

    if (consumed.count === 0) {
      throw new MarketplaceAuthError(
        'That eBay authorisation link has expired or was already used. Please start again.',
        false,
      );
    }

    const record = await prisma.oAuthState.findUnique({ where: { state: input.state } });
    if (!record) throw new MarketplaceAuthError('Invalid authorisation state.', false);

    const tokens = await exchangeAuthorizationCode(input.code);

    const platform = await prisma.platform.findUniqueOrThrow({ where: { key: PlatformKey.EBAY } });
    const connection = await prisma.platformConnection.upsert({
      where: { workspaceId_platformId: { workspaceId: record.workspaceId, platformId: platform.id } },
      create: {
        workspaceId: record.workspaceId,
        platformId: platform.id,
        state: ConnectionState.CONNECTED,
        environment: getEnv().EBAY_ENVIRONMENT,
        marketplaceId: ebayMarketplaceId(),
        scopes: [...ebayScopeString().split(' ')],
      },
      update: {
        state: ConnectionState.CONNECTED,
        environment: getEnv().EBAY_ENVIRONMENT,
        marketplaceId: ebayMarketplaceId(),
        scopes: [...ebayScopeString().split(' ')],
        lastError: null,
      },
    });

    await storeTokens(connection.id, tokens);

    // Best-effort readiness discovery: a missing policy is a setup prompt, not
    // a failed connection.
    try {
      await this.refreshSetupMetadata(connection.id);
    } catch (error) {
      logger.warn('Could not read eBay seller setup after connecting', {
        connectionId: connection.id,
        error,
      });
    }

    await prisma.analyticsEvent.create({
      data: {
        name: 'CONNECTION_ESTABLISHED',
        workspaceId: record.workspaceId,
        userId: record.userId,
        properties: { platform: 'EBAY' },
      },
    });

    return {
      connectionId: connection.id,
      workspaceId: record.workspaceId,
      redirectTo: record.redirectTo,
    };
  }

  async disconnect(connectionId: string): Promise<void> {
    await clearTokens(connectionId);
  }

  /**
   * Pulls the seller's business policies and inventory location.
   *
   * eBay refuses to publish an offer without all three policies and a location,
   * so discovering them up front turns a cryptic publish failure into a clear
   * setup checklist.
   */
  async refreshSetupMetadata(connectionId: string): Promise<EbayPolicySummary> {
    const marketplaceId = ebayMarketplaceId();
    const metadata: EbayPolicySummary = {};

    const readFirstPolicy = async (resource: string, key: keyof EbayPolicySummary, idField: string) => {
      try {
        const response = await ebayRequest<Record<string, Array<Record<string, string>>>>(connectionId, {
          method: 'GET',
          path: `/sell/account/v1/${resource}`,
          query: { marketplace_id: marketplaceId, limit: 20 },
        });
        const list = response.data[`${resource.replace(/_policy$/, '')}Policies`] ?? [];
        const first = Array.isArray(list) ? list[0] : undefined;
        if (first?.[idField]) metadata[key] = first[idField];
      } catch (error) {
        logger.warn('Could not read eBay policy', { resource, error });
      }
    };

    await readFirstPolicy('fulfillment_policy', 'fulfillmentPolicyId', 'fulfillmentPolicyId');
    await readFirstPolicy('payment_policy', 'paymentPolicyId', 'paymentPolicyId');
    await readFirstPolicy('return_policy', 'returnPolicyId', 'returnPolicyId');

    try {
      const locations = await ebayRequest<{ locations?: Array<{ merchantLocationKey?: string }> }>(
        connectionId,
        { method: 'GET', path: '/sell/inventory/v1/location', query: { limit: 10 } },
      );
      const first = locations.data.locations?.[0];
      if (first?.merchantLocationKey) metadata.merchantLocationKey = first.merchantLocationKey;
    } catch (error) {
      logger.warn('Could not read eBay inventory locations', { error });
    }

    try {
      const tree = await ebayRequest<{ categoryTreeId?: string }>(connectionId, {
        method: 'GET',
        path: '/commerce/taxonomy/v1/get_default_category_tree_id',
        query: { marketplace_id: marketplaceId },
      });
      if (tree.data.categoryTreeId) metadata.categoryTreeId = tree.data.categoryTreeId;
    } catch (error) {
      logger.warn('Could not read eBay category tree id', { error });
    }

    await prisma.platformConnection.update({
      where: { id: connectionId },
      data: { setupMetadata: metadata as never, lastSyncAt: new Date() },
    });

    return metadata;
  }

  /**
   * Uses the official Taxonomy API to suggest a category. Returning null is a
   * valid outcome — the seller then picks one — and is far better than guessing.
   */
  async suggestCategory(connectionId: string, query: string): Promise<{ categoryId: string; categoryName: string } | null> {
    const connection = await prisma.platformConnection.findUnique({ where: { id: connectionId } });
    const metadata = (connection?.setupMetadata ?? {}) as EbayPolicySummary;
    const treeId = metadata.categoryTreeId;
    if (!treeId || !query.trim()) return null;

    try {
      const response = await ebayRequest<{
        categorySuggestions?: Array<{ category?: { categoryId?: string; categoryName?: string } }>;
      }>(connectionId, {
        method: 'GET',
        path: `/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions`,
        query: { q: query.slice(0, 120) },
      });

      const first = response.data.categorySuggestions?.[0]?.category;
      if (first?.categoryId && first.categoryName) {
        return { categoryId: first.categoryId, categoryName: first.categoryName };
      }
    } catch (error) {
      logger.warn('eBay category suggestion failed', { error });
    }
    return null;
  }

  // --- Validation ----------------------------------------------------------

  async validateListing(itemId: string, connectionId: string): Promise<{ ok: boolean; issues: string[] }> {
    const issues: string[] = [];
    const context = await loadPublishContext(itemId, connectionId);

    if (!context) return { ok: false, issues: ['This item could not be loaded.'] };

    const { item, variant, price, metadata, template } = context;

    issues.push(...describeSetupIssues(metadata));

    if (!variant) issues.push('The eBay listing draft has not been generated yet.');
    if (variant && variant.title.trim().length < 5) issues.push('The eBay title is too short.');
    if (variant && variant.title.length > template.titleMaxLength) {
      issues.push(`The eBay title exceeds ${template.titleMaxLength} characters.`);
    }
    if (variant && variant.description.trim().length < 20) {
      issues.push('The eBay description is too short.');
    }
    if (!price) issues.push('Set a price before publishing to eBay.');
    if (item.photos.length === 0) issues.push('eBay requires at least one photo.');

    const fields = (variant?.fields ?? {}) as Record<string, unknown>;
    if (!fields.categoryId && !fields.categorySuggestion) {
      issues.push('Choose an eBay category before publishing.');
    }

    return { ok: issues.length === 0, issues };
  }

  // --- Publish -------------------------------------------------------------

  async publish(input: PublishInput): Promise<PublishResult> {
    // The idempotency key is the guarantee against a duplicate live listing.
    const existing = await prisma.publicationAttempt.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existing && existing.status === PublicationStatus.PUBLISHED) {
      return {
        status: PublicationStatus.PUBLISHED,
        externalListingId: existing.externalListingId ?? undefined,
        externalUrl: existing.externalUrl ?? undefined,
        requestMetadata: existing.requestMetadata as Record<string, unknown>,
        responseMetadata: existing.responseMetadata as Record<string, unknown>,
      };
    }

    if (existing && (existing.status === PublicationStatus.PUBLISHING || existing.status === PublicationStatus.VALIDATING)) {
      return {
        status: existing.status,
        requestMetadata: existing.requestMetadata as Record<string, unknown>,
        responseMetadata: {},
        errorMessage: 'A publish for this item is already in progress.',
      };
    }

    const attempt =
      existing ??
      (await prisma.publicationAttempt.create({
        data: {
          itemId: input.itemId,
          connectionId: input.connectionId,
          platform: PlatformKey.EBAY,
          status: PublicationStatus.PENDING,
          idempotencyKey: input.idempotencyKey,
        },
      }));

    const requestMetadata: Record<string, unknown> = {};

    try {
      // --- VALIDATING ---
      await prisma.publicationAttempt.update({
        where: { id: attempt.id },
        data: { status: PublicationStatus.VALIDATING, startedAt: new Date() },
      });

      const validation = await this.validateListing(input.itemId, input.connectionId);
      if (!validation.ok) {
        return this.#fail(attempt.id, 'validation_failed', validation.issues.join(' '), requestMetadata);
      }

      const context = await loadPublishContext(input.itemId, input.connectionId);
      if (!context || !context.variant || context.price === null) {
        return this.#fail(attempt.id, 'missing_data', 'The listing is not ready to publish.', requestMetadata);
      }

      const { item, variant, price, metadata, template } = context;
      const fields = (variant.fields ?? {}) as Record<string, unknown>;
      const sku = toEbaySku(item.sku);

      // eBay fetches and re-hosts images at publish time, so we mint
      // short-lived signed URLs rather than making the bucket public.
      const storage = getStorage();
      const imageUrls: string[] = [];
      for (const photo of item.photos.slice(0, template.maxPhotos)) {
        imageUrls.push(await storage.createSignedDownload(photo.objectKey, 60 * 60 * 24));
      }

      const marketplaceId = ebayMarketplaceId();

      // --- PUBLISHING ---
      await prisma.publicationAttempt.update({
        where: { id: attempt.id },
        data: { status: PublicationStatus.PUBLISHING },
      });

      // Step 1 — create or replace the inventory item (idempotent on SKU).
      const inventoryPayload = buildInventoryItem({
        title: variant.title,
        description: variant.description,
        conditionValue: typeof fields.conditionDescriptor === 'string' ? fields.conditionDescriptor : null,
        conditionDescription: item.listing?.conditionSummary ?? '',
        quantity: item.quantity,
        imageUrls,
        itemSpecifics: fields.itemSpecifics,
        brand: readFact(item, 'brand'),
        template,
      });

      const inventoryResponse = await ebayRequest<unknown>(input.connectionId, {
        method: 'PUT',
        path: `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
        body: inventoryPayload,
      });
      requestMetadata.inventoryItem = inventoryResponse.metadata;

      // Step 2 — create the offer, or reuse the existing one for this SKU.
      let offerId = await findExistingOfferId(input.connectionId, sku, marketplaceId);

      const offerPayload = buildOffer({
        sku,
        marketplaceId,
        quantity: item.quantity,
        categoryId: String(fields.categoryId ?? fields.categorySuggestion ?? ''),
        description: variant.description,
        priceCents: price,
        currency: item.currency,
        fulfillmentPolicyId: metadata.fulfillmentPolicyId as string,
        paymentPolicyId: metadata.paymentPolicyId as string,
        returnPolicyId: metadata.returnPolicyId as string,
        merchantLocationKey: metadata.merchantLocationKey as string,
      });

      if (offerId) {
        const updateResponse = await ebayRequest<unknown>(input.connectionId, {
          method: 'PUT',
          path: `/sell/inventory/v1/offer/${offerId}`,
          body: offerPayload,
        });
        requestMetadata.offerUpdate = updateResponse.metadata;
      } else {
        const createResponse = await ebayRequest<{ offerId?: string }>(input.connectionId, {
          method: 'POST',
          path: '/sell/inventory/v1/offer',
          body: offerPayload,
        });
        requestMetadata.offerCreate = createResponse.metadata;
        offerId = createResponse.data.offerId ?? null;
      }

      if (!offerId) {
        return this.#fail(
          attempt.id,
          'no_offer_id',
          'eBay accepted the offer request but did not return an offer id.',
          requestMetadata,
        );
      }

      // Step 3 — publish. Only eBay's listingId proves the item is live.
      const publishResponse = await ebayRequest<{ listingId?: string; warnings?: unknown[] }>(
        input.connectionId,
        { method: 'POST', path: `/sell/inventory/v1/offer/${offerId}/publish` },
      );
      requestMetadata.publish = publishResponse.metadata;

      const listingId = publishResponse.data.listingId;
      if (!listingId) {
        return this.#fail(
          attempt.id,
          'no_listing_id',
          'eBay did not confirm a live listing id, so we have not marked this as published.',
          requestMetadata,
        );
      }

      const externalUrl = ebayListingUrl(listingId);

      await prisma.$transaction([
        prisma.publicationAttempt.update({
          where: { id: attempt.id },
          data: {
            status: PublicationStatus.PUBLISHED,
            externalListingId: listingId,
            externalUrl,
            completedAt: new Date(),
            requestMetadata: requestMetadata as never,
            responseMetadata: {
              offerId,
              warningCount: Array.isArray(publishResponse.data.warnings)
                ? publishResponse.data.warnings.length
                : 0,
            } as never,
          },
        }),
        prisma.externalListing.upsert({
          where: { connectionId_externalId: { connectionId: input.connectionId, externalId: listingId } },
          create: {
            itemId: input.itemId,
            connectionId: input.connectionId,
            platform: PlatformKey.EBAY,
            externalId: listingId,
            sku,
            url: externalUrl,
            state: 'ACTIVE',
            priceCents: price,
            currency: item.currency,
            quantity: item.quantity,
            lastSyncAt: new Date(),
          },
          update: {
            url: externalUrl,
            state: 'ACTIVE',
            priceCents: price,
            quantity: item.quantity,
            lastSyncAt: new Date(),
          },
        }),
      ]);

      logger.info('Published listing to eBay', { itemId: input.itemId, listingId });

      return {
        status: PublicationStatus.PUBLISHED,
        externalListingId: listingId,
        externalUrl,
        requestMetadata,
        responseMetadata: { offerId },
      };
    } catch (error) {
      const code =
        error instanceof MarketplaceApiError
          ? error.code
          : error instanceof MarketplaceAuthError
            ? 'auth_required'
            : 'unexpected_error';

      return this.#fail(attempt.id, code, sanitizeError(error, 'The eBay publish failed.'), requestMetadata);
    }
  }

  async #fail(
    attemptId: string,
    code: string,
    message: string,
    requestMetadata: Record<string, unknown>,
  ): Promise<PublishResult> {
    await prisma.publicationAttempt.update({
      where: { id: attemptId },
      data: {
        status: PublicationStatus.FAILED,
        errorCode: code,
        errorMessage: message.slice(0, 500),
        completedAt: new Date(),
        requestMetadata: requestMetadata as never,
      },
    });

    return {
      status: PublicationStatus.FAILED,
      requestMetadata,
      responseMetadata: {},
      errorCode: code,
      errorMessage: message,
    };
  }

  async endListing(itemId: string, connectionId: string): Promise<PublishResult> {
    const listing = await prisma.externalListing.findFirst({
      where: { itemId, connectionId, state: 'ACTIVE' },
    });

    if (!listing) {
      throw new MarketplaceNotSupportedError(PlatformKey.EBAY, 'ending a listing that is not active');
    }

    const offerId = await findExistingOfferId(connectionId, listing.sku ?? '', ebayMarketplaceId());
    if (!offerId) {
      throw new MarketplaceApiError('Could not find the eBay offer for this item.', {
        code: 'offer_not_found',
        retryable: false,
      });
    }

    const response = await ebayRequest<unknown>(connectionId, {
      method: 'POST',
      path: `/sell/inventory/v1/offer/${offerId}/withdraw`,
    });

    await prisma.externalListing.update({
      where: { id: listing.id },
      data: { state: 'ENDED', lastSyncAt: new Date() },
    });

    return {
      status: PublicationStatus.ENDED,
      externalListingId: listing.externalId,
      requestMetadata: { withdraw: response.metadata },
      responseMetadata: {},
    };
  }

  async syncListings(connectionId: string): Promise<{ updated: number }> {
    const listings = await prisma.externalListing.findMany({
      where: { connectionId, state: 'ACTIVE' },
      take: 100,
    });

    let updated = 0;
    for (const listing of listings) {
      if (!listing.sku) continue;
      try {
        const response = await ebayRequest<{ offers?: Array<{ status?: string; listing?: { listingId?: string } }> }>(
          connectionId,
          { method: 'GET', path: '/sell/inventory/v1/offer', query: { sku: listing.sku, limit: 5 } },
        );
        const offer = response.data.offers?.[0];
        if (!offer) continue;

        const nextState = offer.status === 'PUBLISHED' ? 'ACTIVE' : 'ENDED';
        if (nextState !== listing.state) {
          await prisma.externalListing.update({
            where: { id: listing.id },
            data: { state: nextState, lastSyncAt: new Date() },
          });
          updated += 1;
        } else {
          await prisma.externalListing.update({
            where: { id: listing.id },
            data: { lastSyncAt: new Date() },
          });
        }
      } catch (error) {
        logger.warn('eBay listing sync failed for one item', { listingId: listing.id, error });
      }
    }

    await prisma.platformConnection.update({
      where: { id: connectionId },
      data: { lastSyncAt: new Date() },
    });

    return { updated };
  }
}

// --- helpers ---------------------------------------------------------------

async function findExistingOfferId(
  connectionId: string,
  sku: string,
  marketplaceId: string,
): Promise<string | null> {
  if (!sku) return null;
  try {
    const response = await ebayRequest<{ offers?: Array<{ offerId?: string; marketplaceId?: string }> }>(
      connectionId,
      { method: 'GET', path: '/sell/inventory/v1/offer', query: { sku, limit: 10 } },
    );
    const match = response.data.offers?.find((offer) => offer.marketplaceId === marketplaceId);
    return match?.offerId ?? null;
  } catch {
    // A 404 here simply means "no offer yet", which is the common case.
    return null;
  }
}

function describeSetupIssues(metadata: EbayPolicySummary): string[] {
  const issues: string[] = [];
  if (!metadata.paymentPolicyId) issues.push('Create a payment business policy on eBay.');
  if (!metadata.fulfillmentPolicyId) issues.push('Create a shipping (fulfilment) business policy on eBay.');
  if (!metadata.returnPolicyId) issues.push('Create a returns business policy on eBay.');
  if (!metadata.merchantLocationKey) issues.push('Add an inventory location to your eBay account.');
  return issues;
}

function describeConnectionState(state: ConnectionState, environment: string): string {
  switch (state) {
    case ConnectionState.CONNECTED:
      return `Connected to eBay (${environment}). You can publish directly after reviewing each listing.`;
    case ConnectionState.EXPIRED:
      return 'Your eBay authorisation has expired. Reconnect to publish again.';
    case ConnectionState.REAUTH_REQUIRED:
      return 'eBay needs you to re-authorise ResellSnap AI. Exports continue to work.';
    case ConnectionState.ERROR:
      return 'The last eBay request failed. Try reconnecting, or contact support if it persists.';
    default:
      return 'Connect your eBay seller account to publish directly.';
  }
}

interface PublishContext {
  item: {
    id: string;
    sku: string;
    quantity: number;
    currency: string;
    photos: Array<{ objectKey: string }>;
    facts: Array<{ key: string; value: string; confirmed: boolean }>;
    listing: { conditionSummary: string } | null;
  };
  variant: { title: string; description: string; fields: unknown } | null;
  price: number | null;
  metadata: EbayPolicySummary;
  template: { titleMaxLength: number; descriptionMaxLength: number; maxPhotos: number };
}

async function loadPublishContext(itemId: string, connectionId: string): Promise<PublishContext | null> {
  const [item, connection, platform] = await Promise.all([
    prisma.item.findUnique({
      where: { id: itemId },
      include: {
        photos: { where: { status: 'PROCESSED' }, orderBy: { position: 'asc' } },
        facts: true,
        listing: { include: { variants: { where: { platform: PlatformKey.EBAY } } } },
        priceSuggestions: true,
      },
    }),
    prisma.platformConnection.findUnique({ where: { id: connectionId } }),
    prisma.platform.findUnique({
      where: { key: PlatformKey.EBAY },
      include: { templates: { where: { isActive: true }, orderBy: { version: 'desc' }, take: 1 } },
    }),
  ]);

  if (!item || !connection) return null;

  const template = platform?.templates[0] ?? {
    titleMaxLength: 80,
    descriptionMaxLength: 500_000,
    maxPhotos: 12,
  };

  const variant = item.listing?.variants[0] ?? null;
  const balanced =
    item.priceSuggestions.find((suggestion) => suggestion.strategy === 'BALANCED') ??
    item.priceSuggestions[0] ??
    null;

  return {
    item: {
      id: item.id,
      sku: item.sku,
      quantity: item.quantity,
      currency: item.currency,
      photos: item.photos.map((photo) => ({ objectKey: photo.objectKey })),
      facts: item.facts.map((fact) => ({ key: fact.key, value: fact.value, confirmed: fact.confirmed })),
      listing: item.listing ? { conditionSummary: item.listing.conditionSummary } : null,
    },
    variant: variant
      ? { title: variant.title, description: variant.description, fields: variant.fields }
      : null,
    price: balanced?.amountCents ?? null,
    metadata: (connection.setupMetadata ?? {}) as EbayPolicySummary,
    template: {
      titleMaxLength: template.titleMaxLength,
      descriptionMaxLength: template.descriptionMaxLength,
      maxPhotos: template.maxPhotos,
    },
  };
}

/** Reads a seller-confirmed fact. Unconfirmed inferences are never sent to eBay. */
function readFact(
  item: { facts: Array<{ key: string; value: string; confirmed: boolean }> },
  key: string,
): string | null {
  const fact = item.facts.find((entry) => entry.key === key && entry.confirmed);
  return fact?.value ?? null;
}

export const ebayAdapter = new EbayAdapter();
