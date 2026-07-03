import { z } from "zod";

import { errorCodes } from "./errors.js";
import { buildPhases } from "./phase.js";
import {
  buildStatuses,
  canonicalBuildStatuses,
  executionStatuses,
  previewStatuses
} from "./status.js";

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
    status: z.enum(buildStatuses).meta({
      description:
        "Current top-level build status. This union includes the new canonical lifecycle statuses and the temporary legacy adapter statuses (`CLAIMED`, `TEST_READY`) for backward compatibility."
    }),
    phase: z.enum(buildPhases),
    previewStatus: z.enum(previewStatuses).meta({
      description:
        "Legacy preview-era field. Kept as a migration shim until TASK-054/060 move server and UI to the new build/test/deploy response blocks."
    }),
    previewUrl: z.string().url().nullable().meta({
      description:
        "Legacy preview-era field. Represents the temporary runtime endpoint used by the current test-deployment adapter."
    }),
    lifecycleStatus: z.enum(canonicalBuildStatuses).optional().meta({
      description:
        "Canonical lifecycle status projected from the build/test/deploy pipeline model. Optional during the migration window."
    }),
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

// Per-phase completion entry. Each entry captures the timestamp at which a
// canonical BuildPhase transitioned OUT (completed or superseded by a later
// phase). The current in-flight phase is NOT included in this list — see
// `BuildCurrentPhase` below. Together they describe the build's full
// progress without the caller having to know the canonical phase list.
export const buildPhaseHistoryEntrySchema = z
  .object({
    phase: z.enum(buildPhases),
    completedAt: z.string().datetime().meta({
      description:
        "ISO 8601 timestamp at which this phase completed (transitioned out, regardless of outcome)."
    })
  })
  .meta({
    id: "BuildPhaseHistoryEntry",
    description:
      "Single completed-phase record. Appended in transition order. The current in-flight phase is not represented here — see BuildCurrentPhase."
  });

export type BuildPhaseHistoryEntry = z.infer<typeof buildPhaseHistoryEntrySchema>;

// In-flight phase. null when the build is in a terminal state
// (COMPLETED, FAILED) or has not yet been claimed (REQUEST_ACCEPTED →
// QUEUE_CLAIMED). For non-null entries, `startedAt` records when the
// phase began. The phase is also exposed as the canonical `build.phase`
// in BuildSummary, but this entry carries the timestamp.
export const buildCurrentPhaseSchema = z
  .object({
    phase: z.enum(buildPhases),
    startedAt: z.string().datetime().meta({
      description:
        "ISO 8601 timestamp at which the current in-flight phase began. Used by the build-monitor PhaseTimeline to render the \"now\" indicator."
    })
  })
  .nullable()
  .meta({
    id: "BuildCurrentPhase",
    description:
      "The in-flight BuildPhase, or null when the build is in a terminal state. Mirrors build.phase + carry-over timestamp."
  });

export type BuildCurrentPhase = z.infer<typeof buildCurrentPhaseSchema>;

export const buildLifecycleSchema = z
  .object({
    status: z.enum(canonicalBuildStatuses),
    startedAt: z.string().datetime().nullable().optional(),
    finishedAt: z.string().datetime().nullable().optional()
  })
  .meta({
    id: "BuildLifecycle",
    description:
      "Canonical build lifecycle snapshot aligned with the document-first build/test/deploy/result-delivery model."
  });

export type BuildLifecycle = z.infer<typeof buildLifecycleSchema>;

export const buildImageSchema = z
  .object({
    name: z.string().min(1),
    tag: z.string().min(1),
    digest: z.string().min(1).nullable()
  })
  .meta({
    id: "BuildImage",
    description:
      "Image identity emitted after a successful docker build. Optional during the migration window."
  });

export type BuildImage = z.infer<typeof buildImageSchema>;

export const containerTestResultSchema = z
  .object({
    status: z.enum(executionStatuses),
    containerRunning: z.boolean().nullable(),
    healthCheckPassed: z.boolean().nullable(),
    portOpen: z.boolean().nullable(),
    stabilityWindowPassed: z.boolean().nullable()
  })
  .meta({
    id: "ContainerTestResult",
    description:
      "Canonical container-test result block. Replaces preview-centric status interpretation for runtime validation."
  });

export type ContainerTestResult = z.infer<typeof containerTestResultSchema>;

export const deploymentResultSchema = z
  .object({
    status: z.enum(executionStatuses),
    targetType: z.enum([
      "HTTP_API",
      "SCP",
      "SFTP",
      "SHARED_STORAGE",
      "DOCKER_REGISTRY",
      "OTHER"
    ]).nullable(),
    resultRef: z.string().min(1).nullable()
  })
  .meta({
    id: "DeploymentResult",
    description:
      "Canonical external deployment result block. Will replace preview-ready handoff fields after the server migration."
  });

export type DeploymentResult = z.infer<typeof deploymentResultSchema>;

export const deploymentReportRequestSchema = z
  .object({
    status: z.enum(["IN_PROGRESS", "SUCCESS", "FAILED"]),
    targetType: z.enum([
      "HTTP_API",
      "SCP",
      "SFTP",
      "SHARED_STORAGE",
      "DOCKER_REGISTRY",
      "OTHER"
    ]),
    targetRef: z.string().min(1).nullable().optional(),
    resultRef: z.string().min(1).nullable().optional(),
    errorCode: z.string().min(1).nullable().optional(),
    errorMessage: z.string().min(1).nullable().optional(),
    runnerId: z.string().min(1),
    responsePayloadJson: z.record(z.string(), z.unknown()).nullable().optional()
  })
  .meta({
    id: "DeploymentReportRequest",
    description:
      "POST /builds/:buildId/deployment payload (Runner → Host). Records external deployment progress and final result for the canonical deploy block."
  });

export type DeploymentReportRequest = z.infer<typeof deploymentReportRequestSchema>;

export const resultDeliverySchema = z
  .object({
    status: z.enum(executionStatuses),
    mode: z.enum(["POLLING", "NOTIFICATION"]).nullable(),
    deliveredAt: z.string().datetime().nullable()
  })
  .meta({
    id: "ResultDelivery",
    description:
      "Result-delivery state for the final external notification or polling handoff."
  });

export type ResultDelivery = z.infer<typeof resultDeliverySchema>;

export const buildStatusResponseSchema = z
  .object({
    build: buildSummarySchema,
    lastError: buildErrorSchema.nullable(),
    // phaseHistory 와 currentPhase 는 build lifecycle 전체의 timeline 을
    // 표현한다. build-monitor 의 PhaseTimeline 가 이 두 필드를 받아
    // canonical phase 리스트 대비 완료/진행/미진행을 시각화한다.
    // - phaseHistory: 이미 종료된 phase 들 (terminal 단계 제외, 중간에
    //   skip 된 phase 도 미포함).
    // - currentPhase: 현재 진행 중인 phase. terminal (COMPLETED/FAILED)
    //   상태면 null.
    phaseHistory: z
      .array(buildPhaseHistoryEntrySchema)
      .default([])
      .meta({
        description:
          "List of completed phase transitions in chronological order. Excludes the current in-flight phase (see currentPhase). Excludes phases that were skipped (e.g. PREVIEW_QUEUED → COMPLETED without PREVIEW_READY). Empty when the build is still at REQUEST_ACCEPTED and has not transitioned yet. Defaulted to [] when not provided (e.g. by code paths that do not yet track transitions — see TASK-051)."
      }),
    currentPhase: buildCurrentPhaseSchema.default(null),
    lifecycle: buildLifecycleSchema.optional().meta({
      description:
        "Canonical lifecycle snapshot. Optional during the migration window while the server still emits preview-era top-level statuses."
    }),
    image: buildImageSchema.nullable().optional().meta({
      description:
        "Canonical build artifact identity. Optional until docker build metadata is persisted by the server."
    }),
    test: containerTestResultSchema.optional().meta({
      description:
        "Canonical container-test result block. Optional until TASK-054 wires runtime validation results into the API."
    }),
    deploy: deploymentResultSchema.optional().meta({
      description:
        "Canonical external deployment result block. Optional until the deployment adapter is connected."
    }),
    resultDelivery: resultDeliverySchema.optional().meta({
      description:
        "Canonical result-delivery block for polling/notification completion. Optional until final handoff tracking is implemented."
    })
  })
  .meta({
    id: "BuildStatusResponse",
    description:
      "Returned on GET /builds/:buildId and embedded in claim responses (2-depth nesting). phaseHistory + currentPhase preserve the existing timeline contract, while lifecycle/image/test/deploy/resultDelivery provide the new canonical build/test/deploy/result-delivery model."
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
    description:
      "Legacy preview/test-deployment state. Kept as a migration shim until the Build Server and Runner switch to the canonical container-test and deployment result blocks."
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
    containerRef: z.string().min(1).optional(),
    healthCheckPassed: z.boolean().optional(),
    portOpen: z.boolean().optional(),
    stabilityWindowPassed: z.boolean().optional(),
    runnerId: z.string().min(1)
  })
  .meta({
    id: "TestDeploymentReadyRequest",
    description:
      "POST /builds/:buildId/test-deployment/ready payload (Runner → Host). Carries the runtime endpoint plus the minimum container-test result signals."
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
