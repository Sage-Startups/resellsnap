/**
 * Credit pack purchase.
 *
 * Stripe Checkout itself is hosted by Stripe and cannot be driven here, so the
 * spec exercises the half that is ours and that carries the risk: the webhook.
 * Signature verification is local crypto, so a genuinely signed delivery can be
 * posted at the running server, and the grant it produces must be idempotent —
 * Stripe retries, and a customer must never be granted the same pack twice.
 */
import Stripe from 'stripe';
import { expect, test } from '@playwright/test';
import { newAccount, saveSignedInState } from './helpers/auth';
import { closeDb, countRows, creditBalance, destroyUser, query, workspaceIdFor } from './helpers/db';

const account = newAccount('billing');

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const signer = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
  apiVersion: '2026-08-26.dahlia',
});

test.afterAll(async () => {
  await destroyUser(account.email);
  await closeDb();
});

/** The smallest credit pack the deployment sells. */
async function creditPackPlan() {
  const [plan] = await query<{ key: string; priceCents: number; creditsGranted: number }>(
    `SELECT key, "priceCents", "creditsGranted" FROM "plan"
      WHERE kind = 'CREDIT_PACK' ORDER BY "sortOrder" ASC LIMIT 1`,
  );
  if (!plan) throw new Error('No credit pack plan is seeded in this database.');
  return plan;
}

test.describe.configure({ mode: 'serial' });

// Signed in once for the whole file — see the note in marketplace.spec.ts.
const STATE = 'test-results/.auth/billing.json';
test.use({ storageState: STATE });

test.beforeAll(async ({ browser }) => {
  await saveSignedInState(browser, account, STATE);
});

test('the billing page shows packs and never a fabricated balance', async ({ page }) => {
  await page.goto('/app/billing');
  await expect(page).toHaveURL(/\/app\/billing/);

  const balance = await creditBalance(account.email);
  await expect(page.getByText(`${balance} credits`).first()).toBeVisible();
});

test('a signed pack purchase grants credits exactly once, however often it is delivered', async ({
  page,
  request,
}) => {
  test.skip(!WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET is not set for this run');

  const workspaceId = await workspaceIdFor(account.email);
  const before = await creditBalance(account.email);

  const plan = await creditPackPlan();

  const event = {
    id: `evt_e2e_${Date.now()}`,
    object: 'event',
    api_version: '2026-08-26.dahlia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_e2e_${Date.now()}`,
        object: 'checkout.session',
        client_reference_id: workspaceId,
        customer: 'cus_e2e',
        metadata: { planKey: plan.key, workspaceId },
        amount_total: plan.priceCents,
        currency: 'usd',
        status: 'complete',
        subscription: null,
      },
    },
  };

  const body = JSON.stringify(event);
  const signature = signer.webhooks.generateTestHeaderString({
    payload: body,
    secret: WEBHOOK_SECRET as string,
  });

  const post = () =>
    request.post('/api/webhooks/stripe', {
      data: body,
      headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
    });

  expect((await post()).status()).toBe(200);
  // Stripe retries. The second delivery must change nothing.
  expect((await post()).status()).toBe(200);

  expect(await creditBalance(account.email)).toBe(before + plan.creditsGranted);
  expect(
    await countRows(
      `SELECT COUNT(*) FROM "credit_ledger" WHERE "workspaceId" = $1 AND kind = 'PACK_PURCHASE'`,
      [workspaceId],
    ),
  ).toBe(1);

  // And the customer sees the new balance, not a stale one.
  await page.goto('/app/billing');
  await expect(
    page.getByText(`${before + plan.creditsGranted} credits`).first(),
  ).toBeVisible({ timeout: 20_000 });
});

test('an unsigned webhook is refused and grants nothing', async ({ request }) => {
  const workspaceId = await workspaceIdFor(account.email);
  const before = await creditBalance(account.email);
  const plan = await creditPackPlan();

  const response = await request.post('/api/webhooks/stripe', {
    data: JSON.stringify({
      id: `evt_forged_${Date.now()}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_forged',
          client_reference_id: workspaceId,
          metadata: { planKey: plan.key, workspaceId },
        },
      },
    }),
    headers: { 'stripe-signature': 't=1,v1=forged', 'content-type': 'application/json' },
    failOnStatusCode: false,
  });

  expect(response.status()).toBeGreaterThanOrEqual(400);
  expect(await creditBalance(account.email)).toBe(before);
});
