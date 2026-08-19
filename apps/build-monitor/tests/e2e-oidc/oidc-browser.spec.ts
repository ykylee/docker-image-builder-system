import { expect, test } from "@playwright/test";

const API_BASE = "http://127.0.0.1:3312";

test("OIDC browser login exchanges issuer code and bootstraps the session", async ({ page, request }) => {
  const create = await request.post(`${API_BASE}/builds`, { data: { appName: "oidc-browser-build", requestedBy: "oidc-browser-user", sourceArchive: { objectKey: "oidc-browser.tgz", checksumSha256: "a".repeat(64), sizeBytes: 1 }, entrypointPath: "Dockerfile" } });
  expect(create.status()).toBe(202);
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with organization login" }).click();
  await expect(page).toHaveURL(/\/builds$/);
  const session = await page.evaluate(async () => { const response = await fetch("/api/auth/session", { credentials: "include" }); return { status: response.status, body: await response.json() }; });
  expect(session.status).toBe(200);
  expect(session.body).toEqual({ authenticated: true, subject: "oidc-browser-user", roles: ["user"] });
  await expect(page.getByTestId("hdr-user-id")).toHaveText("@oidc-browser-user");
  const builds = await page.evaluate(async () => { const response = await fetch("/api/builds", { credentials: "include" }); return { status: response.status, body: await response.json() }; });
  expect(builds.status).toBe(200);
  expect(builds.body.builds.map((build: { appName: string }) => build.appName)).toEqual(["oidc-browser-build"]);
});
