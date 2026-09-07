/**
 * Worker runtime.
 *
 * Polls the queue, runs up to `WORKER_CONCURRENCY` jobs at once, and shuts down
 * gracefully: on SIGTERM it stops claiming new work and waits for in-flight
 * jobs, so a Railway redeploy never abandons a half-finished generation.
 */
import { randomUUID } from 'node:crypto';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { AIProviderError } from '@/server/ai/provider';
import { MarketplaceApiError, MarketplaceNotSupportedError } from '@/server/marketplace/types';
import { claimJobs, completeJob, failJob, reclaimStalledJobs } from './queue';
import { HANDLERS } from './handlers';

export interface WorkerOptions {
  concurrency?: number;
  pollIntervalMs?: number;
  /** Stop after this many polls. Used by tests; undefined means run forever. */
  maxPolls?: number;
}

export class Worker {
  readonly id = `worker-${randomUUID().slice(0, 8)}`;
  #running = false;
  #stopping = false;
  #inFlight = new Set<Promise<void>>();
  #polls = 0;

  constructor(private readonly options: WorkerOptions = {}) {}

  get concurrency(): number {
    return this.options.concurrency ?? getEnv().WORKER_CONCURRENCY;
  }

  get pollIntervalMs(): number {
    return this.options.pollIntervalMs ?? getEnv().WORKER_POLL_MS;
  }

  async start(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    logger.info('Worker started', { workerId: this.id, concurrency: this.concurrency });

    // Recover anything a previous container left locked.
    await reclaimStalledJobs().catch((error) => logger.warn('Reclaim failed at startup', { error }));

    while (!this.#stopping) {
      if (this.options.maxPolls !== undefined && this.#polls >= this.options.maxPolls) break;
      this.#polls += 1;

      try {
        const capacity = this.concurrency - this.#inFlight.size;
        if (capacity > 0) {
          const jobs = await claimJobs(this.id, capacity);
          for (const job of jobs) {
            const promise = this.#run(job).finally(() => this.#inFlight.delete(promise));
            this.#inFlight.add(promise);
          }
          if (jobs.length > 0) continue; // immediately look for more
        }
      } catch (error) {
        logger.error('Worker poll failed', { error });
      }

      await sleep(this.pollIntervalMs);
    }

    await Promise.allSettled([...this.#inFlight]);
    this.#running = false;
    logger.info('Worker stopped', { workerId: this.id });
  }

  async #run(job: Awaited<ReturnType<typeof claimJobs>>[number]): Promise<void> {
    const log = logger.child({ jobId: job.id, jobType: job.type, correlationId: job.correlationId });
    const handler = HANDLERS[job.type];

    if (!handler) {
      await failJob(job, new Error(`No handler registered for ${job.type}`), { retryable: false });
      return;
    }

    const startedAt = Date.now();
    try {
      const result = await handler(job);
      await completeJob(job.id);
      log.info('Job completed', { durationMs: Date.now() - startedAt, ...(result ?? {}) });
    } catch (error) {
      await failJob(job, error, { retryable: isRetryable(error) });
      log.warn('Job failed', { durationMs: Date.now() - startedAt });
    }
  }

  /** Signals the loop to finish; awaited by the process shutdown handler. */
  stop(): void {
    this.#stopping = true;
  }

  get inFlightCount(): number {
    return this.#inFlight.size;
  }
}

/** Decides retry vs. dead-letter from the error type. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof AIProviderError) return error.retryable;
  if (error instanceof MarketplaceApiError) return error.retryable;
  if (error instanceof MarketplaceNotSupportedError) return false;
  if (error instanceof Error && error.name === 'ZodError') return false;
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
