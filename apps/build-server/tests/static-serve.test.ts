import { strict as assert } from "node:assert";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RuntimeSettings } from "@docker-image-builder-system/shared-config";

import { createApp } from "../src/app/create-app.js";

// TASK-075/093/094: 단일 포트 reverse proxy 회귀 가드. TASK-094 에서
// Svelte legacy mount 가 제거됐고 React only 로 단순화. Build Server 가
// React dist (`apps/build-monitor/dist-react/`) 만 정적 mount + SPA
// fallback 으로 노출:
//   (1) Build Server API 는 정상 (memory backend),
//   (2) React dist 의 `/` + `/assets/*` + `/favicon.svg` 가 서빙되고
//       SPA fallback 으로 React index.html 이 응답,
//   (3) `/api/*` / `/openapi` / `/docs` prefix 는 Build Server 가 자체
//       응답하지 못한 경우 JSON 404 (HTML fallback 이 데이터를 변조하지
//       않도록),
//   (4) React dist 가 빌드되지 않은 경우 mount skip (graceful).
describe("Build Server single-port reverse proxy (TASK-075 + TASK-093 + TASK-094)", () => {
  let reactDistDir: string;
  let prevReactEnv: string | undefined;
  let app: Awaited<ReturnType<typeof createApp>>;
  let baseUrl: string;
  let port: number;

  const REACT_STUB = "build-monitor-react-stub";

  const makeRuntime = (): RuntimeSettings => ({
    port,
    databaseUrl: "",
    buildRepositoryBackend: "memory",
    dbAutoBootstrap: false,
    previewTtlMinutes: 60,
    runnerPollIntervalMs: 1_000,
    buildTimeoutSeconds: 600,
    corsOrigin: "*",
    adminIds: ["admin"]
  });

  before(async () => {
    prevReactEnv = process.env.BUILD_MONITOR_REACT_DIST_PATH;

    reactDistDir = mkdtempSync(join(tmpdir(), "build-monitor-react-"));
    writeFileSync(
      join(reactDistDir, "index.html"),
      `<!DOCTYPE html><html><body><div id='app-react'>${REACT_STUB}</div></body></html>`
    );
    writeFileSync(join(reactDistDir, "favicon.svg"), "<svg-react/>");
    process.env.BUILD_MONITOR_REACT_DIST_PATH = reactDistDir;

    port = await pickPort();
    app = await createApp(makeRuntime());
    baseUrl = `http://127.0.0.1:${port}`;
    await app.listen({ port, host: "127.0.0.1" });
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    if (prevReactEnv === undefined) {
      delete process.env.BUILD_MONITOR_REACT_DIST_PATH;
    } else {
      process.env.BUILD_MONITOR_REACT_DIST_PATH = prevReactEnv;
    }
    if (reactDistDir) {
      rmSync(reactDistDir, { recursive: true, force: true });
    }
  });

  it("serves React index.html on GET /", async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, new RegExp(REACT_STUB));
    assert.match(body, /<!DOCTYPE html>/);
  });

  it("Build Server 가 직접 처리하는 /builds/<id> GET 은 UUID validation 으로 거절", async () => {
    // React SPA 가 직접 진입하는 path 와 Build Server 의 route 매치 우선순위
    // — Build Server 가 `/builds/:buildId` route 를 wildcard GET 으로 등록
    // 했으므로 React SPA 진입은 `/api/builds/<id>` GET (Build Server 가 응답)
    // 또는 Build Server 의 route 가 매치되지 않는 다른 path 로 제한.
    // 직접 URL `/builds/abc-123` 입력 시 Build Server 가 UUID validation
    // 으로 400 응답 — 운영자가 React SPA 측 진입은 `/builds/<uuid>` 가 아닌
    // `/api/builds/<uuid>` 로 fetch (lib/api.ts 의 getBuild 함수).
    //
    // TASK-127: 본 단언은 원래 500 이었다. 그것은 의도된 명세가 아니라
    // 당시 handler 가 `safeParse` 대신 bare `parse` 를 써서 ZodError 가
    // Fastify 기본 error handler 까지 새어 나가던 결함을 그대로 받아적은
    // 것이다. 잘못된 buildId 는 client error 이므로 400 이 맞다. 본
    // 테스트의 본래 목적 (SPA 라우팅 우선순위 검증) 은 그대로 유지된다.
    const res = await fetch(`${baseUrl}/builds/abc-123`);
    assert.equal(res.status, 400);
  });

  it("falls back to React index.html for /api/builds/<id> (Build Server route)", async () => {
    // Build Server 의 `/builds/:buildId` route 가 매치되지만 `/api/*` 가
    // 아닌 직접 호출이므로 setNotFoundHandler 가 안 잡고 Build Server 가
    // 응답. 단, 등록된 build 가 없으면 404 응답.
    const res = await fetch(`${baseUrl}/api/builds/00000000-0000-0000-0000-000000000001`, {
      redirect: "manual"
    });
    assert.equal(res.status, 307);
    const location = res.headers.get("location") ?? "";
    assert.match(location, /^\/builds\//);
  });

  it("falls back to React index.html for /admin/login deep link", async () => {
    const res = await fetch(`${baseUrl}/admin/login`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, new RegExp(REACT_STUB));
  });

  it("falls back to React index.html for arbitrary GET paths", async () => {
    const res = await fetch(`${baseUrl}/not-a-real-route`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, new RegExp(REACT_STUB));
  });

  it("serves React favicon.svg verbatim", async () => {
    const res = await fetch(`${baseUrl}/favicon.svg`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /<svg-react/);
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
    assert.equal(res.status, 200);
    const ct = res.headers.get("content-type") ?? "";
    assert.match(ct, /application\/json/);
    const body = await res.json();
    assert.equal(body.builds.length, 0);
  });

  it("/api/ prefix 404 is JSON, not HTML SPA fallback", async () => {
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

  it("/admin/* deep link still gets React SPA fallback", async () => {
    const res = await fetch(`${baseUrl}/admin/some/very/deep/link`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, new RegExp(REACT_STUB));
  });

  it("does NOT SPA-fallback POST /api/* (404 JSON response)", async () => {
    const res = await fetch(`${baseUrl}/api/no-such-route`, { method: "POST" });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "not_found");
  });

  it("API_REWRITE_ALLOWED_PREFIXES: /api/builds/abc → /builds/abc 307", async () => {
    const res = await fetch(`${baseUrl}/api/builds/00000000-0000-0000-0000-000000000001`, {
      redirect: "manual"
    });
    assert.equal(res.status, 307);
    const location = res.headers.get("location") ?? "";
    assert.match(location, /^\/builds\//);
  });
});

async function pickPort(): Promise<number> {
  const net = await import("node:net");
  return new Promise<number>((resolveP, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const addr = probe.address();
      if (addr === null || typeof addr === "string") {
        probe.close();
        reject(new Error("probe address unavailable"));
        return;
      }
      const p = addr.port;
      probe.close(() => resolveP(p));
    });
  });
}
