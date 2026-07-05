import { z } from "zod";

// ---------------------------------------------------------------------------
// Runner registry (TASK-069).
//
// Build Server 가 Runner 의 self-register + admin 관리 기능의 canonical
// shape. Runner 는 `RUNNER_ID` env 로 자신을 식별하고 매 claim/report
// 호출에 그 id 를 실어 보내는데, Build Server 는 그 id 를 받아
// `runnerRegistry` 에 누적한다. 첫 claim 시 자동 등록 (idempotent),
// admin 은 /admin/runners 로 list / DISABLE / DELETE 가능.
// DISABLED 상태의 runner 의 후속 claim 은 거부된다 (claim response 에
// `reason: "RUNNER_DISABLED"`).
//
// Runner 의 lifecycle 을 자세히 보면:
//   - Runner 가 `POST /builds/claim` 의 request body 에 `{runnerId}` 를 보냄
//   - Build Server: 검증 → repo.registerRunner (idempotent) →
//     repo.markRunnerSeen(runnerId, claimed_build_id) + buildsClaimed++
//   - Runner 가 빌드 처리 → `phase=DOCKER_BUILD_COMPLETED` 보고 시
//     repo.markRunnerSeen + buildsCompleted++
//   - admin 이 `PATCH /admin/runners/:runnerId` 로 DISABLE →
//     다음 claim 시 service.claimNextBuild 가 runner_disabled result 반환
//   - admin 이 `DELETE /admin/runners/:runnerId` 로 영구 삭제하면
//     다음 claim 시점에 다시 self-register (idempotent) 됨
// ---------------------------------------------------------------------------

// Runner state. ACTIVE = 정상 운영, claim 수락. DISABLED = admin 이 명시적으로
// 멈춤, 다음 claim 부터 거부. (실제로 빌드 처리 중인 빌드는 그대로 완료됨 —
// claim 만 차단. 빌드를 중단시키는 것 까지는 v1 scope 아님.)
export const runnerStatusSchema = z
  .enum(["ACTIVE", "DISABLED"])
  .meta({
    id: "RunnerStatus",
    description:
      "Lifecycle state of a registered runner. ACTIVE = accepting claims. DISABLED = admin-disabled; subsequent claims return reason=RUNNER_DISABLED and no build payload."
  });

export type RunnerStatus = z.infer<typeof runnerStatusSchema>;

// Canonical list of all RunnerStatus values. Used as TS↔Python↔Go
// 3-way sync anchor (apps/skill_mcp/contract/canonical.py
// RUNNER_STATUSES frozenset / apps/runner/internal/contract/runner_registry.go
// RunnerStatuses slice). Drift checker cross-checks this slice.
export const runnerStatuses = ["ACTIVE", "DISABLED"] as const;

export const adminRunnerSchema = z
  .object({
    runnerId: z.string().min(1).meta({
      description:
        "Canonical runner id. Matches the `RUNNER_ID` env value the runner process booted with. Self-registers on first claim."
    }),
    status: runnerStatusSchema,
    firstSeenAt: z.string().datetime().meta({
      description:
        "ISO8601 timestamp of the first claim ever observed by the Build Server for this runner."
    }),
    lastSeenAt: z.string().datetime().meta({
      description:
        "ISO8601 timestamp of the most recent claim/phase report from this runner."
    }),
    buildsClaimed: z
      .int()
      .nonnegative()
      .meta({ description: "Total number of builds claimed by this runner." }),
    buildsCompleted: z
      .int()
      .nonnegative()
      .meta({
        description:
          "Total number of builds this runner reported `phase=DOCKER_BUILD_COMPLETED`."
      }),
    currentBuildId: z
      .string()
      .uuid()
      .nullable()
      .meta({
        description:
          "The build id this runner most recently claimed and is still working on. null when the runner has not claimed a build or has finished the previous one."
      }),
    lastError: z
      .string()
      .nullable()
      .meta({
        description:
          "Last error message reported by this runner for the current claim (PHASE=FAILED reason). null when no error is recorded."
      })
  })
  .meta({
    id: "AdminRunner",
    description:
      "Admin view of a runner. Returned by GET /admin/runners and GET /admin/runners/:runnerId. `currentBuildId` is the most recent claim that has not yet transitioned to a terminal phase."
  });

export type AdminRunner = z.infer<typeof adminRunnerSchema>;

export const adminRunnerListResponseSchema = z
  .object({
    runners: z.array(adminRunnerSchema)
  })
  .meta({
    id: "AdminRunnerListResponse",
    description: "Response body for GET /admin/runners."
  });

export type AdminRunnerListResponse = z.infer<typeof adminRunnerListResponseSchema>;

export const adminRunnerPatchRequestSchema = z
  .object({
    status: runnerStatusSchema.meta({
      description:
        "New lifecycle state. DISABLED blocks future claims; ACTIVE re-enables."
    })
  })
  .meta({
    id: "AdminRunnerPatchRequest",
    description: "Request body for PATCH /admin/runners/:runnerId."
  });

export type AdminRunnerPatchRequest = z.infer<typeof adminRunnerPatchRequestSchema>;

export const adminRunnerPatchResponseSchema = z
  .object({
    runner: adminRunnerSchema
  })
  .meta({
    id: "AdminRunnerPatchResponse",
    description: "Response body for PATCH /admin/runners/:runnerId."
  });

export type AdminRunnerPatchResponse = z.infer<typeof adminRunnerPatchResponseSchema>;

export const adminRunnerDeleteResponseSchema = z
  .object({
    removedRunnerId: z.string().min(1).meta({
      description: "The runnerId that was just removed from the registry."
    })
  })
  .meta({
    id: "AdminRunnerDeleteResponse",
    description: "Response body for DELETE /admin/runners/:runnerId."
  });

export type AdminRunnerDeleteResponse = z.infer<typeof adminRunnerDeleteResponseSchema>;
