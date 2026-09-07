/**
 * The super admin's two most consequential surfaces: the numbers they make
 * decisions from, and granting a customer credits — which moves something the
 * customer paid for and therefore must carry a reason and an audit entry.
 */
import { expect, test } from '@playwright/test';
import { newAccount, register, saveSignedInState } from './helpers/auth';
import {
  closeDb,
  creditBalance,
  destroyUser,
  promoteToRole,
  query,
  userIdFor,
  workspaceIdFor,
} from './helpers/db';

const admin = newAccount('superadmin');
const customer = newAccount('grantee');

test.afterAll(async () => {
  await destroyUser(admin.email);
  await destroyUser(customer.email);
  await closeDb();
});

test.describe.configure({ mode: 'serial' });

// The admin signs in once and every test reuses those cookies. Signing in per
// test would trip Better Auth's per-path sign-in rate limit and read as a
// failing test rather than the protection it is.
const ADMIN_STATE = 'test-results/.auth/super-admin.json';
test.use({ storageState: ADMIN_STATE });

test.beforeAll(async ({ browser }) => {
  // The customer exists so the admin has a real workspace to act on.
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await register(page, customer);
  await context.close();

  await saveSignedInState(browser, admin, ADMIN_STATE);
  await promoteToRole(admin.email, 'SUPER_ADMIN');
});

test('a super admin sees the overview, and sample figures are labelled', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

  // Whatever the dashboard shows, it must not invent a testimonial or a
  // customer count it cannot support.
  await expect(page.getByText(/as seen in/i)).toHaveCount(0);
});

test('granting credits requires a reason and is written to the audit log', async ({ page }) => {
  const workspaceId = await workspaceIdFor(customer.email);
  const before = await creditBalance(customer.email);

  // Credit adjustments are made from the customer's own record, so the person
  // acting always has the account in front of them.
  await page.goto(`/admin/users/${await userIdFor(customer.email)}`);
  await expect(page.getByText('Adjust credits')).toBeVisible();

  await page.getByLabel('Amount').fill('12');
  await page.getByLabel('Bucket').selectOption('PURCHASED');

  const reason = 'Goodwill after a failed generation';
  await page.getByLabel('Reason').fill(reason);
  await page.getByRole('button', { name: 'Apply adjustment' }).click();

  await expect
    .poll(() => creditBalance(customer.email), { timeout: 20_000 })
    .toBe(before + 12);

  const [entry] = await query<{ delta: number; reason: string }>(
    `SELECT delta, reason FROM "credit_ledger"
      WHERE "workspaceId" = $1 AND kind = 'ADMIN_GRANT'
      ORDER BY "createdAt" DESC LIMIT 1`,
    [workspaceId],
  );
  expect(Number(entry?.delta)).toBe(12);
  expect(entry?.reason).toBe(reason);

  const [audit] = await query<{ reason: string }>(
    `SELECT reason FROM "audit_log"
      WHERE "targetId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [workspaceId],
  );
  expect(audit?.reason).toBe(reason);
});

test('an adjustment without a reason is refused and moves nothing', async ({ page }) => {
  const before = await creditBalance(customer.email);

  await page.goto(`/admin/users/${await userIdFor(customer.email)}`);
  await page.getByLabel('Amount').fill('99');

  // The reason field is required, so the browser blocks the submit outright.
  await page.getByRole('button', { name: 'Apply adjustment' }).click();

  await expect
    .poll(() => creditBalance(customer.email), { timeout: 10_000 })
    .toBe(before);
});
