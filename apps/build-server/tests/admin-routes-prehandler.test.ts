// Phase 1 (Identity + 테넌트 권한) 4단계 — admin-routes 단일 가드 helper 회귀.
//
// enforceAdminGuard 가 다음 4 정책을 일관되게 적용함을 검증:
//   1. legacy OFF + cookie 인증 admin → 200 통과 (cookie 우선).
//   2. legacy OFF + cookie 인증 user role → 403 reject (admin role 미통과).
//   3. legacy ON + X-Admin-Id 헤더 allow-list 일치 → 200 통과 (legacy fallback).
//   4. legacy OFF + X-Admin-Id 헤더만 → 401 reject (silent 무시, hint 포함).
//
// 모든 케이스에서 envelope 의 `message`/`header`/`hint`/`callerId` 가
// build-routes owner policy (3단계) 의 envelope 과 동일한 형식을 유지하는지
// 확인 — 운영자가 Build Monitor 의 에러 메시지 파싱 로직을 한 곳에서 관리.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import Fastify, { type FastifyInstance } from "fastify";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";
import { createAdminAllowList, registerAdminRoutes } from "../src/routes/admin-routes.js";
import { registerAuthRoutes } from "../src/routes/auth-routes.js";
import { registerPrincipalPreHandler } from "../src/auth/request-principal.js";
import { HmacIdentityProvider } from "../src/auth/hmac-identity-provider.js";
import { BuildService } from "../src/services/build-service.js";

async function buildAppWithAuth(
  legacyHeadersEnabled: boolean
): Promise<FastifyInstance> {
  const previous = process.env.AUTH_LEGACY_HEADERS;
  if (legacyHeadersEnabled) process.env.AUTH_LEGACY_HEADERS = "true";
  else delete process.env.AUTH_LEGACY_HEADERS;
  try {
    const identityProvider = new HmacIdentityProvider({
      secret: "test-secret".padEnd(32, "x"),
      allowDevDefault: true
    });
    const app = Fastify({ logger: false });
    await registerPrincipalPreHandler(app, identityProvider);
    const buildService = new BuildService(createMemoryBuildRepository());
    const allowList = createAdminAllowList(["admin", "yky.lee"]);
    await registerAuthRoutes(app, identityProvider, allowList);
    await registerAdminRoutes(
      app,
      buildService,
      allowList,
      identityProvider
    );
    return app;
  } finally {
    if (previous === undefined) delete process.env.AUTH_LEGACY_HEADERS;
    else process.env.AUTH_LEGACY_HEADERS = previous;
  }
}

async function loginCookie(
  app: FastifyInstance,
  subject: string,
  role: "user" | "admin" = "admin"
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { subject, role }
  });
  assert.equal(res.statusCode, 200);
  const setCookie = res.headers["set-cookie"];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(raw, "Set-Cookie header must be present");
  const match = /auth_token=([^;]+)/.exec(raw);
  assert.ok(match, "auth_token cookie must be issued");
  return `auth_token=${match[1]}`;
}

describe("enforceAdminGuard — Phase 1 4단계 단일 가드", () => {
  it("legacy OFF + cookie 인증 admin → /admin/builds 200 통과", async () => {
    const app = await buildAppWithAuth(false);
    const cookie = await loginCookie(app, "admin");
    const res = await app.inject({
      method: "GET",
      url: "/admin/builds",
      headers: { cookie }
    });
    assert.equal(res.statusCode, 200);
    await app.close();
  });

  it("legacy OFF + cookie 인증 user role → /admin/builds 403 reject (admin role 미통과)", async () => {
    const app = await buildAppWithAuth(false);
    // user role 로 로그인 — admin allow-list 에 없는 subject.
    const cookie = await loginCookie(app, "alice", "user");
    const res = await app.inject({
      method: "GET",
      url: "/admin/builds",
      headers: { cookie }
    });
    assert.equal(res.statusCode, 403);
    const body = res.json();
    assert.equal(body.callerId, "alice");
    assert.match(body.message ?? "", /Admin role/);
    await app.close();
  });

  it("legacy ON + X-Admin-Id 헤더 allow-list 일치 → 200 통과 (legacy fallback)", async () => {
    const app = await buildAppWithAuth(true);
    const res = await app.inject({
      method: "GET",
      url: "/admin/builds",
      headers: { "x-admin-id": "admin" }
    });
    assert.equal(res.statusCode, 200);
    await app.close();
  });

  it("legacy OFF + X-Admin-Id 헤더만 → 401 reject (silent 무시, hint 포함)", async () => {
    const app = await buildAppWithAuth(false);
    const res = await app.inject({
      method: "GET",
      url: "/admin/builds",
      headers: { "x-admin-id": "admin" }
    });
    assert.equal(res.statusCode, 401);
    const body = res.json();
    // legacy OFF 일 때는 cookie/Bearer 인증만 인정. X-Admin-Id 헤더는
    // silent 무시되고 Authentication required. envelope 반환.
    assert.equal(body.message, "Authentication required.");
    assert.match(body.hint ?? "", /\/auth\/login/);
    // 운영자가 X-Admin-Id 의존 여부를 보고 hint message 로 즉시 인지 가능.
    await app.close();
  });

  it("legacy ON + X-Admin-Id 헤더 allow-list 비포함 → 403 + callerId echo", async () => {
    const app = await buildAppWithAuth(true);
    const res = await app.inject({
      method: "GET",
      url: "/admin/builds",
      headers: { "x-admin-id": "alice" }
    });
    assert.equal(res.statusCode, 403);
    const body = res.json();
    assert.equal(body.callerId, "alice");
    assert.match(body.message ?? "", /not in the admin allow-list/);
    await app.close();
  });

  it("legacy OFF + 인증 부재 → 401 hint 포함 (cookie/Bearer 모두 없음)", async () => {
    const app = await buildAppWithAuth(false);
    const res = await app.inject({
      method: "GET",
      url: "/admin/builds"
    });
    assert.equal(res.statusCode, 401);
    const body = res.json();
    assert.equal(body.message, "Authentication required.");
    assert.match(body.hint ?? "", /\/auth\/login/);
    await app.close();
  });
});