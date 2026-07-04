import Fastify, { type FastifyInstance } from "fastify";
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
// 0001~0003 의 brownfield migration 을 차례로 적용한다. 같은 트랜잭션
// 안에서 처리되므로 partial failure 시 자동 rollback.
const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url).pathname;

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

  return app;
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
