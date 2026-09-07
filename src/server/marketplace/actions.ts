'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { ItemStatus, PlatformKey } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { sanitizeError } from '@/lib/logger';
import { enforceRateLimit, RateLimitError } from '@/lib/rate-limit';
import { assertItemInWorkspace, requireApiWorkspace } from '@/server/session';
import { recordAudit, AUDIT_ACTIONS } from '@/server/audit';
import { getAdapter } from './index';
import { MarketplaceAuthError, MarketplaceNotSupportedError } from './types';

export interface MarketplaceActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  code?: string;
  data?: T;
}

/**
 * Publishes an item to a marketplace.
 *
 * Guards, in order: workspace ownership, rate limit, live capability, an active
 * connection, and an explicit user confirmation from the UI. Success is only
 * ever reported when the adapter returns a marketplace listing id.
 */
export async function publishToMarketplaceAction(input: {
  itemId: string;
  platform: PlatformKey;
  connectionId: string;
}): Promise<MarketplaceActionResult<{ externalUrl: string; externalListingId: string }>> {
  try {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(input.itemId, context.workspace.id);
    await enforceRateLimit('publish', context.workspace.id);

    const adapter = getAdapter(input.platform);
    const status = await adapter.getStatus(context.workspace.id);

    // Capability is re-checked on the server. A crafted request cannot publish
    // to a platform the UI would never offer.
    if (!status.capabilities.canPublish || !adapter.publish) {
      return {
        ok: false,
        code: 'not_supported',
        error: `${adapter.name} does not support direct publishing on this deployment.`,
      };
    }
    if (status.state !== 'CONNECTED' || status.connectionId !== input.connectionId) {
      return {
        ok: false,
        code: 'not_connected',
        error: `Your ${adapter.name} connection is not active. Reconnect and try again.`,
      };
    }
    if (status.setupIssues.length > 0) {
      return { ok: false, code: 'setup_incomplete', error: status.setupIssues.join(' ') };
    }

    const result = await adapter.publish({
      itemId: input.itemId,
      workspaceId: context.workspace.id,
      connectionId: input.connectionId,
      // A fresh key per confirmed press: a retry after a genuine failure is a
      // new attempt, while a double-click is absorbed by the attempt row.
      idempotencyKey: `publish:${input.itemId}:${input.platform}:${randomUUID()}`,
      confirmedByUser: true,
    });

    if (result.status !== 'PUBLISHED' || !result.externalUrl || !result.externalListingId) {
      return {
        ok: false,
        code: result.errorCode ?? 'publish_failed',
        error:
          result.errorMessage ??
          `${adapter.name} did not confirm the listing, so we have not marked it as published.`,
      };
    }

    await prisma.$transaction([
      prisma.item.update({
        where: { id: input.itemId },
        data: { status: ItemStatus.LISTED, listedAt: new Date() },
      }),
      prisma.listingStatusEvent.create({
        data: {
          itemId: input.itemId,
          platform: input.platform,
          toStatus: ItemStatus.LISTED,
          actorId: context.user.id,
          source: 'user',
          note: `Published to ${adapter.name}`,
        },
      }),
      prisma.analyticsEvent.create({
        data: {
          name: 'LISTING_PUBLISHED',
          workspaceId: context.workspace.id,
          userId: context.user.id,
          properties: { platform: input.platform },
        },
      }),
    ]);

    revalidatePath(`/app/items/${input.itemId}`);
    revalidatePath('/app/inventory');

    return {
      ok: true,
      data: { externalUrl: result.externalUrl, externalListingId: result.externalListingId },
    };
  } catch (error) {
    if (error instanceof MarketplaceNotSupportedError) {
      return { ok: false, code: 'not_supported', error: error.message };
    }
    if (error instanceof MarketplaceAuthError) {
      return { ok: false, code: 'reauth_required', error: error.message };
    }
    if (error instanceof RateLimitError) {
      return { ok: false, code: 'rate_limited', error: error.message };
    }
    return { ok: false, code: 'unknown', error: sanitizeError(error, 'The publish failed.') };
  }
}

export async function endListingAction(input: {
  itemId: string;
  platform: PlatformKey;
  connectionId: string;
}): Promise<MarketplaceActionResult> {
  try {
    const context = await requireApiWorkspace();
    await assertItemInWorkspace(input.itemId, context.workspace.id);

    const adapter = getAdapter(input.platform);
    const status = await adapter.getStatus(context.workspace.id);

    if (!status.capabilities.canEnd || !adapter.endListing) {
      return {
        ok: false,
        code: 'not_supported',
        error: `${adapter.name} does not support ending listings through an API.`,
      };
    }

    await adapter.endListing(input.itemId, input.connectionId);
    revalidatePath(`/app/items/${input.itemId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, code: 'unknown', error: sanitizeError(error, 'Could not end that listing.') };
  }
}

export async function disconnectPlatformAction(
  platform: PlatformKey,
): Promise<MarketplaceActionResult> {
  try {
    const context = await requireApiWorkspace();
    const adapter = getAdapter(platform);
    const status = await adapter.getStatus(context.workspace.id);

    if (!status.connectionId || !adapter.disconnect) {
      return { ok: false, code: 'not_connected', error: 'There is nothing to disconnect.' };
    }

    await adapter.disconnect(status.connectionId);

    await recordAudit({
      actorId: context.user.id,
      action: AUDIT_ACTIONS.CONNECTION_DISCONNECTED,
      targetType: 'platform_connection',
      targetId: status.connectionId,
      reason: 'Disconnected by the account owner',
    });

    revalidatePath('/app/integrations');
    return { ok: true };
  } catch (error) {
    return { ok: false, code: 'unknown', error: sanitizeError(error, 'Could not disconnect.') };
  }
}

/** Starts the OAuth handshake; returns a URL for the browser to visit. */
export async function startConnectionAction(
  platform: PlatformKey,
): Promise<MarketplaceActionResult<{ url: string }>> {
  try {
    const context = await requireApiWorkspace();
    const adapter = getAdapter(platform);

    if (!adapter.buildAuthorizationUrl) {
      return {
        ok: false,
        code: 'not_supported',
        error: `${adapter.name} does not offer an approved connection flow. Use the export workflow.`,
      };
    }

    const status = await adapter.getStatus(context.workspace.id);
    if (!status.capabilities.canConnect) {
      return { ok: false, code: 'not_available', error: status.statusMessage };
    }

    const { url } = await adapter.buildAuthorizationUrl({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      redirectTo: '/app/integrations',
    });

    return { ok: true, data: { url } };
  } catch (error) {
    if (error instanceof MarketplaceAuthError) {
      return { ok: false, code: 'not_configured', error: error.message };
    }
    return {
      ok: false,
      code: 'unknown',
      error: sanitizeError(error, 'Could not start that connection.'),
    };
  }
}
