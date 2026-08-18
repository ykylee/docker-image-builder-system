import { createHmac, createHash } from "node:crypto";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE = "http://127.0.0.1:3310";
const SECRET = "e2e-auth-secret";

function base64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function token(subject: string, roles: string[] = ["user"]): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    sub: subject,
    roles,
    exp: Math.floor(Date.now() / 1000) + 300
  }));
  const unsigned = `${header}.${payload}`;
  const signature = createHmac("sha256", SECRET).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

function buildPayload(appName: string, requestedBy: string) {
  return {
    appName,
    requestedBy,
    sourceArchive: {
      objectKey: `${appName}.tar.gz`,
      checksumSha256: "8f93424439ac0d4b5162ad03e8990d802bf711b3222e53f8ad4ec9543c2410f1",
      sizeBytes: 21
    },
    entrypointPath: "Dockerfile"
  };
}

async function createBuild(request: APIRequestContext, appName: string, requestedBy: string): Promise<string> {
  const response = await request.post(`${API_BASE}/builds`, { data: buildPayload(appName, requestedBy) });
  expect(response.status()).toBe(202);
  return (await response.json() as { build: { buildId: string } }).build.buildId;
}

async function uploadSource(request: APIRequestContext, buildId: string): Promise<void> {
  const bytes = Buffer.from("public source fixture");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const response = await request.post(`${API_BASE}/builds/${buildId}/source`, {
    headers: {
      "content-type": "application/octet-stream",
      "x-source-checksum-sha256": checksum,
      "x-source-size-bytes": String(bytes.length)
    },
    data: bytes
  });
  expect(response.status(), await response.text()).toBe(201);
}

async function setBrowserSession(page: Page, subject: string): Promise<void> {
  await page.goto("/login");
  await page.evaluate(({ subject, accessToken }) => {
    localStorage.setItem("userId", subject);
    sessionStorage.setItem("accessToken", accessToken);
  }, { subject, accessToken: token(subject) });
}

test("public submission, owner reads, cross-tenant denial, and logout token cleanup", async ({ page, request }) => {
  const aliceBuild = await createBuild(request, "e2e-auth-alice", "alice");
  const bobBuild = await createBuild(request, "e2e-auth-bob", "bob");
  await uploadSource(request, aliceBuild);

  await setBrowserSession(page, "alice");
  await page.goto("/builds");

  const ownList = await page.evaluate(async () => {
    const response = await fetch("/api/builds", {
      headers: { Authorization: `Bearer ${sessionStorage.getItem("accessToken") ?? ""}` }
    });
    return { status: response.status, body: await response.json() };
  });
  expect(ownList.status).toBe(200);
  expect(ownList.body.builds).toHaveLength(1);
  expect(ownList.body.builds[0].appName).toBe("e2e-auth-alice");

  const ownDetail = await page.evaluate(async (buildId) => {
    const response = await fetch(`/api/builds/${buildId}`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem("accessToken") ?? ""}` }
    });
    return { status: response.status, body: await response.json() };
  }, aliceBuild);
  expect(ownDetail.status).toBe(200);

  const foreignDetail = await page.evaluate(async (buildId) => {
    const response = await fetch(`/api/builds/${buildId}`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem("accessToken") ?? ""}` }
    });
    return response.status;
  }, bobBuild);
  expect(foreignDetail).toBe(404);

  const foreignSource = await page.evaluate(async (buildId) => {
    const response = await fetch(`/api/builds/${buildId}/source`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem("accessToken") ?? ""}` }
    });
    return response.status;
  }, bobBuild);
  expect(foreignSource).toBe(404);

  await page.getByTestId("hdr-logout").click();
  await expect(page).toHaveURL(/\/$|\/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem("accessToken"))).toBeNull();
});
