import { defineConfig, devices } from "@playwright/test";

// TASK-184: 인증 계약용 브라우저 harness. 실제 IdP를 흉내 내 토큰을
// 발급하지 않고, 테스트 전용 AUTH_SECRET으로 서명된 fixture token만 주입한다.
export default defineConfig({
  testDir: "./tests/e2e-auth",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    headless: true,
    ...devices["Desktop Chrome"]
  },
  webServer: [
    {
      command:
        "AUTH_SECRET=e2e-auth-secret AUTH_MODE=required BUILD_REPOSITORY_BACKEND=memory PORT=3310 node ../build-server/dist/apps/build-server/src/index.js",
      url: "http://127.0.0.1:3310/health",
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "pipe",
      timeout: 120000
    },
    {
      command: "BUILD_SERVER_PORT=3310 npx vite --port 5173",
      url: "http://localhost:5173",
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "pipe",
      timeout: 120000
    }
  ]
});
