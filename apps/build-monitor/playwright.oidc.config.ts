import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e-oidc",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5174", channel: "chrome", headless: true, ...devices["Desktop Chrome"] },
  webServer: [
    { command: "cd ../build-server && node_modules/.bin/tsx tests/e2e-oidc/oidc-harness.ts", url: "http://127.0.0.1:3312/health", reuseExistingServer: false, env: { OIDC_E2E_DATABASE_URL: process.env.OIDC_E2E_DATABASE_URL ?? "" }, stdout: "ignore", stderr: "pipe", timeout: 120000 },
    { command: "BUILD_SERVER_PORT=3312 npx vite --port 5174", url: "http://localhost:5174", reuseExistingServer: false, stdout: "ignore", stderr: "pipe", timeout: 120000 }
  ]
});
