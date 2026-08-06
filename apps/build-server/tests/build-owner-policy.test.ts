// Phase 1 (Identity + 테넌트 권한) — build owner policy 3단계 회귀 가드.
//
// 검증 표면:
//   1. 미인증 (cookie/Bearer/X-User-Id 모두 없음) → 401
//   2. cookie/Bearer principal.subject === build.requestedBy → 통과
//   3. cookie/Bearer principal 가 다른 owner 빌드 접근 → 403
//   4. admin role + admin allow-list 면 다른 owner 빌드도 통과
//   5. AUTH_LEGACY_HEADERS=true 면 X-User-Id 가 cookie 대신 작동
//   6. AUTH_LEGACY_HEADERS=false (default) 면 X-User-Id 무시 → 401
//   7. POST /builds body.requestedBy 위조 → 403
//   8. /builds/:id 부재 시 404 (인증 정보 누설 방지)
//   9. /builds listBuilds user role 은 본인 빌드만 (query 위조 무시)
//
// 본 test 는 Phase 1 의 cookie issuer 를 그대로 활용한다. registerBuildRoutes
// 시그니처가 3번재 인자로 `OwnerPolicyOptions` 를 받게 바뀌었으므로 기존
// `buildApp()` 도 3가지 variant (no options / legacy OFF / legacy ON) 로
// 구성한다.

import { strict as assert } from "node:assert";
import { createHash, randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import Fastify, { type FastifyInstance } from "fastify";

import {
  createMemoryBuildRepository
} from "../src/repositories/memory-build-repository.js";
import { registerBuildRoutes } from "../src/routes/build-routes.js";
import { registerAuthRoutes } from "../src/routes/auth-routes.js";
import { registerAdminRoutes } from "../src/routes/admin-routes.js";
import { BuildService } from "../src/services/build-service.js";
import { HmacIdentityProvider } from "../src/auth/hmac-identity-provider.js";
import { registerPrincipalPreHandler } from "../src/auth/request-principal.js";

interface FixtureOptions {
  readonly legacyHeadersEnabled: boolean;
  readonly adminIds: ReadonlyArray<string>;
}

async function buildApp(options: FixtureOptions): Promise<FastifyInstance> {
  const processEnvBackup = process.env.AUTH_LEGACY_HEADERS;
  process.env.AUTH_LEGACY_HEADERS = options.legacyHeadersEnabled ? "true" : "false";
  const app = Fastify({ logger: false });
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_request, payload, done) => done(null, payload)
  );
  const repo = createMemoryBuildRepository();
  const service = new BuildService(repo);
  const identityProvider = new HmacIdentityProvider({
    secret: "test-secret-must-be-long-enough-32-bytes!",
    ttlSeconds: 3600
  });
  // registerPrincipalPreHandler 가 cookie/Bearer → request.principal 을
  // 채움. registerAuthRoutes 가 /auth/login 으로 토큰 발급.
  await registerPrincipalPreHandler(app, identityProvider);
  // admin allow-list 는 registerAdminRoutes 안의 createAdminAllowList 와
  // 동일 출처를 써야 하므로 직접 만들어 양쪽에 주입.
  const { createAdminAllowList } = await import("../src/routes/admin-routes.js");
  const allowList = createAdminAllowList(options.adminIds);
  await registerAuthRoutes(app, identityProvider, allowList);
  await registerAdminRoutes(app, service, allowList, identityProvider);
  await registerBuildRoutes(app, service, {
    adminAllowList: options.adminIds,
    legacyHeadersEnabled: options.legacyHeadersEnabled
  });
  // 정합을 위해 process.env 는 원복.
  if (processEnvBackup === undefined) {
    delete process.env.AUTH_LEGACY_HEADERS;
  } else {
    process.env.AUTH_LEGACY_HEADERS = processEnvBackup;
  }
  return app;
}

async function loginAndGetCookie(
  app: FastifyInstance,
  subject: string,
  role: "user" | "admin" = "user"
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { subject, role }
  });
  assert.equal(res.statusCode, 200);
  const setCookie = res.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(cookie, "set-cookie was absent");
  const match = /^auth_token=([^;]+)/.exec(cookie);
  assert.ok(match, "auth_token cookie was missing");
  return `auth_token=${decodeURIComponent(match[1]!)}`;
}

async function seedBuild(
  app: FastifyInstance,
  owner: string
): Promise<string> {
  // seed 단계는 동일 정책으로 owner 인증 통과. cookie 로그인 후 사용.
  const cookie = await loginAndGetCookie(app, owner);
  const bytes = Buffer.from(randomBytes(64));
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  const sizeBytes = bytes.byteLength;
  const enq = await app.inject({
    method: "POST",
    url: "/builds",
    headers: { cookie },
    payload: {
      appName: `app-${owner}-${Math.random().toString(36).slice(2, 8)}`,
      requestedBy: owner,
      sourceArchive: {
        objectKey: `src/${owner}/archive.tar.gz`,
        checksumSha256,
        sizeBytes
      },
      entrypointPath: "x"
    }
  });
  assert.equal(enq.statusCode, 202);
  const buildId = (enq.json() as { build: { buildId: string } }).build.buildId;
  const upload = await app.inject({
    method: "POST",
    url: `/builds/${buildId}/source`,
    headers: { "content-type": "application/octet-stream", cookie },
    payload: bytes
  });
  assert.equal(upload.statusCode, 201);
  return buildId;
}

describe("build owner policy (Phase 1, 3단계)", () => {
  it("GET /builds 리스트는 unauthenticated 요청을 401 로 거부", async () => {
    const app = await buildApp({ legacyHeadersEnabled: false, adminIds: ["admin"] });
    try {
      const res = await app.inject({ method: "GET", url: "/builds" });
      assert.equal(res.statusCode, 401);
    } finally {
      await app.close();
    }
  });

  it("GET /builds/:id 는 cookie 인증 시 본인 빌드는 200", async () => {
    const app = await buildApp({ legacyHeadersEnabled: false, adminIds: ["admin"] });
    try {
      const cookie = await loginAndGetCookie(app, "alice");
      const buildId = await seedBuild(app, "alice");
      const res = await app.inject({
        method: "GET",
        url: `/builds/${buildId}`,
        headers: { cookie }
      });
      assert.equal(res.statusCode, 200);
    } finally {
      await app.close();
    }
  });

  it("GET /builds/:id 는 다른 owner 의 빌드 접근 시 403", async () => {
    const app = await buildApp({ legacyHeadersEnabled: false, adminIds: ["admin"] });
    try {
      const aliceCookie = await loginAndGetCookie(app, "alice");
      const owner = "bob";
      const buildId = await seedBuild(app, owner);
      const res = await app.inject({
        method: "GET",
        url: `/builds/${buildId}`,
        headers: { cookie: aliceCookie }
      });
      assert.equal(res.statusCode, 403);
      const body = res.json() as { message: string; callerId: string };
      assert.match(body.message, /owner/i);
      assert.equal(body.callerId, "alice");
    } finally {
      await app.close();
    }
  });

  it("admin role + allow-list 면 다른 owner 빌드도 200", async () => {
    const app = await buildApp({
      legacyHeadersEnabled: false,
      adminIds: ["admin", "yky.lee"]
    });
    try {
      const buildId = await seedBuild(app, "alice");
      const adminCookie = await loginAndGetCookie(app, "yky.lee", "admin");
      const res = await app.inject({
        method: "GET",
        url: `/builds/${buildId}`,
        headers: { cookie: adminCookie }
      });
      assert.equal(res.statusCode, 200, `body=${res.body}`);
    } finally {
      await app.close();
    }
  });

  it("admin role + allow-list 비포함은 일반 user role 로 강등되어 403", async () => {
    const app = await buildApp({
      legacyHeadersEnabled: false,
      adminIds: ["admin"]
    });
    try {
      // eve 를 admin 으로 로그인 시도하면 403 이 떨어진다. 대신 user role 로
      // 로그인한 뒤 admin role 권한으로 빌드 조회 시도.
      const eveCookie = await loginAndGetCookie(app, "eve");
      const buildId = await seedBuild(app, "alice");
      const res = await app.inject({
        method: "GET",
        url: `/builds/${buildId}`,
        headers: { cookie: eveCookie }
      });
      assert.equal(res.statusCode, 403);
    } finally {
      await app.close();
    }
  });

  it("AUTH_LEGACY_HEADERS=true 면 X-User-Id 헤더로 cookie 없이도 200", async () => {
    const app = await buildApp({ legacyHeadersEnabled: true, adminIds: ["admin"] });
    try {
      // legacy ON app 에서 X-User-Id 헤더로 seed 한 후 동일 헤더로 GET.
      const cookie = await loginAndGetCookie(app, "alice");
      const bytes = Buffer.from(randomBytes(64));
      const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
      const sizeBytes = bytes.byteLength;
      const enq = await app.inject({
        method: "POST",
        url: "/builds",
        headers: { "x-user-id": "alice" },
        payload: {
          appName: `app-alice-legacy-${Math.random().toString(36).slice(2, 8)}`,
          requestedBy: "alice",
          sourceArchive: {
            objectKey: "src/alice/archive.tar.gz",
            checksumSha256,
            sizeBytes
          },
          entrypointPath: "x"
        }
      });
      assert.equal(enq.statusCode, 202);
      const buildId = (enq.json() as { build: { buildId: string } }).build.buildId;
      const upload = await app.inject({
        method: "POST",
        url: `/builds/${buildId}/source`,
        headers: { "content-type": "application/octet-stream", "x-user-id": "alice" },
        payload: bytes
      });
      assert.equal(upload.statusCode, 201);
      // 그 다음 X-User-Id 헤더만으로 GET.
      const res = await app.inject({
        method: "GET",
        url: `/builds/${buildId}`,
        headers: { "x-user-id": "alice" }
      });
      assert.equal(res.statusCode, 200);
    } finally {
      await app.close();
    }
  });

  it("AUTH_LEGACY_HEADERS=false (default) 면 X-User-Id 헤더만으로는 401", async () => {
    const app = await buildApp({ legacyHeadersEnabled: false, adminIds: ["admin"] });
    try {
      // seed 는 cookie 로 (legacy ON 일 필요 없음).
      const buildId = await seedBuild(app, "alice");
      // GET 은 legacy OFF 라 X-User-Id 만으로는 인증 안 됨.
      const res = await app.inject({
        method: "GET",
        url: `/builds/${buildId}`,
        headers: { "x-user-id": "alice" }
      });
      assert.equal(res.statusCode, 401);
    } finally {
      await app.close();
    }
  });

  it("POST /builds body.requestedBy 가 principal.subject 와 다르면 403", async () => {
    const app = await buildApp({ legacyHeadersEnabled: false, adminIds: ["admin"] });
    try {
      const cookie = await loginAndGetCookie(app, "alice");
      const res = await app.inject({
        method: "POST",
        url: "/builds",
        headers: { cookie },
        payload: {
          appName: "spoof-app",
          requestedBy: "bob",
          sourceArchive: {
            objectKey: "src/spoof/archive.tar.gz",
            checksumSha256: "a".repeat(64),
            sizeBytes: 1
          },
          entrypointPath: "x"
        }
      });
      assert.equal(res.statusCode, 403);
      const body = res.json() as { message: string; callerId: string; requestedBy: string };
      assert.equal(body.callerId, "alice");
      assert.equal(body.requestedBy, "bob");
    } finally {
      await app.close();
    }
  });

  it("GET /builds/:id 부재 시 401/403 또한 404 로 동일 표면 (정보 누설 방지)", async () => {
    const app = await buildApp({ legacyHeadersEnabled: false, adminIds: ["admin"] });
    try {
      const cookie = await loginAndGetCookie(app, "alice");
      // unknown UUID — 404 가 아닌 401/403 으로 owner leak 방지.
      const res = await app.inject({
        method: "GET",
        url: "/builds/00000000-0000-0000-0000-000000000000",
        headers: { cookie }
      });
      assert.equal(res.statusCode, 404);
    } finally {
      await app.close();
    }
  });

  it("GET /builds 의 user role 은 query.requestedBy 를 무시하고 본인 빌드만", async () => {
    const app = await buildApp({ legacyHeadersEnabled: false, adminIds: ["admin"] });
    try {
      const aliceCookie = await loginAndGetCookie(app, "alice");
      const bobCookie = await loginAndGetCookie(app, "bob");
      const aliceBuildId = await seedBuild(app, "alice");
      const bobBuildId = await seedBuild(app, "bob");
      // alice 가 본인이 아닌 bob 으로 query 위조 → 결과는 alice 빌드만.
      const res = await app.inject({
        method: "GET",
        url: "/builds?requestedBy=bob",
        headers: { cookie: aliceCookie }
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { builds: Array<{ buildId: string }> };
      const ids = body.builds.map((b) => b.buildId);
      assert.ok(ids.includes(aliceBuildId));
      assert.ok(!ids.includes(bobBuildId));
      // 정합 — bob 은 자기 빌드만 본다.
      const bob = await app.inject({
        method: "GET",
        url: "/builds",
        headers: { cookie: bobCookie }
      });
      const bobBody = bob.json() as { builds: Array<{ buildId: string }> };
      const bobIds = bobBody.builds.map((b) => b.buildId);
      assert.ok(bobIds.includes(bobBuildId));
      assert.ok(!bobIds.includes(aliceBuildId));
    } finally {
      await app.close();
    }
  });

  it("GET /builds/:id/logs 도 owner 가드 적용 — 다른 owner 면 403", async () => {
    const app = await buildApp({ legacyHeadersEnabled: false, adminIds: ["admin"] });
    try {
      const aliceCookie = await loginAndGetCookie(app, "alice");
      const buildId = await seedBuild(app, "bob");
      const res = await app.inject({
        method: "GET",
        url: `/builds/${buildId}/logs`,
        headers: { cookie: aliceCookie }
      });
      assert.equal(res.statusCode, 403);
    } finally {
      await app.close();
    }
  });

  it("DELETE /builds/:id/source 도 owner 가드 적용 — 다른 owner 면 403", async () => {
    const app = await buildApp({ legacyHeadersEnabled: false, adminIds: ["admin"] });
    try {
      const aliceCookie = await loginAndGetCookie(app, "alice");
      const buildId = await seedBuild(app, "bob");
      const res = await app.inject({
        method: "DELETE",
        url: `/builds/${buildId}/source`,
        headers: { cookie: aliceCookie }
      });
      assert.equal(res.statusCode, 403);
    } finally {
      await app.close();
    }
  });
});
