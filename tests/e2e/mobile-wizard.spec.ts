/**
 * The wizard on a phone.
 *
 * Sellers photograph an item with the phone in their hand, so this is the
 * primary device for the most important screen, not an afterthought. What
 * matters here is that nothing is cut off, nothing needs a sideways scroll, and
 * every control is big enough to hit with a thumb.
 */
import { expect, test, type Page } from '@playwright/test';
import { newAccount, saveSignedInState } from './helpers/auth';
import { closeDb, destroyUser } from './helpers/db';
import { jpegFixture } from './helpers/fixtures';

const account = newAccount('mobile');

test.afterAll(async () => {
  await destroyUser(account.email);
  await closeDb();
});

// Signed in once for the file; a fresh sign-in per test would trip Better
// Auth's per-path rate limit.
const STATE = 'test-results/.auth/mobile.json';
test.use({ storageState: STATE });

test.beforeAll(async ({ browser }) => {
  await saveSignedInState(browser, account, STATE);
});

/**
 * Nothing may overflow the viewport horizontally.
 *
 * Reports which elements stick out, because "the page scrolls sideways by 72px"
 * on its own tells you nothing about where to look.
 */
async function expectNoHorizontalScroll(page: Page) {
  const { overflow, offenders } = await page.evaluate(() => {
    const doc = document.documentElement;
    const limit = doc.clientWidth;
    const found: string[] = [];

    document.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > limit + 1 && rect.width > 8) {
        const classes = String(el.className ?? '').slice(0, 60);
        const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
        found.push(
          `<${el.tagName.toLowerCase()} class="${classes}"> w=${Math.round(rect.width)} ` +
            `left=${Math.round(rect.left)} text="${text}"`,
        );
      }
    });

    return { overflow: doc.scrollWidth - doc.clientWidth, offenders: found.slice(0, 8) };
  });

  expect(
    overflow,
    `the page must not scroll sideways on a phone. Overflowing:\n${offenders.join('\n')}`,
  ).toBeLessThanOrEqual(1);
}

test('the whole wizard is usable on a phone viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'This spec is about the mobile viewport');
  test.slow();

  await page.goto('/app');
  await expectNoHorizontalScroll(page);

  await page.goto('/app/items/new');
  await expect(page.getByRole('heading', { name: /photo/i }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // The primary action must be reachable without pinching or zooming.
  const addPhotos = page.getByRole('button', { name: /add|choose|upload|take/i }).first();
  const box = await addPhotos.boundingBox();
  expect(box, 'the add-photos control must be rendered').not.toBeNull();
  // Apple and Google both put the comfortable minimum at 44px.
  expect(box!.height).toBeGreaterThanOrEqual(40);

  await page.locator('input[type="file"]').first().setInputFiles(await jpegFixture());

  const continueButton = page.getByRole('button', { name: /^continue$/i });
  await expect(continueButton).toBeEnabled({ timeout: 60_000 });
  await expectNoHorizontalScroll(page);
  await continueButton.click();

  // --- Facts step ---------------------------------------------------------
  await expect(page.getByText(/uses 1 of your/i)).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByLabel('What is it?').selectOption({ index: 1 });
  await page.getByLabel('Overall condition').selectOption({ index: 1 });

  const generate = page.getByRole('button', { name: /generate my listings/i });
  await expect(generate).toBeEnabled();

  const generateBox = await generate.boundingBox();
  expect(generateBox!.height).toBeGreaterThanOrEqual(40);
  // It must be on screen, not pushed off the side.
  expect(generateBox!.x).toBeGreaterThanOrEqual(0);
  expect(generateBox!.x + generateBox!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );

  await generate.click();
  await page.waitForURL(/\/app\/items\/(?!new)[a-z0-9]+/, { timeout: 120_000 });
  await expectNoHorizontalScroll(page);
});

test('the app navigation is reachable on a phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'This spec is about the mobile viewport');

  await page.goto('/app');
  await expectNoHorizontalScroll(page);

  // Either a visible nav or a disclosure that reveals one — but it must exist.
  const inventoryLink = page.getByRole('link', { name: /inventory/i }).first();
  if (!(await inventoryLink.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /menu|navigation|open/i }).first().click();
  }
  await expect(page.getByRole('link', { name: /inventory/i }).first()).toBeVisible();
});
