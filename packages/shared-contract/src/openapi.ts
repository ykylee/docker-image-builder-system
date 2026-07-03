import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const openapiRegistry = {
  // Component schemas are registered lazily by each schema module through
  // schema.meta({ id, ... }). This registry object exists as a stable import
  // surface so that build-server can pull in every shared-contract schema
  // and re-emit the OpenAPI document from a single entry point.
};

// ---------------------------------------------------------------------------
// Tag metadata for operation grouping in Swagger UI
// ---------------------------------------------------------------------------

export const openapiTags = {
  Builds: {
    name: "Builds",
    description:
      "Build request intake, status, logs, and lifecycle endpoints exposed by the Build Server (system-of-record for PKG-001~PKG-004)."
  },
  RunnerClaim: {
    name: "Runner Claim",
    description:
      "Endpoints consumed by the Go Runner process to claim queued builds and report build phases (PKG-005)."
  },
  TestDeployment: {
    name: "Test Deployment",
    description:
      "Preview service queue and readiness endpoints. Consumed by the Go Runner to schedule, mark ready, and update preview service status (PKG-006)."
  },
  Health: {
    name: "Health",
    description: "Liveness probe."
  }
} as const;

export type OpenApiTagName = keyof typeof openapiTags;

// ---------------------------------------------------------------------------
// Re-export the augmented zod so consumers can attach .openapi() metadata
// without re-importing from @asteasolutions/zod-to-openapi in every file.
// ---------------------------------------------------------------------------

export { z };
