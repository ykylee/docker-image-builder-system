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
  adminListBuildsQuerySchema,
  adminListBuildsResponseSchema,
  adminUserBuildSummarySchema,
  adminUserListResponseSchema,
  buildErrorSchema,
  buildAcceptedResponseSchema,
  buildCurrentPhaseSchema,
  buildDuplicateResponseSchema,
  buildImageSchema,
  buildLifecycleSchema,
  buildListQuerySchema,
  buildListResponseSchema,
  buildStatusResponseSchema,
  buildLogsResponseSchema,
  claimRequestSchema,
  claimResponseSchema,
  containerTestResultSchema,
  deploymentReportRequestSchema,
  deploymentResultSchema,
  phaseUpdateRequestSchema,
  resultDeliverySchema,
  testDeploymentSchema,
  testDeploymentQueueRequestSchema,
  testDeploymentQueueResponseSchema,
  testDeploymentReadyRequestSchema,
  testDeploymentStatusRequestSchema,
  sourceArchiveSchema,
  sourceArchiveUploadResponseSchema,
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
  { id: "BuildLifecycle", schema: buildLifecycleSchema },
  { id: "BuildCurrentPhase", schema: buildCurrentPhaseSchema },
  { id: "BuildImage", schema: buildImageSchema },
  { id: "ContainerTestResult", schema: containerTestResultSchema },
  { id: "DeploymentReportRequest", schema: deploymentReportRequestSchema },
  { id: "DeploymentResult", schema: deploymentResultSchema },
  { id: "ResultDelivery", schema: resultDeliverySchema },
  { id: "BuildListQuery", schema: buildListQuerySchema },
  { id: "BuildListResponse", schema: buildListResponseSchema },
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
  { id: "SourceArchiveUploadResponse", schema: sourceArchiveUploadResponseSchema },
  { id: "BuildRequest", schema: buildRequestSchema },
  { id: "AdminListBuildsQuery", schema: adminListBuildsQuerySchema },
  { id: "AdminListBuildsResponse", schema: adminListBuildsResponseSchema },
  { id: "AdminUserBuildSummary", schema: adminUserBuildSummarySchema },
  { id: "AdminUserListResponse", schema: adminUserListResponseSchema }
];

// Component registry. We keep a Map from canonical component id to a
// refId-bearing clone of each schema. @asteasolutions/zod-to-openapi 8.5
// emits a schema under `components.schemas.<id>` only when the schema
// passed to `register` was created (or cloned) by `.openapi(id)`. Calling
// `.openapi()` returns a new zod instance, so we must use that clone both
// for the registry and for any `registerPath` call that wants the path to
// render as `$ref: '#/components/schemas/<id>'`. The component lookup
// map is also reused in the admin path registrations below so the
// `/admin/builds` query schema shares the `AdminListBuildsQuery` ref.
type ZodWithOpenApi = {
  openapi: (refId: string, meta?: Record<string, unknown>) => unknown;
};
const componentById = new Map<string, ZodTypeAny>();
for (const { id, schema } of componentSchemas) {
  const description = (schema as { description?: string }).description;
  const tagged = (schema as unknown as ZodWithOpenApi).openapi(
    id,
    description ? { description } : {}
  );
  componentById.set(id, tagged as ZodTypeAny);
  registry.register(id, tagged as ZodTypeAny);
}
const component = (id: string): ZodTypeAny => {
  const v = componentById.get(id);
  if (!v) {
    throw new Error(`Unknown component id: ${id}`);
  }
  return v;
};

// Path registrations: every route registered in `apps/build-server/src/routes`
// is described here exactly once. The OpenAPI document is rebuilt on each
// `/openapi.json` request, so all paths must be present in the registry at
// call time. Order matches `apps/build-server/src/routes/build-routes.ts`.
registry.registerPath({
  method: "get",
  path: "/builds",
  description: "List build summaries in createdAt-desc order with optional status filter and cursor pagination.",
  tags: ["Builds"],
  request: { query: buildListQuerySchema },
  responses: {
    200: { description: "Page of build summaries.", content: { "application/json": { schema: buildListResponseSchema } } }
  }
});
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
  method: "post",
  path: "/builds/{buildId}/deployment",
  description: "Runner reports external deployment progress and final result.",
  tags: ["Deployment"],
  request: { params: z.object({ buildId: z.string().uuid() }), body: { content: { "application/json": { schema: deploymentReportRequestSchema } } } },
  responses: {
    200: {
      description: "Deployment state recorded. Response carries the canonical BuildStatusResponse with the just-updated `deploy` and `resultDelivery` blocks.",
      content: { "application/json": { schema: buildStatusResponseSchema } }
    }
  }
});
registry.registerPath({
  method: "get",
  path: "/builds/{buildId}/test-deployment",
  description: "Fetch the current test deployment record for a build (if any).",
  tags: ["Test Deployment"],
  request: { params: z.object({ buildId: z.string().uuid() }) },
  responses: { 200: { description: "Test deployment present.", content: { "application/json": { schema: testDeploymentSchema } } } }
});
// TASK-066: source archive upload/download. The Skill uploads the
// raw archive bytes via POST after POST /builds has recorded the
// `SourceArchive` metadata. The Runner downloads the bytes via GET
// before running `docker build`. The body for POST is
// `application/octet-stream` (binary); the OpenAPI document describes
// the request as a `string` (base64) of format `binary` so the spec
// is portable. The recomputed SHA-256 is echoed in the response body
// (POST) and a response header (GET) so the caller can verify
// integrity without re-reading the body.
registry.registerPath({
  method: "post",
  path: "/builds/{buildId}/source",
  description:
    "Upload the raw source archive bytes for a build. Body is application/octet-stream; the server recomputes the SHA-256 and size and refuses the upload if they do not match the build's `sourceArchive` metadata. The Skill is expected to call this after `POST /builds` has succeeded.",
  tags: ["Builds"],
  request: {
    params: z.object({ buildId: z.string().uuid() }),
    body: {
      content: {
        "application/octet-stream": {
          schema: z.string().describe("Raw source archive bytes (binary).")
        }
      }
    }
  },
  responses: {
    201: {
      description: "Source archive accepted and verified.",
      content: { "application/json": { schema: component("SourceArchiveUploadResponse") as never } }
    },
    400: { description: "Checksum or size mismatch (recomputed from body)." },
    404: { description: "Build not found." }
  }
});
registry.registerPath({
  method: "get",
  path: "/builds/{buildId}/source",
  description:
    "Download the raw source archive bytes for a build. Response is application/octet-stream; the SHA-256 is surfaced in the `X-Source-Checksum-Sha256` response header and the byte count in `X-Source-Size-Bytes`.",
  tags: ["Builds"],
  request: { params: z.object({ buildId: z.string().uuid() }) },
  responses: {
    200: {
      description: "Source archive bytes.",
      content: { "application/octet-stream": { schema: z.string().describe("Raw source archive bytes (binary).") } }
    },
    404: { description: "Build or source archive not found." }
  }
});
registry.registerPath({
  method: "get",
  path: "/health",
  description: 'Liveness probe. Always 200 with `{ status: "ok" }`.',
  tags: ["Health"],
  responses: { 200: { description: "Service is alive." } }
});

registry.registerPath({
  method: "get",
  path: "/admin/builds",
  description:
    "Admin-only. List build summaries across all owners. Requires the X-Admin-Id header to be in the build-server ADMIN_IDS env.",
  tags: ["Admin"],
  // registerPath's query typing in @asteasolutions/zod-to-openapi 8.5 is
  // narrower than the ZodTypeAny we use internally. Cast through never
  // (which is assignable to anything) so the runtime call still works.
  request: { query: component("AdminListBuildsQuery") as never },
  responses: {
    200: {
      description: "Page of build summaries across all owners.",
      content: { "application/json": { schema: component("AdminListBuildsResponse") as never } }
    },
    401: { description: "X-Admin-Id header missing." },
    403: { description: "Caller is not in the admin allow-list." }
  }
});

registry.registerPath({
  method: "get",
  path: "/admin/users",
  description:
    "Admin-only. List userIds that have build history with per-user buildCount and lastBuildAt.",
  tags: ["Admin"],
  responses: {
    200: {
      description: "Owner rollup.",
      content: { "application/json": { schema: component("AdminUserListResponse") as never } }
    },
    401: { description: "X-Admin-Id header missing." },
    403: { description: "Caller is not in the admin allow-list." }
  }
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
