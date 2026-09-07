/**
 * Test bootstrap.
 *
 * Integration tests run against a real PostgreSQL database — mocking Prisma
 * would test the mock, not the transaction and constraint behaviour the credit
 * ledger actually depends on.
 */
import { config } from 'dotenv';

config({ path: '.env.test', quiet: true });
config({ path: '.env', quiet: true, override: false });

// `NODE_ENV` is typed as read-only, but the suite genuinely needs it set before
// any module reads the env cache.
(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.AI_PROVIDER ??= 'fake';
process.env.EMAIL_PROVIDER ??= 'console';
process.env.STORAGE_DRIVER ??= 'local';
process.env.LOCAL_STORAGE_DIR ??= '.storage-test';
process.env.TOKEN_ENCRYPTION_KEY ??=
  '0000000000000000000000000000000000000000000000000000000000000001';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-value-at-least-32-characters-long';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.LOG_LEVEL ??= 'error';
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:5432/resellsnap_test';
