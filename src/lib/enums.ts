/**
 * Browser-safe re-export of the Prisma enums.
 *
 * Client components must never import from `@/generated/prisma/client` (it
 * pulls in the Node runtime). The generated `browser` entrypoint exposes the
 * same enum objects and types with no server dependencies.
 */
export {
  Role,
  WorkspaceRole,
  UserStatus,
  ItemStatus,
  PhotoStatus,
  ShippingPreference,
  JobType,
  JobStatus,
  AIJobKind,
  AIJobStatus,
  ConfidenceLevel,
  FactSource,
  PlatformKey,
  ConnectionState,
  PublicationStatus,
  PriceStrategy,
  PriceSource,
  Tone,
  PlanKind,
  SubscriptionStatus,
  CreditEntryKind,
  CreditBucket,
  ExportFormat,
  ExportStatus,
  ModerationStatus,
  ModerationReason,
  NotificationType,
  EmailStatus,
  WebhookSource,
  WebhookStatus,
  IncidentSeverity,
  IncidentStatus,
  AnalyticsEventName,
} from '@/generated/prisma/enums';

export type {
  Role as RoleType,
  ItemStatus as ItemStatusType,
  PlatformKey as PlatformKeyType,
  ConnectionState as ConnectionStateType,
  PriceStrategy as PriceStrategyType,
  Tone as ToneType,
} from '@/generated/prisma/enums';
