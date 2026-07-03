import { randomUUID } from "node:crypto";

import {
  buildTestTable,
  and,
  asc,
  buildLogTable,
  buildRequestTable,
  desc,
  deploymentAttemptTable,
  sql,
  type DatabaseClient
} from "@docker-image-builder-system/db";
import { eq, inArray } from "@docker-image-builder-system/db";

import type {
  AdminListBuildsQuery,
  AdminListBuildsResponse,
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
  PreviewStatus,
  TestDeployment
} from "@docker-image-builder-system/shared-contract";

import type {
  BuildRepository,
  ClaimNextBuildResult,
  CreateBuildResult,
  GetTestDeploymentResult,
  PreviewStatusDetails,
  QueueTestDeploymentResult,
  ReportDeploymentResult,
  ReportPreviewStatusResult,
  UpdatePhaseResult
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

const activeBuildStatuses: BuildStatus[] = ["QUEUED", "CLAIMED", "BUILDING", "TEST_READY"];

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
    previewStatus: row.previewStatus as PreviewStatus,
    previewUrl: row.previewUrl,
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

function mapBuildTestRowToDeployment(
  buildRow: BuildRequestRow,
  testRow: BuildTestRow | null | undefined
): TestDeployment | null {
  if (buildRow.previewStatus === "NOT_REQUESTED") {
    return null;
  }

  return {
    status: buildRow.previewStatus as TestDeployment["status"],
    previewUrl: testRow?.runtimeUrl ?? buildRow.previewUrl,
    host: testRow?.host ?? null,
    hostPort: testRow?.hostPort ?? null,
    internalPort: testRow?.internalPort ?? null,
    expiresAt: null,
    updatedAt: buildRow.updatedAt.toISOString()
  };
}

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
    testDeployment: mapBuildTestRowToDeployment(row, buildTestRow),
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
          previewStatus: "NOT_REQUESTED",
          sourceArchiveKey: input.sourceArchive.objectKey,
          sourceArchiveChecksumSha256: input.sourceArchive.checksumSha256,
          sourceArchiveSizeBytes: input.sourceArchive.sizeBytes,
          entrypointPath: input.entrypointPath,
          dockerfilePath: input.dockerfilePath,
          previewTtlMinutes: input.previewTtlMinutes,
          metadata: input.metadata,
          previewUrl: null,
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

  async claimNextBuild(): Promise<ClaimNextBuildResult> {
    return this.db.transaction(async (tx) => {
      const [activeRow] = await tx
        .select()
        .from(buildRequestTable)
        .where(inArray(buildRequestTable.status, ["CLAIMED", "BUILDING", "TEST_READY"] as BuildStatus[]))
        .orderBy(asc(buildRequestTable.createdAt))
        .limit(1);

      if (activeRow) {
        const activeSummary = mapBuildRowToSummary(activeRow);
        return {
          kind: "active_build_exists",
          build: toBuildStatusResponse(activeRow)
        };
      }

      const [nextRow] = await tx
        .select()
        .from(buildRequestTable)
        .where(eq(buildRequestTable.status, "QUEUED"))
        .orderBy(asc(buildRequestTable.createdAt))
        .limit(1);

      if (!nextRow) {
        return { kind: "no_build_available" };
      }

      const timestamp = new Date();
      const nextPhaseHistory = advancePhaseHistory(
        (nextRow.phaseHistory ?? []) as Array<{ phase: BuildPhase; completedAt: string }>,
        nextRow.phase as BuildPhase,
        "QUEUE_CLAIMED",
        timestamp.toISOString()
      );

      const [updated] = await tx
        .update(buildRequestTable)
        .set({
          status: "CLAIMED",
          phase: "QUEUE_CLAIMED",
          phaseHistory: nextPhaseHistory,
          updatedAt: timestamp
        })
        .where(
          and(
            eq(buildRequestTable.id, nextRow.id),
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

  async updatePhase(buildId: string, phase: string): Promise<UpdatePhaseResult> {
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

    const [updated] = await this.db
      .update(buildRequestTable)
      .set({
        phase: phase as BuildPhase,
        status: nextStatus,
        phaseHistory: nextPhaseHistory,
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

  async queueTestDeployment(
    buildId: string,
    internalPort: number,
    ttlMinutes: number
  ): Promise<QueueTestDeploymentResult> {
    const [row] = await this.db
      .select()
      .from(buildRequestTable)
      .where(eq(buildRequestTable.id, buildId))
      .limit(1);

    if (!row) {
      return { kind: "not_found" };
    }

    if (!["BUILDING", "TEST_READY"].includes(row.status as string) &&
        !["DOCKER_BUILD_COMPLETED", "TEST_READY"].includes(row.phase as string)) {
      return {
        kind: "invalid_state",
        reason: `cannot queue preview from phase=${row.phase} status=${row.status}`
      };
    }

    const timestamp = new Date();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    const nextPhaseHistory = advancePhaseHistory(
      (row.phaseHistory ?? []) as Array<{ phase: BuildPhase; completedAt: string }>,
      row.phase as BuildPhase,
      "PREVIEW_QUEUED",
      timestamp.toISOString()
    );

    const [updated] = await this.db
      .update(buildRequestTable)
      .set({
        phase: "PREVIEW_QUEUED",
        previewStatus: "QUEUED",
        previewUrl: null,
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
      phase: "PREVIEW_QUEUED",
      message: `Preview queued: internalPort=${internalPort} ttlMinutes=${ttlMinutes}`,
      createdAt: timestamp
    });

    const testDeployment: TestDeployment = {
      status: "QUEUED",
      previewUrl: null,
      host: null,
      hostPort: null,
      internalPort,
      expiresAt: expiresAt.toISOString(),
      updatedAt: timestamp.toISOString()
    };

    return {
      kind: "queued",
      response: toBuildStatusResponse(updated),
      testDeployment
    };
  }

  async reportPreviewStatus(
    buildId: string,
    status: "PROVISIONING" | "READY" | "FAILED" | "EXPIRED",
    details?: PreviewStatusDetails
  ): Promise<ReportPreviewStatusResult> {
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

      if (status === "PROVISIONING") {
        nextPhase = "PREVIEW_QUEUED";
        nextStatus = "BUILDING";
      } else if (status === "READY") {
        nextPhase = "PREVIEW_READY";
        nextStatus = "TEST_READY";
      } else if (status === "FAILED") {
        nextPhase = "FAILED";
        nextStatus = "FAILED";
      }

      const nextPreviewUrl = details?.previewUrl ?? row.previewUrl;
      const nextPhaseHistory = advancePhaseHistory(
        (row.phaseHistory ?? []) as Array<{ phase: BuildPhase; completedAt: string }>,
        row.phase as BuildPhase,
        nextPhase,
        timestamp.toISOString()
      );

      const [updated] = await tx
        .update(buildRequestTable)
        .set({
          phase: nextPhase,
          status: nextStatus,
          previewStatus: status as PreviewStatus,
          previewUrl: nextPreviewUrl,
          phaseHistory: nextPhaseHistory,
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
          status:
            status === "READY"
              ? "SUCCESS"
              : status === "FAILED"
                ? "FAILED"
                : "IN_PROGRESS",
          host: details?.host ?? null,
          hostPort: details?.hostPort ?? null,
          containerRef: details?.containerRef ?? null,
          runtimeUrl: nextPreviewUrl,
          healthCheckPassed:
            details?.healthCheckPassed ?? (status === "FAILED" ? false : null),
          portOpen: details?.portOpen ?? (status === "FAILED" ? false : null),
          stabilityWindowPassed:
            details?.stabilityWindowPassed ?? (status === "EXPIRED" ? true : null),
          errorCode: status === "FAILED" ? "TEST_DEPLOYMENT_FAILED" : null,
          errorMessage: status === "FAILED" ? "Preview/test deployment failed." : null,
          createdAt: timestamp,
          startedAt: timestamp,
          finishedAt: status === "READY" || status === "FAILED" ? timestamp : null,
          updatedAt: timestamp
        })
        .onConflictDoUpdate({
          target: buildTestTable.buildId,
          set: {
            status:
              status === "READY"
                ? "SUCCESS"
                : status === "FAILED"
                  ? "FAILED"
                  : "IN_PROGRESS",
            host: details?.host ?? null,
            hostPort: details?.hostPort ?? null,
            containerRef: details?.containerRef ?? null,
            runtimeUrl: nextPreviewUrl,
            healthCheckPassed:
              details?.healthCheckPassed ?? (status === "FAILED" ? false : null),
            portOpen: details?.portOpen ?? (status === "FAILED" ? false : null),
            stabilityWindowPassed:
              details?.stabilityWindowPassed ?? (status === "EXPIRED" ? true : null),
            errorCode: status === "FAILED" ? "TEST_DEPLOYMENT_FAILED" : null,
            errorMessage: status === "FAILED" ? "Preview/test deployment failed." : null,
            finishedAt: status === "READY" || status === "FAILED" ? timestamp : null,
            updatedAt: timestamp
          }
        });

      await tx.insert(buildLogTable).values({
        id: randomUUID(),
        buildId,
        phase: nextPhase,
        message: `Preview status: ${status}` + (details?.previewUrl ? ` url=${details.previewUrl}` : ""),
        createdAt: timestamp
      });

      const [buildTestRow] = await tx
        .select()
        .from(buildTestTable)
        .where(eq(buildTestTable.buildId, buildId))
        .limit(1);

      const testDeployment: TestDeployment = {
        status,
        previewUrl: nextPreviewUrl,
        host: details?.host ?? null,
        hostPort: details?.hostPort ?? null,
        internalPort: buildTestRow?.internalPort ?? null,
        expiresAt: null,
        updatedAt: timestamp.toISOString()
      };

      return {
        kind: "ok",
        response: toBuildStatusResponse(updated, buildTestRow),
        testDeployment
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

  async getTestDeployment(buildId: string): Promise<GetTestDeploymentResult> {
    // Left join build_test so the legacy TestDeployment response exposes the
    // same host / hostPort / internalPort / runtimeUrl as the canonical
    // ContainerTestResult block returned by getBuild. Without the join the
    // runner-side host info recorded in build_test would be invisible here.
    const [row] = await this.db
      .select({
        previewStatus: buildRequestTable.previewStatus,
        previewUrl: buildRequestTable.previewUrl,
        updatedAt: buildRequestTable.updatedAt,
        buildTestHost: buildTestTable.host,
        buildTestHostPort: buildTestTable.hostPort,
        buildTestInternalPort: buildTestTable.internalPort,
        buildTestRuntimeUrl: buildTestTable.runtimeUrl
      })
      .from(buildRequestTable)
      .leftJoin(buildTestTable, eq(buildTestTable.buildId, buildRequestTable.id))
      .where(eq(buildRequestTable.id, buildId))
      .limit(1);

    if (!row) {
      return { kind: "not_found" };
    }
    if (!row.previewStatus || row.previewStatus === "NOT_REQUESTED") {
      return { kind: "not_requested" };
    }

    const testDeployment: TestDeployment = {
      status: row.previewStatus as TestDeployment["status"],
      previewUrl: row.buildTestRuntimeUrl ?? row.previewUrl,
      host: row.buildTestHost ?? null,
      hostPort: row.buildTestHostPort ?? null,
      internalPort: row.buildTestInternalPort ?? null,
      expiresAt: null,
      updatedAt: row.updatedAt.toISOString()
    };

    return { kind: "found", testDeployment };
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
}
