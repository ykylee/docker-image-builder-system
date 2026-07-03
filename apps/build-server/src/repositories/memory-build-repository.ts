import { randomUUID } from "node:crypto";

import type {
  BuildDuplicateResponse,
  BuildError,
  BuildLogEntry,
  BuildRequest,
  BuildStatusResponse,
  BuildSummary
} from "@docker-image-builder-system/shared-contract";

import { nowIsoString } from "../lib/time.js";
import type { BuildRepository, CreateBuildResult } from "./build-repository.js";

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
    }
  };
}
