import test from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { bearerToken, signPrincipalToken, verifyPrincipalToken } from "../src/auth/principal.js";
import { createApp } from "../src/app/create-app.js";
import {
  createCompositeSessionAdapter,
  createHmacSessionAdapter,
  createOidcSessionAdapter
} from "../src/auth/session-adapter.js";
import { MemorySessionStore } from "../src/auth/session-store.js";
import { OidcClient } from "../src/auth/oidc-client.js";
import { registerOidcRoutes } from "../src/routes/oidc-routes.js";
import { PostgresSessionStore } from "../src/auth/postgres-session-store.js";
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

test("session adapter exposes a replaceable principal verification boundary", async () => {
  const adapter = createHmacSessionAdapter(secret);
  const token = signPrincipalToken(secret, { subject: "alice", roles: ["user"], expiresAt: 4102444800 });
  assert.equal(adapter.kind, "hmac");
  assert.deepEqual((await adapter.verifyRequest({ authorization: `Bearer ${token}` }))?.subject, "alice");
  assert.equal(await adapter.verifyRequest({ authorization: "Basic not-a-token" }), null);
});

test("memory session store enforces TTL and one-time OIDC flow consumption", async () => {
  const store = new MemorySessionStore();
  const record = await store.createSession(
    { subject: "alice", roles: ["user"], expiresAt: 200 },
    60
  );
  assert.equal((await store.getSession(record.id, record.expiresAt - 1))?.principal.subject, "alice");
  assert.equal(await store.getSession(record.id, record.expiresAt), null);

  await store.saveOidcFlow({
    state: "state-1",
    nonce: "nonce-1",
    codeVerifier: "verifier-1",
    returnTo: "/builds",
    expiresAt: 200
  });
  assert.equal((await store.consumeOidcFlow("state-1", 199))?.nonce, "nonce-1");
  assert.equal(await store.consumeOidcFlow("state-1", 199), null);
});

test("OIDC session adapter resolves only the opaque session cookie", async () => {
  const store = new MemorySessionStore();
  const record = await store.createSession(
    { subject: "alice", roles: ["user"], expiresAt: 4_102_444_800 },
    3600
  );
  const oidc = createOidcSessionAdapter(store);
  assert.equal(
    (await oidc.verifyRequest({ cookie: `dib_session=${encodeURIComponent(record.id)}; X-User-Id=mallory` }))?.subject,
    "alice"
  );
  assert.equal(await oidc.verifyRequest({ cookie: "dib_session=unknown" }), null);

  const composite = createCompositeSessionAdapter([oidc, createHmacSessionAdapter(secret)]);
  const token = signPrincipalToken(secret, { subject: "runner", roles: ["user"], expiresAt: 4102444800 });
  assert.equal((await composite.verifyRequest({ authorization: `Bearer ${token}` }))?.subject, "runner");
});

test("OIDC client builds PKCE login URL and rejects issuer drift", async () => {
  const calls: string[] = [];
  const client = new OidcClient({
    issuerUrl: "https://issuer.example.test",
    clientId: "dib",
    clientSecret: "server-only",
    redirectUri: "https://dib.example.test/auth/callback",
    fetchFn: async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          issuer: "https://issuer.example.test",
          authorization_endpoint: "https://issuer.example.test/authorize",
          token_endpoint: "https://issuer.example.test/token",
          jwks_uri: "https://issuer.example.test/jwks"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
  });
  const flow = await client.beginLogin("/builds");
  const login = new URL(flow.authorizationUrl);
  assert.equal(login.searchParams.get("client_id"), "dib");
  assert.equal(login.searchParams.get("code_challenge_method"), "S256");
  assert.ok(login.searchParams.get("code_challenge"));
  assert.equal(calls[0], "https://issuer.example.test/.well-known/openid-configuration");
});

test("OIDC routes keep callback state server-side and issue an opaque cookie", async () => {
  const app = Fastify();
  const store = new MemorySessionStore();
  const client = {
    async beginLogin() {
      return {
        state: "state-route",
        nonce: "nonce-route",
        codeVerifier: "verifier-route",
        authorizationUrl: "https://issuer.example.test/authorize?state=state-route"
      };
    },
    async exchangeCode() {
      return { subject: "alice", roles: ["user"], expiresAt: 4_102_444_800 };
    }
  } as unknown as OidcClient;
  registerOidcRoutes(app, { client, store, cookieName: "dib_session", sessionTtlSeconds: 3600 });

  const login = await app.inject({ method: "GET", url: "/auth/login?returnTo=/builds" });
  assert.equal(login.statusCode, 302);
  assert.match(login.headers.location ?? "", /state-route/);
  const callback = await app.inject({
    method: "GET",
    url: "/auth/callback?code=code-route&state=state-route"
  });
  assert.equal(callback.statusCode, 303);
  assert.match(callback.headers["set-cookie"]?.toString() ?? "", /HttpOnly/);
  const cookie = callback.headers["set-cookie"]?.toString().split(";", 1)[0];
  const session = await app.inject({ method: "GET", url: "/auth/session", headers: { cookie } });
  assert.deepEqual(session.json(), { authenticated: true, subject: "alice", roles: ["user"] });
  const logout = await app.inject({ method: "POST", url: "/auth/logout", headers: { cookie } });
  assert.equal(logout.statusCode, 204);
  await app.close();
});

test("Postgres session store preserves parameterized session and flow contracts", async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const pool = {
    async query(text: string, values: unknown[] = []) {
      queries.push({ text, values });
      if (text.startsWith("SELECT id")) {
        return { rows: [{ id: values[0], subject: "alice", roles: ["user"], expires_at: 4102444800 }] };
      }
      if (text.startsWith("DELETE FROM auth_oidc_flow")) {
        return { rows: [{ state: "s", nonce: "n", code_verifier: "v", return_to: "/builds", expires_at: 4102444800 }] };
      }
      return { rows: [] };
    }
  } as never;
  const store = new PostgresSessionStore(pool);
  const session = await store.createSession(
    { subject: "alice", roles: ["user"], expiresAt: 4102444800 },
    3600
  );
  assert.equal((await store.getSession(session.id))?.principal.subject, "alice");
  await store.revokeSession(session.id);
  await store.saveOidcFlow({ state: "s", nonce: "n", codeVerifier: "v", returnTo: "/builds", expiresAt: 4102444800 });
  assert.equal((await store.consumeOidcFlow("s"))?.codeVerifier, "v");
  assert.match(queries[0]?.text ?? "", /INSERT INTO auth_session/);
  assert.ok(queries.every(({ text }) => !text.includes("${")));
});

test("OIDC client completes discovery, token exchange and JWKS verification against a fake issuer", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "fake-key-1";
  const provider = Fastify();
  let expectedNonce = "";
  provider.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, _payload, done) => done(null, "")
  );
  provider.get("/.well-known/openid-configuration", async (request, reply) => {
    const origin = `http://${request.headers.host}`;
    reply.send({
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      jwks_uri: `${origin}/jwks`
    });
  });
  provider.get("/jwks", async (_request, reply) => reply.send({ keys: [jwk] }));
  provider.post("/token", async (request, reply) => {
    const origin = `http://${request.headers.host}`;
    const idToken = await new SignJWT({ sub: "oidc-alice", roles: ["user"], nonce: expectedNonce })
      .setProtectedHeader({ alg: "RS256", kid: "fake-key-1" })
      .setIssuer(origin)
      .setAudience("dib-test")
      .setExpirationTime("5m")
      .setIssuedAt()
      .sign(privateKey);
    return reply.send({ id_token: idToken, access_token: "server-only-access-token" });
  });
  await provider.listen({ host: "127.0.0.1", port: 0 });
  const providerAddress = provider.server.address();
  if (!providerAddress || typeof providerAddress === "string") throw new Error("fake issuer did not bind");
  const issuer = `http://127.0.0.1:${providerAddress.port}`;
  const client = new OidcClient({
    issuerUrl: issuer,
    clientId: "dib-test",
    clientSecret: "server-only",
    redirectUri: `${issuer}/auth/callback`
  });
  try {
    const flow = await client.beginLogin("/builds");
    expectedNonce = flow.nonce;
    const principal = await client.exchangeCode("fake-code", flow);
    assert.equal(principal.subject, "oidc-alice");
    assert.deepEqual(principal.roles, ["user"]);
    assert.ok(principal.expiresAt > Math.floor(Date.now() / 1000));
  } finally {
    await provider.close();
  }
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

test("AUTH_MODE=oidc refuses to start before an OIDC session adapter is wired", async () => {
  await assert.rejects(
    () => createApp({ ...toRuntimeSettings(parseRuntimeEnv({})), authMode: "oidc" }),
    /AUTH_MODE=oidc requires an OIDC session adapter/
  );
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
