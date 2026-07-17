import { strict as assert } from "node:assert";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RuntimeSettings } from "@docker-image-builder-system/shared-config";

import { createApp } from "../src/app/create-app.js";

// TASK-075/093: 단일 포트 reverse proxy 회귀 가드. Build Server 가
// Svelte + React 2 dist 를 동시 mount 한다는 것은
//   (1) Build Server API 는 정상 (memory backend),
//   (2) React dist (primary SPA) 의 `/` + `/assets/*` + `/favicon.svg`
//       가 서빙되고 SPA fallback 으로 React index.html 이 응답,
//   (3) Svelte dist (legacy deep link 호환) 의 `/svelte` + `/svelte/`
//       GET 이 Svelte index.html 을 응답,
//   (4) `/api/*` / `/openapi` / `/docs` prefix 는 Build Server 가
//       자체 응답하지 못한 경우 JSON 404 (HTML fallback 이 데이터를
//       변조하지 않도록),
//   (5) 어느 한 dist 가 부재해도 다른 dist + Build Server API 만으로
//       정상 응답 (graceful degradation).
describe("Build Server single-port reverse proxy (TASK-075 + TASK-093)", () => {
  let svelteDistDir: string;
  let reactDistDir: string;
  let prevSvelteEnv: string | undefined;
  let prevReactEnv: string | undefined;
  let app: Awaited<ReturnType<typeof createApp>>;
  let baseUrl: string;
  let port: number;

  const SVELTE_STUB = "build-monitor-svelte-stub";
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
    prevSvelteEnv = process.env.BUILD_MONITOR_DIST_PATH;
    prevReactEnv = process.env.BUILD_MONITOR_REACT_DIST_PATH;

    svelteDistDir = mkdtempSync(join(tmpdir(), "build-monitor-svelte-"));
    writeFileSync(
      join(svelteDistDir, "index.html"),
      `<!DOCTYPE html><html><body><div id='root'>${SVELTE_STUB}</div></body></html>`
    );
    writeFileSync(join(svelteDistDir, "favicon.svg"), "<svg-svelte/>");
    process.env.BUILD_MONITOR_DIST_PATH = svelteDistDir;

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
    if (prevSvelteEnv === undefined) {
      delete process.env.BUILD_MONITOR_DIST_PATH;
    } else {
      process.env.BUILD_MONITOR_DIST_PATH = prevSvelteEnv;
    }
    if (prevReactEnv === undefined) {
      delete process.env.BUILD_MONITOR_REACT_DIST_PATH;
    } else {
      process.env.BUILD_MONITOR_REACT_DIST_PATH = prevReactEnv;
    }
    if (svelteDistDir) {
      rmSync(svelteDistDir, { recursive: true, force: true });
    }
    if (reactDistDir) {
      rmSync(reactDistDir, { recursive: true, force: true });
    }
  });

  it("serves React index.html on GET / (TASK-093 primary SPA)", async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, new RegExp(REACT_STUB));
    assert.match(body, /<!DOCTYPE html>/);
  });

  it("serves Svelte index.html on GET /svelte (TASK-093 legacy deep link)", async () => {
    const res = await fetch(`${baseUrl}/svelte`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, new RegExp(SVELTE_STUB));
  });

  it("serves Svelte index.html on GET /svelte/ (trailing slash)", async () => {
    const res = await fetch(`${baseUrl}/svelte/`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, new RegExp(SVELTE_STUB));
  });

  it("falls back to Svelte index.html for /svelte/* deep links (SPA fallback)", async () => {
    // Build Server 에 등록되지 않은 /svelte/builds/<uuid> 같은 deep link 가
    // Svelte svelte-spa-router 가 클라이언트에서 처리할 수 있도록 같은
    // index.html 응답.
    const res = await fetch(`${baseUrl}/svelte/builds/abc-123`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, new RegExp(SVELTE_STUB));
  });

  it("falls back to React index.html for /admin/login (React primary)", async () => {
    // single-port reverse proxy 의 핵심 — 운영자가 /admin/login 직접 입력
    // 시 React index.html 응답 + react-router-dom 가 클라이언트에서 처리.
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
    // React dist 의 favicon.svg 가 @fastify/static 으로 mount 됨. React 의
    // index.html 이 `<link href="/favicon.svg">` 를 참조하므로 정합 보장.
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

  it("/admin/* deep link still gets React SPA fallback (TASK-093 primary)", async () => {
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
    // fetch 가 default 로 307 redirect 를 따라가서 final 404 응답.
    const res = await fetch(`${baseUrl}/api/builds/00000000-0000-0000-0000-000000000001`, {
      redirect: "manual"
    });
    assert.equal(res.status, 307);
    const location = res.headers.get("location") ?? "";
    // /api/builds/<id> → /builds/<id> 로 rewrite (TASK-075).
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
