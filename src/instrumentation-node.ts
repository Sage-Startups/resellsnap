/**
 * Node-only startup checks.
 *
 * Kept in its own module because `instrumentation.ts` is compiled for every
 * runtime, including Edge, where `process.exit` does not exist — referencing it
 * there makes the bundler complain on every build. Importing this file only
 * under the Node runtime keeps that API out of the Edge bundle entirely.
 */
import { getEnv } from '@/lib/env';

/**
 * Proves the deployment is configured before the server accepts traffic.
 *
 * Without this, `getEnv()` is only reached on the first request that happens to
 * need it: a deployment missing, say, `TOKEN_ENCRYPTION_KEY` would start
 * cleanly, pass the liveness healthcheck — which deliberately touches no
 * dependency — go green, and only then throw a 500 at the first real visitor.
 */
export function assertEnvironment(): void {
  try {
    getEnv();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    // Not the logger: it reads the environment we have just failed to load.
    console.error(`\nThis deployment is not correctly configured.\n\n${detail}\n`);

    // Exit rather than serve. A container that dies is a failed deploy the
    // platform will surface; one that answers 500s looks healthy.
    process.exit(1);
  }
}
