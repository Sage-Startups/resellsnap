/**
 * Registration and sign-in helpers.
 *
 * Accounts are created through the real form rather than seeded, so every spec
 * that needs a user also re-exercises sign-up.
 */
import { expect, type Browser, type Page } from '@playwright/test';
import { verifyEmail } from './db';

export interface TestAccount {
  email: string;
  password: string;
  name: string;
}

export function newAccount(prefix: string): TestAccount {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return {
    email: `${prefix}-${suffix}@example.test`,
    password: 'correct-horse-battery-staple',
    name: 'Sam Tester',
  };
}

/** Registers through the UI, then verifies the address and lands in the app. */
export async function register(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Your name').fill(account.name);
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password', { exact: false }).first().fill(account.password);

  const terms = page.locator('input[name="terms"]');
  if (await terms.count()) await terms.check();

  await page.getByRole('button', { name: /create (my )?account|sign up|get started/i }).click();

  // Sign-up does not sign you in: the account is inert until the address is
  // confirmed, and the form says so in place rather than navigating.
  await expect(page.getByText(/check your email/i).first()).toBeVisible({ timeout: 30_000 });

  await verifyEmail(account.email);
  await login(page, account);
  await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
}

export async function login(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password', { exact: false }).first().fill(account.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /account menu/i }).first().click();
  // The panel is a `role="menu"`, so its children are menuitems rather than
  // buttons — that is the correct ARIA, and the selector has to match it.
  await page.getByRole('menuitem', { name: /sign out|log out/i }).click();
}

/**
 * Registers an account once and saves its signed-in cookies to `path`, for
 * `test.use({ storageState })`.
 *
 * Signing in once per file rather than once per test matters: Better Auth rate
 * limits sign-in attempts per path, so a suite that logs in repeatedly starts
 * getting 429s that look like failing tests.
 */
export async function saveSignedInState(
  browser: Browser,
  account: TestAccount,
  path: string,
): Promise<void> {
  // Explicitly unset: the `browser` fixture otherwise applies the file this
  // function is about to create, which does not exist yet.
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await register(page, account);
  await context.storageState({ path });
  await context.close();
}
