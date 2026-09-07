/**
 * Scheduled maintenance entry point.
 *
 * Deployed on Railway as a Cron service running `pnpm maintenance`.
 */
import 'dotenv/config';
import { runMaintenance } from '../src/server/jobs/maintenance';
import { disconnectPrisma } from '../src/lib/db';
import { logger } from '../src/lib/logger';

async function main(): Promise<void> {
  const report = await runMaintenance();
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
  await disconnectPrisma();
}

main().catch(async (error) => {
  logger.error('Maintenance run failed', { error });
  await disconnectPrisma().catch(() => undefined);
  process.exit(1);
});
