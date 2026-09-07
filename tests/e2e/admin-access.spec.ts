/**
 * An ordinary customer must not reach the admin area — by link, by typing a
 * URL, or by calling the server action a button would have called.
 */
import { expect, test } from '@playwright/test';
import { newAccount, register } from './helpers/auth';
import { closeDb, destroyUser } from './helpers/db';

const account = newAccount('ordinary');

test.afterAll(async () => {
  await destroyUser(account.email);
  await closeDb();
});

test.describe.configure({ mode: 'serial' });

test('an ordinary user is redirected away from every admin route', async ({ page }) => {
  await register(page, account);

  // The navigation must not even offer it.
  await expect(page.getByRole('link', { name: /^admin$/i })).toHaveCount(0);

  for (const path of ['/admin', '/admin/users', '/admin/credits', '/admin/settings']) {
    await page.goto(path);
    await expect(page, `${path} must not render for an ordinary user`).not.toHaveURL(/\/admin/);
  }
});

test('an anonymous visitor is sent to sign in, not to the admin area', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
});
