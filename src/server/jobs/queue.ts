/**
 * PostgreSQL-backed job queue.
 *
 * Claiming uses `SELECT ... FOR UPDATE SKIP LOCKED`, which lets several worker
 * processes share one table without stepping on each other and without adding
 * Redis to the deployment. Failures back off exponentially with jitter and
 * land in a dead-letter state after `maxAttempts`.
 */
import { JobStatus, type JobType } from '@/generated/prisma/enums';
import type { Job } from '@/lib/models';
import { prisma } from '@/lib/db';
import { correlationId } from '@/lib/ids';
import { logger, sanitizeError } from '@/lib/logger';

export interface EnqueueInput {
  type: JobType;
  payload: Record<string, unknown>;
  workspaceId?: string | null;
  /** Lower runs first. */
  priority?: number;
  maxAttempts?: number;
  runAt?: Date;
  /** Makes the enqueue itself idempotent. */
  idempotencyKey?: string;
  correlationId?: string;
}

export interface EnqueueResult {
  job: Job;
  created: boolean;
}

export async function enqueueJob(input: EnqueueInput): Promise<EnqueueResult> {
  const data = {
    type: input.type,
    payload: input.payload as never,
    workspaceId: input.workspaceId ?? null,
    priority: input.priority ?? 100,
    maxAttempts: input.maxAttempts ?? 5,
    runAt: input.runAt ?? new Date(),
    idempotencyKey: input.idempotencyKey ?? null,
    correlationId: input.correlationId ?? correlationId(),
  };

  if (!input.idempotencyKey) {
    return { job: await prisma.job.create({ data }), created: true };
  }

  const existing = await prisma.job.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { job: existing, created: false };

  try {
    return { job: await prisma.job.create({ data }), created: true };
  } catch {
    // Lost a race against a concurrent enqueue with the same key — that is the
    // intended outcome, so return the winner.
    const winner = await prisma.job.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (winner) return { job: winner, created: false };
    throw new Error('Failed to enqueue job');
  }
}

/**
 * Atomically claims up to `limit` due jobs for this worker.
 *
 * The whole claim is a single statement so a worker crash between SELECT and
 * UPDATE is impossible; a crash *after* the claim is recovered by
 * `reclaimStalledJobs`.
 */
export async function claimJobs(workerId: string, limit: number): Promise<Job[]> {
  const rows = await prisma.$queryRaw<Job[]>`
    UPDATE "job"
    SET "status" = 'RUNNING',
        "lockedAt" = NOW(),
        "lockedBy" = ${workerId},
        "startedAt" = COALESCE("startedAt", NOW()),
        "attempts" = "attempts" + 1,
        "updatedAt" = NOW()
    WHERE "id" IN (
      SELECT "id" FROM "job"
      WHERE "status" = 'QUEUED' AND "runAt" <= NOW()
      ORDER BY "priority" ASC, "runAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING *
  `;
  return rows;
}

export async function completeJob(jobId: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: JobStatus.SUCCEEDED,
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
}

/** Exponential backoff with full jitter, capped at 10 minutes. */
export function backoffDelayMs(attempt: number): number {
  const base = Math.min(600_000, 2_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base / 2 + Math.random() * (base / 2));
}

export interface FailJobResult {
  deadLettered: boolean;
  nextRunAt: Date | null;
}

export async function failJob(
  job: Pick<Job, 'id' | 'attempts' | 'maxAttempts' | 'type'>,
  error: unknown,
  options: { retryable?: boolean } = {},
): Promise<FailJobResult> {
  const message = sanitizeError(error, 'Job failed');
  const retryable = options.retryable ?? true;
  const exhausted = !retryable || job.attempts >= job.maxAttempts;

  if (exhausted) {
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: JobStatus.DEAD_LETTER,
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: message,
      },
    });
    logger.error('Job dead-lettered', { jobId: job.id, type: job.type, attempts: job.attempts });
    return { deadLettered: true, nextRunAt: null };
  }

  const nextRunAt = new Date(Date.now() + backoffDelayMs(job.attempts));
  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: JobStatus.QUEUED,
      runAt: nextRunAt,
      lockedAt: null,
      lockedBy: null,
      lastError: message,
    },
  });

  logger.warn('Job failed; scheduled for retry', {
    jobId: job.id,
    type: job.type,
    attempt: job.attempts,
    nextRunAt: nextRunAt.toISOString(),
  });

  return { deadLettered: false, nextRunAt };
}

/**
 * Returns jobs whose worker died mid-flight to the queue.
 *
 * A job locked for longer than the stall window has no live owner: either the
 * container was reclaimed or the process crashed.
 */
export async function reclaimStalledJobs(stallMinutes = 15): Promise<number> {
  const cutoff = new Date(Date.now() - stallMinutes * 60_000);
  const result = await prisma.job.updateMany({
    where: { status: JobStatus.RUNNING, lockedAt: { lt: cutoff } },
    data: { status: JobStatus.QUEUED, lockedAt: null, lockedBy: null, runAt: new Date() },
  });
  if (result.count > 0) logger.warn('Reclaimed stalled jobs', { count: result.count });
  return result.count;
}

export async function cancelJob(jobId: string): Promise<void> {
  await prisma.job.updateMany({
    where: { id: jobId, status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] } },
    data: { status: JobStatus.CANCELLED, finishedAt: new Date(), lockedAt: null, lockedBy: null },
  });
}

/** Puts a dead-lettered job back on the queue with its attempt counter reset. */
export async function retryJob(jobId: string): Promise<void> {
  await prisma.job.updateMany({
    where: { id: jobId, status: { in: [JobStatus.DEAD_LETTER, JobStatus.FAILED, JobStatus.CANCELLED] } },
    data: {
      status: JobStatus.QUEUED,
      attempts: 0,
      runAt: new Date(),
      lastError: null,
      finishedAt: null,
      lockedAt: null,
      lockedBy: null,
    },
  });
}

export interface QueueStats {
  queued: number;
  running: number;
  succeeded: number;
  deadLetter: number;
  oldestQueuedAt: Date | null;
  backlogByType: Array<{ type: JobType; count: number }>;
}

export async function getQueueStats(): Promise<QueueStats> {
  const [counts, oldest, byType] = await Promise.all([
    prisma.job.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.job.findFirst({
      where: { status: JobStatus.QUEUED },
      orderBy: { runAt: 'asc' },
      select: { runAt: true },
    }),
    prisma.job.groupBy({
      by: ['type'],
      where: { status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] } },
      _count: { _all: true },
    }),
  ]);

  const find = (status: JobStatus) => counts.find((c) => c.status === status)?._count._all ?? 0;

  return {
    queued: find(JobStatus.QUEUED),
    running: find(JobStatus.RUNNING),
    succeeded: find(JobStatus.SUCCEEDED),
    deadLetter: find(JobStatus.DEAD_LETTER),
    oldestQueuedAt: oldest?.runAt ?? null,
    backlogByType: byType.map((row) => ({ type: row.type, count: row._count._all })),
  };
}
