/**
 * Fixed-window rate limiting backed by PostgreSQL.
 *
 * Deliberately not Redis: the whole product runs on one PostgreSQL service plus
 * a worker, which keeps the Railway setup (and the handover) simple. Windows
 * are short and rows are swept by the scheduled cleanup job.
 */
import { prisma } from './db';
import { logger } from './logger';

export interface RateLimitRule {
  /** Maximum number of hits allowed inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

/** Named rules so limits are reviewable in one place. */
export const RATE_LIMITS = {
  login: { limit: 10, windowSeconds: 300 },
  register: { limit: 5, windowSeconds: 3600 },
  passwordReset: { limit: 5, windowSeconds: 3600 },
  uploadRequest: { limit: 120, windowSeconds: 3600 },
  aiJob: { limit: 40, windowSeconds: 3600 },
  aiJobBurst: { limit: 6, windowSeconds: 60 },
  export: { limit: 60, windowSeconds: 3600 },
  oauthCallback: { limit: 20, windowSeconds: 600 },
  adminMutation: { limit: 200, windowSeconds: 3600 },
  contactForm: { limit: 5, windowSeconds: 3600 },
  publish: { limit: 30, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Consumes one unit from a bucket.
 *
 * The upsert is atomic, so concurrent requests cannot both observe a stale
 * count. If the limiter itself errors we fail *open* and log loudly — a
 * database blip should not lock every customer out of the product.
 */
export async function consumeRateLimit(
  name: RateLimitName,
  identifier: string,
  overrides?: Partial<RateLimitRule>,
): Promise<RateLimitResult> {
  const rule = { ...RATE_LIMITS[name], ...overrides };
  const now = new Date();
  const windowStart = Math.floor(now.getTime() / (rule.windowSeconds * 1000));
  const bucketKey = `${name}:${identifier}:${windowStart}`;
  const resetAt = new Date((windowStart + 1) * rule.windowSeconds * 1000);

  try {
    const record = await prisma.rateLimit.upsert({
      where: { bucketKey },
      create: { bucketKey, count: 1, expiresAt: resetAt },
      update: { count: { increment: 1 } },
      select: { count: true },
    });

    const allowed = record.count <= rule.limit;
    return {
      allowed,
      remaining: Math.max(0, rule.limit - record.count),
      limit: rule.limit,
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)),
    };
  } catch (error) {
    logger.error('Rate limiter unavailable; failing open', { name, error });
    return {
      allowed: true,
      remaining: rule.limit,
      limit: rule.limit,
      resetAt,
      retryAfterSeconds: 0,
    };
  }
}

/** Reads the current state without consuming a unit. */
export async function peekRateLimit(
  name: RateLimitName,
  identifier: string,
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name];
  const now = new Date();
  const windowStart = Math.floor(now.getTime() / (rule.windowSeconds * 1000));
  const resetAt = new Date((windowStart + 1) * rule.windowSeconds * 1000);

  const record = await prisma.rateLimit.findUnique({
    where: { bucketKey: `${name}:${identifier}:${windowStart}` },
    select: { count: true },
  });

  const count = record?.count ?? 0;
  return {
    allowed: count < rule.limit,
    remaining: Math.max(0, rule.limit - count),
    limit: rule.limit,
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)),
  };
}

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('Too many requests. Please try again shortly.');
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function enforceRateLimit(
  name: RateLimitName,
  identifier: string,
  overrides?: Partial<RateLimitRule>,
): Promise<void> {
  const result = await consumeRateLimit(name, identifier, overrides);
  if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds);
}
