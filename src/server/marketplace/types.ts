/**
 * Marketplace adapter contract.
 *
 * The product's central honesty guarantee lives here: the UI renders actions
 * from `MarketplaceCapabilities` and `ConnectionState`, so a "Publish" button
 * can only appear when an approved official API, valid credentials and an
 * admin-enabled capability all agree that publishing is possible. There is no
 * hard-coded publish path anywhere in the components.
 */
import type { ConnectionState, PlatformKey, PublicationStatus } from '@/generated/prisma/enums';

export interface MarketplaceCapabilities {
  canConnect: boolean;
  canCreateDraft: boolean;
  canPublish: boolean;
  canUpdate: boolean;
  canEnd: boolean;
  canReadListings: boolean;
  canReadOrders: boolean;
  canFetchComparables: boolean;
}

export const NO_CAPABILITIES: MarketplaceCapabilities = {
  canConnect: false,
  canCreateDraft: false,
  canPublish: false,
  canUpdate: false,
  canEnd: false,
  canReadListings: false,
  canReadOrders: false,
  canFetchComparables: false,
};

/** What the customer-facing badge should say. Derived, never stored. */
export type CapabilityBadge =
  | 'DIRECT_PUBLISHING'
  | 'EXPORT_WORKFLOW'
  | 'APPROVED_ACCESS_REQUIRED'
  | 'TEMPORARILY_UNAVAILABLE';

export interface PlatformStatus {
  key: PlatformKey;
  name: string;
  sellerUrl: string;
  state: ConnectionState;
  badge: CapabilityBadge;
  capabilities: MarketplaceCapabilities;
  /** Plain-English explanation shown next to the badge. */
  statusMessage: string;
  /** Set when the workspace has an active connection. */
  connectionId?: string;
  externalUsername?: string | null;
  environment?: string;
  expiresAt?: Date | null;
  lastError?: string | null;
  /** Steps the seller must finish before publishing can be attempted. */
  setupIssues: string[];
}

export interface PublishInput {
  itemId: string;
  workspaceId: string;
  connectionId: string;
  idempotencyKey: string;
  /** The seller has seen the final content and pressed publish. */
  confirmedByUser: true;
}

export interface PublishResult {
  status: PublicationStatus;
  externalListingId?: string;
  externalUrl?: string;
  /** Sanitised — correlation ids and status codes only, never tokens. */
  requestMetadata: Record<string, unknown>;
  responseMetadata: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

export interface ComparableResult {
  title: string;
  priceCents: number;
  currency: string;
  condition?: string;
  soldAt?: Date;
  externalRef?: string;
  url?: string;
}

export class MarketplaceNotSupportedError extends Error {
  constructor(platform: PlatformKey, operation: string) {
    super(`${platform} does not support ${operation} through an approved official API.`);
    this.name = 'MarketplaceNotSupportedError';
  }
}

export class MarketplaceAuthError extends Error {
  readonly requiresReauth: boolean;

  constructor(message: string, requiresReauth = true) {
    super(message);
    this.name = 'MarketplaceAuthError';
    this.requiresReauth = requiresReauth;
  }
}

export class MarketplaceApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly statusCode: number | null;

  constructor(
    message: string,
    options: { code: string; retryable: boolean; statusCode?: number | null },
  ) {
    super(message);
    this.name = 'MarketplaceApiError';
    this.code = options.code;
    this.retryable = options.retryable;
    this.statusCode = options.statusCode ?? null;
  }
}

/**
 * Every adapter implements this. Operations a platform does not support throw
 * `MarketplaceNotSupportedError` rather than pretending to succeed.
 */
export interface MarketplaceAdapter {
  readonly key: PlatformKey;
  readonly name: string;
  readonly sellerUrl: string;

  /** True when this deployment holds credentials for the platform. */
  isConfigured(): boolean;

  /** Capabilities this adapter *can* offer, before admin flags are applied. */
  declaredCapabilities(): MarketplaceCapabilities;

  /** Full status for one workspace, including connection and setup readiness. */
  getStatus(workspaceId: string): Promise<PlatformStatus>;

  /** OAuth start URL. Throws when the platform has no approved connect flow. */
  buildAuthorizationUrl?(input: {
    workspaceId: string;
    userId: string;
    redirectTo?: string;
  }): Promise<{ url: string; state: string }>;

  handleAuthorizationCallback?(input: {
    code: string;
    state: string;
  }): Promise<{ connectionId: string; workspaceId: string; redirectTo: string | null }>;

  disconnect?(connectionId: string): Promise<void>;

  /** Validates without side effects. Always available where publish is. */
  validateListing?(itemId: string, connectionId: string): Promise<{ ok: boolean; issues: string[] }>;

  publish?(input: PublishInput): Promise<PublishResult>;

  updateListing?(itemId: string, connectionId: string): Promise<PublishResult>;

  endListing?(itemId: string, connectionId: string): Promise<PublishResult>;

  syncListings?(connectionId: string): Promise<{ updated: number }>;

  fetchComparables?(input: {
    connectionId: string;
    query: string;
    categoryId?: string;
    limit?: number;
  }): Promise<ComparableResult[]>;
}
