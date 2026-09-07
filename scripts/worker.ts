/**
 * Worker process entry point.
 *
 * Deployed on Railway as a second service from the same image, with the start
 * command `pnpm worker`. Shares the database with the web service and nothing
 * else.
 */
import 'dotenv/config';
import { Worker } from '../src/server/jobs/runner';
import { disconnectPrisma } from '../src/lib/db';
import { logger } from '../src/lib/logger';

async function main(): Promise<void> {
  const worker = new Worker();

  const shutdown = (signal: string) => {
    logger.info('Shutdown signal received; draining in-flight jobs', {
      signal,
      inFlight: worker.inFlightCount,
    });
    worker.stop();

    // Hard stop if a job hangs past the platform's grace period.
    setTimeout(() => {
      logger.error('Graceful shutdown timed out; exiting');
      process.exit(1);
    }, 25_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection in worker', { reason });
  });

  await worker.start();
  await disconnectPrisma();
  process.exit(0);
}

main().catch((error) => {
  logger.error('Worker crashed during startup', { error });
  process.exit(1);
});
