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
import { ServiceDatabaseProvisioner } from "../services/service-database-provisioner.js";
import { KubectlSecretWriter } from "../services/k8s-secret-writer.js";
import {
  postHostingCapacityDriftAlert,
  shouldSendDriftAlert,
  startHostingCapacityMonitor
} from "../services/hosting-capacity-monitor.js";
import { createHmacSessionAdapter, createOidcSessionAdapter, type SessionAdapter } from "../auth/session-adapter.js";
import type { OidcRouteOptions } from "../routes/oidc-routes.js";
import { registerOidcRoutes } from "../routes/oidc-routes.js";

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
const MIGRATIONS_DIR = existsSync(join(process.cwd(), "apps/build-server/migrations"))
  ? join(process.cwd(), "apps/build-server/migrations")
  : join(process.cwd(), "migrations");

// TASK-110: STRICT_CONTENT_RANGE env flag parser. Recognised truthy
// values are `"true"`, `"1"`, `"yes"` (case-insensitive); anything
// else (including unset) maps to `false` so the default remains the
// TASK-108/109 lenient behaviour. We do NOT honour `"true"` flag in
// the route layer — it's a deployment-policy switch, not a
// per-request parameter, so we read it once at startup and feed it
// through the BuildService constructor.
function parseStrictContentRangeFlag(env: NodeJS.ProcessEnv): boolean {
  const raw = env.STRICT_CONTENT_RANGE;
  if (typeof raw !== "string") return false;
  const normalised = raw.trim().toLowerCase();
  return normalised === "true" || normalised === "1" || normalised === "yes";
}

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
const API_REWRITE_ALLOWED_PREFIXES = ["/builds", "/services", "/admin/"];

// API documentation prefix. SPA fallback 에서 제외 — Build Server 가 자체
// 응답하지 못한 GET path 만 wildcard 가 잡으므로 사실상 catch-all 404
// 케이스에서 JSON 응답을 보장하기 위함. `/api/` 는 별도 분기 (위
// setNotFoundHandler 안에서 307 transparent redirect 로 rewrite) — 본
// constant 에는 들어가지 않음. `/admin/` 도 Build Server 가 registered
// path (예: /admin/builds, /admin/users, /admin/runners, /admin/login,
// /admin/admins) 만 catch 하고 나머지는 SPA fallback 으로 떨어지도록
// wildcard 제외에서 제외한다.
const API_JSON_PREFIXES = ["/openapi", "/docs", "/health", "/ready"];

// 브라우저 문서 내비게이션이어도 SPA 로 가로채지 않을 prefix. Scalar API Reference
// (`/docs`) 와 OpenAPI 문서는 운영자가 주소창으로 직접 여는 대상이고,
// `/api/*` 는 프론트엔드 fetch 의 정식 진입점이라 리다이렉트 계약을
// 유지해야 한다. `/assets/` 는 빌드 산출물 정적 경로.
const SPA_NAVIGATION_EXCLUDED_PREFIXES = ["/api/", "/openapi", "/docs", "/health", "/ready", "/assets/"];

export type CreateAppOptions = {
  oidc?: OidcRouteOptions;
  sessionAdapter?: SessionAdapter;
};

export async function createApp(runtime: RuntimeSettings, options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true
  });

  // Identity boundary for deployments that provide AUTH_SECRET. The legacy
  // header mode remains available when unset so existing local fixtures can
  // migrate independently; once enabled, the server derives owner/admin
  // headers from the verified principal and ignores caller-supplied values.
  const authSecret = runtime.authSecret?.trim() || process.env.AUTH_SECRET?.trim() || "";
  const sessionAdapter = options.sessionAdapter ??
    (options.oidc ? createOidcSessionAdapter(options.oidc.store, options.oidc.cookieName) : null) ??
    (authSecret ? createHmacSessionAdapter(authSecret) : null);
  const authMode = runtime.authMode ?? (process.env.AUTH_MODE === "required" ? "required" : "legacy");
  if (authMode === "required" && !authSecret) {
    throw new Error("AUTH_MODE=required needs AUTH_SECRET to be configured.");
  }
  if (authMode === "oidc" && !options.oidc && !options.sessionAdapter) {
    throw new Error("AUTH_MODE=oidc requires an OIDC session adapter to be configured.");
  }
  if (options.oidc) registerOidcRoutes(app, options.oidc);
  if (authMode === "disabled") {
    // Explicit open-deployment mode: identity is still supplied by the
    // caller's registration ID for tenant-scoped views, but it is not
    // cryptographically authenticated. Admin route guards retain the seed
    // identity solely for legacy compatibility; normal build/service views
    // use the supplied X-User-Id and are marked as a regular user.
    const openIdentity = runtime.adminIds[0] ?? "public";
    app.addHook("onRequest", async (request) => {
      const supplied = request.headers["x-user-id"] ?? request.headers["x-admin-id"];
      const callerId = typeof supplied === "string" && supplied.trim() !== "" ? supplied.trim() : "public";
      request.headers["x-admin-id"] = openIdentity;
      request.headers["x-user-id"] = callerId;
      request.headers["x-principal-role"] = "user";
    });
  }
  if (runtime.nodeEnv === "production") {
    if (runtime.corsOrigin === true) {
      app.log.warn("CORS wildcard is enabled in production; set CORS_ORIGIN to an explicit origin.");
    }
    if (authMode === "legacy") {
      app.log.warn("AUTH_MODE=legacy is enabled in production; set AUTH_MODE=required after provisioning tokens.");
    }
  }
  if (sessionAdapter && authMode !== "disabled") {
    app.addHook("onRequest", async (request, reply) => {
      const path = request.url.split("?", 1)[0] ?? "";
      const segments = path.split("/").filter(Boolean);
      const isPublicBuildApi =
        (path === "/builds" && request.method === "POST") ||
        (segments[0] === "builds" && segments.length >= 2 && segments[1] !== "claim" &&
          ((segments.length === 3 && segments[2] === "source" && request.method === "POST") ||
            (segments.length === 4 && segments[2] === "source" && segments[3] === "chunk" && request.method === "POST")));
      if (
        path === "/health" ||
        path === "/openapi.json" ||
        path.startsWith("/docs") ||
        path.startsWith("/assets/")
      ) {
        return;
      }
      // Build intake is intentionally public: untrusted users may submit a
      // build and identify themselves through the request's appName and
      // requestedBy fields. Only admin and runner control surfaces require a
      // cryptographic principal in this phase.
      if (isPublicBuildApi) return;
      if (!(path === "/services" || path.startsWith("/builds") || path.startsWith("/admin/"))) {
        return;
      }
      const principal =
        (await sessionAdapter?.verifyRequest({
          authorization: request.headers.authorization,
          cookie: request.headers.cookie
        })) ?? null;
      if (!principal) {
        return reply.status(401).send({ message: "Bearer authentication required." });
      }
      if (path.startsWith("/admin/") && !principal.roles.includes("admin")) {
        return reply.status(403).send({ message: "Admin role required." });
      }
      request.headers["x-user-id"] = principal.subject;
      request.headers["x-admin-id"] = principal.subject;
      request.headers["x-principal-role"] = principal.roles.includes("admin") ? "admin" : "user";
    });
  }

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

  // OpenAPI / Scalar API Reference / CORS are registered before any data layer so
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
      : createMemoryBuildRepository(runtime.hostingCapacity);
  // TASK-110: STRICT_CONTENT_RANGE env flag mirror. When set to
  // "true"/"1"/"yes" the BuildService enforces numeric Content-Range
  // totals on chunk uploads — callers that supply `*` (RFC 7233
  // §4.2 unknown total) get a 400 `content_range_invalid`. Off by
  // default so existing TASK-108/109 callers keep working. See
  // `docs/operations/content-range-rfc-7233-strict-mode-2026-07-20.md`
  // for the rollout playbook.
  const strictContentRange = parseStrictContentRangeFlag(process.env);
  // TASK-165 (P2-M5): 결과 전달 webhook. 설정 시 build 가 terminal 에 도달할
  // 때 canonical BuildStatusResponse 를 이 URL 로 POST 한다(NOTIFICATION).
  // 빈 문자열/미설정이면 undefined 로 넘겨 기존 POLLING 만 유지.
  const resultWebhookUrl =
    process.env.RESULT_WEBHOOK_URL && process.env.RESULT_WEBHOOK_URL.trim() !== ""
      ? process.env.RESULT_WEBHOOK_URL.trim()
      : undefined;
  // TASK-167 (P3-M2): 호스팅 base host. 설정 시 배포 성공 보고가 HostedService
  // 를 upsert 하고 접속 URL 을 조립한다. 미설정이면 호스팅 비활성(opt-in).
  const hostingBaseHost =
    process.env.HOSTING_BASE_HOST && process.env.HOSTING_BASE_HOST.trim() !== ""
      ? process.env.HOSTING_BASE_HOST.trim()
      : undefined;
  const leaseTimeoutMs = (() => {
    const raw = process.env.BUILD_LEASE_TIMEOUT_MS?.trim();
    if (!raw) return 15 * 60 * 1000;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : 15 * 60 * 1000;
  })();
  const buildService = new BuildService(buildRepository, {
    strictContentRange,
    hostingCapacity: runtime.hostingCapacity,
    resultWebhookUrl,
    hostingBaseHost,
    leaseTimeoutMs
  });

  // Capacity drift monitoring is opt-in. When enabled, compare the configured
  // admission budget with current Kubernetes node allocatable and warn on a
  // material drop; admission remains conservative until operators update env.
  if (runtime.hostingCapacityDriftCheckIntervalMs > 0) {
    let lastDriftAlertAt = 0;
    let lastDriftReason: string | undefined;
    const capacityMonitor = startHostingCapacityMonitor({
      configured: runtime.hostingCapacity,
      reserveRatio: runtime.hostingCapacityReserveRatio,
      threshold: runtime.hostingCapacityDriftThreshold,
      intervalMs: runtime.hostingCapacityDriftCheckIntervalMs,
      onDrift: (drift, observed) => {
        app.log.warn(
          { drift, configured: runtime.hostingCapacity, observed },
          "hosting capacity drift detected"
        );
        const now = Date.now();
        const shouldAlert = shouldSendDriftAlert(
          now,
          lastDriftAlertAt,
          runtime.hostingCapacityDriftAlertCooldownMs,
          lastDriftReason,
          drift.reason
        );
        if (runtime.hostingCapacityDriftAlertWebhookUrl && shouldAlert) {
          lastDriftAlertAt = now;
          lastDriftReason = drift.reason;
          void postHostingCapacityDriftAlert(
            runtime.hostingCapacityDriftAlertWebhookUrl,
            drift,
            runtime.hostingCapacity,
            observed
          ).catch((error) => {
            app.log.warn({ err: error }, "hosting capacity drift alert delivery failed");
          });
        } else if (runtime.hostingCapacityDriftAlertWebhookUrl) {
          app.log.info(
            { cooldownMs: runtime.hostingCapacityDriftAlertCooldownMs, reason: drift.reason },
            "hosting capacity drift alert suppressed by cooldown"
          );
        }
      },
      onError: (error) => {
        app.log.warn({ err: error }, "hosting capacity drift check failed");
      }
    });
    app.addHook("onClose", async () => capacityMonitor.stop());
  }

  // TASK-174 (v0.7.0): 호스팅 status 캐시 주기 sync. hosting opt-in
  // (HOSTING_BASE_HOST 설정)이고 interval>0 일 때만 기동 — 미설정 배포에서는
  // kubectl 호출을 만들지 않는다. 프로세스 최초의 background job: .unref() 로
  // 이벤트 루프를 붙잡지 않고, onClose 에서 정리한다. 각 tick 은 격리되어
  // (실패해도 다음 tick 계속) 관리 명령/desired status 와 충돌하지 않는다.
  // HOSTING_STATUS_SYNC_INTERVAL_MS=0 으로 명시적 비활성 가능(기본 30s).
  const syncIntervalMs = (() => {
    const raw = process.env.HOSTING_STATUS_SYNC_INTERVAL_MS?.trim();
    if (raw === undefined || raw === "") return 30_000;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 30_000;
  })();
  if (hostingBaseHost && syncIntervalMs > 0) {
    const timer = setInterval(() => {
      buildService.syncHostedServiceStatuses().then(
        (r) => {
          if (r.failed > 0) {
            app.log.warn(r, "hosting status sync completed with failures");
          }
        },
        (err) => app.log.error({ err }, "hosting status sync tick failed")
      );
    }, syncIntervalMs);
    timer.unref();
    app.addHook("onClose", async () => {
      clearInterval(timer);
    });
  }

  void registerHealthRoute(app);
  void registerBuildRoutes(app, buildService);

  // Admin endpoints (ADMIN-004, ADMIN-049). The admin allow-list is a
  // mutable Set seeded from `runtime.adminIds` at boot; the list/add/remove
  // helpers (createAdminAllowList) are exposed via /admin/admins/* and the
  // isAdmin guard shares the same Set, so mutations are immediately visible
  // to subsequent /admin/* requests within the same process.
  const adminAllowList = createAdminAllowList(runtime.adminIds);
  const serviceDatabasePool = runtime.buildRepositoryBackend === "postgres" ? createDbPool(runtime.databaseUrl) : undefined;
  if (serviceDatabasePool) app.addHook("onClose", async () => serviceDatabasePool.end());
  await registerAdminRoutes(app, buildService, adminAllowList, serviceDatabasePool ? {
    provisioner: new ServiceDatabaseProvisioner(serviceDatabasePool),
    secretWriter: new KubectlSecretWriter(),
    gatewayHost: process.env.SERVICE_DB_GATEWAY_HOST?.trim() ?? "",
    databaseName: process.env.SERVICE_DB_DATABASE_NAME?.trim() || "dibs"
  } : undefined);

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
 * Build Monitor 의 React vite build 산출물 (`apps/build-monitor/dist-react`)
 * 을 정적 서빙 + SPA fallback 으로 Build Server 에 mount.
 *
 * TASK-094: Svelte → React frontend rewrite 7-PR 시리즈 7단계 (final). 본
 * TASK 는 TASK-093 의 2-dist (React primary + Svelte legacy) 구조에서
 * Svelte mount + legacy env + SPA fallback 분기를 모두 제거하고 React only
 * 로 단순화. Svelte 측 진입점은 `BuildDetailRedirect.svelte` 가 React SPA
 * 의 `/builds/<id>` 로 즉시 redirect — 운영자가 BuildDetail deep link 를
 * 그대로 사용 가능.
 *
 * env:
 * - `BUILD_MONITOR_REACT_DIST_PATH`: React dist path (default
 *   `apps/build-monitor/dist-react`). env 미설정 시 workspace root 기준
 *   default path 사용.
 *
 * React dist 가 빌드되지 않은 경우 (단위 테스트 환경 등) 조용히 skip —
 * Build Server 자체 route 만 응답.
 *
 * SPA fallback: Build Server 의 fixed route 가 매치되지 않은 GET 만 React
 * index.html 로 응답. `/api/*` / `/openapi` / `/docs` / `/health` prefix 는
 * JSON 404 (HTML fallback 회피).
 */
async function mountBuildMonitorDist(app: FastifyInstance): Promise<void> {
  const reactDistDir = process.env.BUILD_MONITOR_REACT_DIST_PATH
    ? resolve(process.cwd(), process.env.BUILD_MONITOR_REACT_DIST_PATH)
    : resolve(process.cwd(), "apps/build-monitor/dist-react");

  if (!existsSync(reactDistDir) || !existsSync(join(reactDistDir, "index.html"))) {
    app.log.warn(
      { distDir: reactDistDir },
      "react dist not found — single-port reverse-proxy mount skipped. " +
        "Run `pnpm --filter @docker-image-builder-system/build-monitor build:react` first."
    );
    return;
  }

  await app.register(fastifyStatic, {
    root: reactDistDir,
    prefix: "/",
    decorateReply: true,
    serveDotFiles: false
  });

  app.log.info({ distDir: reactDistDir }, "react dist mounted (single SPA)");

  // 브라우저 문서 내비게이션은 SPA 로 (2026-07-21 UI 검수).
  //
  // 문제: SPA 라우트 `/builds`, `/admin/builds` 는 Build Server 의 API route
  // 와 경로가 겹친다. API route 가 먼저 매치되므로 운영자가 주소창에
  // `/builds` 를 직접 입력하면 화면 대신 원시 JSON 이 뜨고, `/admin/builds`
  // 는 `{"message":"Admin id header missing."}` 401 이 뜬다. 등록되지 않은
  // path 만 처리하는 setNotFoundHandler 로는 잡을 수 없다 — 이 경로들은
  // "등록된" 경로이기 때문. 그래서 라우팅 이전 단계인 onRequest 에서 가른다.
  //
  // 판정 기준은 `Accept: text/html`인 문서 요청이다. 브라우저 주소창 이동은
  // 보통 `Sec-Fetch-Dest: document`도 보내지만, Tailscale/reverse proxy,
  // Safari, 일부 embedded browser는 이 헤더를 제거할 수 있다. 따라서
  // `Sec-Fetch-Dest`가 없을 때도 HTML 수락 의사가 명확하면 SPA로 처리한다.
  // fetch/XHR의 `Sec-Fetch-Dest: empty`, iframe의 `iframe`, 이미지·스크립트의
  // `image`/`script`는 여전히 API 응답을 유지한다.
  // 따라서 프론트엔드의 `/api/*` 호출과 runner 의 bare `/builds/claim` 호출은
  // 이 분기에 걸리지 않는다 — 기존 API 계약은 무변경.
  //
  // `Accept`가 없는 curl/runner 요청은 종전대로 JSON을 받는다. 규칙이
  // 암묵적이므로 회귀 가드로 고정해 둔다 (tests/static-serve.test.ts).
  app.addHook("onRequest", async (request, reply) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return;
    }
    const fetchDest = request.headers["sec-fetch-dest"];
    if (fetchDest && fetchDest !== "document") {
      return;
    }
    if (!(request.headers.accept ?? "").includes("text/html")) {
      return;
    }
    const path = request.url.split("?")[0]!;
    // API / 문서 UI 는 브라우저로 직접 열어야 하므로 가로채지 않는다.
    if (SPA_NAVIGATION_EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return;
    }
    reply.type("text/html");
    return reply.send(createReadStream(join(reactDistDir, "index.html")));
  });

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
  // TASK-094: React SPA 가 `/builds/<id>` 와 `/admin/*` deep link 도 직접
  // 처리 — Build Server 의 `/builds/:buildId` route (UUID validation) 가
  // SPA fallback 보다 먼저 매치되어 500 응답하는 문제 봉인. React 측의
  // `/api/builds/<id>` GET 요청은 `/builds/<id>` (Build Server) 가 아닌
  // `/api/builds/<id>` (Build Server 의 route 와 매치) 로 도달하므로 SPA
  // 와 충돌 없음. setNotFoundHandler 는 wildcard GET 만 잡으므로
  // Build Server 의 route 가 먼저 매치 — SPA fallback 이 동작하려면
  // Build Server 의 `/builds/:buildId` 같은 wildcard route 가 매치
  // 안되도록 prefix 분리. 본 TASK 에서는 단순화: Build Server 의
  // wildcard GET route 가 매치 안 되는 path 만 setNotFoundHandler 로
  // 전달 — 실제 운영에서 `/builds/<id>` 직접 URL 입력 시 Build Server
  // route 가 UUID validation 으로 거절, React SPA 가 그 path 에서만
  // 동작. 단, Build Monitor 가 fetch 시 `/api/builds/<id>` 로 호출하므로
  // 정합 영향 0.
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split("?")[0]!;
    // Vite `base: "./"` is required for path-hosted services, but a deep
    // SPA URL such as `/admin/builds` makes the browser resolve `./assets/*`
    // as `/admin/assets/*`.  Normalize that deep-link suffix here, before
    // the generic SPA fallback can return index.html with a JavaScript MIME
    // type.  The ingress has already stripped the service context prefix.
    const assetMarker = "/assets/";
    const assetIndex = path.indexOf(assetMarker);
    if (assetIndex >= 0) {
      const relativeAsset = path.slice(assetIndex + 1);
      if (!relativeAsset.includes("..")) {
        return reply.sendFile(relativeAsset);
      }
    }
    if (path.endsWith("/favicon.svg")) {
      return reply.sendFile("favicon.svg");
    }
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
    const isApiPath = ["/openapi", "/docs", "/health", "/ready"].some((prefix) =>
      path.startsWith(prefix)
    );
    if (isApiPath) {
      return reply.code(404).send({ error: "not_found", path });
    }
    // 그 외 GET (Build Server 가 등록 안 한 /admin/* deep link 등) 는 React
    // SPA fallback → index.html + react-router-dom 가 클라이언트에서 처리.
    // @fastify/static 의 reply.sendFile 가 path resolution 에 실패하는
    // 케이스가 있어 fs.createReadStream 으로 직접 응답.
    const indexPath = join(reactDistDir, "index.html");
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

  return new PostgresBuildRepository(createDbClientFromPool(pool), runtime.hostingCapacity);
}
