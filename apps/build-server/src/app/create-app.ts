import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { createReadStream, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  applyMigrations,
  createDbClientFromPool,
  createDbPool,
  ensureDbSchema
} from "@docker-image-builder-system/db";
import type { RuntimeSettings } from "@docker-image-builder-system/shared-config";

import { registerOpenApiRoutes } from "./openapi.js";
import { createMemoryBuildRepository } from "../repositories/memory-build-repository.js";
import { PostgresBuildRepository } from "../repositories/postgres-build-repository.js";
import { registerAdminRoutes, createAdminAllowList } from "../routes/admin-routes.js";
import { registerBuildRoutes } from "../routes/build-routes.js";
import { registerHealthRoute } from "../routes/health-route.js";
import { BuildService } from "../services/build-service.js";

// TASK-064 운영 baseline — postgres backend 부팅 시
// `apps/build-server/migrations/` 의 미적용 SQL 을 자동 적용한다.
// `ensureDbSchema` 가 greenfield DDL 을 bootstrap 으로 만들고, 이어서
// 0001~000N 의 brownfield migration 을 차례로 적용한다. 같은 트랜잭션
// 안에서 처리되므로 partial failure 시 자동 rollback.
//
// runtime cwd 기준 상대 path 로 결정 — docker image (WORKDIR=/app) 와
// local 실행 (cwd=REPO_ROOT) 모두 `apps/build-server/migrations/` 가
// cwd 아래 존재. 이전 구현은 `import.meta.url` 의 `../../migrations/` 였는데
// tsc 가 `dist/apps/build-server/src/app/create-app.js` 로 emit 하면
// `../../migrations/` 가 `dist/apps/build-server/migrations/` 를 가리켜
// postgres backend 부팅 시 ENOENT. TASK-075 와 동일한 함정이었으나
// memory backend 가 applyMigrations 를 호출하지 않아 기존엔 잠복.
// TASK-082 multi-runner postgres 운영 검증에서 봉인.
const MIGRATIONS_DIR = join(process.cwd(), "apps/build-server/migrations");

// TASK-075 단일 포트 reverse proxy. Build Server 가 build-monitor 의
// vite build 산출물 (`apps/build-monitor/dist`) 을 정적 서빙 + SPA fallback 으로
// 함께 노출 — Build Server 의 API routes 와 Build Monitor 의 SPA 가 단일 포트
// (default 3000) 에서 동시 접근 가능. Build Server 자체 route (/api/*,
// /openapi, /docs, /admin/* 등) 가 우선 매치되고, 그 외 GET 요청 (deep
// link 포함) 은 모두 index.html 로 SPA fallback.
//
// `BUILD_MONITOR_DIST_PATH` env 가 runtime cwd 기준 상대 path 를 가리키면
// mount. env 가 없으면 single-port reverse-proxy mount 를 skip — Build Server
// 의 API routes 만 응답 (memory backend e2e / unit test 시 의도된 동작).
// tsc 가 `apps/build-server/dist/apps/build-server/src/app/` 로 build 되어
// `import.meta.url` depth 가 build flag (rootDir 유무) 에 따라 흔들리므로
// default cwd-relative path 는 runtime 에서 env 또는 명시 override 로만
// 안정적으로 정렬된다.
//
// dev 환경에선 vite dev server (5173) 가 별도로 떠서 `/api` 를 :3000 으로
// 프록시 (vite.config.ts) — 그 경로는 그대로 유지.

// API rewrite 가 허용되는 prefix (`/api/foo` → `/foo` 307 redirect 의
// 대상). Build Server 의 routes 가 `/builds` 와 `/admin/*` prefix 로
// 등록되어 있으므로 동일 prefix 만 redirect 허용 — 미등록 path 는
// SPA fallback 으로 떨어지지 않고 정직한 404 JSON 으로 응답되어
// consumer 가 잘못된 path 호출을 신뢰성 있게 인지.
const API_REWRITE_ALLOWED_PREFIXES = ["/builds", "/admin/"];

// API/Swagger prefix. SPA fallback 에서 제외 — Build Server 가 자체
// 응답하지 못한 GET path 만 wildcard 가 잡으므로 사실상 catch-all 404
// 케이스에서 JSON 응답을 보장하기 위함. `/api/` 는 별도 분기 (위
// setNotFoundHandler 안에서 307 transparent redirect 로 rewrite) — 본
// constant 에는 들어가지 않음. `/admin/` 도 Build Server 가 registered
// path (예: /admin/builds, /admin/users, /admin/runners, /admin/login,
// /admin/admins) 만 catch 하고 나머지는 SPA fallback 으로 떨어지도록
// wildcard 제외에서 제외한다.
const API_JSON_PREFIXES = ["/openapi", "/docs", "/health"];

export async function createApp(runtime: RuntimeSettings): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true
  });

  // TASK-066: accept the raw source archive bytes uploaded by the
  // Skill as `application/octet-stream`. Fastify's default content
  // type parser only handles JSON and text/plain, so an octet-stream
  // body would otherwise 415. The parser runs the body bytes through
  // `asBuffer()` and exposes them as a `Buffer` on `request.body`,
  // which the `POST /builds/:buildId/source` route then type-guards
  // with `Buffer.isBuffer` before validating. A generous `bodyLimit`
  // is also lifted from the Fastify default (1 MiB) to 256 MiB so
  // realistic source archives fit; this matches the
  // `sourceArchive.sizeBytes` upper bound that callers are expected
  // to honour.
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: 256 * 1024 * 1024 },
    (_request, payload, done) => done(null, payload)
  );

  // OpenAPI / Swagger UI / CORS are registered before any data layer so
  // /docs and /openapi.json are available even when the database is
  // unreachable. When corsOrigin is `false` (CORS disabled) we still keep
  // the OpenAPI routes but skip the @fastify/cors plugin entirely.
  await registerOpenApiRoutes(app, {
    // The internal `string | true` type is wider than @fastify/cors accepts.
    // The openapi module normalizes `true` to "*" for dev. When the env
    // setting is `false`, the cors plugin is skipped entirely.
    corsOrigin: runtime.corsOrigin === false ? true : runtime.corsOrigin,
    skipCors: runtime.corsOrigin === false
  });

  const buildRepository =
    runtime.buildRepositoryBackend === "postgres"
      ? await createPostgresBuildRepository(app, runtime)
      : createMemoryBuildRepository();
  const buildService = new BuildService(buildRepository);

  void registerHealthRoute(app);
  void registerBuildRoutes(app, buildService);

  // Admin endpoints (ADMIN-004, ADMIN-049). The admin allow-list is a
  // mutable Set seeded from `runtime.adminIds` at boot; the list/add/remove
  // helpers (createAdminAllowList) are exposed via /admin/admins/* and the
  // isAdmin guard shares the same Set, so mutations are immediately visible
  // to subsequent /admin/* requests within the same process.
  const adminAllowList = createAdminAllowList(runtime.adminIds);
  await registerAdminRoutes(app, buildService, adminAllowList);

  // TASK-075: build-monitor 의 vite build 산출물을 정적 서빙 + SPA
  // fallback 으로 mount. Build Server 의 자체 route (/api/*, /openapi,
  // /docs, /admin/*, /health) 가 우선 매치되고, 그 외 GET 요청 (deep link)
  // 은 모두 `index.html` 로 SPA fallback 되어 svelte-spa-router 의
  // 클라이언트 라우팅이 자연스럽게 처리. Build Monitor 가 별도 vite dev
  // (5173) 로 떠 있을 때는 단일 포트가 아니라 두 포트, 본 mount 는 그 때
  // 도움 안 됨 — 단, mount 가 빌드 산출물 검색이므로 vite dev 가 같이 떠
  // 있어도 충돌하지 않는다 (5173 이 primary).
  await mountBuildMonitorDist(app);

  return app;
}

/**
 * Build Monitor 의 vite build 산출물 (Svelte + React 2 dist) 을 정적 서빙 +
 * SPA fallback 으로 Build Server 에 mount.
 *
 * TASK-093: Svelte → React frontend rewrite 7-PR 시리즈 6단계. React 빌드
 * (`apps/build-monitor/dist-react/`) 가 primary SPA — `/` + `/assets/*` +
 * `/favicon.svg` + SPA fallback (react-router-dom 가 클라이언트에서 처리).
 * Svelte 빌드 (`apps/build-monitor/dist/`) 는 legacy deep link 호환을 위해
 * `/svelte` + `/svelte/` GET 만 raw stream 으로 응답 — TASK-094 의 Svelte
 * 코드 정리까지 운영자 비교 검증 + legacy URL 보존.
 *
 * env:
 * - `BUILD_MONITOR_DIST_PATH`: Svelte dist path (default `apps/build-monitor/dist`).
 * - `BUILD_MONITOR_REACT_DIST_PATH`: React dist path (default `apps/build-monitor/dist-react`).
 *
 * 어느 dist 가 빌드되지 않았어도 (단위 테스트 환경 등) 조용히 skip — Build
 * Server 자체 route 만 정상 응답. SPA fallback 우선순위는 React index.html
 * (primary) → Svelte index.html (`/svelte/*` deep link) 순.
 *
 * @fastify/static 의 decorateReply: true decorator 는 reply.sendFile 을
 * 단일 dist 만 지원 (중복 등록 시 throw). React 만 @fastify/static 으로
 * mount 하고 Svelte 는 raw fastify route + fs.createReadStream 으로 처리.
 */
async function mountBuildMonitorDist(app: FastifyInstance): Promise<void> {
  const svelteDistDir = process.env.BUILD_MONITOR_DIST_PATH
    ? resolve(process.cwd(), process.env.BUILD_MONITOR_DIST_PATH)
    : resolve(process.cwd(), "apps/build-monitor/dist");

  const reactDistDir = process.env.BUILD_MONITOR_REACT_DIST_PATH
    ? resolve(process.cwd(), process.env.BUILD_MONITOR_REACT_DIST_PATH)
    : resolve(process.cwd(), "apps/build-monitor/dist-react");

  let svelteAvailable = false;
  if (
    existsSync(svelteDistDir) &&
    existsSync(join(svelteDistDir, "index.html"))
  ) {
    mountSvelteIndexHtml(app, svelteDistDir);
    svelteAvailable = true;
    app.log.info(
      { distDir: svelteDistDir },
      "svelte dist mounted (legacy /svelte/* deep link)"
    );
  } else {
    app.log.warn(
      { distDir: svelteDistDir },
      "svelte dist not found — /svelte/* deep link will 404"
    );
  }

  let reactAvailable = false;
  if (
    existsSync(reactDistDir) &&
    existsSync(join(reactDistDir, "index.html"))
  ) {
    await app.register(fastifyStatic, {
      root: reactDistDir,
      prefix: "/",
      decorateReply: true,
      serveDotFiles: false
    });
    reactAvailable = true;
    app.log.info({ distDir: reactDistDir }, "react dist mounted (primary SPA)");
  } else {
    app.log.warn(
      { distDir: reactDistDir },
      "react dist not found — primary SPA fallback skipped"
    );
  }

  if (!svelteAvailable && !reactAvailable) {
    app.log.info(
      "no build-monitor dist available — single-port reverse-proxy mount skipped"
    );
    return;
  }

  // SPA fallback — Build Server 의 fixed route 가 매치되지 않은 GET 만
  // index.html 로 응답. POST/PUT/PATCH/DELETE 는 Build Server 가 자체
  // 응답하지 못한 경우 그대로 404 가 떨어지도록 두어 (SPA 가 아닌
  // 소비자 측 호출 — health probe / Skill 등) 잘못된 path 로 PUT 이
  // SPA HTML 로 응답되어 데이터를 변조하는 사고를 차단.
  //
  // TASK-075 의 `/api/*` 처리 — Build Monitor 가 `baseUrl: '/api'` 로
  // fetch 하기 때문에 browser / Skill 측에서는 모든 API 호출이
  // `/api/builds`, `/api/admin/...` 형태로 옴. Build Server 의 routes 가
  // 본래 `/builds`, `/admin/...` (v5 의 openapi-typescript 자동생성 +
  // shared-contract 의 path 형태) 로 등록되어 있으므로 `/api/` prefix 는
  // 떼고 와야 함. dev 환경에선 vite proxy 의 rewrite 가 이 변환을
  // 담당했지만 (vite.config.ts), production 의 Build Server 자체는 그
  // rewrite 가 없으므로 307 redirect 로 transparent 처리 — fetch 가
  // 자동으로 따라가서 `/builds`, `/admin/...` 로 도착. POST 의 body 도
  // 307 에서 보존됨 (RFC 7231).
  //
  // TASK-093: SPA fallback 우선순위 — `/svelte/*` deep link 는 Svelte
  // index.html (raw stream), 그 외 unknown path 는 React index.html
  // (sendFile) 로 응답.
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split("?")[0]!;
    if (path.startsWith("/api/")) {
      const withoutApi = path.replace(/^\/api/, "");
      const isRegisteredPath = API_REWRITE_ALLOWED_PREFIXES.some((prefix) =>
        withoutApi.startsWith(prefix)
      );
      if (isRegisteredPath) {
        const queryIdx = request.url.indexOf("?");
        const queryStr = queryIdx === -1 ? "" : request.url.slice(queryIdx);
        return reply.redirect(withoutApi + queryStr, 307);
      }
      return reply.code(404).send({ error: "not_found", path });
    }
    const isApiPath = ["/openapi", "/docs", "/health"].some((prefix) =>
      path.startsWith(prefix)
    );
    if (isApiPath) {
      return reply.code(404).send({ error: "not_found", path });
    }
    // TASK-093: /svelte/* deep link — Svelte SPA fallback (raw stream).
    if (path.startsWith("/svelte/") || path === "/svelte") {
      if (!svelteAvailable) {
        return reply
          .code(404)
          .send({ error: "svelte_dist_not_mounted", path });
      }
      const indexPath = join(svelteDistDir, "index.html");
      reply.type("text/html");
      return reply.send(createReadStream(indexPath));
    }
    // 그 외 GET (Build Server 가 등록 안 한 /admin/* deep link 등) 는 React
    // SPA fallback → index.html + react-router-dom 가 클라이언트에서 처리.
    if (reactAvailable) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "no_dist_mounted", path });
  });
}

/**
 * Svelte dist 의 index.html 을 raw `fs.createReadStream` 으로 응답. SPA
 * fallback 시 `/svelte/*` deep link 가 이 index.html 로 응답되어 Svelte
 * svelte-spa-router 가 클라이언트에서 처리.
 *
 * @fastify/static 의 decorateReply: true decorator 가 reply.sendFile 을
 * 단일 dist 만 지원하므로 Svelte mount 는 별도 path. fs.createReadStream +
 * reply.type('text/html') 으로 직접 응답.
 */
function mountSvelteIndexHtml(
  app: FastifyInstance,
  svelteDistDir: string
): void {
  app.get("/svelte", async (_request, reply) => {
    const indexPath = join(svelteDistDir, "index.html");
    if (!existsSync(indexPath)) {
      return reply.code(404).send({ error: "svelte_index_not_found" });
    }
    reply.type("text/html");
    return reply.send(createReadStream(indexPath));
  });

  app.get("/svelte/", async (_request, reply) => {
    const indexPath = join(svelteDistDir, "index.html");
    if (!existsSync(indexPath)) {
      return reply.code(404).send({ error: "svelte_index_not_found" });
    }
    reply.type("text/html");
    return reply.send(createReadStream(indexPath));
  });
}

async function createPostgresBuildRepository(
  app: FastifyInstance,
  runtime: RuntimeSettings
): Promise<PostgresBuildRepository> {
  const pool = createDbPool(runtime.databaseUrl);

  if (runtime.dbAutoBootstrap) {
    // greenfield: CREATE TABLE IF NOT EXISTS bootstrap DDL.
    await ensureDbSchema(pool);
    // brownfield: 0001~000N SQL 을 schema_migrations 추적 위에서 idempotent 적용.
    const result = await applyMigrations(pool, { migrationsDir: MIGRATIONS_DIR });
    if (result.applied.length > 0) {
      app.log.info(
        { applied: result.applied.map((m) => m.version) },
        "applied pending migrations on bootstrap"
      );
    }
  }

  app.addHook("onClose", async () => {
    await pool.end();
  });

  return new PostgresBuildRepository(createDbClientFromPool(pool));
}
