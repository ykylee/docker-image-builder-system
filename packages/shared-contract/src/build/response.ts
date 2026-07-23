import { z } from "zod";

import { errorCodes } from "./errors.js";
import { buildPhases } from "./phase.js";
import {
  buildStatuses,
  canonicalBuildStatuses,
  executionStatuses,
} from "./status.js";

// All exported schemas carry a `.meta({ id, description })` so that
// @asteasolutions/zod-to-openapi's OpenApiGeneratorV3 can lift them into
// `components.schemas` with stable refs. The `id` doubles as the component
// name. `.meta()` is zod v4 native and is the v8+ preferred path.

// 필드 정의는 한 곳에만 둔다 — 아래 두 스키마가 같은 shape 를 공유한다.
const buildErrorShape = {
  code: z.enum(errorCodes),
  message: z.string().min(1)
};

export const buildErrorSchema = z
  .object(buildErrorShape)
  .meta({ id: "BuildError", description: "Standard error shape returned with 4xx/5xx responses." });

export type BuildError = z.infer<typeof buildErrorSchema>;

// TASK-163 (P2-M4): nullable 전용 등록 스키마.
//
// 왜 별도 스키마인가 — `buildErrorSchema.nullable()` 처럼 **이미 등록된($ref)
// 스키마에 nullable 을 씌우면** OpenAPI 3.0 산출이
// `allOf: [$ref, { nullable: true }]` 가 되고, `openapi-typescript` 는 그것을
// `BuildError & unknown` 으로 렌더한다 — **null 이 타입에서 사라진다.**
// 그 결과 프런트가 `lastError: null`(성공한 빌드의 절대다수)을 타입으로
// 표현할 수 없었다. object 에 nullable 을 먼저 적용한 뒤 등록하면
// `{...} | null` 로 제대로 나온다 (`BuildCurrentPhase` 가 쓰는 검증된 패턴).
export const nullableBuildErrorSchema = z
  .object(buildErrorShape)
  .nullable()
  .meta({
    id: "NullableBuildError",
    description:
      "BuildError or null. null = 이 빌드에 기록된 실패 이유가 없음 (TASK-162 이전에는 항상 null 이었다)."
  });

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
        "Current top-level build status (canonical lifecycle). TASK-159 에서 legacy adapter status(CLAIMED/TEST_READY)를 제거해 canonical 과 동일해졌다."
    }),
    phase: z.enum(buildPhases),
    // TASK-160 (P2-M1 Step 3): `previewStatus` shim 제거. canonical `test`
    // 블록이 컨테이너 테스트 상태의 단일 출처다.
    // TASK-161 (P2-M2): `previewUrl` → `runtimeUrl` 로 최종 개명 완료.
    // 이 필드는 실제 런타임 URL 을 나르는 유일한 요약 필드다.
    runtimeUrl: z.string().url().nullable().meta({
      description:
        "Runtime endpoint of the container under test (canonical name; `build_test.runtime_url` 과 동일 개념). TASK-161 에서 preview-era 의 `previewUrl` 을 대체했다."
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
    lastError: nullableBuildErrorSchema,
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
          "List of completed phase transitions in chronological order. Excludes the current in-flight phase (see currentPhase). Excludes phases that were skipped (e.g. CONTAINER_TEST_STARTED → COMPLETED without CONTAINER_TEST_PASSED). Empty when the build is still at REQUEST_ACCEPTED and has not transitioned yet. Defaulted to [] when not provided (e.g. by code paths that do not yet track transitions — see TASK-051)."
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
    reason: z
      .enum([
        "NO_BUILD_AVAILABLE",
        "ACTIVE_BUILD_EXISTS",
        "QUEUE_CLAIM_FAILED",
        // TASK-069: admin 가 /admin/runners/:runnerId PATCH 로 status=DISABLED
        // 로 토글한 러너의 후속 claim. Runner poll loop 가 짧게 backoff.
        "RUNNER_DISABLED",
        // Runner 가 자기 id 없이 /builds/claim 호출. v1 에선 명시적으로
        // backoff (모니터링 알림 의미). 추후 모든 caller 가 id 보장하면
        // 본 enum 멤버 제거 검토.
        "RUNNER_ID_REQUIRED"
      ])
      .nullable()
  })
  .meta({
    id: "ClaimResponse",
    description: "Runner claim poll response. When claimed=true, build is a 2-depth BuildStatusResponse."
  });

export type ClaimResponse = z.infer<typeof claimResponseSchema>;

// TASK-162 (P2-M3): FAILED phase 가 **이유를 나를 수 있게** errorCode /
// errorMessage 를 추가한다. 이전에는 채널 자체가 없어 runner 가 어느 단계에서
// 왜 실패했는지 서버에 전달할 방법이 없었고, 그 결과 `build_request` 의
// `last_error_code` / `last_error_message` 가 **한 번도 기록되지 않았다** —
// 모든 실패 빌드가 `lastError: null` 이었다. 두 필드는 FAILED 가 아닌 phase
// 에서는 의미가 없으므로 optional 이다.
export const phaseUpdateRequestSchema = z
  .object({
    phase: z.enum(buildPhases),
    runnerId: z.string().min(1),
    occurredAt: z.string().datetime().optional(),
    errorCode: z.enum(errorCodes).optional(),
    errorMessage: z.string().min(1).optional()
  })
  .meta({ id: "PhaseUpdateRequest", description: "Runner phase report payload (PKG-005). FAILED phase 는 errorCode/errorMessage 로 실패 이유를 함께 보고한다 (TASK-162)." });

export type PhaseUpdateRequest = z.infer<typeof phaseUpdateRequestSchema>;

// ---------------------------------------------------------------------------
// Container test (TASK-161 / P2-M2)
// ---------------------------------------------------------------------------
//
// preview-era 의 `TestDeployment` 일가를 canonical 컨테이너 테스트 계약으로
// 교체한다. 상태값은 `previewStatuses`(PROVISIONING/READY/EXPIRED …) 가 아니라
// 다른 lifecycle 블록과 같은 `executionStatuses` 를 쓴다 — 한 시스템에 두 개의
// 상태 어휘가 공존하던 것이 preview-era 잔재의 핵심이었다.
//
// 엔드포인트도 함께 정리했다:
//   POST /builds/:buildId/preview                  → /container-test/start
//   POST /builds/:buildId/test-deployment/ready    → /container-test/result
//   POST /builds/:buildId/test-deployment/status   → result 로 흡수 (제거)
//   GET  /builds/:buildId/test-deployment          → 제거 (소비자 0,
//        canonical `test` 블록이 GET /builds/:buildId 에서 같은 정보를 준다)

export const containerTestStartRequestSchema = z
  .object({
    internalPort: z.int().positive(),
    runnerId: z.string().min(1)
  })
  .meta({
    id: "ContainerTestStartRequest",
    description:
      "POST /builds/:buildId/container-test/start payload (Runner → Host). 컨테이너 테스트 시작을 알린다. preview-era 의 ttlMinutes 는 canonical 모델에 대응 개념이 없어 제거됐다."
  });

export type ContainerTestStartRequest = z.infer<typeof containerTestStartRequestSchema>;

export const containerTestResultRequestSchema = z
  .object({
    // IN_PROGRESS / SUCCESS / FAILED — 다른 lifecycle 블록과 같은 어휘.
    status: z.enum(["IN_PROGRESS", "SUCCESS", "FAILED"]),
    runtimeUrl: z.string().url().nullable().optional(),
    host: z.string().min(1).nullable().optional(),
    hostPort: z.int().nonnegative().nullable().optional(),
    containerRef: z.string().min(1).optional(),
    healthCheckPassed: z.boolean().optional(),
    portOpen: z.boolean().optional(),
    stabilityWindowPassed: z.boolean().optional(),
    // TASK-162: status=FAILED 일 때 실패 이유. 이전에는 서버가 계약에 없는
    // 문자열 `TEST_DEPLOYMENT_FAILED` 와 고정 문구를 하드코딩해 runner 가
    // 아는 실제 원인을 버렸다.
    errorCode: z.enum(errorCodes).optional(),
    errorMessage: z.string().min(1).optional(),
    runnerId: z.string().min(1)
  })
  .meta({
    id: "ContainerTestResultRequest",
    description:
      "POST /builds/:buildId/container-test/result payload (Runner → Host). 진행/성공/실패를 하나의 엔드포인트로 보고한다 (구 ready + status 통합)."
  });

export type ContainerTestResultRequest = z.infer<typeof containerTestResultRequestSchema>;

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
