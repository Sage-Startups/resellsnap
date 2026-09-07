/**
 * Export-first adapter for platforms without approved direct publishing.
 *
 * This is not a stub waiting to be filled in — it is the shipped, supported
 * workflow for Vinted, Depop and Facebook Marketplace. It deliberately
 * implements *none* of the publish operations: calling one throws
 * `MarketplaceNotSupportedError`, so no UI path can accidentally imply that
 * one-click publishing exists.
 *
 * When an operator does obtain approved API access, they enable the capability
 * flags in the admin console and drop in a real adapter beside `ebay/`. The
 * contract, settings, connection records and UI are already in place.
 */
import { ConnectionState, type PlatformKey } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import {
  MarketplaceNotSupportedError,
  NO_CAPABILITIES,
  type MarketplaceAdapter,
  type MarketplaceCapabilities,
  type PlatformStatus,
} from './types';
import { findPlatformSeed } from './registry';

export class ExportOnlyAdapter implements MarketplaceAdapter {
  readonly key: PlatformKey;
  readonly name: string;
  readonly sellerUrl: string;

  constructor(key: PlatformKey) {
    const seed = findPlatformSeed(key);
    this.key = key;
    this.name = seed.name;
    this.sellerUrl = seed.sellerUrl;
  }

  isConfigured(): boolean {
    // Export always works: it needs no third-party credentials at all.
    return true;
  }

  declaredCapabilities(): MarketplaceCapabilities {
    return { ...NO_CAPABILITIES };
  }

  async getStatus(workspaceId: string): Promise<PlatformStatus> {
    const seed = findPlatformSeed(this.key);
    const platform = await prisma.platform.findUnique({
      where: { key: this.key },
      include: { capability: true },
    });

    const capability = platform?.capability;

    // If an operator has genuinely obtained approved access and enabled the
    // publish capability, say so honestly rather than hard-coding "export only".
    const adminEnabledPublish = capability?.canPublish === true && capability.killSwitch === false;

    if (capability?.killSwitch) {
      return {
        key: this.key,
        name: this.name,
        sellerUrl: this.sellerUrl,
        state: ConnectionState.ERROR,
        badge: 'TEMPORARILY_UNAVAILABLE',
        capabilities: { ...NO_CAPABILITIES },
        statusMessage:
          capability.unavailableReason ?? `${this.name} exports are temporarily paused by the operator.`,
        setupIssues: [],
      };
    }

    if (adminEnabledPublish) {
      return {
        key: this.key,
        name: this.name,
        sellerUrl: this.sellerUrl,
        state: ConnectionState.AVAILABLE,
        badge: 'APPROVED_ACCESS_REQUIRED',
        capabilities: { ...NO_CAPABILITIES },
        statusMessage:
          `Direct publishing has been enabled for ${this.name} in the admin console, but no approved adapter is installed on this deployment yet. Use the export workflow until one is.`,
        setupIssues: [],
      };
    }

    const connection = platform
      ? await prisma.platformConnection.findUnique({
          where: { workspaceId_platformId: { workspaceId, platformId: platform.id } },
        })
      : null;

    return {
      key: this.key,
      name: this.name,
      sellerUrl: this.sellerUrl,
      state: ConnectionState.EXPORT_ONLY,
      badge: 'EXPORT_WORKFLOW',
      capabilities: { ...NO_CAPABILITIES },
      connectionId: connection?.id,
      statusMessage:
        capability?.unavailableReason ??
        seed.unavailableReason ??
        `${this.name} does not offer approved third-party listing creation. Your listing is prepared for copy-and-paste.`,
      setupIssues: [],
    };
  }

  async publish(): Promise<never> {
    throw new MarketplaceNotSupportedError(this.key, 'direct publishing');
  }

  async updateListing(): Promise<never> {
    throw new MarketplaceNotSupportedError(this.key, 'updating a listing');
  }

  async endListing(): Promise<never> {
    throw new MarketplaceNotSupportedError(this.key, 'ending a listing');
  }

  async fetchComparables(): Promise<never> {
    throw new MarketplaceNotSupportedError(this.key, 'fetching comparable sales');
  }
}
