import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3210';
const email = `tester+${Date.now()}@example.com`;
const password = 'correct-horse-battery';
const psql = (sql) =>
  execSync(`PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d resellsnap -tAc "${sql}"`).toString().trim();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('BROWSER ERROR:', m.text().slice(0, 200)); });
page.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url().slice(0, 140)); });
await page.route('**/*', (r) => {
  const h = new URL(r.request().url()).hostname;
  return (h === '127.0.0.1' || h === 'localhost') ? r.continue() : r.abort();
});

const step = async (name, fn) => {
  process.stdout.write(`${name} … `);
  try { await fn(); console.log('ok'); }
  catch (e) { console.log('FAILED'); console.log('  ' + String(e).split('\n')[0]); await page.screenshot({ path: `${process.argv[2]}/fail-${name.replace(/\W+/g,'-')}.png` }); throw e; }
};

await step('register', async () => {
  await page.goto(`${BASE}/register`, { waitUntil: 'load' });
  await page.fill('#name', 'Test Seller');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.check('input[name="terms"]');
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=Check your email', { timeout: 20000 });
});

await step('workspace-provisioned', async () => {
  const row = psql(`select w.name || '|' || w.\\"purchasedCredits\\" from workspace w join workspace_member m on m.\\"workspaceId\\"=w.id join \\"user\\" u on u.id=m.\\"userId\\" where u.email='${email}'`);
  if (!row.includes('|3')) throw new Error('expected 3 signup credits, got: ' + row);
});

await step('verify-email', async () => {
  psql(`update \\"user\\" set \\"emailVerified\\"=true where email='${email}'`);
});

await step('login', async () => {
  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/app', { timeout: 20000 });
  await page.waitForSelector('h1:has-text("Good")', { timeout: 15000 });
});

await step('dashboard-screenshot', async () => {
  await page.screenshot({ path: `${process.argv[2]}/dashboard.png`, fullPage: false });
});

await step('start-wizard', async () => {
  await page.goto(`${BASE}/app/items/new`, { waitUntil: 'load' });
  await page.waitForSelector('text=Add photos of your item', { timeout: 20000 });
});

await step('upload-photos', async () => {
  const files = ['public/fixtures/trainers-front.webp','public/fixtures/trainers-detail.webp','public/fixtures/trainers-back.webp'];
  await page.setInputFiles('input[type="file"][multiple]', files);
  await page.waitForSelector('text=/3 photos/', { timeout: 30000 });
  // Wait for the worker to process them.
  await page.waitForFunction(() => !document.body.innerText.includes('still processing'), null, { timeout: 60000 });
});

await step('wizard-photos-screenshot', async () => {
  await page.screenshot({ path: `${process.argv[2]}/wizard-photos.png` });
});

await step('facts-step', async () => {
  await page.click('button:has-text("Continue")');
  await page.waitForSelector('#fact-category', { timeout: 15000 });
  await page.selectOption('#fact-category', 'shoes');
  await page.selectOption('#fact-condition', 'very_good');
  await page.fill('#fact-defects', 'Light scuffing on the right toe');
  await page.fill('#fact-size', 'UK 8 / US 9');
  await page.screenshot({ path: `${process.argv[2]}/wizard-facts.png` });
});

await step('generate', async () => {
  await page.click('button:has-text("Generate my listings")');
  await page.waitForSelector('text=Analysing your item', { timeout: 20000 });
});

await step('generation-completes', async () => {
  await page.waitForURL('**/app/items/**', { timeout: 120000 });
  await page.waitForSelector('text=Your drafts are ready', { timeout: 30000 });
});

await step('credit-debited', async () => {
  const bal = psql(`select w.\\"purchasedCredits\\" from workspace w join workspace_member m on m.\\"workspaceId\\"=w.id join \\"user\\" u on u.id=m.\\"userId\\" where u.email='${email}'`);
  if (bal !== '2') throw new Error('expected balance 2 after one generation, got ' + bal);
});

await step('four-variants-exist', async () => {
  const n = psql(`select count(*) from listing_variant v join listing l on l.id=v.\\"listingId\\" join item i on i.id=l.\\"itemId\\" join workspace_member m on m.\\"workspaceId\\"=i.\\"workspaceId\\" join \\"user\\" u on u.id=m.\\"userId\\" where u.email='${email}'`);
  if (n !== '4') throw new Error('expected 4 variants, got ' + n);
});

await step('studio-screenshot', async () => {
  await page.screenshot({ path: `${process.argv[2]}/studio.png`, fullPage: false });
});

await step('switch-to-ebay-tab', async () => {
  await page.click('button[role="tab"]:has-text("eBay")');
  await page.waitForSelector('#title-EBAY', { timeout: 15000 });
  await page.screenshot({ path: `${process.argv[2]}/studio-ebay.png` });
});

await step('edit-persists', async () => {
  const field = page.locator('#title-EBAY');
  await field.fill('Edited eBay title for the automated test');
  await page.waitForSelector('text=Saved', { timeout: 20000 });
  const saved = psql(`select v.title from listing_variant v join listing l on l.id=v.\\"listingId\\" join item i on i.id=l.\\"itemId\\" join workspace_member m on m.\\"workspaceId\\"=i.\\"workspaceId\\" join \\"user\\" u on u.id=m.\\"userId\\" where u.email='${email}' and v.platform='EBAY'`);
  if (!saved.includes('Edited eBay title')) throw new Error('edit not persisted: ' + saved);
});

console.log('\nALL STEPS PASSED');
await browser.close();
