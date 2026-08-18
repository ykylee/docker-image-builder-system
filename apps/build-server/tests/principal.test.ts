import test from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { bearerToken, signPrincipalToken, verifyPrincipalToken } from "../src/auth/principal.js";
import { createApp } from "../src/app/create-app.js";
import { getOpenApiDocument } from "../src/app/openapi.js";
import { toRuntimeSettings, parseRuntimeEnv } from "@docker-image-builder-system/shared-config";

const secret = "test-secret";

test("signed principal token round-trips subject, roles and expiry", () => {
  const token = signPrincipalToken(secret, { subject: "alice", roles: ["user"], expiresAt: 200 });
  assert.deepEqual(verifyPrincipalToken(token, secret, 100), {
    subject: "alice",
    roles: ["user"],
    expiresAt: 200
  });
});

test("tampered, expired and malformed tokens are rejected", () => {
  const token = signPrincipalToken(secret, { subject: "alice", expiresAt: 200 });
  assert.equal(verifyPrincipalToken(`${token}x`, secret, 100), null);
  assert.equal(verifyPrincipalToken(token, secret, 200), null);
  assert.equal(verifyPrincipalToken("not-a-token", secret, 100), null);
});

test("bearer parser only accepts the Authorization bearer form", () => {
  assert.equal(bearerToken("Bearer abc"), "abc");
  assert.equal(bearerToken("bearer abc"), "abc");
  assert.equal(bearerToken("Basic abc"), undefined);
  assert.equal(bearerToken(undefined), undefined);
});

test("AUTH_SECRET keeps public build intake open but protects control APIs", async () => {
  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = secret;
  const runtime = toRuntimeSettings(
    parseRuntimeEnv({ BUILD_REPOSITORY_BACKEND: "memory", ADMIN_IDS: "admin", CORS_ORIGIN: "false" })
  );
  const app = await createApp(runtime);
  try {
    const publicResponse = await app.inject({ method: "POST", url: "/builds", payload: {} });
    assert.equal(publicResponse.statusCode, 400);
    const runnerResponse = await app.inject({ method: "POST", url: "/builds/claim", payload: {} });
    assert.equal(runnerResponse.statusCode, 401);
    const adminResponse = await app.inject({ method: "GET", url: "/admin/users" });
    assert.equal(adminResponse.statusCode, 401);
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previous;
  }
});

test("OpenAPI marks control operations protected and build intake public", () => {
  const document = getOpenApiDocument() as {
    paths: Record<string, Record<string, { security?: unknown }>>;
  };
  assert.deepEqual(document.paths["/builds"]?.get.security, [{ bearerAuth: [] }]);
  assert.equal(document.paths["/builds"]?.post.security, undefined);
  assert.deepEqual(document.paths["/services"]?.get.security, [{ bearerAuth: [] }]);
  assert.equal(document.paths["/builds/{buildId}/source"]?.post.security, undefined);
  assert.deepEqual(document.paths["/builds/{buildId}/source"]?.get.security, [{ bearerAuth: [] }]);
  assert.deepEqual(document.paths["/builds/{buildId}/source"]?.delete.security, [{ bearerAuth: [] }]);
  assert.deepEqual(document.paths["/builds/claim"]?.post.security, [{ bearerAuth: [] }]);
  assert.deepEqual(document.paths["/admin/users"]?.get.security, [{ bearerAuth: [] }]);
});

test("AUTH_SECRET is carried through shared runtime settings", () => {
  const settings = toRuntimeSettings(
    parseRuntimeEnv({ AUTH_SECRET: secret, ADMIN_IDS: "admin" })
  );
  assert.equal(settings.authSecret, secret);
  assert.equal(settings.authMode, "legacy");
});

test("AUTH_MODE=required refuses to start without AUTH_SECRET", async () => {
  const runtime = toRuntimeSettings(
    parseRuntimeEnv({ AUTH_MODE: "required", ADMIN_IDS: "admin" })
  );
  await assert.rejects(() => createApp(runtime), /AUTH_MODE=required needs AUTH_SECRET/);
});

test("AUTH_MODE=required accepts a signed Runner token on control APIs", async () => {
  const runtime = toRuntimeSettings(
    parseRuntimeEnv({
      AUTH_SECRET: secret,
      AUTH_MODE: "required",
      ADMIN_IDS: "admin",
      BUILD_REPOSITORY_BACKEND: "memory",
      CORS_ORIGIN: "false"
    })
  );
  const app = await createApp(runtime);
  try {
    const token = signPrincipalToken(secret, {
      subject: "runner-1",
      roles: ["user"],
      expiresAt: 4102444800
    });
    const response = await app.inject({
      method: "POST",
      url: "/builds/claim",
      headers: { authorization: `Bearer ${token}` },
      payload: { runnerId: "runner-1" }
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().claimed, false);
  } finally {
    await app.close();
  }
});

test("authenticated build reads are scoped to the principal owner", async () => {
  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = secret;
  const runtime = toRuntimeSettings(parseRuntimeEnv({ BUILD_REPOSITORY_BACKEND: "memory", ADMIN_IDS: "admin", CORS_ORIGIN: "false" }));
  const app = await createApp(runtime);
  try {
    const create = async (appName: string, requestedBy: string) => {
      const bytes = Buffer.from(`${appName}-source`);
      const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
      const response = await app.inject({
        method: "POST",
        url: "/builds",
        payload: {
          appName,
          requestedBy,
          sourceArchive: { objectKey: `${appName}.tar.gz`, checksumSha256, sizeBytes: bytes.length },
          entrypointPath: "index.js"
        }
      });
      assert.equal(response.statusCode, 202);
      const buildId = response.json().build.buildId as string;
      const upload = await app.inject({
        method: "POST",
        url: `/builds/${buildId}/source`,
        headers: { "content-type": "application/octet-stream", "x-source-checksum-sha256": checksumSha256 },
        payload: bytes
      });
      assert.equal(upload.statusCode, 201);
      return buildId;
    };
    const aliceBuild = await create("alice-app", "alice");
    const bobBuild = await create("bob-app", "bob");
    const aliceToken = signPrincipalToken(secret, { subject: "alice", roles: ["user"], expiresAt: 4102444800 });
    const bobToken = signPrincipalToken(secret, { subject: "bob", roles: ["user"], expiresAt: 4102444800 });
    const headers = { authorization: `Bearer ${aliceToken}` };
    const bobHeaders = { authorization: `Bearer ${bobToken}` };
    const list = await app.inject({ method: "GET", url: "/builds", headers });
    assert.equal(list.statusCode, 200);
    assert.deepEqual(list.json().builds.map((build: { buildId: string }) => build.buildId), [aliceBuild]);
    assert.equal((await app.inject({ method: "GET", url: `/builds/${aliceBuild}`, headers })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: `/builds/${bobBuild}`, headers })).statusCode, 404);
    assert.equal((await app.inject({ method: "GET", url: `/builds/${aliceBuild}/logs`, headers })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: `/builds/${aliceBuild}/source`, headers })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: `/builds/${aliceBuild}/logs`, headers: bobHeaders })).statusCode, 404);
    assert.equal((await app.inject({ method: "GET", url: `/builds/${aliceBuild}/source`, headers: bobHeaders })).statusCode, 404);
    assert.equal((await app.inject({ method: "DELETE", url: `/builds/${aliceBuild}/source`, headers: bobHeaders })).statusCode, 404);
    assert.equal((await app.inject({ method: "DELETE", url: `/builds/${aliceBuild}/source`, headers })).statusCode, 204);
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previous;
  }
});
