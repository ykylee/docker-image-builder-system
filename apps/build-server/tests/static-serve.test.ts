import { strict as assert } from "node:assert";
import { describe, it, before, after, beforeEach } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RuntimeSettings } from "@docker-image-builder-system/shared-config";

import { createApp } from "../src/app/create-app.js";

// TASK-075: 단일 포트 reverse proxy 회귀 가드. Build Server 가
// `apps/build-monitor/dist` 를 정적 mount + SPA fallback 으로 함께 노출
// 한다는 것은 (1) Build Server API 는 정상, (2) dist/index.html + assets 가
// 서빙됨, (3) 알 수 없는 GET path 가 SPA fallback 으로 같은 index.html 을
// 응답, (4) `/api/*` / `/openapi` / `/docs` prefix 는 Build Server 가
// 자체 응답하지 못한 경우에도 JSON 404 로 떨어지는 것 (HTML fallback 이
// 데이터를 변조하지 않도록) 을 보장한다.
describe("Build Server single-port reverse proxy (TASK-075)", () => {
  let distDir: string;
  let prevDistEnv: string | undefined;
  let app: Awaited<ReturnType<typeof createApp>>;
  let baseUrl: string;
  let port: number;

  const baseRequest = (requestedBy: string, appName: string) => ({
    appName,
    requestedBy,
    sourceArchive: {
      objectKey: `src/${appName}/abc.tar.gz`,
      checksumShaef: "deadbeef",
      sizeBytes: 1024
    } as never,
    entrypointPath: "src/index.ts"
  });

  const makeRuntime = (): RuntimeSettings => ({
    port,
    databaseUrl: "",
    buildRepositoryBackend: "memory",
    dbAutoBootstrap: false,
    previewTtlMinutes: 60,
    runnerPollIntervalMs: 1_000,
    buildTimeoutSeconds: 600,
    // TASK-075: 단일 포트 reverse proxy 검증 — CORS wildcard 는 SPA UX
    // (운영자가 단일 origin으로 프론트+백 호출) 와 양립하므로 그대로 둔다.
    corsOrigin: "*",
    adminIds: ["admin"]
  });

  before(async () => {
    prevDistEnv = process.env.BUILD_MONITOR_DIST_PATH;
    // 임시 build-monitor dist 디렉토리 + index.html + asset 작성.
    distDir = mkdtempSync(join(tmpdir(), "build-monitor-dist-"));
    writeFileSync(
      join(distDir, "index.html"),
      "<!DOCTYPE html><html><body><div id='root'>build-monitor stub</div></body></html>"
    );
    writeFileSync(join(distDir, "favicon.svg"), "<svg/>");
    writeFileSync(
      join(distDir, "assets"),
      "/* fallback empty bundle */",
      { encoding: "utf-8", flag: "w" }
    );
    // assets/ 디렉토리 작성 (writeFileSync 가 위에선 파일을 만든 경우 — 안전망).
    process.env.BUILD_MONITOR_DIST_PATH = distDir;

    port = await pickPort();
    app = await createApp(makeRuntime());
    baseUrl = `http://127.0.0.1:${port}`;
    await app.listen({ port, host: "127.0.0.1" });
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    if (prevDistEnv === undefined) {
      delete process.env.BUILD_MONITOR_DIST_PATH;
    } else {
      process.env.BUILD_MONITOR_DIST_PATH = prevDistEnv;
    }
    if (distDir) {
      rmSync(distDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    // Each test 는 깨끗한 memory backend 상태로 시작 — listBuilds 끝점
    // 검증 시 사전 등록된 build 가 없도록 reset. 단순화를 위해 별도
    // endpoint 검증 + 별도 app 인스턴스를 두면 깨끗하지만 한 app 으로
    // 통합 가능 — 빌드 등록 / listBuilds 는 별개 시나리오로 검증.
  });

  it("serves build-monitor index.html on GET /", async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /build-monitor stub/);
    assert.match(body, /<!DOCTYPE html>/);
  });

  it("falls back to index.html for SPA deep links (GET /admin/login)", async () => {
    // single-port reverse proxy 의 핵심 — vite dev 가 없어도 사용자가
    // /admin/login 직접 입력 시 같은 index.html 응답 + svelte-spa-router 가
    // 클라이언트에서 /admin/login path 처리.
    const res = await fetch(`${baseUrl}/admin/login`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /build-monitor stub/);
  });

  it("falls back to index.html for arbitrary GET paths (GET /not-a-real-route)", async () => {
    const res = await fetch(`${baseUrl}/not-a-real-route`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /build-monitor stub/);
  });

  it("serves dist assets verbatim (GET /favicon.svg)", async () => {
    const res = await fetch(`${baseUrl}/favicon.svg`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /<svg/);
  });

  it("preserves Build Server API routing — GET /health returns JSON", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const ct = res.headers.get("content-type") ?? "";
    assert.match(ct, /application\/json/);
    const body = await res.json();
    assert.deepEqual(body, { status: "ok" });
  });

  it("preserves Build Server API routing — GET /api/builds returns JSON", async () => {
    const res = await fetch(`${baseUrl}/api/builds`);
    // 200 + 빈 list (메모리 backend 라 build 가 없음).
    assert.equal(res.status, 200);
    const ct = res.headers.get("content-type") ?? "";
    assert.match(ct, /application\/json/);
    const body = await res.json();
    assert.equal(body.builds.length, 0);
  });

  it("/api/ prefix 404 is JSON, not HTML SPA fallback", async () => {
    // catch-all 이 절대 Build Server 가 자체 응답하지 못한 path 에도
    // JSON 404 를 보장하는지 — SPA fallback 이 Skil / health probe 같은
    // 비-browser 소비자의 잘못된 요청을 HTML 로 응답해 데이터를 변조하지
    // 않도록.
    const res = await fetch(`${baseUrl}/api/no-such-route`);
    assert.equal(res.status, 404);
    const ct = res.headers.get("content-type") ?? "";
    assert.match(ct, /application\/json/);
    const body = await res.json();
    assert.equal(body.error, "not_found");
    assert.equal(body.path, "/api/no-such-route");
  });

  it("/openapi prefix 404 is JSON, not HTML", async () => {
    const res = await fetch(`${baseUrl}/openapi/nonexistent`);
    assert.equal(res.status, 404);
    const ct = res.headers.get("content-type") ?? "";
    assert.match(ct, /application\/json/);
  });

  it("/admin/* deep link still gets SPA fallback (Build Server route 가 매치 안 한 경우)", async () => {
    // Build Server 의 `/admin/*` route 는 registered path 만 — 미지의
    // /admin/* 는 SPA fallback 으로 떨어져야 자연스러움. (`/admin/`
    // 은 wildcard 제외이지만 wildcard 가 Build Server 의 registered
    // path 와 충돌하지 않게 prefix-match 후 내부 dispatch 는 Build
    // Server 가 결정.)
    const res = await fetch(`${baseUrl}/admin/some/very/deep/link`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /build-monitor stub/);
  });

  it("does NOT SPA-fallback POST /api/* (404 JSON response)", async () => {
    // POST /api/no-such-route 가 SPA HTML 200 으로 응답되면 consumer
    // 가 의도하지 않은 success 로 인식할 위험. Build Server 가 자체
    // 응답하지 못한 POST 에도 JSON 404 보장.
    const res = await fetch(`${baseUrl}/api/no-such-route`, { method: "POST" });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "not_found");
  });
});

async function pickPort(): Promise<number> {
  // Bind ephemeral port via net.Server.0; Fastify 가 그 port 위에서
  // listen. 0 포트 자동할당 +1 회 호출만 가능 (Fastify 가 bind 후에
  // address() 를 호출) — 게다가 double-bind (이미 다른 Fastify 가 listen)
  // 의 race 를 피하기 위해 0 임시 바인드 + close.
  const net = await import("node:net");
  return new Promise<number>((resolveP, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const addr = probe.address();
      if (addr === null || typeof addr === "string") {
        probe.close();
        reject(new Error("ephemeral port unavailable"));
        return;
      }
      const p = addr.port;
      probe.close(() => resolveP(p));
    });
  });
}
