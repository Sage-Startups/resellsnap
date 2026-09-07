/**
 * Stripe integration.
 *
 * Stripe is the source of truth for what was charged. We mirror only what the
 * product needs — plan, status, period, and the credits those imply — and we
 * never create products or prices from code, so a deployment cannot
 * accidentally spawn live Stripe objects.
 */
import Stripe from 'stripe';
import { getEnv, isStripeConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!isStripeConfigured()) {
    throw new Error('Stripe is not configured on this deployment.');
  }
  client ??= new Stripe(getEnv().STRIPE_SECRET_KEY as string, {
    // Pinning the API version means a Stripe-side upgrade cannot silently
    // change the shape of a webhook we depend on.
    apiVersion: '2026-08-26.dahlia',
    typescript: true,
    maxNetworkRetries: 2,
    timeout: 20_000,
  });
  return client;
}

export function setStripeForTests(next: Stripe | null): void {
  client = next;
}

export async function stripeHealthCheck(): Promise<{ ok: boolean; detail: string }> {
  if (!isStripeConfigured()) {
    return { ok: false, detail: 'STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is not set' };
  }
  try {
    const account = await getStripe().accounts.retrieve('');
    const mode = (getEnv().STRIPE_SECRET_KEY ?? '').startsWith('sk_live') ? 'live' : 'test';
    return { ok: true, detail: `Connected to ${account.id} (${mode} mode)` };
  } catch (error) {
    logger.warn('Stripe health check failed', { error });
    return { ok: false, detail: 'Stripe is configured but unreachable' };
  }
}

/**
 * Verifies a webhook signature against the RAW request body.
 *
 * Passing a parsed body here would silently break verification, which is why
 * the route reads `request.text()` and hands the string straight through.
 */
export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  return getStripe().webhooks.constructEvent(
    rawBody,
    signature,
    getEnv().STRIPE_WEBHOOK_SECRET as string,
  );
}

export function isTestMode(): boolean {
  return !(getEnv().STRIPE_SECRET_KEY ?? '').startsWith('sk_live');
}
