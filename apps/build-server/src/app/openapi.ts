import { createRequire } from "node:module";

import {
  OpenAPIRegistry,
  OpenApiGeneratorV3
} from "@asteasolutions/zod-to-openapi";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ZodTypeAny } from "zod";

// CJS plugins (@fastify/cors, @fastify/swagger, @fastify/swagger-ui) expose
// their fastify-plugin wrapped function as `module.exports` itself, not
// under a separate `default` field when loaded from CJS. Dynamic ESM
// import wraps them in a namespace where `.default` works, but the
// fastify plugin then sees the namespace object instead of the function
// and silently drops the `opts` argument. `createRequire` gives us a
// CJS-style require that returns the function directly.
const projectRequire = createRequire(import.meta.url);

import {
  buildErrorSchema,
  buildAcceptedResponseSchema,
  buildDuplicateResponseSchema,
  buildStatusResponseSchema,
  buildLogsResponseSchema,
  claimRequestSchema,
  claimResponseSchema,
  phaseUpdateRequestSchema,
  testDeploymentSchema,
  testDeploymentQueueRequestSchema,
  testDeploymentQueueResponseSchema,
  testDeploymentReadyRequestSchema,
  testDeploymentStatusRequestSchema,
  sourceArchiveSchema,
  buildRequestSchema,
  openapiTags
} from "@docker-image-builder-system/shared-contract";

const registry = new OpenAPIRegistry();

// Register every canonical schema once so it lands in `components.schemas`.
// The `id` set via `.meta({ id })` is what binds each component to its
// `$ref` site. Re-registering with the same id is a no-op for the generator.
// Each component is registered with a stable id that matches the
// `.meta({ id })` set in shared-contract. This is the canonical
// mapping from `components.schemas.<Id>` to the underlying zod schema.
const componentSchemas: ReadonlyArray<{ id: string; schema: ZodTypeAny }> = [
  { id: "BuildError", schema: buildErrorSchema },
  { id: "BuildAcceptedResponse", schema: buildAcceptedResponseSchema },
  { id: "BuildDuplicateResponse", schema: buildDuplicateResponseSchema },
  { id: "BuildStatusResponse", schema: buildStatusResponseSchema },
  { id: "BuildLogsResponse", schema: buildLogsResponseSchema },
  { id: "ClaimRequest", schema: claimRequestSchema },
  { id: "ClaimResponse", schema: claimResponseSchema },
  { id: "PhaseUpdateRequest", schema: phaseUpdateRequestSchema },
  { id: "TestDeployment", schema: testDeploymentSchema },
  { id: "TestDeploymentQueueRequest", schema: testDeploymentQueueRequestSchema },
  { id: "TestDeploymentQueueResponse", schema: testDeploymentQueueResponseSchema },
  { id: "TestDeploymentReadyRequest", schema: testDeploymentReadyRequestSchema },
  { id: "TestDeploymentStatusRequest", schema: testDeploymentStatusRequestSchema },
  { id: "SourceArchive", schema: sourceArchiveSchema },
  { id: "BuildRequest", schema: buildRequestSchema }
];

for (const { id, schema } of componentSchemas) {
  // 8.x signature: `register(refId, zodSchema)`. The refId is the
  // `components.schemas.<id>` key and must match the `.meta({ id })`.
  registry.register(id, schema);
}

// Path registrations: every route registered in `apps/build-server/src/routes`
// is described here exactly once. The OpenAPI document is rebuilt on each
// `/openapi.json` request, so all paths must be present in the registry at
// call time. Order matches `apps/build-server/src/routes/build-routes.ts`.
registry.registerPath({
  method: "post",
  path: "/builds",
  description: "Submit a new build request. Returns 202 with the new buildId, or 409 if a build for the same sourceArchive+tag is already in flight.",
  tags: ["Builds"],
  request: { body: { content: { "application/json": { schema: buildRequestSchema } } } },
  responses: {
    202: { description: "Build accepted.", content: { "application/json": { schema: buildAcceptedResponseSchema } } },
    409: { description: "A matching build is already in flight.", content: { "application/json": { schema: buildDuplicateResponseSchema } } }
  }
});
registry.registerPath({
  method: "get",
  path: "/builds/{buildId}",
  description: "Fetch current status, phases, and preview info for a build.",
  tags: ["Builds"],
  request: { params: z.object({ buildId: z.string().uuid() }) },
  responses: { 200: { description: "Build status.", content: { "application/json": { schema: buildStatusResponseSchema } } } }
});
registry.registerPath({
  method: "get",
  path: "/builds/{buildId}/logs",
  description: "Append log entries since the cursor and report the latest cursor.",
  tags: ["Builds"],
  request: { params: z.object({ buildId: z.string().uuid() }), query: z.object({ since: z.string().optional() }) },
  responses: { 200: { description: "Logs batch.", content: { "application/json": { schema: buildLogsResponseSchema } } } }
});
registry.registerPath({
  method: "post",
  path: "/builds/claim",
  description: "Runner long-poll: claim the next pending build. 204 if no work.",
  tags: ["Runner Claim"],
  request: { body: { content: { "application/json": { schema: claimRequestSchema } } } },
  responses: { 200: { description: "Claimed build.", content: { "application/json": { schema: claimResponseSchema } } } }
});
registry.registerPath({
  method: "post",
  path: "/builds/{buildId}/phase",
  description: "Runner reports a phase transition (DOCKER_BUILD_STARTED, COMPLETED, FAILED, ...).",
  tags: ["Runner Claim"],
  request: { params: z.object({ buildId: z.string().uuid() }), body: { content: { "application/json": { schema: phaseUpdateRequestSchema } } } },
  responses: { 200: { description: "Phase updated." } }
});
registry.registerPath({
  method: "post",
  path: "/builds/{buildId}/preview",
  description: "Queue a test deployment once the build reaches DOCKER_BUILD_COMPLETED.",
  tags: ["Test Deployment"],
  request: { params: z.object({ buildId: z.string().uuid() }), body: { content: { "application/json": { schema: testDeploymentQueueRequestSchema } } } },
  responses: { 202: { description: "Preview queued.", content: { "application/json": { schema: testDeploymentQueueResponseSchema } } } }
});
registry.registerPath({
  method: "post",
  path: "/builds/{buildId}/test-deployment/ready",
  description: "Runner reports the preview is reachable.",
  tags: ["Test Deployment"],
  request: { params: z.object({ buildId: z.string().uuid() }), body: { content: { "application/json": { schema: testDeploymentReadyRequestSchema } } } },
  responses: { 200: { description: "Preview marked ready." } }
});
registry.registerPath({
  method: "post",
  path: "/builds/{buildId}/test-deployment/status",
  description: "Runner reports general preview status (PROVISIONING, FAILED, EXPIRED).",
  tags: ["Test Deployment"],
  request: { params: z.object({ buildId: z.string().uuid() }), body: { content: { "application/json": { schema: testDeploymentStatusRequestSchema } } } },
  responses: { 200: { description: "Status recorded." } }
});
registry.registerPath({
  method: "get",
  path: "/builds/{buildId}/test-deployment",
  description: "Fetch the current test deployment record for a build (if any).",
  tags: ["Test Deployment"],
  request: { params: z.object({ buildId: z.string().uuid() }) },
  responses: { 200: { description: "Test deployment present.", content: { "application/json": { schema: testDeploymentSchema } } } }
});
registry.registerPath({
  method: "get",
  path: "/health",
  description: 'Liveness probe. Always 200 with `{ status: "ok" }`.',
  tags: ["Health"],
  responses: { 200: { description: "Service is alive." } }
});

export function getOpenApiDocument(): unknown {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Docker Image Builder — Build Server API",
      version: "0.1.0",
      description:
        "HTTP contract exposed by the Build Server (PKG-001~PKG-006). The Go Runner consumes the Runner Claim and Test Deployment tag groups; the Skill layer consumes the Builds group. Generated from zod schemas in @docker-image-builder-system/shared-contract."
    },
    tags: Object.values(openapiTags).map((tag) => ({
      name: tag.name,
      description: tag.description
    }))
  });
}

export async function registerOpenApiRoutes(
  app: FastifyInstance,
  options: { corsOrigin: string | true; skipCors?: boolean }
): Promise<void> {
  // The `false` branch of the shared-config setting (CORS disabled) is
  // expressed here as `true` (any origin) so we never reach @fastify/cors
  // with an unsupported value. Callers that need to disable CORS should
  // simply omit the registration at the application bootstrap layer.
  // CORS is needed so the future frontend workspace (Vite default 5173)
  // can call the API directly. Wildcard `true` is allowed for dev; tighten
  // via env later.
  if (!options.skipCors) {
    // Hand-rolled CORS: @fastify/cors dropped because its ESM dynamic
    // import + fastify-plugin fp wrapping silently dropped `opts` in our
    // workspace setup. The behaviour we need for the future Vite
    // frontend (port 5173) and the Skill layer is straightforward:
    // echo the incoming `Origin` (or `*` when wildcard), allow the
    // methods we expose, and short-circuit OPTIONS preflight with 204.
    const allowOrigin =
      options.corsOrigin === true ? "*" : options.corsOrigin;
    const allowMethods = "GET,POST,DELETE,OPTIONS";
    const allowHeaders = "Content-Type,Authorization";

    app.addHook("onRequest", async (request, reply) => {
      // Set the CORS headers on every request as early as possible so they
      // are present even when the route handler short-circuits via
      // `reply.send()`. Fastify preserves reply.header() values set in
      // onRequest because they are written into the response object before
      // the handler runs.
      reply.header("Access-Control-Allow-Origin", allowOrigin);
      reply.header("Access-Control-Allow-Methods", allowMethods);
      reply.header("Access-Control-Allow-Headers", allowHeaders);
      reply.header("Access-Control-Max-Age", "600");
    });

    // Preflight (OPTIONS) must be answered without invoking the route
    // handler. We register an explicit OPTIONS route that returns 204
    // and lets the headers above ride along. The path :_ supports any
    // URL so preflight works for every endpoint we expose.
    app.options("/:_(.*)", async (_request, reply) => {
      return reply.code(204).send();
    });
  }

  const swagger = projectRequire("@fastify/swagger");
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "Docker Image Builder — Build Server API",
        version: "0.1.0"
      }
    }
  });

  const swaggerUi = projectRequire("@fastify/swagger-ui");
  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      displayRequestDuration: true
    },
    staticCSP: true
  });

  // The full document is rebuilt from the registry on each request so route
  // definitions registered later in `createApp` are reflected. Cheap for our
  // scale; Fastify schema lifecycle does not need live-reloading.
  app.get("/openapi.json", async () => getOpenApiDocument());
}
