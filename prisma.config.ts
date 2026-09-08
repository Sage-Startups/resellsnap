import 'dotenv/config';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 moved the datasource URL out of `schema.prisma` and into this file.
 * The runtime client is constructed separately in `src/lib/db.ts` with the
 * `@prisma/adapter-pg` driver adapter, so the connection string lives in
 * exactly one place: the `DATABASE_URL` environment variable.
 */

/**
 * `prisma generate` only reads the schema — it needs no database. But this
 * config is loaded for *every* Prisma command, and `env()` throws when the
 * variable is missing, which breaks `generate` during a Docker build: an image
 * is built long before it is given a database.
 *
 * So during a build (`SKIP_ENV_VALIDATION=1`, the same switch the rest of the
 * codebase uses) fall back to an unusable placeholder. Everywhere else the
 * strict lookup stands, so `migrate deploy` at release time still fails loudly
 * and by name rather than with a confusing connection error.
 */
function datasourceUrl(): string {
  if (process.env.SKIP_ENV_VALIDATION === '1') {
    return process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder';
  }
  return env('DATABASE_URL');
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: datasourceUrl(),
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
