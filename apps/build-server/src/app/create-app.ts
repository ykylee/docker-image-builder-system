import Fastify, { type FastifyInstance } from "fastify";
import {
  createDbClientFromPool,
  createDbPool,
  ensureDbSchema
} from "@docker-image-builder-system/db";
import type { RuntimeSettings } from "@docker-image-builder-system/shared-config";

import { registerOpenApiRoutes } from "./openapi.js";
import { createMemoryBuildRepository } from "../repositories/memory-build-repository.js";
import { PostgresBuildRepository } from "../repositories/postgres-build-repository.js";
import { registerBuildRoutes } from "../routes/build-routes.js";
import { registerHealthRoute } from "../routes/health-route.js";
import { BuildService } from "../services/build-service.js";

export async function createApp(runtime: RuntimeSettings): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true
  });

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

  return app;
}

async function createPostgresBuildRepository(
  app: FastifyInstance,
  runtime: RuntimeSettings
): Promise<PostgresBuildRepository> {
  const pool = createDbPool(runtime.databaseUrl);

  if (runtime.dbAutoBootstrap) {
    await ensureDbSchema(pool);
  }

  app.addHook("onClose", async () => {
    await pool.end();
  });

  return new PostgresBuildRepository(createDbClientFromPool(pool));
}
