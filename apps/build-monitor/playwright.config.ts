import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Configuration for Docker Image Builder Build Monitor
 * 
 * Note: Internal network restricts downloading bundled chromium binaries (ETIMEDOUT on cdn.playwright.dev).
 * Therefore, we use channel: 'chrome' to utilize the pre-installed system Google Chrome browser.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    channel: 'chrome',
    headless: true,
  },
  projects: [
    {
      name: 'Google Chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
  webServer: [
    {
      command: 'BUILD_REPOSITORY_BACKEND=memory node ../build-server/dist/apps/build-server/src/index.js',
      url: 'http://127.0.0.1:3000/health',
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
      timeout: 120000,
    },
    {
      command: 'npx vite --port 5173',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
      timeout: 120000,
    },
  ],
});
