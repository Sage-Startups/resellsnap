import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Native tsconfig path resolution; no plugin needed.
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Integration tests share one PostgreSQL database, so files must not run
    // concurrently.
    fileParallelism: false,
  },
});
