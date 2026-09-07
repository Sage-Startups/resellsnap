/**
 * Structural accessibility checks across the public site.
 *
 * These are the defects that are invisible when you look at a page and obvious
 * when you listen to one: a missing page title, an image with no alternative
 * text, a form control with no label.
 */
import { expect, test } from '@playwright/test';

const PUBLIC_PAGES = [
  '/',
  '/features',
  '/how-it-works',
  '/pricing',
  '/platforms',
  '/integrations',
  '/demo',
  '/help',
  '/contact',
  '/legal/terms',
  '/legal/privacy',
  '/legal/acceptable-use',
];

for (const path of PUBLIC_PAGES) {
  test(`${path} has exactly one top-level heading`, async ({ page }) => {
    await page.goto(path);

    // Screen readers announce the h1 as the page's title and let users jump
    // between levels. A page built entirely from h2s has no announced title.
    const headings = page.locator('h1');
    await expect(headings, `${path} must have exactly one <h1>`).toHaveCount(1);
    await expect(headings.first()).not.toBeEmpty();
  });
}

test('every image on the public site carries alternative text', async ({ page }) => {
  for (const path of PUBLIC_PAGES) {
    await page.goto(path);
    const missing = await page.locator('img:not([alt])').count();
    expect(missing, `${path} has an <img> with no alt attribute`).toBe(0);
  }
});

test('every form control on the auth pages is labelled', async ({ page }) => {
  for (const path of ['/login', '/register', '/forgot-password']) {
    await page.goto(path);

    const unlabelled = await page.evaluate(() => {
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>('input, select, textarea'),
      ).filter((el) => (el as HTMLInputElement).type !== 'hidden');

      return controls
        .filter((el) => {
          if (el.getAttribute('aria-label')) return false;
          if (el.getAttribute('aria-labelledby')) return false;
          if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
          return !el.closest('label');
        })
        .map((el) => el.getAttribute('name') ?? el.tagName);
    });

    expect(unlabelled, `${path} has unlabelled form controls`).toEqual([]);
  }
});
