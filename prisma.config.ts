import 'dotenv/config';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 moved the datasource URL out of `schema.prisma` and into this file.
 * The runtime client is constructed separately in `src/lib/db.ts` with the
 * `@prisma/adapter-pg` driver adapter, so the connection string lives in
 * exactly one place: the `DATABASE_URL` environment variable.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: env('DATABASE_URL'),
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
