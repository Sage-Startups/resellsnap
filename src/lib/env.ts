/**
 * Environment configuration.
 *
 * Required variables are validated eagerly so a misconfigured deployment fails
 * loudly at boot instead of quietly at 3am. Optional integrations degrade to a
 * clearly-signalled "not configured" state rather than throwing.
 */
import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()),
  );

/** Rejects anything that is not an absolute http(s) URL with no trailing slash. */
const httpUrl = nonEmpty
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'must be an absolute http(s) URL')
  .transform((value) => value.replace(/\/+$/, ''));

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: httpUrl.default('http://localhost:3000'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: nonEmpty,
  SHADOW_DATABASE_URL: z.string().optional(),

  BETTER_AUTH_SECRET: nonEmpty,
  SUPER_ADMIN_EMAIL: z.string().email().optional(),

  /** 32 bytes, hex-encoded. Used for AES-256-GCM at-rest encryption. */
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters (32 bytes)'),

  AI_PROVIDER: z.enum(['openai', 'fake']).default('openai'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_VISION_MODEL: z.string().default('gpt-4.1-mini'),
  OPENAI_TEXT_MODEL: z.string().default('gpt-4.1-mini'),
  OPENAI_BASE_URL: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_STARTER_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PACK_20: z.string().optional(),
  STRIPE_PRICE_PACK_75: z.string().optional(),
  STRIPE_PRICE_PACK_200: z.string().optional(),

  EMAIL_PROVIDER: z.enum(['resend', 'console']).default('resend'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('ResellSnap AI <no-reply@example.com>'),
  SUPPORT_EMAIL: z.string().default('support@example.com'),

  STORAGE_DRIVER: z.enum(['s3', 'local']).default('s3'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: booleanish.default(true),
  /** Filesystem root for the local development storage driver. */
  LOCAL_STORAGE_DIR: z.string().default('.storage'),

  EBAY_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  EBAY_CLIENT_ID: z.string().optional(),
  EBAY_CLIENT_SECRET: z.string().optional(),
  EBAY_REDIRECT_URI: z.string().optional(),
  EBAY_MARKETPLACE_ID: z.string().default('EBAY_US'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  CRON_SECRET: z.string().optional(),
  SENTRY_DSN: z.string().optional(),

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),
  MAX_PHOTOS_PER_ITEM: z.coerce.number().int().positive().max(24).default(12),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().max(32).default(4),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(2000),
  /** Daily ceiling on estimated AI spend, in USD cents. 0 disables the breaker. */
  AI_DAILY_COST_LIMIT_CENTS: z.coerce.number().int().nonnegative().default(0),
});

export type AppEnv = z.infer<typeof baseSchema> & {
  isProduction: boolean;
  isTest: boolean;
};

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

let cached: AppEnv | null = null;

/**
 * A production *build* has no runtime secrets — the Docker image is built long
 * before it is given a database or an S3 bucket. Next.js sets `NEXT_PHASE`
 * during `next build`, which lets us validate shape without demanding values
 * that only exist at deploy time. The full production checks still run when the
 * server actually starts.
 */
function isBuildPhase(): boolean {
  return (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.SKIP_ENV_VALIDATION === '1'
  );
}

/** Placeholders used only during a build, never at runtime. */
const BUILD_PLACEHOLDERS: Record<string, string> = {
  DATABASE_URL: 'postgresql://build:build@127.0.0.1:5432/build',
  BETTER_AUTH_SECRET: 'build-time-placeholder-secret-value-not-used-at-runtime',
  TOKEN_ENCRYPTION_KEY: '0'.repeat(64),
};

function build(): AppEnv {
  const buildPhase = isBuildPhase();
  const source: NodeJS.ProcessEnv = buildPhase
    ? { ...BUILD_PLACEHOLDERS, ...process.env }
    : process.env;

  const parsed = baseSchema.safeParse(source);

  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n${formatIssues(parsed.error)}\n\n` +
        'See .env.example for the full list of variables.',
    );
  }

  const value = parsed.data;
  const isProduction = value.NODE_ENV === 'production' && !buildPhase;

  // Production-only requirements. Keeping these out of the base schema means
  // local development and CI stay frictionless while production stays strict.
  if (isProduction) {
    const missing: string[] = [];
    if (value.STORAGE_DRIVER !== 's3') {
      missing.push('STORAGE_DRIVER must be "s3" in production');
    }
    if (!value.S3_BUCKET) missing.push('S3_BUCKET is required in production');
    if (!value.S3_ENDPOINT) missing.push('S3_ENDPOINT is required in production');
    if (!value.S3_ACCESS_KEY_ID) missing.push('S3_ACCESS_KEY_ID is required in production');
    if (!value.S3_SECRET_ACCESS_KEY) missing.push('S3_SECRET_ACCESS_KEY is required in production');
    if (value.BETTER_AUTH_SECRET.length < 32) {
      missing.push('BETTER_AUTH_SECRET must be at least 32 characters in production');
    }
    if (value.APP_URL.startsWith('http://')) {
      missing.push('APP_URL must use https in production');
    }
    // The deterministic fixture provider must be impossible to reach in
    // production, even by accident.
    if (value.AI_PROVIDER === 'fake') {
      missing.push('AI_PROVIDER="fake" is not permitted in production');
    }
    if (missing.length > 0) {
      throw new Error(`Invalid production environment:\n${missing.map((m) => `  • ${m}`).join('\n')}`);
    }
  }

  return { ...value, isProduction, isTest: value.NODE_ENV === 'test' };
}

export function getEnv(): AppEnv {
  cached ??= build();
  return cached;
}

/** Test-only hook so suites can exercise different configurations. */
export function resetEnvCacheForTests(): void {
  cached = null;
}

export const env: AppEnv = new Proxy({} as AppEnv, {
  get(_target, prop) {
    return getEnv()[prop as keyof AppEnv];
  },
  has(_target, prop) {
    return prop in getEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(getEnv());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(getEnv(), prop);
  },
});

// --- Capability probes -----------------------------------------------------
// Every optional integration answers one question: "is this usable right now?"
// The UI and the admin system-health page read these instead of guessing.

export function isStripeConfigured(): boolean {
  const e = getEnv();
  return Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET);
}

export function isOpenAIConfigured(): boolean {
  return Boolean(getEnv().OPENAI_API_KEY);
}

export function isAIConfigured(): boolean {
  const e = getEnv();
  return e.AI_PROVIDER === 'fake' ? !e.isProduction : isOpenAIConfigured();
}

export function isResendConfigured(): boolean {
  const e = getEnv();
  return e.EMAIL_PROVIDER === 'resend' ? Boolean(e.RESEND_API_KEY) : true;
}

export function isStorageConfigured(): boolean {
  const e = getEnv();
  if (e.STORAGE_DRIVER === 'local') return !e.isProduction;
  return Boolean(e.S3_BUCKET && e.S3_ENDPOINT && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY);
}

export function isEbayConfigured(): boolean {
  const e = getEnv();
  return Boolean(e.EBAY_CLIENT_ID && e.EBAY_CLIENT_SECRET && e.EBAY_REDIRECT_URI);
}

export function isGoogleOAuthConfigured(): boolean {
  const e = getEnv();
  return Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
}
