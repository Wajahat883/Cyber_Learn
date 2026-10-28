import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = process.env.E2E_WEB_PORT ?? '5180';

/**
 * End-to-end tests against the real app with the offline AI provider.
 *   npm run e2e            (first time: npx playwright install chromium)
 * Set CHROMIUM_PATH to use an installed Chromium instead of Playwright's download.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } },
    },
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 7'], launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } },
    },
  ],
  webServer: {
    command: 'node start-stack.mjs',
    url: `http://localhost:${WEB_PORT}`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
