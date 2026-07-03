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
  BuildDuplicateResponse,
  BuildError,
  BuildLogEntry,
  BuildPhase,
  BuildRequest,
  BuildStatus,
  BuildStatusResponse,
  BuildSummary,
  ErrorCode,
  PreviewStatus
} from "@docker-image-builder-system/shared-contract";

import type {
  BuildRepository,
  ClaimNextBuildResult,
  CreateBuildResult,
  UpdatePhaseResult
} from "./build-repository.js";

const activeBuildStatuses: BuildStatus[] = ["QUEUED", "CLAIMED", "BUILDING", "TEST_READY"];

type BuildRequestRow = typeof buildRequestTable.$inferSelect;
type BuildLogRow = typeof buildLogTable.$inferSelect;

function mapBuildRowToSummary(row: BuildRequestRow): BuildSummary {
  return {
    buildId: row.id,
    projectId: row.projectId,
    repositoryId: row.repositoryId,
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
    const lockKey = `${input.projectId}:${input.repositoryId}`;

    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

      const [activeBuild] = await tx
        .select()
        .from(buildRequestTable)
        .where(
          and(
            eq(buildRequestTable.projectId, input.projectId),
            eq(buildRequestTable.repositoryId, input.repositoryId),
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
          projectId: input.projectId,
          repositoryId: input.repositoryId,
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
}
