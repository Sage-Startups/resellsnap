/**
 * Sign-in, sign-out and password reset.
 *
 * Includes the no-JavaScript case, because a login form that falls back to GET
 * would put the password in the URL, the browser history and any proxy log.
 */
import { expect, test } from '@playwright/test';
import { login, logout, newAccount, register } from './helpers/auth';
import { closeDb, countRows, destroyUser } from './helpers/db';

const account = newAccount('auth');

test.afterAll(async () => {
  await destroyUser(account.email);
  await closeDb();
});

test.describe.configure({ mode: 'serial' });

test('a new account can register, sign out and sign back in', async ({ page }) => {
  await register(page, account);
  await expect(page).toHaveURL(/\/app/);

  await logout(page);
  await expect(page).toHaveURL(/\/(login|$)/, { timeout: 20_000 });

  // The app is genuinely closed to them now, not merely hidden.
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login/);

  await login(page, account);
  await expect(page).toHaveURL(/\/app/, { timeout: 20_000 });
});

test('a wrong password is refused without revealing which field was wrong', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password', { exact: false }).first().fill('not-the-password');
  await page.getByRole('button', { name: /sign in|log in/i }).click();

  const message = page.getByRole('alert').first();
  await expect(message).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/login/);

  // The message must not say *which* half was wrong — that turns the form into
  // an oracle for which addresses have accounts.
  const text = ((await message.textContent()) ?? '').toLowerCase();
  expect(text).not.toMatch(/no account|unknown (email|user)|user not found|wrong password/);
});

test('the auth forms post, so a password never lands in the URL', async ({ page }) => {
  for (const path of ['/login', '/register', '/forgot-password']) {
    await page.goto(path);
    const method = await page.locator('form').first().getAttribute('method');
    expect(method?.toLowerCase(), `${path} form must POST`).toBe('post');
  }
});

test('a password reset can be requested without disclosing whether the address exists', async ({
  page,
}) => {
  await page.goto('/forgot-password');
  await page.getByLabel('Email address').fill('nobody-here@example.test');
  await page.getByRole('button', { name: /send|reset|email me/i }).first().click();

  // The same confirmation regardless of whether the account exists.
  const confirmation = page.getByText(/if that address|check your (inbox|email)/i).first();
  await expect(confirmation).toBeVisible({ timeout: 20_000 });

  await page.goto('/forgot-password');
  await page.getByLabel('Email address').fill(account.email);
  await page.getByRole('button', { name: /send|reset|email me/i }).first().click();
  await expect(page.getByText(/if that address|check your (inbox|email)/i).first()).toBeVisible({
    timeout: 20_000,
  });

  // The request really was recorded for the real address.
  const logged = await countRows(
    `SELECT COUNT(*) FROM "email_log" WHERE "toEmail" = $1 AND "templateKey" ILIKE '%reset%'`,
    [account.email],
  );
  expect(logged).toBeGreaterThan(0);
});
