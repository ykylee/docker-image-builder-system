import { createHash, randomUUID } from "node:crypto";

import {
  buildSourceChunkTable,
  buildSourceTable,
  buildTestTable,
  and,
  asc,
  buildLogTable,
  buildRequestTable,
  desc,
  deploymentAttemptTable,
  runnerTable,
  sql,
  type DatabaseClient
} from "@docker-image-builder-system/db";

// TASK-106: the chunked upload envelope uses the same
// `MAX_CHUNK_SIZE` as the memory repository (16 MiB) so the chunked
// upload index derivation stays consistent across both backends.
// Operators may tune this constant; bumping it reduces the chunk
// count per upload but widens the per-row `bytea` footprint.
const MAX_CHUNK_SIZE = 16 * 1024 * 1024;
import { eq, inArray } from "@docker-image-builder-system/db";

import type {
  AdminListBuildsQuery,
  AdminListBuildsResponse,
  AdminRunner,
  AdminRunnerListResponse,
  AdminUserBuildSummary,
  AdminUserListResponse,
  AdminUserSummary,
  BuildDuplicateResponse,
  BuildError,
  BuildListQuery,
  BuildListResponse,
  BuildLogEntry,
  BuildPhase,
  BuildRequest,
  BuildStatus,
  BuildStatusResponse,
  BuildSummary,
  DeploymentReportRequest,
  ErrorCode,
  ExecutionStatus,
  RunnerStatus,
} from "@docker-image-builder-system/shared-contract";

import type {
  BuildRepository,
  ClaimNextBuildResult,
  ContentRangeParts,
  CreateBuildResult,
  DeleteSourceArchiveResult,
  GetSourceArchiveMetadataResult,
  GetSourceArchiveResult,
  ContainerTestDetails,
  PhaseFailureDetails,
  StartContainerTestResult,
  ReportDeploymentResult,
  ReportContainerTestResult,
  StoreSourceArchiveResult,
  StoreSourceChunkResult,
  UpdatePhaseResult,
  ResultDeliveryPhase,
  RecordResultDeliveryResult
} from "./build-repository.js";
import {
  advancePhaseHistory,
  toPhaseTimeline
} from "./phase-history.js";
import {
  type BuildTestSnapshot,
  type DeploymentAttemptSnapshot,
  buildStatusResponseFromState,
  enrichBuildSummary
} from "./build-status-response.js";

const activeBuildStatuses: BuildStatus[] = ["QUEUED", "PREPARING_SOURCE", "BUILDING", "TEST_SUCCESS"];

type BuildRequestRow = typeof buildRequestTable.$inferSelect;
type BuildLogRow = typeof buildLogTable.$inferSelect;
type BuildTestRow = typeof buildTestTable.$inferSelect;
type DeploymentAttemptRow = typeof deploymentAttemptTable.$inferSelect;

function mapBuildRowToSummary(row: BuildRequestRow): BuildSummary {
  return enrichBuildSummary({
    buildId: row.id,
    appName: row.appName,
    status: row.status as BuildStatus,
    phase: row.phase as BuildPhase,
    runtimeUrl: row.runtimeUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function mapBuildRowToLastError(row: BuildRequestRow): BuildError | null {
  if (!row.lastErrorCode || !row.lastErrorMessage) {
    return null;
  }

  return {
    code: row.lastErrorCode as ErrorCode,
    message: row.lastErrorMessage
  };
}

function mapBuildTestRowToSnapshot(row: BuildTestRow | null | undefined): BuildTestSnapshot | null {
  if (!row) {
    return null;
  }

  return {
    status: row.status as BuildTestSnapshot["status"],
    containerRef: row.containerRef,
    runtimeUrl: row.runtimeUrl,
    healthCheckPassed: row.healthCheckPassed,
    portOpen: row.portOpen,
    stabilityWindowPassed: row.stabilityWindowPassed
  };
}

// TASK-161 (P2-M2): P2-M1 이 임시로 뒀던 canonical→legacy 어댑터
// (executionToPreviewStatus / mapBuildTestRowToDeployment) 를 예정대로 제거했다.
// TestDeployment 응답 자체가 사라졌으므로 매핑할 대상이 없다.


function mapDeploymentAttemptRowToSnapshot(
  row: DeploymentAttemptRow | null | undefined
): DeploymentAttemptSnapshot | null {
  if (!row) {
    return null;
  }

  return {
    status: row.status as DeploymentAttemptSnapshot["status"],
    targetType: row.targetType as DeploymentAttemptSnapshot["targetType"],
    resultRef: row.resultRef,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null
  };
}

function toBuildStatusResponse(
  row: BuildRequestRow,
  buildTestRow?: BuildTestRow | null,
  deploymentAttemptRow?: DeploymentAttemptRow | null
): BuildStatusResponse {
  const summary = mapBuildRowToSummary(row);

  return buildStatusResponseFromState({
    summary,
    lastError: mapBuildRowToLastError(row),
    ...toPhaseTimeline(summary, row.phaseHistory),
    buildTest: mapBuildTestRowToSnapshot(buildTestRow),
    deploymentAttempt: mapDeploymentAttemptRowToSnapshot(deploymentAttemptRow)
  });
}

function mapBuildLogRow(row: BuildLogRow): BuildLogEntry {
  return {
    id: row.id,
    buildId: row.buildId,
    phase: row.phase as BuildPhase,
    message: row.message,
    createdAt: row.createdAt.toISOString()
  };
}

export class PostgresBuildRepository implements BuildRepository {
  constructor(private readonly db: DatabaseClient) {}

  async createBuild(input: BuildRequest): Promise<CreateBuildResult> {
    const buildId = randomUUID();
    const timestamp = new Date();
    // Lock keyed on appName only (1 active build per app). See
    // shared-contract/src/build/request.ts — the legacy
    // (projectId, repositoryId) pair was collapsed into appName.
    const lockKey = input.appName;

    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

      // Active-build dedup is keyed on appName (v0.2 schema). Probe is
      // a direct column compare so the index (build_request_app_name_idx
      // from migrations/0001) can serve it.
      const [activeBuild] = await tx
        .select()
        .from(buildRequestTable)
        .where(
          and(
            eq(buildRequestTable.appName, input.appName),
            inArray(buildRequestTable.status, activeBuildStatuses)
          )
        )
        .orderBy(desc(buildRequestTable.createdAt))
        .limit(1);
      if (activeBuild) {
        const duplicate: BuildDuplicateResponse = {
          accepted: false,
          duplicate: true,
          reason: "ACTIVE_BUILD_EXISTS",
          build: mapBuildRowToSummary(activeBuild)
        };

        return {
          kind: "duplicate",
          response: duplicate
        };
      }

      const [createdBuild] = await tx
        .insert(buildRequestTable)
        .values({
          id: buildId,
          // v0.2 schema (TASK-045): appName is the canonical identifier.
          // metadata 에는 caller 가 함께 보낸 key-value (e.g. git commit
          // hash, trigger id) 만 기록 — appName 중복 X.
          appName: input.appName,
          requestedBy: input.requestedBy,
          status: "QUEUED",
          phase: "REQUEST_ACCEPTED",
          sourceArchiveKey: input.sourceArchive.objectKey,
          sourceArchiveChecksumSha256: input.sourceArchive.checksumSha256,
          sourceArchiveSizeBytes: input.sourceArchive.sizeBytes,
          entrypointPath: input.entrypointPath,
          dockerfilePath: input.dockerfilePath,
          metadata: input.metadata,
          runtimeUrl: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          createdAt: timestamp,
          updatedAt: timestamp
        })
        .returning();

      if (!createdBuild) {
        throw new Error("Failed to create build request row.");
      }

      await tx.insert(buildLogTable).values({
        id: randomUUID(),
        buildId,
        phase: "REQUEST_ACCEPTED",
        message: "Build request accepted and queued.",
        createdAt: timestamp
      });

      return {
        kind: "accepted",
        response: toBuildStatusResponse(createdBuild)
      };
    });
  }

  async getBuild(buildId: string): Promise<BuildStatusResponse | null> {
    const [row] = await this.db
      .select({
        build: buildRequestTable,
        buildTest: buildTestTable,
        deploymentAttempt: deploymentAttemptTable
      })
      .from(buildRequestTable)
      .leftJoin(buildTestTable, eq(buildTestTable.buildId, buildRequestTable.id))
      .leftJoin(deploymentAttemptTable, eq(deploymentAttemptTable.buildId, buildRequestTable.id))
      .where(eq(buildRequestTable.id, buildId))
      .limit(1);

    if (!row) {
      return null;
    }

    return toBuildStatusResponse(row.build, row.buildTest, row.deploymentAttempt);
  }

  async getBuildLogs(buildId: string): Promise<BuildLogEntry[] | null> {
    const [buildExists] = await this.db
      .select({ id: buildRequestTable.id })
      .from(buildRequestTable)
      .where(eq(buildRequestTable.id, buildId))
      .limit(1);

    if (!buildExists) {
      return null;
    }

    const rows = await this.db
      .select()
      .from(buildLogTable)
      .where(eq(buildLogTable.buildId, buildId))
      .orderBy(asc(buildLogTable.createdAt));

    return rows.map(mapBuildLogRow);
  }

  // TASK-080: a QUEUED build is only eligible for claim once a
  // row exists in `build_source` for it — the INNER JOIN below
  // implements the source-upload race mitigation. Builds whose
  // archive bytes have not yet been uploaded are silently skipped
  // (the runner's next claim cycle will pick them up after the
  // Skill finishes POSTing the archive). See
  // `docs/operations/dogfood-e2e-2026-07-06.md` §3.2.
  async claimNextBuild(): Promise<ClaimNextBuildResult> {
    return this.db.transaction(async (tx) => {
      const [activeRow] = await tx
        .select()
        .from(buildRequestTable)
        .where(inArray(buildRequestTable.status, ["PREPARING_SOURCE", "BUILDING", "TEST_SUCCESS"] as BuildStatus[]))
        .orderBy(asc(buildRequestTable.createdAt))
        .limit(1);

      if (activeRow) {
        const activeSummary = mapBuildRowToSummary(activeRow);
        return {
          kind: "active_build_exists",
          build: toBuildStatusResponse(activeRow)
        };
      }

      // TASK-080: gate claim on source archive presence — a build whose
      // source bytes have not yet been uploaded is not eligible for claim.
      // Without this, a Runner that claims the build before the Skill
      // finishes uploading hits a 404 on `/builds/:id/source` and the
      // build fails immediately. See
      // `docs/operations/dogfood-e2e-2026-07-06.md` §3.2.
      //
      // TASK-154: 원래 구현은 legacy `build_source` 로 inner join 만 했다.
      // 그런데 TASK-106 의 chunked 업로드는 **첫 chunk 에서 legacy row 를
      // 삭제**하고 `build_source_chunk` 에 기록하므로, chunked 로 올린
      // build 는 join 이 비어 **영원히 claim 되지 않았다** (QUEUED 정체).
      // 이제 자격 = (legacy row 존재) OR (chunk 가 1건 이상이면서 누적
      // size 가 선언 total 이상 = 업로드 완료).
      //
      // `EXISTS(chunk)` 를 AND 로 함께 거는 이유: chunk 0 건이면 SUM 이
      // NULL → COALESCE 0 이 되어, sizeBytes 0 으로 선언된 build 가
      // source 없이도 `0 >= 0` 으로 통과해 TASK-080 가드가 뚫린다.
      const [nextBuild] = await tx
        .select()
        .from(buildRequestTable)
        .where(
          and(
            eq(buildRequestTable.status, "QUEUED"),
            sql`(
              EXISTS (
                SELECT 1 FROM build_source s
                WHERE s.build_id = ${buildRequestTable.id}
              )
              OR (
                EXISTS (
                  SELECT 1 FROM build_source_chunk c
                  WHERE c.build_id = ${buildRequestTable.id}
                )
                AND COALESCE((
                  SELECT SUM(c.size_bytes) FROM build_source_chunk c
                  WHERE c.build_id = ${buildRequestTable.id}
                ), 0) >= ${buildRequestTable.sourceArchiveSizeBytes}
              )
            )`
          )
        )
        .orderBy(asc(buildRequestTable.createdAt))
        .limit(1);

      if (!nextBuild) {
        return { kind: "no_build_available" };
      }

      const timestamp = new Date();
      const nextPhaseHistory = advancePhaseHistory(
        (nextBuild.phaseHistory ?? []) as Array<{ phase: BuildPhase; completedAt: string }>,
        nextBuild.phase as BuildPhase,
        "QUEUE_CLAIMED",
        timestamp.toISOString()
      );

      const [updated] = await tx
        .update(buildRequestTable)
        .set({
          status: "PREPARING_SOURCE",
          phase: "QUEUE_CLAIMED",
          phaseHistory: nextPhaseHistory,
          updatedAt: timestamp
        })
        .where(
          and(
            eq(buildRequestTable.id, nextBuild.id),
            eq(buildRequestTable.status, "QUEUED")
          )
        )
        .returning();

      if (!updated) {
        // raced: another runner won
        return { kind: "no_build_available" };
      }

      await tx.insert(buildLogTable).values({
        id: randomUUID(),
        buildId: updated.id,
        phase: "QUEUE_CLAIMED",
        message: "Build claimed by runner.",
        createdAt: timestamp
      });

      return {
        kind: "claimed",
        response: toBuildStatusResponse(updated)
      };
    });
  }

  async updatePhase(
    buildId: string,
    phase: string,
    failure?: PhaseFailureDetails
  ): Promise<UpdatePhaseResult> {
    const [row] = await this.db
      .select()
      .from(buildRequestTable)
      .where(eq(buildRequestTable.id, buildId))
      .limit(1);

    if (!row) {
      return { kind: "not_found" };
    }

    if (row.phase === phase) {
      return {
        kind: "ok",
        response: toBuildStatusResponse(row)
      };
    }

    let nextStatus: BuildStatus = row.status as BuildStatus;
    if (phase === "DOCKER_BUILD_STARTED") {
      nextStatus = "BUILDING";
    } else if (phase === "DEPLOYMENT_STARTED") {
      nextStatus = "DEPLOYING";
    } else if (phase === "DEPLOYMENT_COMPLETED") {
      nextStatus = "DEPLOY_SUCCESS";
    } else if (phase === "COMPLETED") {
      nextStatus = "COMPLETED";
    } else if (phase === "FAILED") {
      nextStatus = "FAILED";
    }

    const timestamp = new Date();
    const nextPhaseHistory = advancePhaseHistory(
      (row.phaseHistory ?? []) as Array<{ phase: BuildPhase; completedAt: string }>,
      row.phase as BuildPhase,
      phase as BuildPhase,
      timestamp.toISOString()
    );

    // TASK-162: FAILED phase 는 실패 이유를 함께 적는다. 이전에는 이 두
    // 컬럼을 쓰는 곳이 없어 모든 실패 빌드의 `lastError` 가 null 이었다.
    // FAILED 가 아닌 phase 로 전이하면 (재시도 등) 이전 오류를 지운다.
    const failureColumns =
      phase === "FAILED"
        ? {
            lastErrorCode: failure?.errorCode ?? "UNKNOWN_ERROR",
            lastErrorMessage:
              failure?.errorMessage ?? `Build failed during phase ${row.phase}.`
          }
        : { lastErrorCode: null, lastErrorMessage: null };

    const [updated] = await this.db
      .update(buildRequestTable)
      .set({
        phase: phase as BuildPhase,
        status: nextStatus,
        phaseHistory: nextPhaseHistory,
        ...failureColumns,
        updatedAt: timestamp
      })
      .where(eq(buildRequestTable.id, buildId))
      .returning();

    if (!updated) {
      return { kind: "not_found" };
    }

    await this.db.insert(buildLogTable).values({
      id: randomUUID(),
      buildId,
      phase: phase as BuildPhase,
      message: `Phase updated to ${phase}.`,
      createdAt: timestamp
    });

    return {
      kind: "ok",
      response: toBuildStatusResponse(updated)
    };
  }

  // TASK-165 (P2-M5): 결과 전달 phase 를 phaseHistory JSONB 에 idempotent
  // append. terminal 이후 후처리라 phase/status/updatedAt 은 건드리지 않고
  // history 에만 기록한다(memory 저장소와 동일 semantics — TASK-155 교훈).
  async recordResultDeliveryPhase(
    buildId: string,
    phase: ResultDeliveryPhase
  ): Promise<RecordResultDeliveryResult> {
    const [row] = await this.db
      .select()
      .from(buildRequestTable)
      .where(eq(buildRequestTable.id, buildId))
      .limit(1);

    if (!row) {
      return { kind: "not_found" };
    }

    const history = (row.phaseHistory ?? []) as Array<{
      phase: BuildPhase;
      completedAt: string;
    }>;
    if (history.some((e) => e.phase === phase)) {
      return { kind: "ok", appended: false, response: toBuildStatusResponse(row) };
    }

    const nextHistory = [
      ...history,
      { phase: phase as BuildPhase, completedAt: new Date().toISOString() }
    ];
    const [updated] = await this.db
      .update(buildRequestTable)
      .set({ phaseHistory: nextHistory })
      .where(eq(buildRequestTable.id, buildId))
      .returning();

    if (!updated) {
      return { kind: "not_found" };
    }

    return {
      kind: "ok",
      appended: true,
      response: toBuildStatusResponse(updated)
    };
  }

  async startContainerTest(
    buildId: string,
    internalPort: number
  ): Promise<StartContainerTestResult> {
    const [row] = await this.db
      .select()
      .from(buildRequestTable)
      .where(eq(buildRequestTable.id, buildId))
      .limit(1);

    if (!row) {
      return { kind: "not_found" };
    }

    if (!["BUILDING", "TEST_SUCCESS"].includes(row.status as string) &&
        !["DOCKER_BUILD_COMPLETED", "TEST_SUCCESS"].includes(row.phase as string)) {
      return {
        kind: "invalid_state",
        reason: `cannot start container test from phase=${row.phase} status=${row.status}`
      };
    }

    const timestamp = new Date();

    const nextPhaseHistory = advancePhaseHistory(
      (row.phaseHistory ?? []) as Array<{ phase: BuildPhase; completedAt: string }>,
      row.phase as BuildPhase,
      "CONTAINER_TEST_STARTED",
      timestamp.toISOString()
    );

    const [updated] = await this.db
      .update(buildRequestTable)
      .set({
        phase: "CONTAINER_TEST_STARTED",
        runtimeUrl: null,
        phaseHistory: nextPhaseHistory,
        updatedAt: timestamp
      })
      .where(eq(buildRequestTable.id, buildId))
      .returning();

    if (!updated) {
      return { kind: "not_found" };
    }

    await this.db
      .insert(buildTestTable)
      .values({
        id: randomUUID(),
        buildId,
        status: "IN_PROGRESS",
        internalPort,
        runtimeUrl: null,
        createdAt: timestamp,
        startedAt: timestamp,
        finishedAt: null,
        updatedAt: timestamp
      })
      .onConflictDoUpdate({
        target: buildTestTable.buildId,
        set: {
          status: "IN_PROGRESS",
          internalPort,
          runtimeUrl: null,
          updatedAt: timestamp
        }
      });

    await this.db.insert(buildLogTable).values({
      id: randomUUID(),
      buildId,
      phase: "CONTAINER_TEST_STARTED",
      message: `Container test started: internalPort=${internalPort}`,
      createdAt: timestamp
    });

    return {
      kind: "started",
      response: toBuildStatusResponse(updated)
    };
  }

  async reportContainerTestResult(
    buildId: string,
    status: "IN_PROGRESS" | "SUCCESS" | "FAILED",
    details?: ContainerTestDetails
  ): Promise<ReportContainerTestResult> {
    const timestamp = new Date();
    // Wrap build_request update + build_test upsert + build_log insert in a
    // single transaction so that partial failures do not leave the build in a
    // half-reported state (e.g. status updated but log line missing, or test
    // snapshot stale relative to the latest phase transition).
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(buildRequestTable)
        .where(eq(buildRequestTable.id, buildId))
        .limit(1);

      if (!row) {
        return { kind: "not_found" } as const;
      }

      let nextPhase: BuildPhase = row.phase as BuildPhase;
      let nextStatus: BuildStatus = row.status as BuildStatus;

      // TASK-161: status 가 곧 ExecutionStatus 라 preview→execution 이중
      // 매핑이 사라졌다.
      if (status === "IN_PROGRESS") {
        nextPhase = "CONTAINER_TEST_STARTED";
        nextStatus = "BUILDING";
      } else if (status === "SUCCESS") {
        nextPhase = "CONTAINER_TEST_PASSED";
        nextStatus = "TEST_SUCCESS";
      } else {
        nextPhase = "FAILED";
        nextStatus = "FAILED";
      }

      const nextRuntimeUrl = details?.runtimeUrl ?? row.runtimeUrl;
      const nextPhaseHistory = advancePhaseHistory(
        (row.phaseHistory ?? []) as Array<{ phase: BuildPhase; completedAt: string }>,
        row.phase as BuildPhase,
        nextPhase,
        timestamp.toISOString()
      );

      // TASK-162: 컨테이너 테스트 실패도 build-level lastError 로 노출한다
      // (memory 저장소와 동일 semantics). build_test.error_code 에는 아래에서
      // 같은 값을 적는다.
      const testFailureColumns =
        status === "FAILED"
          ? {
              lastErrorCode: details?.errorCode ?? "CONTAINER_TEST_FAILED",
              lastErrorMessage: details?.errorMessage ?? "Container test failed."
            }
          : {};

      const [updated] = await tx
        .update(buildRequestTable)
        .set({
          phase: nextPhase,
          status: nextStatus,
          runtimeUrl: nextRuntimeUrl,
          phaseHistory: nextPhaseHistory,
          ...testFailureColumns,
          updatedAt: timestamp
        })
        .where(eq(buildRequestTable.id, buildId))
        .returning();

      if (!updated) {
        return { kind: "not_found" } as const;
      }

      await tx
        .insert(buildTestTable)
        .values({
          id: randomUUID(),
          buildId,
          status,
          host: details?.host ?? null,
          hostPort: details?.hostPort ?? null,
          containerRef: details?.containerRef ?? null,
          runtimeUrl: nextRuntimeUrl,
          healthCheckPassed:
            details?.healthCheckPassed ?? (status === "FAILED" ? false : null),
          portOpen: details?.portOpen ?? (status === "FAILED" ? false : null),
          stabilityWindowPassed:
            details?.stabilityWindowPassed ?? null,
          // TASK-162: 계약에 없던 `TEST_DEPLOYMENT_FAILED` 하드코딩 제거.
          // runner 가 준 이유를 그대로 쓰고, 없으면 canonical 기본값.
          errorCode:
            status === "FAILED"
              ? details?.errorCode ?? "CONTAINER_TEST_FAILED"
              : null,
          errorMessage:
            status === "FAILED"
              ? details?.errorMessage ?? "Container test failed."
              : null,
          createdAt: timestamp,
          startedAt: timestamp,
          finishedAt: status === "SUCCESS" || status === "FAILED" ? timestamp : null,
          updatedAt: timestamp
        })
        .onConflictDoUpdate({
          target: buildTestTable.buildId,
          set: {
            status,
            host: details?.host ?? null,
            hostPort: details?.hostPort ?? null,
            containerRef: details?.containerRef ?? null,
            runtimeUrl: nextRuntimeUrl,
            healthCheckPassed:
              details?.healthCheckPassed ?? (status === "FAILED" ? false : null),
            portOpen: details?.portOpen ?? (status === "FAILED" ? false : null),
            stabilityWindowPassed:
              details?.stabilityWindowPassed ?? null,
            errorCode:
              status === "FAILED"
                ? details?.errorCode ?? "CONTAINER_TEST_FAILED"
                : null,
            errorMessage:
              status === "FAILED"
                ? details?.errorMessage ?? "Container test failed."
                : null,
            finishedAt: status === "SUCCESS" || status === "FAILED" ? timestamp : null,
            updatedAt: timestamp
          }
        });

      await tx.insert(buildLogTable).values({
        id: randomUUID(),
        buildId,
        phase: nextPhase,
        message: `Container test: ${status}` + (nextRuntimeUrl ? ` url=${nextRuntimeUrl}` : ""),
        createdAt: timestamp
      });

      const [buildTestRow] = await tx
        .select()
        .from(buildTestTable)
        .where(eq(buildTestTable.buildId, buildId))
        .limit(1);

      return {
        kind: "ok",
        response: toBuildStatusResponse(updated, buildTestRow)
      } as const;
    });
  }

  async reportDeploymentResult(
    buildId: string,
    input: DeploymentReportRequest
  ): Promise<ReportDeploymentResult> {
    const timestamp = new Date();
    // Wrap build_request update + deployment_attempt upsert + build_log insert
    // + final left-join select in a single transaction so that the canonical
    // `deploy` / `resultDelivery` blocks read in the response are always
    // consistent with the just-written state.
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(buildRequestTable)
        .where(eq(buildRequestTable.id, buildId))
        .limit(1);

      if (!row) {
        return { kind: "not_found" } as const;
      }

      const nextPhase =
        input.status === "IN_PROGRESS"
          ? "DEPLOYMENT_STARTED"
          : input.status === "SUCCESS"
            ? "DEPLOYMENT_COMPLETED"
            : "FAILED";
      const nextStatus =
        input.status === "IN_PROGRESS"
          ? "DEPLOYING"
          : input.status === "SUCCESS"
            ? "DEPLOY_SUCCESS"
            : "FAILED";
      const nextPhaseHistory = advancePhaseHistory(
        (row.phaseHistory ?? []) as Array<{ phase: BuildPhase; completedAt: string }>,
        row.phase as BuildPhase,
        nextPhase as BuildPhase,
        timestamp.toISOString()
      );

      const [updated] = await tx
        .update(buildRequestTable)
        .set({
          phase: nextPhase as BuildPhase,
          status: nextStatus,
          phaseHistory: nextPhaseHistory,
          updatedAt: timestamp
        })
        .where(eq(buildRequestTable.id, buildId))
        .returning();

      if (!updated) {
        return { kind: "not_found" } as const;
      }

      await tx
        .insert(deploymentAttemptTable)
        .values({
          id: randomUUID(),
          buildId,
          status: input.status,
          targetType: input.targetType,
          targetRef: input.targetRef ?? null,
          resultRef: input.resultRef ?? null,
          responsePayloadJson: input.responsePayloadJson ?? null,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
          createdAt: timestamp,
          startedAt: timestamp,
          finishedAt:
            input.status === "SUCCESS" || input.status === "FAILED" ? timestamp : null,
          updatedAt: timestamp
        })
        .onConflictDoUpdate({
          target: deploymentAttemptTable.buildId,
          set: {
            status: input.status,
            targetType: input.targetType,
            targetRef: input.targetRef ?? null,
            resultRef: input.resultRef ?? null,
            responsePayloadJson: input.responsePayloadJson ?? null,
            errorCode: input.errorCode ?? null,
            errorMessage: input.errorMessage ?? null,
            finishedAt:
              input.status === "SUCCESS" || input.status === "FAILED" ? timestamp : null,
            updatedAt: timestamp
          }
        });

      await tx.insert(buildLogTable).values({
        id: randomUUID(),
        buildId,
        phase: nextPhase as BuildPhase,
        message:
          `Deployment status: ${input.status} targetType=${input.targetType}` +
          (input.resultRef ? ` resultRef=${input.resultRef}` : ""),
        createdAt: timestamp
      });

      // Final read inside the same transaction so the canonical `deploy` /
      // `resultDelivery` blocks reflect the upsert we just performed.
      const [joined] = await tx
        .select({
          build: buildRequestTable,
          buildTest: buildTestTable,
          deploymentAttempt: deploymentAttemptTable
        })
        .from(buildRequestTable)
        .leftJoin(buildTestTable, eq(buildTestTable.buildId, buildRequestTable.id))
        .leftJoin(
          deploymentAttemptTable,
          eq(deploymentAttemptTable.buildId, buildRequestTable.id)
        )
        .where(eq(buildRequestTable.id, buildId))
        .limit(1);

      return {
        kind: "ok",
        response: toBuildStatusResponse(
          joined?.build ?? updated,
          joined?.buildTest ?? null,
          joined?.deploymentAttempt ?? null
        )
      } as const;
    });
  }

  async listBuilds(query: BuildListQuery): Promise<BuildListResponse> {
    // (1) status filter, (2) requestedBy filter, (3) cursor skip
    //     (createdAt < cursor.createdAt OR (createdAt == cursor.createdAt
    //     AND id < cursor.id), id 기준 tiebreak), (4) createdAt desc, id
    //     desc, (5) limit.
    // 1차 골격은 id(uuid) 만 cursor 로 사용 — createdAt 비교는 backend 가
    // monotonic 하지 않을 수 있어 안정성 우선.
    const cursorRow = query.cursor
      ? (
          await this.db
            .select({ createdAt: buildRequestTable.createdAt })
            .from(buildRequestTable)
            .where(eq(buildRequestTable.id, query.cursor))
            .limit(1)
        )[0]
      : undefined;

    const conds = [];
    if (query.status) {
      conds.push(eq(buildRequestTable.status, query.status));
    }
    if (query.requestedBy) {
      conds.push(eq(buildRequestTable.requestedBy, query.requestedBy));
    }
    if (cursorRow) {
      // Skip rows with the same createdAt as the cursor and id <= cursor.id.
      // PostgreSQL: (createdAt, id) < (cursor.createdAt, cursor.id).
      conds.push(
        sql`(${buildRequestTable.createdAt}, ${buildRequestTable.id}) < (${cursorRow.createdAt}, ${buildRequestTable.id})`
      );
    }

    const rows = await this.db
      .select()
      .from(buildRequestTable)
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(buildRequestTable.createdAt), desc(buildRequestTable.id))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const summaries = page.map(mapBuildRowToSummary);
    const nextCursor = hasMore ? (summaries[summaries.length - 1]?.buildId ?? null) : null;

    return { builds: summaries, nextCursor };
  }

  // Admin-only methods (ADMIN-003). Reuses the same filter+sort+cursor
  // pipeline as listBuilds, then enriches each summary with the
  // requestedBy owner key. The listBuilds path already selected
  // requestedBy because mapBuildRowToSummary could surface it directly
  // (or by adding a thin parallel projection). We re-fetch the rows
  // here with the same predicates and read the column.
  async listBuildsAcrossUsers(
    query: AdminListBuildsQuery
  ): Promise<AdminListBuildsResponse> {
    const cursorRow = query.cursor
      ? (
          await this.db
            .select({
              createdAt: buildRequestTable.createdAt,
              id: buildRequestTable.id
            })
            .from(buildRequestTable)
            .where(eq(buildRequestTable.id, query.cursor))
            .limit(1)
        )[0]
      : undefined;

    const conds = [];
    if (query.status) {
      conds.push(eq(buildRequestTable.status, query.status));
    }
    if (query.requestedBy) {
      conds.push(eq(buildRequestTable.requestedBy, query.requestedBy));
    }
    if (cursorRow) {
      conds.push(
        sql`(${buildRequestTable.createdAt}, ${buildRequestTable.id}) < (${cursorRow.createdAt}, ${buildRequestTable.id})`
      );
    }

    const rows = await this.db
      .select()
      .from(buildRequestTable)
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(buildRequestTable.createdAt), desc(buildRequestTable.id))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const enriched: AdminUserBuildSummary[] = page.map((row) => ({
      ...mapBuildRowToSummary(row),
      requestedBy: row.requestedBy
    }));
    const nextCursor = hasMore
      ? enriched[enriched.length - 1]?.buildId ?? null
      : null;
    return { builds: enriched, nextCursor };
  }

  async listBuildOwners(): Promise<AdminUserListResponse> {
    // GROUP BY requestedBy on the build_request table. count(*) +
    // max(createdAt) 를 한 번에 가져와 메모리 정렬. 빌드 수가 많아지면
    // (1) 페이지네이션, (2) createdAt 기준 인덱스 정밀화를 후속 PR 에서
    // 다룬다. 현 1차 골격은 전체 owner 를 한 번에 반환.
    //
    // TODO (ADMIN-006 follow-up): AdminListBuildsQuery 와 동일한
    // `limit` + `cursor` 파라미터로 owner rollup 도 페이지네이션
    // 한다. cursor 키는 (lastBuildAt, userId) tuple. 이 자리에
    // `limit: query.limit ?? 100` 와 `.limit(...)` 절이 들어가고,
    // 응답 envelope 에 nextCursor 가 추가되어야 한다. 스키마
    // (adminUserListResponseSchema) 도 같이 evolve 한다.
    const rows = await this.db
      .select({
        userId: buildRequestTable.requestedBy,
        buildCount: sql<number>`count(*)::int`,
        lastBuildAt: sql<string | null>`max(${buildRequestTable.createdAt})`
      })
      .from(buildRequestTable)
      .groupBy(buildRequestTable.requestedBy)
      .orderBy(sql`max(${buildRequestTable.createdAt}) DESC`);

    const users: AdminUserSummary[] = rows.map((row) => ({
      userId: row.userId,
      buildCount: row.buildCount,
      lastBuildAt: row.lastBuildAt
        ? new Date(row.lastBuildAt as unknown as string | Date).toISOString()
        : null
    }));

    return { users };
  }

  // TASK-066: store the source archive bytes for `buildId`. The whole
  // operation runs inside a single transaction so the build existence
  // check and the upsert observe the same snapshot — a concurrent
  // build deletion cannot leave the source row orphaned. The SHA-256
  // and size are recomputed from the actual `bytes` rather than
  // trusting the caller-supplied metadata, so a tampered body is
  // rejected before the row is written. The `bytea` column is updated
  // via an `INSERT ... ON CONFLICT DO UPDATE` so a re-upload of the
  // same buildId replaces the previous bytes (last-write-wins) — the
  // same semantic as the in-memory repository.
  async storeSourceArchive(
    buildId: string,
    bytes: Uint8Array,
    expectedChecksumSha256: string,
    expectedSizeBytes: number
  ): Promise<StoreSourceArchiveResult> {
    // The SHA-256 is computed once and reused for both the mismatch
    // check and the row write so a single computation covers the full
    // verification path.
    const actualChecksumSha256 = createHash("sha256")
      .update(Buffer.from(bytes))
      .digest("hex");
    if (actualChecksumSha256 !== expectedChecksumSha256) {
      return {
        kind: "checksum_mismatch",
        expected: expectedChecksumSha256,
        actual: actualChecksumSha256
      };
    }

    const actualSizeBytes = bytes.byteLength;
    if (actualSizeBytes !== expectedSizeBytes) {
      return {
        kind: "size_mismatch",
        expected: expectedSizeBytes,
        actual: actualSizeBytes
      };
    }

    return this.db.transaction(async (tx) => {
      const [buildExists] = await tx
        .select({ id: buildRequestTable.id })
        .from(buildRequestTable)
        .where(eq(buildRequestTable.id, buildId))
        .limit(1);

      if (!buildExists) {
        return { kind: "not_found" } as const;
      }

      // Drizzle's pg driver accepts Uint8Array directly for `bytea`
      // columns and serialises it as the binary form. We do not need to
      // hex-encode the payload ourselves.
      await tx
        .insert(buildSourceTable)
        .values({
          buildId,
          bytes: new Uint8Array(bytes),
          checksumSha256: actualChecksumSha256,
          sizeBytes: actualSizeBytes
        })
        .onConflictDoUpdate({
          target: buildSourceTable.buildId,
          set: {
            bytes: new Uint8Array(bytes),
            checksumSha256: actualChecksumSha256,
            sizeBytes: actualSizeBytes,
            updatedAt: new Date()
          }
        });
      // TASK-106: a fresh legacy single-shot upload wipes any prior
      // chunked upload for the same buildId so the two sides never
      // disagree on which bytes are current.
      await tx
        .delete(buildSourceChunkTable)
        .where(eq(buildSourceChunkTable.buildId, buildId));

      return {
        kind: "ok",
        checksumSha256: actualChecksumSha256,
        sizeBytes: actualSizeBytes
      } as const;
    });
  }

  // TASK-066 / TASK-106: read the stored archive bytes. Chunked
  // uploads (TASK-106) take precedence over the legacy single-shot
  // storage (TASK-066) — the chunked side is authoritative because
  // it is the more recent upload path. The legacy side is wiped on
  // the first chunked write (and vice versa, in `storeSourceArchive`),
  // so the precedence only matters when an operator ran both paths
  // across a boundary. Returns a fresh `Uint8Array` so the caller
  // is not coupled to Drizzle's internal row representation. A
  // build with no uploaded archive is reported as `not_found` — no
  // `bytes` row in either table — distinct from the build itself
  // being missing, which is reported as `not_found` from the build
  // existence check first so a 404 from the route layer is the same
  // for both.
  async getSourceArchive(buildId: string): Promise<GetSourceArchiveResult> {
    const chunked = await this.getSourceArchiveFromChunks(buildId);
    if (chunked.kind === "ok") {
      return chunked;
    }
    const [row] = await this.db
      .select({
        buildId: buildSourceTable.buildId,
        bytes: buildSourceTable.bytes,
        checksumSha256: buildSourceTable.checksumSha256,
        sizeBytes: buildSourceTable.sizeBytes
      })
      .from(buildSourceTable)
      .where(eq(buildSourceTable.buildId, buildId))
      .limit(1);

    if (!row) {
      return { kind: "not_found" };
    }

    return {
      kind: "ok",
      bytes: new Uint8Array(row.bytes),
      checksumSha256: row.checksumSha256,
      sizeBytes: row.sizeBytes
    };
  }

  // TASK-066: read the declared `SourceArchive` metadata from
  // `build_request` directly. No need to touch `build_source` — the
  // metadata is part of the build row and is present the moment
  // `POST /builds` succeeds, regardless of whether the Skill has
  // uploaded the actual bytes yet. Used by the upload route to
  // validate an incoming `POST /builds/:buildId/source` payload.
  async getSourceArchiveMetadata(
    buildId: string
  ): Promise<GetSourceArchiveMetadataResult> {
    const [row] = await this.db
      .select({
        objectKey: buildRequestTable.sourceArchiveKey,
        checksumSha256: buildRequestTable.sourceArchiveChecksumSha256,
        sizeBytes: buildRequestTable.sourceArchiveSizeBytes
      })
      .from(buildRequestTable)
      .where(eq(buildRequestTable.id, buildId))
      .limit(1);

    if (!row) {
      return { kind: "not_found" };
    }

    return {
      kind: "ok",
      sourceArchive: {
        objectKey: row.objectKey,
        checksumSha256: row.checksumSha256,
        sizeBytes: row.sizeBytes
      }
    };
  }

  // TASK-066: delete the stored archive bytes. The build row
  // itself (and `build_request.source_archive_*` columns) is
  // untouched so the declared metadata remains the canonical
  // record of what the Skill committed to. `DELETE ... RETURNING`
  // is used so a missing row yields 0 rows and we can report
  // `not_found` for the build (vs `ok` for "build exists, no
  // archive was present") without a separate existence check —
  // but that ambiguity is fine: both states end with no bytes
  // present, which is what `DELETE` was trying to achieve.
  //
  // TASK-106: this also clears the chunked upload (all rows in
  // `build_source_chunk` for this buildId) so the two storage
  // sides stay in sync. Either side populated ⇒ `ok`; neither
  // populated ⇒ `not_found`.
  async deleteSourceArchive(
    buildId: string
  ): Promise<DeleteSourceArchiveResult> {
    const [legacyResult, chunkedResult] = await Promise.all([
      this.db
        .delete(buildSourceTable)
        .where(eq(buildSourceTable.buildId, buildId))
        .returning({ buildId: buildSourceTable.buildId }),
      this.db
        .delete(buildSourceChunkTable)
        .where(eq(buildSourceChunkTable.buildId, buildId))
        .returning({ buildId: buildSourceChunkTable.buildId })
    ]);
    if (legacyResult.length === 0 && chunkedResult.length === 0) {
      return { kind: "not_found" };
    }
    return { kind: "ok" };
  }

  // TASK-106: chunked upload. Same per-chunk invariants as the
  // memory repository — the chunk's SHA-256 is recomputed from the
  // bytes, the declared `totalSizeBytes` is the
  // `BuildRequest.sourceArchive.sizeBytes` recorded at `POST
  // /builds`, and `idx` is the 0-based chunk index rolled from
  // the chunked upload's prior chunks for this build. We write one
  // row per chunk into `build_source_chunk` via an `INSERT ...
  // ON CONFLICT (build_id, idx) DO UPDATE` so retries at the same
  // index replace the chunk (last-write-wins). When the final
  // chunk lands (`isFinalChunk`) the whole-archive SHA-256 is the
  // one declared at `POST /builds` — we rely on
  // `build_request.source_archive_checksum_sha256` and do not
  // recompute it (the per-chunk checksums already cover integrity).
  async storeSourceChunk(
    buildId: string,
    bytes: Uint8Array,
    perChunkChecksumSha256: string,
    declaredTotalSizeBytes: number,
    contentRange?: ContentRangeParts,
    strictContentRange: boolean = false
  ): Promise<StoreSourceChunkResult> {
    const buildRow = await this.db
      .select({ id: buildRequestTable.id })
      .from(buildRequestTable)
      .where(eq(buildRequestTable.id, buildId))
      .limit(1);
    if (buildRow.length === 0) {
      return { kind: "not_found" };
    }
    const actualSizeBytes = bytes.byteLength;
    const actualChecksumSha256 = createHash("sha256")
      .update(Buffer.from(bytes))
      .digest("hex");
    if (actualChecksumSha256 !== perChunkChecksumSha256) {
      return {
        kind: "checksum_mismatch",
        expected: perChunkChecksumSha256,
        actual: actualChecksumSha256
      };
    }
    if (declaredTotalSizeBytes <= 0) {
      return {
        kind: "size_mismatch",
        expected: declaredTotalSizeBytes,
        actual: actualSizeBytes
      };
    }
    // TASK-108: Content-Range total cross-check (same as memory
    // repository). When the caller supplies a Content-Range header
    // the `total` is the declared archive size per their framing;
    // a mismatch surfaces `content_range_mismatch` rather than
    // silently trusting either side.
    //
    // TASK-109: when `total` is `*` (RFC 7233 §4.2 unknown total)
    // the numeric equality check is inapplicable. We still enforce
    // that the chunk's `[start, start + size)` range lies within
    // `declaredTotalSizeBytes` because the build's declared
    // metadata is the server-side source-of-truth. A stricter
    // alternative — reject `*` outright and force the caller to
    // supply a numeric total — is documented in
    // `docs/operations/content-range-rfc-7233-star-2026-07-20.md`
    // as the "strict" path; we adopt the lenient default to let
    // existing callers adopt RFC 7233 incrementally.
    //
    // TASK-110: STRICT_CONTENT_RANGE env flag mirror. When the
    // route layer sets this flag the repository rejects callers that
    // supply `Content-Range` with `*` total — they must provide a
    // numeric total to satisfy the cross-check. This is the
    // operationally enforced variant of the "strict" alternative
    // noted above; operators flip it on once they're ready to
    // require numeric totals.
    if (contentRange) {
      if (strictContentRange && contentRange.total === 0) {
        // TASK-110: STRICT_CONTENT_RANGE=true 인 경우 `*` total
        // 거부.
        return {
          kind: "content_range_invalid"
        };
      }
      if (contentRange.total > 0 && contentRange.total !== declaredTotalSizeBytes) {
        return {
          kind: "content_range_mismatch",
          declared: declaredTotalSizeBytes,
          supplied: contentRange.total
        };
      }
      // `*` 케이스 — total 부재. chunk 의 end+1 이 declared 를
      // 넘어가면 size_mismatch 로 거절.
      if (contentRange.total === 0 && contentRange.end + 1 > declaredTotalSizeBytes) {
        return {
          kind: "size_mismatch",
          expected: declaredTotalSizeBytes,
          actual: contentRange.end + 1
        };
      }
    }
    // silently trusting either side.
    //
    // TASK-109: when `total` is `*` (RFC 7233 §4.2 unknown total)
    // the numeric equality check is inapplicable. We still enforce
    // that the chunk's `[start, start + size)` range lies within
    // `declaredTotalSizeBytes` because the build's declared
    // metadata is the server-side source-of-truth. The strictly-
    // numeric alternative (reject `*` outright) is documented as
    // the "strict" path in the TASK-109 follow-up operating guide;
    // the lenient default lets existing callers adopt RFC 7233
    // incrementally.
    if (contentRange) {
      if (contentRange.total > 0 && contentRange.total !== declaredTotalSizeBytes) {
        return {
          kind: "content_range_mismatch",
          declared: declaredTotalSizeBytes,
          supplied: contentRange.total
        };
      }
      // `*` 케이스 — total 부재. chunk 의 end+1 이 declared 를
      // 넘어가면 size_mismatch 로 거절.
      if (contentRange.total === 0 && contentRange.end + 1 > declaredTotalSizeBytes) {
        return {
          kind: "size_mismatch",
          expected: declaredTotalSizeBytes,
          actual: contentRange.end + 1
        };
      }
    }
    // TASK-108: 의미 C bipartite — semantic A (Content-Range
    // trusted) vs semantic B (monotonic sequence). Both paths share
    // `(build_id, idx)` uniqueness so a caller can mix semantic-B
    // (no header) and semantic-A (with header) uploads in the same
    // archive.
    let idx: number;
    if (contentRange) {
      // Semantic A: derive idx from the chunk's start offset. The
      // derivation matches MAX_CHUNK_SIZE = 16 MiB so multiple
      // callers can independently pick a non-contiguous range and
      // write to a specific index.
      const MAX_CHUNK_SIZE_FOR_DERIVATION = 16 * 1024 * 1024;
      idx = Math.floor(contentRange.start / MAX_CHUNK_SIZE_FOR_DERIVATION);
      // Content-Range's end must equal start + bytes.length - 1.
      const expectedEnd = contentRange.start + actualSizeBytes - 1;
      if (contentRange.end !== expectedEnd) {
        return { kind: "content_range_invalid" };
      }
      if (contentRange.start + actualSizeBytes > declaredTotalSizeBytes) {
        return { kind: "size_mismatch", expected: declaredTotalSizeBytes, actual: contentRange.start + actualSizeBytes };
      }
    } else {
      // Semantic B (TASK-106 default): monotonic sequence.
      const priorCount = await this.db
        .select({ id: buildSourceChunkTable.id })
        .from(buildSourceChunkTable)
        .where(eq(buildSourceChunkTable.buildId, buildId));
      idx = priorCount.length;
    }
    const totalChunks = Math.ceil(declaredTotalSizeBytes / 1024);
    if (idx >= totalChunks) {
      return { kind: "idx_out_of_range", idx, totalChunks };
    }
    await this.db
      .insert(buildSourceChunkTable)
      .values({
        buildId,
        idx,
        bytes: Buffer.from(bytes),
        sizeBytes: actualSizeBytes,
        checksumSha256: actualChecksumSha256
      })
      .onConflictDoUpdate({
        target: [buildSourceChunkTable.buildId, buildSourceChunkTable.idx],
        set: {
          bytes: Buffer.from(bytes),
          sizeBytes: actualSizeBytes,
          checksumSha256: actualChecksumSha256
        }
      });
    // First chunk wipes the legacy `build_source` row so the two
    // sides never disagree on which is authoritative.
    if (idx === 0) {
      await this.db.delete(buildSourceTable).where(eq(buildSourceTable.buildId, buildId));
    }
    // The "final" chunk is the one that completes the upload —
    // i.e. after this write the cumulative size equals the declared
    // total. Recompute by summing chunk sizes for this build.
    const cumulativeRows = await this.db
      .select({ sizeBytes: buildSourceChunkTable.sizeBytes })
      .from(buildSourceChunkTable)
      .where(eq(buildSourceChunkTable.buildId, buildId));
    const cumulative = cumulativeRows.reduce((acc, r) => acc + r.sizeBytes, 0);
    const isFinalChunk = cumulative >= declaredTotalSizeBytes;
    return {
      kind: "ok",
      checksumSha256: actualChecksumSha256,
      sizeBytes: actualSizeBytes,
      idx,
      isFinalChunk
    };
  }

  // TASK-106: chunked `getSourceArchive` path. Concatenates the
  // rows in ascending `idx` order into a single `Uint8Array`. The
  // per-chunk checksums have already been verified on upload; the
  // declared whole-archive SHA-256 is taken from the build row.
  async getSourceArchiveFromChunks(
    buildId: string
  ): Promise<GetSourceArchiveResult> {
    const buildRow = await this.db
      .select({ checksumSha256: buildRequestTable.sourceArchiveChecksumSha256 })
      .from(buildRequestTable)
      .where(eq(buildRequestTable.id, buildId))
      .limit(1);
    if (buildRow.length === 0) {
      return { kind: "not_found" };
    }
    const rows = await this.db
      .select({ bytes: buildSourceChunkTable.bytes, sizeBytes: buildSourceChunkTable.sizeBytes })
      .from(buildSourceChunkTable)
      .where(eq(buildSourceChunkTable.buildId, buildId))
      .orderBy(buildSourceChunkTable.idx);
    if (rows.length === 0) {
      return { kind: "not_found" };
    }
    const totalSize = rows.reduce((acc, r) => acc + r.sizeBytes, 0);
    const out = new Uint8Array(totalSize);
    let offset = 0;
    for (const row of rows) {
      out.set(new Uint8Array(row.bytes), offset);
      offset += row.sizeBytes;
    }
    const checksumSha256 = buildRow[0]?.checksumSha256;
    if (!checksumSha256) {
      return { kind: "not_found" };
    }
    return {
      kind: "ok",
      bytes: out,
      checksumSha256,
      sizeBytes: totalSize
    };
  }

  // -------------------------------------------------------------------------
  // TASK-069: runner registry (admin menu backing store, postgres variant).
  //
  // The schema lives in `packages/db/src/schema/runner.ts` and the migration
  // in `apps/build-server/migrations/0005_runner_registry.sql`. Memory + postgres
  // repos implement the same 6 methods on the `BuildRepository` interface
  // so the admin routes don't care which backend is wired.
  // -------------------------------------------------------------------------

  async registerRunner(runnerId: string): Promise<AdminRunner> {
    // PostgreSQL upsert: ON CONFLICT (runner_id) DO UPDATE — preserve status
    // (admin 의 DISABLED 토글이 runner 재시작 시 사라지지 않게), but bump
    // last_seen_at to keep the freshness signal honest.
    const inserted = await this.db
      .insert(runnerTable)
      .values({
        runnerId,
        status: "ACTIVE",
        firstSeenAt: sql`NOW()`,
        lastSeenAt: sql`NOW()`,
        buildsClaimed: 0,
        buildsCompleted: 0,
        currentBuildId: null,
        lastError: null
      })
      .onConflictDoUpdate({
        target: runnerTable.runnerId,
        set: {
          lastSeenAt: sql`NOW()`
        }
      })
      .returning();
    const row = inserted[0];
    if (!row) {
      // ON CONFLICT DO UPDATE 의 returning() 는 항상 row 를 반환해야 하지만
      // 타입 가드를 위해 안전망 추가.
      throw new Error(`registerRunner(${runnerId}) returned no row`);
    }
    return rowToAdminRunner(row);
  }

  // TASK-077: admin-initiated runner registration. INSERT with
  // ON CONFLICT DO NOTHING — if the row already exists, the insert is
  // a no-op and the `.returning()` array is empty, which we surface as
  // `{ kind: "duplicate" }`. This pattern is atomic in a single SQL
  // statement (no SELECT-then-INSERT race) and matches the in-memory
  // repo's contract exactly.
  async createAdminRunner(
    runnerId: string
  ): Promise<
    | { kind: "created"; runner: AdminRunner }
    | { kind: "duplicate" }
  > {
    const inserted = await this.db
      .insert(runnerTable)
      .values({
        runnerId,
        status: "ACTIVE",
        firstSeenAt: sql`NOW()`,
        lastSeenAt: sql`NOW()`,
        buildsClaimed: 0,
        buildsCompleted: 0,
        currentBuildId: null,
        lastError: null
      })
      .onConflictDoNothing({
        target: runnerTable.runnerId
      })
      .returning();
    const row = inserted[0];
    if (!row) {
      return { kind: "duplicate" };
    }
    return { kind: "created", runner: rowToAdminRunner(row) };
  }

  async markRunnerSeen(
    runnerId: string,
    currentBuildId: string | null,
    event: "claimed" | "completed" | "failed"
  ): Promise<AdminRunner | null> {
    // Conditional UPDATE — counter/event 의 분기를 event 별 SQL fragment 로
    // 표현. WHERE runner_id matches; returns null if not found so callers
    // can register-on-first-call 패턴을 강제하지 않고도 정합 보장.
    if (event === "claimed") {
      const updated = await this.db
        .update(runnerTable)
        .set({
          lastSeenAt: sql`NOW()`,
          currentBuildId,
          buildsClaimed: sql`${runnerTable.buildsClaimed} + 1`
        })
        .where(eq(runnerTable.runnerId, runnerId))
        .returning();
      return updated[0] ? rowToAdminRunner(updated[0]) : null;
    }
    if (event === "completed") {
      const updated = await this.db
        .update(runnerTable)
        .set({
          lastSeenAt: sql`NOW()`,
          currentBuildId: null,
          buildsCompleted: sql`${runnerTable.buildsCompleted} + 1`,
          lastError: null
        })
        .where(eq(runnerTable.runnerId, runnerId))
        .returning();
      return updated[0] ? rowToAdminRunner(updated[0]) : null;
    }
    // failed
    const updated = await this.db
      .update(runnerTable)
      .set({
        lastSeenAt: sql`NOW()`,
        currentBuildId: null
      })
      .where(eq(runnerTable.runnerId, runnerId))
      .returning();
    return updated[0] ? rowToAdminRunner(updated[0]) : null;
  }

  async listRunners(): Promise<AdminRunnerListResponse> {
    const rows = await this.db
      .select()
      .from(runnerTable)
      .orderBy(asc(runnerTable.runnerId));
    return { runners: rows.map(rowToAdminRunner) };
  }

  async setRunnerStatus(runnerId: string, status: RunnerStatus) {
    const updated = await this.db
      .update(runnerTable)
      .set({ status })
      .where(eq(runnerTable.runnerId, runnerId))
      .returning();
    return updated[0] ? rowToAdminRunner(updated[0]) : null;
  }

  async deleteRunner(runnerId: string) {
    const deleted = await this.db
      .delete(runnerTable)
      .where(eq(runnerTable.runnerId, runnerId))
      .returning({ runnerId: runnerTable.runnerId });
    return deleted.length > 0
      ? ({ removed: true as const })
      : ({ removed: false as const });
  }

  async getRunnerStatus(runnerId: string): Promise<RunnerStatus | null> {
    const row = await this.db
      .select({ status: runnerTable.status })
      .from(runnerTable)
      .where(eq(runnerTable.runnerId, runnerId))
      .limit(1);
    return row[0] ? (row[0].status as RunnerStatus) : null;
  }
}

// TASK-069: postgres → AdminRunner 변환. row 의 status 는 text 로 저장되지만
// canonical enum 으로 narrow 한다 (DB 가 enum 제약이 없으므로 가드).
function rowToAdminRunner(row: {
  runnerId: string;
  status: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  buildsClaimed: number;
  buildsCompleted: number;
  currentBuildId: string | null;
  lastError: string | null;
}): AdminRunner {
  return {
    runnerId: row.runnerId,
    status: row.status === "DISABLED" ? "DISABLED" : "ACTIVE",
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    buildsClaimed: row.buildsClaimed,
    buildsCompleted: row.buildsCompleted,
    currentBuildId: row.currentBuildId,
    lastError: row.lastError
  };
}
