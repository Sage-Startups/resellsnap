import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * Some sandboxes ship a pre-installed Chromium that does not match the build
 * this Playwright version would download. `PLAYWRIGHT_CHROMIUM_EXECUTABLE`
 * points the runner at whatever browser is actually present; unset, Playwright
 * resolves its own as normal.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
      // The mobile spec asserts phone layout; running it at desktop width would
      // assert nothing.
      testIgnore: /mobile-.*\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], launchOptions: { executablePath } },
      // Everything else is viewport-independent and already covered by desktop.
      testMatch: /mobile-.*\.spec\.ts/,
    },
  ],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { PORT: String(PORT) },
  },
});
