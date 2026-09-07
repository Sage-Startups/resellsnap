/**
 * Stripe webhook integration tests.
 *
 * Two properties matter more than any other here, because getting either wrong
 * costs a customer real money:
 *
 *  1. An unsigned or tampered payload must never reach a handler.
 *  2. A replayed delivery — Stripe retries aggressively — must never grant
 *     credits twice.
 *
 * These run against the real PostgreSQL database and the real Stripe SDK. Only
 * the network is absent: signature construction and verification are local
 * crypto, so they can be exercised end to end with a test secret.
 */
import Stripe from 'stripe';
import type * as BillingService from '@/server/billing/service';
import type * as BillingStripe from '@/server/billing/stripe';
import type * as StripeWebhookRoute from '@/app/api/webhooks/stripe/route';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CreditEntryKind, WebhookStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { resetEnvCacheForTests } from '@/lib/env';
import {
  createTestWorkspace,
  destroyTestWorkspace,
  ensureReferenceData,
  type TestWorkspace,
} from '../helpers/db';

const WEBHOOK_SECRET = 'whsec_test_secret_for_signature_verification';
const created: TestWorkspace[] = [];
const eventIds: string[] = [];

let processStripeEvent: typeof BillingService.processStripeEvent;
let constructWebhookEvent: typeof BillingStripe.constructWebhookEvent;
let route: typeof StripeWebhookRoute;
let signer: Stripe;

beforeAll(async () => {
  // Stripe must look configured before any module reads the env cache.
  process.env.STRIPE_SECRET_KEY = 'sk_test_00000000000000000000000000';
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.STRIPE_PORTAL_RETURN_URL = 'http://localhost:3000/app/billing';
  resetEnvCacheForTests();

  ({ processStripeEvent } = await import('@/server/billing/service'));
  ({ constructWebhookEvent } = await import('@/server/billing/stripe'));
  route = await import('@/app/api/webhooks/stripe/route');

  signer = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-08-26.dahlia' });

  await ensureReferenceData();
});

afterEach(async () => {
  await Promise.all(created.splice(0).map(destroyTestWorkspace));
  if (eventIds.length > 0) {
    const ids = eventIds.splice(0);
    await prisma.stripeEvent.deleteMany({ where: { stripeEventId: { in: ids } } });
    await prisma.webhookEvent.deleteMany({ where: { source: 'STRIPE', eventId: { in: ids } } });
  }
});

afterAll(async () => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  resetEnvCacheForTests();
});

async function freshWorkspace() {
  const workspace = await createTestWorkspace();
  created.push(workspace);
  return workspace;
}

/** Builds a payload and the header Stripe would have sent with it. */
function sign(payload: unknown, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(payload);
  const header = signer.webhooks.generateTestHeaderString({ payload: body, secret });
  return { body, header };
}

function checkoutEvent(input: {
  id: string;
  workspaceId: string;
  planKey: string;
  sessionId: string;
}) {
  eventIds.push(input.id);
  return {
    id: input.id,
    object: 'event',
    api_version: '2026-08-26.dahlia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: input.sessionId,
        object: 'checkout.session',
        client_reference_id: input.workspaceId,
        customer: 'cus_test_1',
        metadata: { planKey: input.planKey, workspaceId: input.workspaceId },
        amount_total: 1900,
        currency: 'usd',
        status: 'complete',
        subscription: null,
      },
    },
  };
}

describe('Stripe webhook signature verification', () => {
  it('accepts a correctly signed payload', () => {
    const workspaceId = 'ws_signature_only';
    const { body, header } = sign(
      checkoutEvent({ id: 'evt_sig_ok', workspaceId, planKey: 'pack_20', sessionId: 'cs_1' }),
    );

    const event = constructWebhookEvent(body, header);
    expect(event.id).toBe('evt_sig_ok');
    expect(event.type).toBe('checkout.session.completed');
  });

  it('rejects a payload whose body was altered after signing', () => {
    const { body, header } = sign(
      checkoutEvent({ id: 'evt_sig_tamper', workspaceId: 'ws_x', planKey: 'pack_20', sessionId: 'cs_2' }),
    );

    // An attacker keeps the captured signature but swaps in a bigger pack.
    const tampered = body.replace('pack_20', 'pack_200');
    expect(tampered).not.toBe(body);

    expect(() => constructWebhookEvent(tampered, header)).toThrow();
  });

  it('rejects a payload signed with a different secret', () => {
    const { body, header } = sign(
      checkoutEvent({ id: 'evt_sig_wrong', workspaceId: 'ws_x', planKey: 'pack_20', sessionId: 'cs_3' }),
      'whsec_a_completely_different_secret',
    );

    expect(() => constructWebhookEvent(body, header)).toThrow();
  });

  it('rejects a stale timestamp outside the tolerance window', () => {
    const body = JSON.stringify(
      checkoutEvent({ id: 'evt_sig_old', workspaceId: 'ws_x', planKey: 'pack_20', sessionId: 'cs_4' }),
    );
    const header = signer.webhooks.generateTestHeaderString({
      payload: body,
      secret: WEBHOOK_SECRET,
      timestamp: Math.floor(Date.now() / 1000) - 60 * 60,
    });

    expect(() => constructWebhookEvent(body, header)).toThrow();
  });
});

describe('Stripe webhook route', () => {
  it('returns 400 and runs no handler when the signature header is missing', async () => {
    const { body } = sign(
      checkoutEvent({ id: 'evt_route_nosig', workspaceId: 'ws_x', planKey: 'pack_20', sessionId: 'cs_5' }),
    );

    const response = await route.POST(
      new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body }),
    );

    expect(response.status).toBe(400);
    expect(await prisma.stripeEvent.count({ where: { stripeEventId: 'evt_route_nosig' } })).toBe(0);
  });

  it('returns 400 for a bad signature and records nothing', async () => {
    const { body } = sign(
      checkoutEvent({ id: 'evt_route_badsig', workspaceId: 'ws_x', planKey: 'pack_20', sessionId: 'cs_6' }),
    );

    const response = await route.POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body,
        headers: { 'stripe-signature': 't=1,v1=deadbeef' },
      }),
    );

    expect(response.status).toBe(400);
    // The reason must not leak back over the wire.
    expect(await response.json()).toEqual({ error: 'Invalid signature' });
    expect(await prisma.stripeEvent.count({ where: { stripeEventId: 'evt_route_badsig' } })).toBe(0);
  });

  it('processes a properly signed credit pack purchase end to end', async () => {
    const workspace = await freshWorkspace();
    const { body, header } = sign(
      checkoutEvent({
        id: 'evt_route_ok',
        workspaceId: workspace.workspaceId,
        planKey: 'pack_20',
        sessionId: 'cs_route_ok',
      }),
    );

    const response = await route.POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body,
        headers: { 'stripe-signature': header },
      }),
    );

    expect(response.status).toBe(200);

    const after = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspace.workspaceId },
      select: { purchasedCredits: true },
    });
    expect(after.purchasedCredits).toBe(20);
  });
});

describe('Stripe webhook idempotency', () => {
  it('grants credits exactly once when the same event is delivered twice', async () => {
    const workspace = await freshWorkspace();
    const event = checkoutEvent({
      id: 'evt_replay',
      workspaceId: workspace.workspaceId,
      planKey: 'pack_75',
      sessionId: 'cs_replay',
    }) as unknown as Stripe.Event;

    const first = await processStripeEvent(event);
    const second = await processStripeEvent(event);

    expect(first.status).toBe(WebhookStatus.PROCESSED);
    expect(second.status).toBe(WebhookStatus.PROCESSED);
    expect(second.detail).toBe('Already processed');

    const after = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspace.workspaceId },
      select: { purchasedCredits: true },
    });
    expect(after.purchasedCredits).toBe(75);

    const entries = await prisma.creditLedger.count({
      where: { workspaceId: workspace.workspaceId, kind: CreditEntryKind.PACK_PURCHASE },
    });
    expect(entries).toBe(1);
  });

  it('grants exactly once even when two deliveries race', async () => {
    const workspace = await freshWorkspace();
    const event = checkoutEvent({
      id: 'evt_race',
      workspaceId: workspace.workspaceId,
      planKey: 'pack_20',
      sessionId: 'cs_race',
    }) as unknown as Stripe.Event;

    // Stripe can genuinely deliver the same event to two containers at once.
    const results = await Promise.allSettled([
      processStripeEvent(event),
      processStripeEvent(event),
    ]);

    // Whatever happens at the event-record layer, the money outcome is fixed.
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);

    // A loser of the race records FAILED, so Stripe retries it. The retry must
    // converge on PROCESSED without granting a second time.
    const retry = await processStripeEvent(event);
    expect(retry.status).toBe(WebhookStatus.PROCESSED);

    const after = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspace.workspaceId },
      select: { purchasedCredits: true },
    });
    expect(after.purchasedCredits).toBe(20);
    expect(
      await prisma.creditLedger.count({
        where: { workspaceId: workspace.workspaceId, kind: CreditEntryKind.PACK_PURCHASE },
      }),
    ).toBe(1);
  });

  it('records an unhandled event type as ignored rather than failing', async () => {
    const id = 'evt_unhandled';
    eventIds.push(id);
    const event = {
      id,
      object: 'event',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      type: 'payment_intent.created',
      data: { object: { id: 'pi_1', object: 'payment_intent' } },
    } as unknown as Stripe.Event;

    const outcome = await processStripeEvent(event);
    expect(outcome.status).toBe(WebhookStatus.IGNORED);

    const record = await prisma.stripeEvent.findUniqueOrThrow({
      where: { stripeEventId: id },
    });
    expect(record.status).toBe(WebhookStatus.IGNORED);
  });

  it('stores only ids and states in the payload summary, never card data', async () => {
    const workspace = await freshWorkspace();
    const id = 'evt_summary';
    const event = checkoutEvent({
      id,
      workspaceId: workspace.workspaceId,
      planKey: 'pack_20',
      sessionId: 'cs_summary',
    }) as unknown as Stripe.Event;

    await processStripeEvent(event);

    const record = await prisma.stripeEvent.findUniqueOrThrow({ where: { stripeEventId: id } });
    const summary = record.payloadSummary as Record<string, unknown>;
    expect(Object.keys(summary).sort()).toEqual(
      ['amountTotal', 'currency', 'id', 'livemode', 'object', 'status'].sort(),
    );
    expect(JSON.stringify(summary)).not.toContain('cus_test_1');
  });
});

describe('Stripe subscription lifecycle credits', () => {
  function invoicePaidEvent(input: {
    id: string;
    customerId: string;
    priceId: string;
    periodStart: number;
  }) {
    eventIds.push(input.id);
    return {
      id: input.id,
      object: 'event',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      type: 'invoice.paid',
      data: {
        object: {
          id: `in_${input.id}`,
          object: 'invoice',
          customer: input.customerId,
          created: input.periodStart,
          metadata: {},
          lines: {
            data: [
              {
                pricing: { price_details: { price: input.priceId } },
                period: { start: input.periodStart, end: input.periodStart + 2_592_000 },
              },
            ],
          },
        },
      },
    } as unknown as Stripe.Event;
  }

  it('resets monthly credits once per billing period, not once per delivery', async () => {
    const workspace = await freshWorkspace();
    const customerId = `cus_${workspace.workspaceId.slice(-12)}`;
    const priceId = `price_${workspace.workspaceId.slice(-12)}`;

    await prisma.plan.update({ where: { key: 'starter' }, data: { stripePriceId: priceId } });
    await prisma.subscription.update({
      where: { workspaceId: workspace.workspaceId },
      data: { stripeCustomerId: customerId },
    });

    const periodStart = Math.floor(Date.now() / 1000);
    const first = await processStripeEvent(
      invoicePaidEvent({ id: 'evt_inv_1', customerId, priceId, periodStart }),
    );
    // A different event id, same billing period — Stripe does this on retries
    // that arrive after the original was already recorded.
    const second = await processStripeEvent(
      invoicePaidEvent({ id: 'evt_inv_2', customerId, priceId, periodStart }),
    );

    expect(first.status).toBe(WebhookStatus.PROCESSED);
    expect(second.detail).toBe('Already reset');

    const after = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspace.workspaceId },
      select: { monthlyCredits: true },
    });
    expect(after.monthlyCredits).toBe(50);

    await prisma.plan.update({ where: { key: 'starter' }, data: { stripePriceId: null } });
  });

  it('expires monthly credits through the ledger on cancellation but keeps purchased ones', async () => {
    const workspace = await createTestWorkspace({ monthlyCredits: 40, purchasedCredits: 15 });
    created.push(workspace);

    const customerId = `cus_cancel_${workspace.workspaceId.slice(-8)}`;
    await prisma.subscription.update({
      where: { workspaceId: workspace.workspaceId },
      data: { stripeCustomerId: customerId, status: 'ACTIVE' },
    });

    const id = 'evt_sub_deleted';
    eventIds.push(id);
    const event = {
      id,
      object: 'event',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_cancel_1',
          object: 'subscription',
          customer: customerId,
          metadata: {},
          items: { data: [] },
        },
      },
    } as unknown as Stripe.Event;

    const outcome = await processStripeEvent(event);
    expect(outcome.status).toBe(WebhookStatus.PROCESSED);

    const after = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspace.workspaceId },
      select: { monthlyCredits: true, purchasedCredits: true },
    });
    expect(after.monthlyCredits).toBe(0);
    // The seller paid for these separately; cancelling a plan must not take them.
    expect(after.purchasedCredits).toBe(15);

    // The cached balance and the ledger must still agree.
    const entries = await prisma.creditLedger.findMany({
      where: { workspaceId: workspace.workspaceId },
    });
    const ledgerTotal = entries.reduce((sum, entry) => sum + entry.delta, 0);
    expect(ledgerTotal).toBe(after.monthlyCredits + after.purchasedCredits);
    expect(entries.some((entry) => entry.kind === CreditEntryKind.EXPIRY)).toBe(true);
  });
});
