/**
 * What the integrations page is allowed to offer.
 *
 * The rule is that a Connect or Publish action appears only where an approved
 * official API and valid credentials actually exist. Everywhere else the seller
 * is told plainly that they will be exporting and pasting themselves — never
 * given a button that cannot work.
 */
import { expect, test } from '@playwright/test';
import { newAccount, saveSignedInState } from './helpers/auth';
import { closeDb, countRows, destroyUser, setPlan } from './helpers/db';

const account = newAccount('marketplace');
const ebayConfigured = Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);

test.afterAll(async () => {
  await destroyUser(account.email);
  await closeDb();
});

test.describe.configure({ mode: 'serial' });

// Signed in once for the whole file: every test gets a fresh browser context,
// and signing in per test would trip Better Auth's sign-in rate limit.
const STATE = 'test-results/.auth/marketplace.json';
test.use({ storageState: STATE });

test.beforeAll(async ({ browser }) => {
  await saveSignedInState(browser, account, STATE);
});

test('platforms without a publishing API offer export, not a dead Connect button', async ({
  page,
}) => {
  await page.goto('/app/integrations');
  await expect(page).toHaveURL(/\/app\/integrations/);

  for (const name of ['Vinted', 'Depop', 'Facebook Marketplace']) {
    // Each platform is one list item headed by its name.
    const card = page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name, exact: true }) })
      .first();
    await expect(card).toBeVisible();

    // The page must say why, rather than implying an integration exists.
    const text = ((await card.textContent()) ?? '').toLowerCase();
    expect(text, `${name} must explain that it is export-only`).toMatch(
      /export|copy|paste|not available|no (public |official )?api/,
    );

    // And it must not offer an action that cannot work.
    await expect(card.getByRole('button', { name: /^connect/i })).toHaveCount(0);
    await expect(card.getByRole('button', { name: /^publish/i })).toHaveCount(0);
  }

  // No promise of automatic publishing anywhere on the page.
  const body = ((await page.textContent('body')) ?? '').toLowerCase();
  expect(body).not.toContain('publishes automatically');
});

test('eBay reflects the deployment it is actually running on', async ({ page }) => {
  await page.goto('/app/integrations');

  const card = page
    .locator('li')
    .filter({ has: page.getByRole('heading', { name: 'eBay', exact: true }) })
    .first();
  await expect(card).toBeVisible();
  const text = ((await card.textContent()) ?? '').toLowerCase();

  if (ebayConfigured) {
    // Credentials exist, but connecting eBay is a paid feature and this account
    // is on the free plan — so the honest offer is an upgrade, not a Connect
    // button that would be refused by the server anyway.
    await expect(card.getByRole('link', { name: /upgrade/i })).toBeVisible();
    await expect(card.getByRole('button', { name: /^connect/i })).toHaveCount(0);
  } else {
    // No credentials: the seller must be told, not shown a button that 500s.
    expect(text).toMatch(/not configured|unavailable|not set up|export/);
  }
});

test('the eBay authorisation start builds a correct, single-use request', async ({ page }) => {
  test.skip(!ebayConfigured, 'eBay credentials are not configured for this run');

  // Connecting eBay is a paid feature, so the account needs a plan that has it.
  await setPlan(account.email, 'starter');

  // Stop at the redirect rather than actually calling eBay.
  let authorizeUrl: string | null = null;
  await page.route(/auth(\.sandbox)?\.ebay\.com/, async (route) => {
    authorizeUrl = route.request().url();
    await route.abort();
  });

  await page.goto('/app/integrations');
  await page.getByRole('button', { name: /^connect/i }).first().click();

  await expect.poll(() => authorizeUrl, { timeout: 20_000 }).not.toBeNull();

  const url = new URL(authorizeUrl as unknown as string);
  expect(url.hostname).toMatch(/ebay\.com$/);
  expect(url.searchParams.get('response_type')).toBe('code');
  expect(url.searchParams.get('client_id')).toBeTruthy();
  // `state` is the CSRF control for this flow; it must be present and stored.
  const state = url.searchParams.get('state');
  expect(state).toBeTruthy();
  expect(
    await countRows('SELECT COUNT(*) FROM "oauth_state" WHERE state = $1', [state]),
  ).toBe(1);
});
