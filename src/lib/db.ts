import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { getEnv } from './env';

/**
 * Prisma 7 talks to PostgreSQL through a driver adapter rather than a Rust
 * engine binary, which keeps the Railway image small and startup fast.
 *
 * Connection pooling is sized conservatively: a Railway service typically runs
 * a small number of containers, and the worker process opens its own pool.
 */
function createClient(): PrismaClient {
  const env = getEnv();

  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  return new PrismaClient({
    adapter,
    log: env.isProduction ? ['warn', 'error'] : ['warn', 'error'],
  });
}

const globalForPrisma = globalThis as unknown as { __resellsnapPrisma?: PrismaClient };

// Re-use the client across hot reloads in development so we don't exhaust
// PostgreSQL connections.
export const prisma: PrismaClient = globalForPrisma.__resellsnapPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__resellsnapPrisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
