// Phase 2 (Runner 인증) — lease token 회귀 가드.
//
// 5 case:
//   1. POST /auth/runner-login — 등록된 runner 면 200 + leaseToken + expiresAt.
//   2. POST /auth/runner-login — unknown runner 면 401 + Runner is not registered.
//   3. POST /auth/runner-login — DISABLED runner 면 403 + Runner is disabled.
//   4. POST /auth/runner-lease-renew — cookie 인증 runner 면 200 + 새 lease.
//   5. POST /auth/runner-lease-renew — 인증 부재면 401 + Authentication required.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import Fastify, { type FastifyInstance } from "fastify";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";
import { createAdminAllowList, registerAdminRoutes } from "../src/routes/admin-routes.js";
import { registerAuthRoutes } from "../src/routes/auth-routes.js";
import { HmacIdentityProvider } from "../src/auth/hmac-identity-provider.js";
import { registerPrincipalPreHandler } from "../src/auth/request-principal.js";
import { BuildService } from "../src/services/build-service.js";

async function buildApp(): Promise<FastifyInstance> {
  const identityProvider = new HmacIdentityProvider({
    secret: "test-secret".padEnd(32, "x"),
    allowDevDefault: true
  });
  // legacy X-Admin-Id 헤더 fallback 활성 — admin runner 등록을 단일 env 에서
  // 처리 가능하도록.
  process.env.AUTH_LEGACY_HEADERS = "true";
  const app = Fastify({ logger: false });
  await registerPrincipalPreHandler(app, identityProvider);
  const buildService = new BuildService(createMemoryBuildRepository(), {
    strictContentRange: false,
    identityProvider,
    leaseTtlSeconds: 60
  });
  const allowList = createAdminAllowList(["admin"]);
  await registerAuthRoutes(app, identityProvider, allowList, buildService);
  await registerAdminRoutes(app, buildService, allowList, identityProvider);
  return app;
}

async function registerRunner(
  app: FastifyInstance,
  runnerId: string
): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: "/admin/runners",
    headers: { "x-admin-id": "admin", "content-type": "application/json" },
    payload: { runnerId }
  });
  assert.equal(res.statusCode, 201, `admin register failed: ${res.body}`);
}

describe("POST /auth/runner-login", () => {
  it("returns 200 + leaseToken + expiresAt for registered runner", async () => {
    const app = await buildApp();
    await registerRunner(app, "runner-1");
    const res = await app.inject({
      method: "POST",
      url: "/auth/runner-login",
      headers: { "content-type": "application/json" },
      payload: { runnerId: "runner-1" }
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    assert.ok(typeof body.leaseToken === "string" && body.leaseToken.startsWith("v2."));
    assert.equal(body.runnerId, "runner-1");
    assert.ok(typeof body.expiresAt === "number" && body.expiresAt > 0);
    await app.close();
  });

  it("returns 401 for unknown runner", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/runner-login",
      headers: { "content-type": "application/json" },
      payload: { runnerId: "unknown-runner" }
    });
    assert.equal(res.statusCode, 401);
    const body = res.json();
    assert.equal(body.message, "Runner is not registered.");
    assert.equal(body.runnerId, "unknown-runner");
    await app.close();
  });

  it("returns 403 for DISABLED runner", async () => {
    const app = await buildApp();
    await registerRunner(app, "runner-disabled");
    // admin PATCH 로 DISABLED 토글.
    const patch = await app.inject({
      method: "PATCH",
      url: "/admin/runners/runner-disabled",
      headers: { "x-admin-id": "admin", "content-type": "application/json" },
      payload: { status: "DISABLED" }
    });
    assert.equal(patch.statusCode, 200);
    // login 시도가 거절되는지 검증.
    const res = await app.inject({
      method: "POST",
      url: "/auth/runner-login",
      headers: { "content-type": "application/json" },
      payload: { runnerId: "runner-disabled" }
    });
    assert.equal(res.statusCode, 403);
    const body = res.json();
    assert.match(body.message ?? "", /disabled/);
    await app.close();
  });

  it("returns 400 for invalid body (empty runnerId)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/runner-login",
      headers: { "content-type": "application/json" },
      payload: { runnerId: "" }
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });
});

describe("POST /auth/runner-lease-renew", () => {
  it("returns 200 + new leaseToken when cookie carries valid runner lease", async () => {
    const app = await buildApp();
    await registerRunner(app, "runner-renew");
    // 1) login 으로 lease 발급.
    const login = await app.inject({
      method: "POST",
      url: "/auth/runner-login",
      headers: { "content-type": "application/json" },
      payload: { runnerId: "runner-renew" }
    });
    assert.equal(login.statusCode, 200);
    const loginBody = login.json();
    const leaseCookie = `auth_token=${encodeURIComponent(loginBody.leaseToken)}`;
    // 2) renew 으로 새 lease 발급.
    const renew = await app.inject({
      method: "POST",
      url: "/auth/runner-lease-renew",
      headers: { cookie: leaseCookie }
    });
    assert.equal(renew.statusCode, 200, renew.body);
    const renewBody = renew.json();
    assert.ok(typeof renewBody.leaseToken === "string" && renewBody.leaseToken.startsWith("v2."));
    assert.ok(renewBody.expiresAt >= loginBody.expiresAt, "renewed lease should not expire earlier");
    assert.equal(renewBody.runnerId, "runner-renew");
    await app.close();
  });

  it("returns 401 when no cookie / bearer", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/runner-lease-renew"
    });
    assert.equal(res.statusCode, 401);
    const body = res.json();
    assert.match(body.message ?? "", /Authentication required/);
    assert.match(body.hint ?? "", /runner-login/);
    await app.close();
  });

  it("returns 403 when caller is not runner (admin role)", async () => {
    const app = await buildApp();
    // admin role 로 login → /auth/login 사용.
    const adminLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      payload: { subject: "admin", role: "admin" }
    });
    assert.equal(adminLogin.statusCode, 200);
    const adminCookie = adminLogin.headers["set-cookie"];
    const adminCookieStr = Array.isArray(adminCookie) ? adminCookie[0] : adminCookie;
    assert.ok(adminCookieStr);
    const renew = await app.inject({
      method: "POST",
      url: "/auth/runner-lease-renew",
      headers: { cookie: adminCookieStr }
    });
    assert.equal(renew.statusCode, 403);
    const body = renew.json();
    assert.match(body.message ?? "", /not a runner/);
    assert.equal(body.callerId, "admin");
    await app.close();
  });
});