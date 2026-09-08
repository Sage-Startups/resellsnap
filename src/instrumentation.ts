/**
 * Server startup checks.
 *
 * `register` is called once per server instance and must complete before the
 * server accepts requests, which makes it the right place to prove the
 * deployment is actually configured.
 *
 * Without this, `getEnv()` is only reached on the first request that happens to
 * need it. A deployment missing, say, `TOKEN_ENCRYPTION_KEY` would start
 * cleanly, pass the liveness healthcheck — which deliberately touches no
 * dependency — go green, and only then throw a 500 at the first real visitor.
 * A misconfigured release should fail immediately and visibly instead.
 */
export async function register(): Promise<void> {
  // `register` runs in every runtime; the environment schema is Node-only.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { getEnv } = await import('@/lib/env');

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
