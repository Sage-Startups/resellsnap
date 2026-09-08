/**
 * Server startup checks.
 *
 * `register` is called once per server instance and must complete before the
 * server accepts requests, which makes it the right place to prove the
 * deployment is actually configured.
 *
 * Next calls this in every runtime, so the actual check lives in
 * `instrumentation-node.ts` and is imported only under Node — it uses
 * `process.exit`, which does not exist in the Edge runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { assertEnvironment } = await import('./instrumentation-node');
  assertEnvironment();
}
