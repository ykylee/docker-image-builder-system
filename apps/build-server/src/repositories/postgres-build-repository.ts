import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  buildLogTable,
  buildRequestTable,
  desc,
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
  ErrorCode,
  PreviewStatus,
  TestDeployment
} from "@docker-image-builder-system/shared-contract";

import type {
  BuildRepository,
  ClaimNextBuildResult,
  CreateBuildResult,
  GetTestDeploymentResult,
  QueueTestDeploymentResult,
  ReportPreviewStatusResult,
  UpdatePhaseResult
} from "./build-repository.js";

const activeBuildStatuses: BuildStatus[] = ["QUEUED", "CLAIMED", "BUILDING", "TEST_READY"];

type BuildRequestRow = typeof buildRequestTable.$inferSelect;
type BuildLogRow = typeof buildLogTable.$inferSelect;

function mapBuildRowToSummary(row: BuildRequestRow): BuildSummary {
  // TODO (DB migration, follow-up): add an `appName text not null` column
  // to build_request and read it directly. Until the migration ships,
  // we surface appName through the metadata JSONB so the API contract
  // already speaks appName end-to-end. Legacy rows written by PR #6 / #7
  // still have the canonical appName under metadata.appName; new rows
  // also write to metadata.appName via the insert below.
  const metadata = (row.metadata ?? {}) as Record<string, string>;
  const appName =
    metadata["appName"] ??
    // Belt-and-suspenders: legacy rows may also have stashed the value
    // under snake_case keys if a prior client wrote them that way.
    metadata["app_name"] ??
    "";
  return {
    buildId: row.id,
    appName,
    status: row.status as BuildStatus,
    phase: row.phase as BuildPhase,
    previewStatus: row.previewStatus as PreviewStatus,
    previewUrl: row.previewUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
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
        response: {
          build: mapBuildRowToSummary(createdBuild),
          lastError: mapBuildRowToLastError(createdBuild)
        }
      };
    });
  }

  async getBuild(buildId: string): Promise<BuildStatusResponse | null> {
    const [row] = await this.db
      .select()
      .from(buildRequestTable)
      .where(eq(buildRequestTable.id, buildId))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      build: mapBuildRowToSummary(row),
      lastError: mapBuildRowToLastError(row)
    };
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
        return {
          kind: "active_build_exists",
          build: {
            build: mapBuildRowToSummary(activeRow),
            lastError: mapBuildRowToLastError(activeRow)
          }
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
      const [updated] = await tx
        .update(buildRequestTable)
        .set({
          status: "CLAIMED",
          phase: "QUEUE_CLAIMED",
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
        response: {
          build: mapBuildRowToSummary(updated),
          lastError: mapBuildRowToLastError(updated)
        }
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
        response: {
          build: mapBuildRowToSummary(row),
          lastError: mapBuildRowToLastError(row)
        }
      };
    }

    let nextStatus: BuildStatus = row.status as BuildStatus;
    if (phase === "DOCKER_BUILD_STARTED") {
      nextStatus = "BUILDING";
    } else if (phase === "COMPLETED") {
      nextStatus = "COMPLETED";
    } else if (phase === "FAILED") {
      nextStatus = "FAILED";
    }

    const timestamp = new Date();
    const [updated] = await this.db
      .update(buildRequestTable)
      .set({
        phase: phase as BuildPhase,
        status: nextStatus,
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
      response: {
        build: mapBuildRowToSummary(updated),
        lastError: mapBuildRowToLastError(updated)
      }
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

    const [updated] = await this.db
      .update(buildRequestTable)
      .set({
        phase: "PREVIEW_QUEUED",
        previewStatus: "QUEUED",
        previewUrl: null,
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
      response: {
        build: mapBuildRowToSummary(updated),
        lastError: mapBuildRowToLastError(updated)
      },
      testDeployment
    };
  }

  async reportPreviewStatus(
    buildId: string,
    status: "PROVISIONING" | "READY" | "FAILED" | "EXPIRED",
    details?: { previewUrl?: string; host?: string; hostPort?: number }
  ): Promise<ReportPreviewStatusResult> {
    const [row] = await this.db
      .select()
      .from(buildRequestTable)
      .where(eq(buildRequestTable.id, buildId))
      .limit(1);

    if (!row) {
      return { kind: "not_found" };
    }

    const timestamp = new Date();
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

    const [updated] = await this.db
      .update(buildRequestTable)
      .set({
        phase: nextPhase,
        status: nextStatus,
        previewStatus: status as PreviewStatus,
        previewUrl: nextPreviewUrl,
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
      phase: nextPhase,
      message: `Preview status: ${status}` + (details?.previewUrl ? ` url=${details.previewUrl}` : ""),
      createdAt: timestamp
    });

    const testDeployment: TestDeployment = {
      status,
      previewUrl: nextPreviewUrl,
      host: details?.host ?? null,
      hostPort: details?.hostPort ?? null,
      internalPort: null,
      expiresAt: null,
      updatedAt: timestamp.toISOString()
    };

    return {
      kind: "ok",
      response: {
        build: mapBuildRowToSummary(updated),
        lastError: mapBuildRowToLastError(updated)
      },
      testDeployment
    };
  }

  async getTestDeployment(buildId: string): Promise<GetTestDeploymentResult> {
    const [row] = await this.db
      .select({
        previewStatus: buildRequestTable.previewStatus,
        previewUrl: buildRequestTable.previewUrl,
        updatedAt: buildRequestTable.updatedAt
      })
      .from(buildRequestTable)
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
      previewUrl: row.previewUrl,
      host: null,
      hostPort: null,
      internalPort: null,
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
