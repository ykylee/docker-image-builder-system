import { z } from "zod";

import { errorCodes } from "./errors.js";
import { buildPhases } from "./phase.js";
import { buildStatuses, previewStatuses } from "./status.js";

// All exported schemas carry a `.meta({ id, description })` so that
// @asteasolutions/zod-to-openapi's OpenApiGeneratorV3 can lift them into
// `components.schemas` with stable refs. The `id` doubles as the component
// name. `.meta()` is zod v4 native and is the v8+ preferred path.

export const buildErrorSchema = z
  .object({
    code: z.enum(errorCodes),
    message: z.string().min(1)
  })
  .meta({ id: "BuildError", description: "Standard error shape returned with 4xx/5xx responses." });

export type BuildError = z.infer<typeof buildErrorSchema>;

export const buildSummarySchema = z
  .object({
    buildId: z.string().uuid(),
    // appName replaces the legacy (projectId, repositoryId) pair — see
    // BuildRequest comment. AdminUserBuildSummary (ADMIN-*) extends this
    // shape with `requestedBy` via zod `.extend({...})`, so the evolve
    // contract documented in packages/shared-contract/src/build/admin.ts
    // continues to hold for this field too.
    appName: z.string().min(1).meta({
      description:
        "Canonical application name (BuildRequest.appName). One identifier per build, used as the active-build lock key and rendered in the UI."
    }),
    status: z.enum(buildStatuses),
    phase: z.enum(buildPhases),
    previewStatus: z.enum(previewStatuses),
    previewUrl: z.string().url().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .meta({
    id: "BuildSummary",
    description: "Compact build snapshot returned in intake, status, claim, and preview responses."
  });

export type BuildSummary = z.infer<typeof buildSummarySchema>;

export const buildAcceptedResponseSchema = z
  .object({
    accepted: z.literal(true),
    duplicate: z.literal(false),
    build: buildSummarySchema
  })
  .meta({
    id: "BuildAcceptedResponse",
    description: "Returned on POST /builds when a new build is queued (HTTP 202)."
  });

export type BuildAcceptedResponse = z.infer<typeof buildAcceptedResponseSchema>;

export const buildDuplicateResponseSchema = z
  .object({
    accepted: z.literal(false),
    duplicate: z.literal(true),
    reason: z.enum(["ACTIVE_BUILD_EXISTS"]),
    build: buildSummarySchema
  })
  .meta({
    id: "BuildDuplicateResponse",
    description: "Returned on POST /builds when an active build already exists for the same appName (HTTP 409, not 4xx error)."
  });

export type BuildDuplicateResponse = z.infer<typeof buildDuplicateResponseSchema>;

export const buildStatusResponseSchema = z
  .object({
    build: buildSummarySchema,
    lastError: buildErrorSchema.nullable()
  })
  .meta({
    id: "BuildStatusResponse",
    description: "Returned on GET /builds/:buildId and embedded in claim responses (2-depth nesting)."
  });

export type BuildStatusResponse = z.infer<typeof buildStatusResponseSchema>;

export const buildLogEntrySchema = z
  .object({
    id: z.string().uuid(),
    buildId: z.string().uuid(),
    phase: z.enum(buildPhases),
    message: z.string().min(1),
    createdAt: z.string().datetime()
  })
  .meta({ id: "BuildLogEntry", description: "Single append-only log line." });

export type BuildLogEntry = z.infer<typeof buildLogEntrySchema>;

export const buildLogsResponseSchema = z
  .object({
    buildId: z.string().uuid(),
    logs: z.array(buildLogEntrySchema)
  })
  .meta({ id: "BuildLogsResponse", description: "Returned on GET /builds/:buildId/logs." });

export type BuildLogsResponse = z.infer<typeof buildLogsResponseSchema>;

export const claimRequestSchema = z
  .object({
    runnerId: z.string().min(1),
    capabilities: z.array(z.string().min(1)).default([])
  })
  .meta({ id: "ClaimRequest", description: "Runner claim poll payload (PKG-005)." });

export type ClaimRequest = z.infer<typeof claimRequestSchema>;

export const claimResponseSchema = z
  .object({
    claimed: z.boolean(),
    build: buildStatusResponseSchema.nullable(),
    reason: z.enum(["NO_BUILD_AVAILABLE", "ACTIVE_BUILD_EXISTS", "QUEUE_CLAIM_FAILED"]).nullable()
  })
  .meta({
    id: "ClaimResponse",
    description: "Runner claim poll response. When claimed=true, build is a 2-depth BuildStatusResponse."
  });

export type ClaimResponse = z.infer<typeof claimResponseSchema>;

export const phaseUpdateRequestSchema = z
  .object({
    phase: z.enum(buildPhases),
    runnerId: z.string().min(1),
    occurredAt: z.string().datetime().optional()
  })
  .meta({ id: "PhaseUpdateRequest", description: "Runner phase report payload (PKG-005)." });

export type PhaseUpdateRequest = z.infer<typeof phaseUpdateRequestSchema>;

// testDeployment minimal schema (canonical doc §9)
export const testDeploymentSchema = z
  .object({
    status: z.enum(previewStatuses),
    previewUrl: z.string().url().nullable(),
    host: z.string().nullable(),
    hostPort: z.int().nonnegative().nullable(),
    internalPort: z.int().positive().nullable(),
    expiresAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime()
  })
  .meta({
    id: "TestDeployment",
    description: "Preview service state. Returned in BuildStatusResponse.testDeployment (PKG-006)."
  });

export type TestDeployment = z.infer<typeof testDeploymentSchema>;

export const testDeploymentQueueRequestSchema = z
  .object({
    internalPort: z.int().positive(),
    ttlMinutes: z.int().positive().default(60),
    runnerId: z.string().min(1)
  })
  .meta({
    id: "TestDeploymentQueueRequest",
    description: "POST /builds/:buildId/preview payload (Runner → Host)."
  });

export type TestDeploymentQueueRequest = z.infer<typeof testDeploymentQueueRequestSchema>;

export const testDeploymentQueueResponseSchema = z
  .object({
    testDeployment: testDeploymentSchema
  })
  .meta({
    id: "TestDeploymentQueueResponse",
    description: "POST /builds/:buildId/preview response (HTTP 202)."
  });

export type TestDeploymentQueueResponse = z.infer<typeof testDeploymentQueueResponseSchema>;

export const testDeploymentReadyRequestSchema = z
  .object({
    previewUrl: z.string().url(),
    host: z.string().min(1),
    hostPort: z.int().nonnegative(),
    runnerId: z.string().min(1)
  })
  .meta({
    id: "TestDeploymentReadyRequest",
    description: "POST /builds/:buildId/test-deployment/ready payload (Runner → Host)."
  });

export type TestDeploymentReadyRequest = z.infer<typeof testDeploymentReadyRequestSchema>;

export const testDeploymentStatusRequestSchema = z
  .object({
    status: z.enum(["PROVISIONING", "READY", "FAILED", "EXPIRED"]),
    runnerId: z.string().min(1)
  })
  .meta({
    id: "TestDeploymentStatusRequest",
    description: "POST /builds/:buildId/test-deployment/status payload (Runner → Host, PROVISIONING/FAILED/EXPIRED)."
  });

export type TestDeploymentStatusRequest = z.infer<typeof testDeploymentStatusRequestSchema>;


export const buildListResponseSchema = z
  .object({
    builds: z.array(buildSummarySchema),
    nextCursor: z
      .string()
      .uuid()
      .nullable()
      .meta({
        description:
          "Cursor to fetch the next page (buildId of the last item in this page). null = no more pages."
      })
  })
  .meta({
    id: "BuildListResponse",
    description:
      "Page of build summaries returned by GET /builds. nextCursor is null when the caller has reached the end."
  });

export type BuildListResponse = z.infer<typeof buildListResponseSchema>;
