/**
 * The journey the product exists for: register, add a photo, tell us what a
 * photograph cannot show, generate, edit the result, export it.
 *
 * Runs against the fake AI provider, so the copy is deterministic fixture text
 * rather than a live model — but every other part of the path is real: the
 * upload, the job queue, the worker, the credit debit and the export build.
 */
import { expect, test } from '@playwright/test';
import { newAccount, register } from './helpers/auth';
import {
  closeDb,
  countRows,
  creditBalance,
  destroyUser,
  query,
  workspaceIdFor,
} from './helpers/db';
import { jpegFixture, tinyJpegFixture } from './helpers/fixtures';

const account = newAccount('journey');

test.afterAll(async () => {
  await destroyUser(account.email);
  await closeDb();
});

test('a seller registers, generates a listing, edits it and exports it', async ({ page }) => {
  test.slow();

  await register(page, account);

  const startingCredits = await creditBalance(account.email);
  expect(startingCredits).toBeGreaterThan(0);

  // --- Photos -------------------------------------------------------------
  await page.goto('/app/items/new');
  await expect(page.getByRole('heading', { name: /photo/i }).first()).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles(await jpegFixture());

  // The worker processes the upload; Continue unlocks only once it is done.
  const continueButton = page.getByRole('button', { name: /^continue$/i });
  await expect(continueButton).toBeEnabled({ timeout: 60_000 });
  await continueButton.click();

  // --- Seller facts -------------------------------------------------------
  await expect(page.getByText(/uses 1 of your/i)).toBeVisible();

  await page.getByLabel('What is it?').selectOption({ index: 1 });
  await page.getByLabel('Overall condition').selectOption({ index: 1 });

  const generate = page.getByRole('button', { name: /generate my listings/i });
  await expect(generate).toBeEnabled();
  await generate.click();

  // --- Generation ---------------------------------------------------------
  // The wizard hands over to the studio once the worker finishes the job.
  await page.waitForURL(/\/app\/items\/(?!new)[a-z0-9]+/, { timeout: 120_000 });

  // The credit was spent exactly once.
  expect(await creditBalance(account.email)).toBe(startingCredits - 1);

  const workspaceId = await workspaceIdFor(account.email);
  const debits = await countRows(
    `SELECT COUNT(*) FROM "credit_ledger" WHERE "workspaceId" = $1 AND kind = 'CONSUMPTION'`,
    [workspaceId],
  );
  expect(debits).toBe(1);

  // --- The studio shows a real draft --------------------------------------
  const titleField = page.locator('#master-title');
  await expect(titleField).toBeVisible({ timeout: 30_000 });
  await expect(titleField).not.toHaveValue('');
  await expect(page.locator('#master-description')).not.toHaveValue('');

  // A price must never be presented as a fact.
  await expect(page.getByText(/estimate/i).first()).toBeVisible();

  // --- Edit ---------------------------------------------------------------
  // The editor autosaves rather than offering a Save button, so the seller's
  // own words are what persist.
  const editedTitle = 'My own edited title for this item';
  await titleField.fill(editedTitle);
  await expect(page.getByText('Saved').first()).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await expect(page.locator('#master-title')).toHaveValue(editedTitle);

  // The seller's edit is what is stored, not the model's draft.
  const [listing] = await query<{ title: string }>(
    `SELECT l.title FROM "listing" l
       JOIN "item" i ON i.id = l."itemId"
      WHERE i."workspaceId" = $1
      LIMIT 1`,
    [workspaceId],
  );
  expect(listing?.title).toBe(editedTitle);

  // --- Export -------------------------------------------------------------
  // Each marketplace has its own draft, tailored to that platform's limits, and
  // its own export. So the edit that must survive into the eBay export is the
  // one made on the eBay tab.
  await page.getByRole('tab', { name: /eBay/i }).click();
  await expect(page.getByRole('tabpanel')).toBeVisible();

  const variantTitle = page.locator('#title-EBAY');
  await expect(variantTitle).toBeVisible();
  await expect(variantTitle).not.toHaveValue('');

  const editedVariantTitle = 'My own eBay title for this coat';
  await variantTitle.fill(editedVariantTitle);
  await expect(page.getByText('Saved').first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Export' }).first().click();

  const download = page.waitForEvent('download', { timeout: 90_000 });
  await page.getByRole('menuitem', { name: 'Listing text' }).click();

  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.txt$/);

  // The export the seller actually receives must carry the price qualifier.
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const contents = Buffer.concat(chunks).toString('utf8');

  expect(contents).toContain(editedVariantTitle);
  expect(contents.toLowerCase()).toContain('estimate');
  // And the qualifier says what the estimate is based on, not just that it is one.
  expect(contents.toLowerCase()).toMatch(/basis:/);
});

test('a photo below the minimum size is refused with a reason', async ({ page }) => {
  const small = newAccount('smallphoto');

  try {
    await register(page, small);
    await page.goto('/app/items/new');

    await page.locator('input[type="file"]').first().setInputFiles(await tinyJpegFixture());

    // The seller is told the actual problem, not just "upload failed".
    await expect(page.getByText(/at least 200px/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^continue$/i })).toBeDisabled();
  } finally {
    await destroyUser(small.email);
  }
});
