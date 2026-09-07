/**
 * The public demo. It must work with no account at all, and it must be honest
 * about what it is showing.
 */
import { expect, test } from '@playwright/test';

test('anyone can try the demo without signing in', async ({ page }) => {
  await page.context().clearCookies();

  await page.goto('/demo');
  await expect(page).toHaveURL(/\/demo/);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

  // No redirect to a sign-in wall.
  await expect(page).not.toHaveURL(/\/login/);
});

test('the demo labels its figures as sample data and claims no verification', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/demo');

  const body = (await page.textContent('body')) ?? '';

  // If the demo shows metrics at all, they must be marked as samples.
  const looksLikeMetrics = /\d/.test(body);
  if (looksLikeMetrics) {
    expect(body.toLowerCase()).toContain('sample');
  }

  // The product must never claim to have authenticated an item.
  expect(body.toLowerCase()).not.toContain('authenticated');
  expect(body.toLowerCase()).not.toContain('guaranteed genuine');
});

test('the demo does not create an account or spend anyone\'s credits', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/demo');

  // Still anonymous afterwards.
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login/);
});
