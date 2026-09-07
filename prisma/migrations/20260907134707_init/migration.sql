-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'SUPPORT', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETION_REQUESTED', 'DELETED');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('DRAFT', 'ANALYZING', 'READY', 'LISTED', 'SOLD', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PhotoStatus" AS ENUM ('PENDING', 'UPLOADED', 'PROCESSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ShippingPreference" AS ENUM ('SHIPPING', 'LOCAL_PICKUP', 'BOTH');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('ANALYZE_ITEM', 'GENERATE_LISTING', 'REGENERATE_VARIANT', 'PROCESS_PHOTO', 'BUILD_EXPORT', 'SEND_EMAIL', 'SYNC_MARKETPLACE', 'CLEANUP');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AIJobKind" AS ENUM ('ANALYZE', 'GENERATE_MASTER', 'GENERATE_VARIANT', 'REGENERATE_FIELD');

-- CreateEnum
CREATE TYPE "AIJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "FactSource" AS ENUM ('SELLER_CONFIRMED', 'PHOTO_EVIDENCE', 'AI_INFERENCE', 'NEEDS_CONFIRMATION');

-- CreateEnum
CREATE TYPE "PlatformKey" AS ENUM ('EBAY', 'VINTED', 'DEPOP', 'FACEBOOK_MARKETPLACE');

-- CreateEnum
CREATE TYPE "ConnectionState" AS ENUM ('NOT_CONFIGURED', 'EXPORT_ONLY', 'AVAILABLE', 'CONNECTED', 'EXPIRED', 'REAUTH_REQUIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('PENDING', 'VALIDATING', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'ENDED');

-- CreateEnum
CREATE TYPE "PriceStrategy" AS ENUM ('QUICK_SALE', 'BALANCED', 'MAXIMISE_RETURN');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('MARKETPLACE_API', 'USER_HISTORY', 'ADMIN_HEURISTIC', 'AI_ESTIMATE');

-- CreateEnum
CREATE TYPE "Tone" AS ENUM ('STRAIGHTFORWARD', 'FRIENDLY', 'VINTAGE', 'MINIMAL');

-- CreateEnum
CREATE TYPE "PlanKind" AS ENUM ('FREE', 'SUBSCRIPTION', 'CREDIT_PACK');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'PAUSED');

-- CreateEnum
CREATE TYPE "CreditEntryKind" AS ENUM ('SIGNUP_GRANT', 'PLAN_RENEWAL', 'PACK_PURCHASE', 'ADMIN_GRANT', 'ADMIN_REVERSAL', 'CONSUMPTION', 'REFUND', 'EXPIRY');

-- CreateEnum
CREATE TYPE "CreditBucket" AS ENUM ('MONTHLY', 'PURCHASED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('TEXT', 'JSON', 'CSV', 'PHOTO_ZIP');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('QUEUED', 'BUILDING', 'READY', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('OPEN', 'REVIEWING', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ModerationReason" AS ENUM ('PROHIBITED_CATEGORY', 'SUSPECTED_COUNTERFEIT', 'UNSAFE_CONTENT', 'USER_REPORTED_OUTPUT', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('GENERATION_COMPLETE', 'GENERATION_FAILED', 'LOW_CREDITS', 'BILLING', 'CONNECTION_EXPIRED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "WebhookSource" AS ENUM ('STRIPE', 'EBAY');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'MONITORING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AnalyticsEventName" AS ENUM ('SIGNUP_COMPLETED', 'EMAIL_VERIFIED', 'ONBOARDING_STEP_COMPLETED', 'ITEM_CREATED', 'PHOTOS_UPLOADED', 'ANALYSIS_STARTED', 'ANALYSIS_COMPLETED', 'ANALYSIS_FAILED', 'LISTING_GENERATED', 'VARIANT_REGENERATED', 'LISTING_EXPORTED', 'LISTING_PUBLISHED', 'ITEM_MARKED_SOLD', 'CHECKOUT_STARTED', 'SUBSCRIPTION_STARTED', 'CREDIT_PACK_PURCHASED', 'CONNECTION_ESTABLISHED', 'DEMO_STARTED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedAt" TIMESTAMPTZ,
    "suspendedReason" TEXT,
    "deletionRequested" TIMESTAMPTZ,
    "lastSeenAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "impersonatedBy" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ,
    "refreshTokenExpiresAt" TIMESTAMPTZ,
    "scope" TEXT,
    "password" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "country" TEXT NOT NULL DEFAULT 'US',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "monthlyCredits" INTEGER NOT NULL DEFAULT 0,
    "purchasedCredits" INTEGER NOT NULL DEFAULT 0,
    "onboardingState" JSONB NOT NULL DEFAULT '{}',
    "deletedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_member" (
    "id" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'OWNER',
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "workspace_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "defaultTone" "Tone" NOT NULL DEFAULT 'STRAIGHTFORWARD',
    "brandVoice" TEXT,
    "measurementUnit" TEXT NOT NULL DEFAULT 'in',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailGenerationComplete" BOOLEAN NOT NULL DEFAULT true,
    "emailGenerationFailed" BOOLEAN NOT NULL DEFAULT true,
    "emailLowCredits" BOOLEAN NOT NULL DEFAULT true,
    "emailProductUpdates" BOOLEAN NOT NULL DEFAULT false,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled item',
    "status" "ItemStatus" NOT NULL DEFAULT 'DRAFT',
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "categoryHint" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "acquisitionCostCents" INTEGER,
    "desiredMinPriceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "shippingPreference" "ShippingPreference" NOT NULL DEFAULT 'SHIPPING',
    "country" TEXT NOT NULL DEFAULT 'US',
    "notes" TEXT,
    "coverPhotoId" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "listedAt" TIMESTAMPTZ,
    "soldAt" TIMESTAMPTZ,
    "archivedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_photo" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" "PhotoStatus" NOT NULL DEFAULT 'PENDING',
    "objectKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksumSha256" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "blurScore" DOUBLE PRECISION,
    "brightness" DOUBLE PRECISION,
    "isDuplicateOf" TEXT,
    "rejectReason" TEXT,
    "exifStripped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "item_photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_fact" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" "FactSource" NOT NULL,
    "confidence" "ConfidenceLevel",
    "evidence" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "item_fact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_revision" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "authorId" TEXT,
    "summary" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "workspaceId" TEXT,
    "payload" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ,
    "lockedBy" TEXT,
    "startedAt" TIMESTAMPTZ,
    "finishedAt" TIMESTAMPTZ,
    "lastError" TEXT,
    "correlationId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_template" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "publishedVersionId" TEXT,

    CONSTRAINT "prompt_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_version" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "userTemplate" TEXT NOT NULL,
    "outputSchema" JSONB NOT NULL,
    "notes" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMPTZ,
    "publishedBy" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "prompt_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_job" (
    "id" TEXT NOT NULL,
    "kind" "AIJobKind" NOT NULL,
    "status" "AIJobStatus" NOT NULL DEFAULT 'QUEUED',
    "workspaceId" TEXT NOT NULL,
    "itemId" TEXT,
    "jobId" TEXT,
    "promptVersionId" TEXT,
    "platform" "PlatformKey",
    "creditEntryId" TEXT,
    "creditRefunded" BOOLEAN NOT NULL DEFAULT false,
    "correlationId" TEXT,
    "startedAt" TIMESTAMPTZ,
    "finishedAt" TIMESTAMPTZ,
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ai_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analysis" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "aiJobId" TEXT NOT NULL,
    "promptVersionId" TEXT,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "photoWarnings" JSONB NOT NULL DEFAULT '[]',
    "safetyFlags" JSONB NOT NULL DEFAULT '[]',
    "suggestedQuestions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "aiJobId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostMicros" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tone" "Tone" NOT NULL DEFAULT 'STRAIGHTFORWARD',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "conditionSummary" TEXT NOT NULL,
    "defectDisclosure" TEXT,
    "includedItems" TEXT,
    "measurements" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "searchTerms" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_variant" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "platform" "PlatformKey" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "tone" "Tone" NOT NULL DEFAULT 'STRAIGHTFORWARD',
    "issues" JSONB NOT NULL DEFAULT '[]',
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "templateVersion" INTEGER,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "listing_variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_revision" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "variantId" TEXT,
    "platform" "PlatformKey",
    "authorId" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'user',
    "summary" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_status_event" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "platform" "PlatformKey",
    "fromStatus" "ItemStatus",
    "toStatus" "ItemStatus" NOT NULL,
    "actorId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'user',
    "note" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_status_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_suggestion" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "strategy" "PriceStrategy" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "amountCents" INTEGER NOT NULL,
    "lowCents" INTEGER,
    "highCents" INTEGER,
    "source" "PriceSource" NOT NULL,
    "confidence" "ConfidenceLevel" NOT NULL,
    "explanation" TEXT NOT NULL,
    "comparableCount" INTEGER NOT NULL DEFAULT 0,
    "observedAt" TIMESTAMPTZ,
    "userEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "price_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparable" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "platform" "PlatformKey" NOT NULL,
    "source" "PriceSource" NOT NULL,
    "title" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "condition" TEXT,
    "soldAt" TIMESTAMPTZ,
    "externalRef" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comparable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_record" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" "PlatformKey" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "salePriceCents" INTEGER NOT NULL,
    "feesCents" INTEGER NOT NULL DEFAULT 0,
    "shippingCents" INTEGER NOT NULL DEFAULT 0,
    "soldAt" TIMESTAMPTZ NOT NULL,
    "isApiSynced" BOOLEAN NOT NULL DEFAULT false,
    "externalRef" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sale_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform" (
    "id" TEXT NOT NULL,
    "key" "PlatformKey" NOT NULL,
    "name" TEXT NOT NULL,
    "sellerUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "platform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_capability" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "canConnect" BOOLEAN NOT NULL DEFAULT false,
    "canCreateDraft" BOOLEAN NOT NULL DEFAULT false,
    "canPublish" BOOLEAN NOT NULL DEFAULT false,
    "canUpdate" BOOLEAN NOT NULL DEFAULT false,
    "canEnd" BOOLEAN NOT NULL DEFAULT false,
    "canReadListings" BOOLEAN NOT NULL DEFAULT false,
    "canReadOrders" BOOLEAN NOT NULL DEFAULT false,
    "canFetchComparables" BOOLEAN NOT NULL DEFAULT false,
    "killSwitch" BOOLEAN NOT NULL DEFAULT false,
    "unavailableReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "platform_capability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_template" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "titleMaxLength" INTEGER NOT NULL DEFAULT 80,
    "descriptionMaxLength" INTEGER NOT NULL DEFAULT 4000,
    "maxPhotos" INTEGER NOT NULL DEFAULT 12,
    "maxHashtags" INTEGER NOT NULL DEFAULT 0,
    "requiredFields" JSONB NOT NULL DEFAULT '[]',
    "toneRules" TEXT NOT NULL,
    "feePercentBps" INTEGER NOT NULL DEFAULT 0,
    "feeFixedCents" INTEGER NOT NULL DEFAULT 0,
    "exportFormats" JSONB NOT NULL DEFAULT '["TEXT","JSON","CSV","PHOTO_ZIP"]',
    "regions" JSONB NOT NULL DEFAULT '["US"]',
    "guidance" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "platform_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_connection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "state" "ConnectionState" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "externalAccountId" TEXT,
    "externalUsername" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "marketplaceId" TEXT,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "setupMetadata" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMPTZ,
    "lastSyncAt" TIMESTAMPTZ,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "platform_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_state" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "PlatformKey" NOT NULL,
    "codeVerifier" TEXT,
    "redirectTo" TEXT,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "consumedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encrypted_token" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "encrypted_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_attempt" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "connectionId" TEXT,
    "platform" "PlatformKey" NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "requestMetadata" JSONB NOT NULL DEFAULT '{}',
    "responseMetadata" JSONB NOT NULL DEFAULT '{}',
    "externalListingId" TEXT,
    "externalUrl" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "publication_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_listing" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "platform" "PlatformKey" NOT NULL,
    "externalId" TEXT NOT NULL,
    "sku" TEXT,
    "url" TEXT,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "priceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "lastSyncAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "external_listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_event" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT,
    "platform" "PlatformKey" NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadSummary" JSONB NOT NULL DEFAULT '{}',
    "processedAt" TIMESTAMPTZ,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PlanKind" NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "interval" TEXT,
    "creditsGranted" INTEGER NOT NULL DEFAULT 0,
    "stripePriceId" TEXT,
    "stripeProductId" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_entitlement" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "boolValue" BOOLEAN,
    "intValue" INTEGER,
    "stringValue" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "plan_entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'NONE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMPTZ,
    "currentPeriodEnd" TIMESTAMPTZ,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMPTZ,
    "endedAt" TIMESTAMPTZ,
    "lastCreditResetAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "CreditEntryKind" NOT NULL,
    "bucket" "CreditBucket" NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT,
    "actorId" TEXT,
    "itemId" TEXT,
    "aiJobId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_event" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "processedAt" TIMESTAMPTZ,
    "error" TEXT,
    "payloadSummary" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_job" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "itemId" TEXT,
    "platform" "PlatformKey",
    "format" "ExportFormat" NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "export_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "download_artifact" (
    "id" TEXT NOT NULL,
    "exportJobId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "download_artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "planKeys" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_block" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'announcement',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "content_block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_template" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isEssential" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_log" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "userId" TEXT,
    "templateKey" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "providerMessageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "readAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_flag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "itemId" TEXT,
    "reason" "ModerationReason" NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'OPEN',
    "detail" TEXT NOT NULL,
    "raisedBy" TEXT NOT NULL DEFAULT 'ai_safety',
    "reporterId" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMPTZ,
    "resolution" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "moderation_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_note" (
    "id" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impersonation" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "sessionId" TEXT,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "endedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "impersonation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_event" (
    "id" TEXT NOT NULL,
    "source" "WebhookSource" NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payloadSummary" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "processedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_incident" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'WARNING',
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "resolvedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "system_incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_event" (
    "id" TEXT NOT NULL,
    "name" "AnalyticsEventName" NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit" (
    "id" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_role_idx" ON "user"("role");

-- CreateIndex
CREATE INDEX "user_status_idx" ON "user"("status");

-- CreateIndex
CREATE INDEX "user_createdAt_idx" ON "user"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "session_expiresAt_idx" ON "session"("expiresAt");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "verification_expiresAt_idx" ON "verification"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_slug_key" ON "workspace"("slug");

-- CreateIndex
CREATE INDEX "workspace_deletedAt_idx" ON "workspace"("deletedAt");

-- CreateIndex
CREATE INDEX "workspace_member_userId_idx" ON "workspace_member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_member_workspaceId_userId_key" ON "workspace_member"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_preference_userId_key" ON "user_preference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preference_userId_key" ON "notification_preference"("userId");

-- CreateIndex
CREATE INDEX "item_workspaceId_status_idx" ON "item"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "item_workspaceId_createdAt_idx" ON "item"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "item_deletedAt_idx" ON "item"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "item_workspaceId_sku_key" ON "item"("workspaceId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "item_photo_objectKey_key" ON "item_photo"("objectKey");

-- CreateIndex
CREATE INDEX "item_photo_itemId_position_idx" ON "item_photo"("itemId", "position");

-- CreateIndex
CREATE INDEX "item_photo_status_idx" ON "item_photo"("status");

-- CreateIndex
CREATE INDEX "item_fact_itemId_source_idx" ON "item_fact"("itemId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "item_fact_itemId_key_key" ON "item_fact"("itemId", "key");

-- CreateIndex
CREATE INDEX "item_revision_itemId_createdAt_idx" ON "item_revision"("itemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_idempotencyKey_key" ON "job"("idempotencyKey");

-- CreateIndex
CREATE INDEX "job_status_runAt_priority_idx" ON "job"("status", "runAt", "priority");

-- CreateIndex
CREATE INDEX "job_type_status_idx" ON "job"("type", "status");

-- CreateIndex
CREATE INDEX "job_workspaceId_idx" ON "job"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_template_key_key" ON "prompt_template"("key");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_template_publishedVersionId_key" ON "prompt_template"("publishedVersionId");

-- CreateIndex
CREATE INDEX "prompt_version_templateId_isPublished_idx" ON "prompt_version"("templateId", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_version_templateId_version_key" ON "prompt_version"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ai_job_jobId_key" ON "ai_job"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_job_creditEntryId_key" ON "ai_job"("creditEntryId");

-- CreateIndex
CREATE INDEX "ai_job_workspaceId_createdAt_idx" ON "ai_job"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_job_status_createdAt_idx" ON "ai_job"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ai_job_kind_status_idx" ON "ai_job"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_analysis_aiJobId_key" ON "ai_analysis"("aiJobId");

-- CreateIndex
CREATE INDEX "ai_analysis_itemId_createdAt_idx" ON "ai_analysis"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_createdAt_idx" ON "ai_usage"("createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_aiJobId_idx" ON "ai_usage"("aiJobId");

-- CreateIndex
CREATE UNIQUE INDEX "listing_itemId_key" ON "listing"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "listing_variant_listingId_platform_key" ON "listing_variant"("listingId", "platform");

-- CreateIndex
CREATE INDEX "listing_revision_listingId_createdAt_idx" ON "listing_revision"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "listing_revision_variantId_createdAt_idx" ON "listing_revision"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "listing_status_event_itemId_createdAt_idx" ON "listing_status_event"("itemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "price_suggestion_itemId_strategy_key" ON "price_suggestion"("itemId", "strategy");

-- CreateIndex
CREATE INDEX "comparable_itemId_idx" ON "comparable"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_record_itemId_key" ON "sale_record"("itemId");

-- CreateIndex
CREATE INDEX "sale_record_workspaceId_soldAt_idx" ON "sale_record"("workspaceId", "soldAt");

-- CreateIndex
CREATE UNIQUE INDEX "platform_key_key" ON "platform"("key");

-- CreateIndex
CREATE UNIQUE INDEX "platform_capability_platformId_key" ON "platform_capability"("platformId");

-- CreateIndex
CREATE INDEX "platform_template_platformId_isActive_idx" ON "platform_template"("platformId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "platform_template_platformId_version_key" ON "platform_template"("platformId", "version");

-- CreateIndex
CREATE INDEX "platform_connection_state_idx" ON "platform_connection"("state");

-- CreateIndex
CREATE UNIQUE INDEX "platform_connection_workspaceId_platformId_key" ON "platform_connection"("workspaceId", "platformId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_state_state_key" ON "oauth_state"("state");

-- CreateIndex
CREATE INDEX "oauth_state_expiresAt_idx" ON "oauth_state"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "encrypted_token_connectionId_kind_key" ON "encrypted_token"("connectionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "publication_attempt_idempotencyKey_key" ON "publication_attempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "publication_attempt_itemId_createdAt_idx" ON "publication_attempt"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "publication_attempt_status_idx" ON "publication_attempt"("status");

-- CreateIndex
CREATE INDEX "external_listing_itemId_idx" ON "external_listing"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "external_listing_connectionId_externalId_key" ON "external_listing"("connectionId", "externalId");

-- CreateIndex
CREATE INDEX "external_event_processedAt_idx" ON "external_event"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "external_event_platform_externalEventId_key" ON "external_event"("platform", "externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_key_key" ON "plan"("key");

-- CreateIndex
CREATE INDEX "plan_kind_isVisible_idx" ON "plan"("kind", "isVisible");

-- CreateIndex
CREATE UNIQUE INDEX "plan_entitlement_planId_key_key" ON "plan_entitlement"("planId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_workspaceId_key" ON "subscription"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_stripeCustomerId_key" ON "subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_stripeSubscriptionId_key" ON "subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "subscription_status_idx" ON "subscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "credit_ledger_idempotencyKey_key" ON "credit_ledger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "credit_ledger_workspaceId_createdAt_idx" ON "credit_ledger"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "credit_ledger_kind_idx" ON "credit_ledger"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_event_stripeEventId_key" ON "stripe_event"("stripeEventId");

-- CreateIndex
CREATE INDEX "stripe_event_type_createdAt_idx" ON "stripe_event"("type", "createdAt");

-- CreateIndex
CREATE INDEX "export_job_workspaceId_createdAt_idx" ON "export_job"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "download_artifact_objectKey_key" ON "download_artifact"("objectKey");

-- CreateIndex
CREATE INDEX "download_artifact_expiresAt_idx" ON "download_artifact"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_key_key" ON "feature_flag"("key");

-- CreateIndex
CREATE UNIQUE INDEX "app_setting_key_key" ON "app_setting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "content_block_key_key" ON "content_block"("key");

-- CreateIndex
CREATE INDEX "content_block_category_isActive_sortOrder_idx" ON "content_block"("category", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "email_template_key_key" ON "email_template"("key");

-- CreateIndex
CREATE INDEX "email_log_status_createdAt_idx" ON "email_log"("status", "createdAt");

-- CreateIndex
CREATE INDEX "email_log_toEmail_idx" ON "email_log"("toEmail");

-- CreateIndex
CREATE INDEX "notification_userId_readAt_createdAt_idx" ON "notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "moderation_flag_status_createdAt_idx" ON "moderation_flag"("status", "createdAt");

-- CreateIndex
CREATE INDEX "support_note_subjectUserId_createdAt_idx" ON "support_note"("subjectUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_actorId_createdAt_idx" ON "audit_log"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_targetType_targetId_idx" ON "audit_log"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "audit_log_action_createdAt_idx" ON "audit_log"("action", "createdAt");

-- CreateIndex
CREATE INDEX "impersonation_actorId_createdAt_idx" ON "impersonation"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_event_status_createdAt_idx" ON "webhook_event"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_source_eventId_key" ON "webhook_event"("source", "eventId");

-- CreateIndex
CREATE INDEX "system_incident_status_createdAt_idx" ON "system_incident"("status", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_event_name_createdAt_idx" ON "analytics_event"("name", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_event_workspaceId_createdAt_idx" ON "analytics_event"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_bucketKey_key" ON "rate_limit"("bucketKey");

-- CreateIndex
CREATE INDEX "rate_limit_expiresAt_idx" ON "rate_limit"("expiresAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_photo" ADD CONSTRAINT "item_photo_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_fact" ADD CONSTRAINT "item_fact_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_revision" ADD CONSTRAINT "item_revision_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_template" ADD CONSTRAINT "prompt_template_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "prompt_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_version" ADD CONSTRAINT "prompt_version_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "prompt_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "prompt_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analysis" ADD CONSTRAINT "ai_analysis_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analysis" ADD CONSTRAINT "ai_analysis_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "ai_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analysis" ADD CONSTRAINT "ai_analysis_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "prompt_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "ai_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_variant" ADD CONSTRAINT "listing_variant_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_revision" ADD CONSTRAINT "listing_revision_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_revision" ADD CONSTRAINT "listing_revision_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "listing_variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_status_event" ADD CONSTRAINT "listing_status_event_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_suggestion" ADD CONSTRAINT "price_suggestion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparable" ADD CONSTRAINT "comparable_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_record" ADD CONSTRAINT "sale_record_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_record" ADD CONSTRAINT "sale_record_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_capability" ADD CONSTRAINT "platform_capability_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_template" ADD CONSTRAINT "platform_template_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_connection" ADD CONSTRAINT "platform_connection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_connection" ADD CONSTRAINT "platform_connection_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_state" ADD CONSTRAINT "oauth_state_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encrypted_token" ADD CONSTRAINT "encrypted_token_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "platform_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_attempt" ADD CONSTRAINT "publication_attempt_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_attempt" ADD CONSTRAINT "publication_attempt_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "platform_connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_listing" ADD CONSTRAINT "external_listing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_listing" ADD CONSTRAINT "external_listing_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "platform_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_event" ADD CONSTRAINT "external_event_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "platform_connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entitlement" ADD CONSTRAINT "plan_entitlement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_artifact" ADD CONSTRAINT "download_artifact_exportJobId_fkey" FOREIGN KEY ("exportJobId") REFERENCES "export_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "email_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_flag" ADD CONSTRAINT "moderation_flag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_flag" ADD CONSTRAINT "moderation_flag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_note" ADD CONSTRAINT "support_note_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_note" ADD CONSTRAINT "support_note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation" ADD CONSTRAINT "impersonation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation" ADD CONSTRAINT "impersonation_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_event" ADD CONSTRAINT "analytics_event_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
