import { randomUUID } from "node:crypto";

import type {
  BuildDuplicateResponse,
  BuildError,
  BuildLogEntry,
  BuildPhase,
  BuildRequest,
  BuildStatusResponse,
  BuildSummary
} from "@docker-image-builder-system/shared-contract";

import { nowIsoString } from "../lib/time.js";
import type {
  BuildRepository,
  ClaimNextBuildResult,
  CreateBuildResult,
  UpdatePhaseResult
} from "./build-repository.js";

type StoredBuild = {
  summary: BuildSummary;
  lastError: BuildError | null;
  logs: BuildLogEntry[];
};

export function createMemoryBuildRepository(): BuildRepository {
  const builds = new Map<string, StoredBuild>();

  return {
    async createBuild(input: BuildRequest): Promise<CreateBuildResult> {
      const activeBuild = [...builds.values()].find((entry) => {
        return (
          entry.summary.projectId === input.projectId &&
          entry.summary.repositoryId === input.repositoryId &&
          ["QUEUED", "CLAIMED", "BUILDING", "TEST_READY"].includes(entry.summary.status)
        );
      });

      if (activeBuild) {
        const duplicate: BuildDuplicateResponse = {
          accepted: false,
          duplicate: true,
          reason: "ACTIVE_BUILD_EXISTS",
          build: activeBuild.summary
        };

        return {
          kind: "duplicate",
          response: duplicate
        };
      }

      const timestamp = nowIsoString();
      const buildId = randomUUID();
      const summary: BuildSummary = {
        buildId,
        projectId: input.projectId,
        repositoryId: input.repositoryId,
        status: "QUEUED",
        phase: "REQUEST_ACCEPTED",
        previewStatus: "NOT_REQUESTED",
        previewUrl: null,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      const logEntry: BuildLogEntry = {
        id: randomUUID(),
        buildId,
        phase: "REQUEST_ACCEPTED",
        message: "Build request accepted and queued.",
        createdAt: timestamp
      };

      builds.set(buildId, {
        summary,
        lastError: null,
        logs: [logEntry]
      });

      return {
        kind: "accepted",
        response: {
          build: summary,
          lastError: null
        }
      };
    },

    async getBuild(buildId: string): Promise<BuildStatusResponse | null> {
      const build = builds.get(buildId);
      if (!build) {
        return null;
      }

      return {
        build: build.summary,
        lastError: build.lastError
      };
    },


    async getBuildLogs(buildId: string): Promise<BuildLogEntry[] | null> {
      const build = builds.get(buildId);
      if (!build) {
        return null;
      }

      return build.logs;
    },

    async claimNextBuild(): Promise<ClaimNextBuildResult> {
      // Find oldest QUEUED build. If a CLAIMED/BUILDING/TEST_READY build exists
      // for the same projectId+repositoryId, return active_build_exists.
      const queueOrder = [...builds.values()].sort((a, b) => {
        return a.summary.createdAt.localeCompare(b.summary.createdAt);
      });

      const active = queueOrder.find((entry) =>
        ["CLAIMED", "BUILDING", "TEST_READY"].includes(entry.summary.status)
      );
      if (active) {
        return {
          kind: "active_build_exists",
          build: {
            build: active.summary,
            lastError: active.lastError
          }
        };
      }

      const next = queueOrder.find((entry) => entry.summary.status === "QUEUED");
      if (!next) {
        return { kind: "no_build_available" };
      }

      const timestamp = nowIsoString();
      next.summary = {
        ...next.summary,
        status: "CLAIMED",
        phase: "QUEUE_CLAIMED",
        updatedAt: timestamp
      };
      builds.set(next.summary.buildId, next);

      const claimLog: BuildLogEntry = {
        id: randomUUID(),
        buildId: next.summary.buildId,
        phase: "QUEUE_CLAIMED",
        message: "Build claimed by runner.",
        createdAt: timestamp
      };
      next.logs.push(claimLog);

      return {
        kind: "claimed",
        response: {
          build: next.summary,
          lastError: next.lastError
        }
      };
    },

    async updatePhase(buildId: string, phase: string): Promise<UpdatePhaseResult> {
      const build = builds.get(buildId);
      if (!build) {
        return { kind: "not_found" };
      }

      const fromPhase = build.summary.phase;
      if (fromPhase === phase) {
        // idempotent: same phase, return ok
        return {
          kind: "ok",
          response: {
            build: build.summary,
            lastError: build.lastError
          }
        };
      }

      const timestamp = nowIsoString();
      // status transition heuristic
      let nextStatus = build.summary.status;
      if (phase === "DOCKER_BUILD_STARTED") {
        nextStatus = "BUILDING";
      } else if (phase === "COMPLETED") {
        nextStatus = "COMPLETED";
      } else if (phase === "FAILED") {
        nextStatus = "FAILED";
      }

      build.summary = {
        ...build.summary,
        phase: phase as BuildPhase,
        status: nextStatus,
        updatedAt: timestamp
      };
      builds.set(buildId, build);

      const phaseLog: BuildLogEntry = {
        id: randomUUID(),
        buildId,
        phase: phase as BuildPhase,
        message: `Phase updated to ${phase}.`,
        createdAt: timestamp
      };
      build.logs.push(phaseLog);

      return {
        kind: "ok",
        response: {
          build: build.summary,
          lastError: build.lastError
        }
      };
    }
  };
}
