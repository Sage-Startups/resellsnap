import { NextResponse } from 'next/server';
import { isStripeConfigured } from '@/lib/env';
import { logger, sanitizeError } from '@/lib/logger';
import { constructWebhookEvent } from '@/server/billing/stripe';
import { processStripeEvent } from '@/server/billing/service';

/**
 * Stripe webhook receiver.
 *
 * Signature verification runs against the RAW body — `request.text()`, never a
 * parsed object — because Stripe signs the exact bytes it sent. An unverified
 * request is rejected before any handler runs.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isStripeConfigured()) {
    logger.warn('Stripe webhook received but Stripe is not configured');
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (error) {
    // A bad signature is either a misconfiguration or an attack. Either way it
    // is a 400, and the reason never goes back over the wire.
    logger.warn('Stripe webhook signature verification failed', {
      reason: sanitizeError(error, 'invalid signature'),
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    const outcome = await processStripeEvent(event);
    logger.info('Stripe webhook processed', {
      type: event.type,
      eventId: event.id,
      status: outcome.status,
    });
    // Always 200 on a handled event, including "ignored": a non-2xx makes
    // Stripe retry an event we have deliberately chosen not to act on.
    return NextResponse.json({ received: true, status: outcome.status });
  } catch (error) {
    logger.error('Stripe webhook handler threw', { type: event.type, error });
    // 500 asks Stripe to retry, which is what we want for a transient failure.
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
