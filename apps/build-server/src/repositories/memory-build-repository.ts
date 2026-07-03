import { randomUUID } from "node:crypto";

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
  BuildStatusResponse,
  BuildSummary,
  TestDeployment
} from "@docker-image-builder-system/shared-contract";

import { nowIsoString } from "../lib/time.js";
import type {
  BuildRepository,
  ClaimNextBuildResult,
  CreateBuildResult,
  GetTestDeploymentResult,
  QueueTestDeploymentResult,
  ReportPreviewStatusResult,
  UpdatePhaseResult
} from "./build-repository.js";

type StoredBuild = {
  summary: BuildSummary;
  requestedBy: string;
  lastError: BuildError | null;
  logs: BuildLogEntry[];
  testDeployment: TestDeployment | null;
  // phase lifecycle timeline (TASK-050). 매 phase transition 마다
  // 직전 currentPhase 의 (phase, completedAt) 가 history 에 push 되고,
  // 새 currentPhase 가 시작된다 (startedAt 갱신). terminal phase
  // (COMPLETED, FAILED) 진입 시 currentPhaseStartedAt 은 null 로 —
  // currentPhase 자체가 없음을 의미.
  phaseHistory: { phase: BuildPhase; completedAt: string }[];
  currentPhaseStartedAt: string | null;
};

function emptyTestDeployment(updatedAt: string): TestDeployment {
  return {
    status: "NOT_REQUESTED",
    previewUrl: null,
    host: null,
    hostPort: null,
    internalPort: null,
    expiresAt: null,
    updatedAt
  };
}

export function createMemoryBuildRepository(): BuildRepository {
  const builds = new Map<string, StoredBuild>();

  return {
    async createBuild(input: BuildRequest): Promise<CreateBuildResult> {
      // Active-build deduplication is keyed on appName only. The previous
      // (projectId, repositoryId) pair was collapsed to appName in the
      // BuildRequest schema — see shared-contract/src/build/request.ts.
      const activeBuild = [...builds.values()].find((entry) => {
        return (
          entry.summary.appName === input.appName &&
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
        appName: input.appName,
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
        requestedBy: input.requestedBy,
        lastError: null,
        logs: [logEntry],
        testDeployment: null,
        phaseHistory: [],
        // REQUEST_ACCEPTED 가 initial phase. transition 이벤트가 들어오기
        // 전까지 in-flight.
        currentPhaseStartedAt: timestamp
      });

      return {
        kind: "accepted",
        response: {
          build: summary,
          lastError: null,
          phaseHistory: [],
          currentPhase: {
            phase: "REQUEST_ACCEPTED",
            startedAt: timestamp
          }
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
        lastError: build.lastError,
        // phaseHistory 는 transition 시 push 된 종료 시각 모음. currentPhase
        // 는 build 가 terminal (COMPLETED/FAILED) 가 아닐 때 in-flight phase
        // 와 startedAt.
        phaseHistory: build.phaseHistory,
        currentPhase: isTerminalPhase(build.summary.phase)
          ? null
          : {
              phase: build.summary.phase,
              startedAt: build.currentPhaseStartedAt ?? build.summary.createdAt
            }
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
            lastError: active.lastError,
            ...toPhaseTimeline(active)
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
          lastError: next.lastError,
          ...toPhaseTimeline(next)
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
        return {
          kind: "ok",
          response: {
            build: build.summary,
            lastError: build.lastError,
            ...toPhaseTimeline(build)
          }
        };
      }

      const timestamp = nowIsoString();
      let nextStatus = build.summary.status;
      if (phase === "DOCKER_BUILD_STARTED") {
        nextStatus = "BUILDING";
      } else if (phase === "COMPLETED") {
        nextStatus = "COMPLETED";
      } else if (phase === "FAILED") {
        nextStatus = "FAILED";
      }

      // TASK-050: phase transition 마다 직전 currentPhase 를 history 에 push.
      // push 순서: 새 phase 의 startedAt 결정 → 직전 phase 의 completedAt 결정
      // → history push → currentPhaseStartedAt 갱신. terminal (COMPLETED /
      // FAILED) 진입 시 currentPhaseStartedAt = null.
      const prevPhase = build.summary.phase;
      const isTerminal = isTerminalPhase(phase);
      if (prevPhase !== phase) {
        build.phaseHistory.push({
          phase: prevPhase,
          completedAt: timestamp
        });
      }
      build.summary = {
        ...build.summary,
        phase: phase as BuildPhase,
        status: nextStatus,
        updatedAt: timestamp
      };
      build.currentPhaseStartedAt = isTerminal ? null : timestamp;
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
          lastError: build.lastError,
          phaseHistory: build.phaseHistory,
          currentPhase: isTerminal
            ? null
            : {
                phase: build.summary.phase,
                startedAt: build.currentPhaseStartedAt ?? build.summary.createdAt
              }
        }
      };
    },

    async queueTestDeployment(
      buildId: string,
      internalPort: number,
      ttlMinutes: number
    ): Promise<QueueTestDeploymentResult> {
      const build = builds.get(buildId);
      if (!build) {
        return { kind: "not_found" };
      }

      // only allow queue when build is in DOCKER_BUILD_COMPLETED or TEST_READY state
      if (!["DOCKER_BUILD_COMPLETED", "TEST_READY"].includes(build.summary.phase) &&
          !["BUILDING", "TEST_READY"].includes(build.summary.status)) {
        return {
          kind: "invalid_state",
          reason: `cannot queue preview from phase=${build.summary.phase} status=${build.summary.status}`
        };
      }

      const timestamp = nowIsoString();
      const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();

      const testDeployment: TestDeployment = {
        status: "QUEUED",
        previewUrl: null,
        host: null,
        hostPort: null,
        internalPort,
        expiresAt,
        updatedAt: timestamp
      };
      // TASK-050: PREVIEW_QUEUED 진입 시 직전 phase 의 completedAt 기록.
      const prevPhase6 = build.summary.phase;
      if (prevPhase6 !== "PREVIEW_QUEUED") {
        build.phaseHistory.push({ phase: prevPhase6, completedAt: timestamp });
      }
      build.testDeployment = testDeployment;
      build.summary = {
        ...build.summary,
        phase: "PREVIEW_QUEUED",
        previewStatus: "QUEUED",
        previewUrl: null,
        updatedAt: timestamp
      };
      build.currentPhaseStartedAt = timestamp;
      builds.set(buildId, build);

      const log: BuildLogEntry = {
        id: randomUUID(),
        buildId,
        phase: "PREVIEW_QUEUED",
        message: `Preview queued: internalPort=${internalPort} ttlMinutes=${ttlMinutes}`,
        createdAt: timestamp
      };
      build.logs.push(log);

      return {
        kind: "queued",
        response: {
          build: build.summary,
          lastError: build.lastError,
          ...toPhaseTimeline(build)
        },
        testDeployment
      };
    },

    async reportPreviewStatus(
      buildId: string,
      status: "PROVISIONING" | "READY" | "FAILED" | "EXPIRED",
      details?: { previewUrl?: string; host?: string; hostPort?: number }
    ): Promise<ReportPreviewStatusResult> {
      const build = builds.get(buildId);
      if (!build) {
        return { kind: "not_found" };
      }

      if (!build.testDeployment) {
        build.testDeployment = emptyTestDeployment(nowIsoString());
      }

      const timestamp = nowIsoString();
      const prev = build.testDeployment;
      const next: TestDeployment = {
        ...prev,
        status,
        previewUrl: details?.previewUrl ?? prev.previewUrl,
        host: details?.host ?? prev.host,
        hostPort: details?.hostPort ?? prev.hostPort,
        updatedAt: timestamp
      };
      build.testDeployment = next;

      // map previewStatus -> build.phase/status
      let nextPhase = build.summary.phase;
      let nextStatus = build.summary.status;
      if (status === "PROVISIONING") {
        nextPhase = "PREVIEW_QUEUED";
        nextStatus = "BUILDING"; // still building until ready
      } else if (status === "READY") {
        nextPhase = "PREVIEW_READY";
        nextStatus = "TEST_READY";
      } else if (status === "FAILED") {
        nextPhase = "FAILED";
        nextStatus = "FAILED";
      } else if (status === "EXPIRED") {
        // preview expired; build remains TEST_READY (caller can call COMPLETED later)
        nextPhase = build.summary.phase;
        nextStatus = build.summary.status;
      }

      build.summary = {
        ...build.summary,
        previewStatus: status,
        previewUrl: next.previewUrl,
        phase: nextPhase as BuildPhase,
        status: nextStatus,
        updatedAt: timestamp
      };
      builds.set(buildId, build);

      const log: BuildLogEntry = {
        id: randomUUID(),
        buildId,
        phase: nextPhase as BuildPhase,
        message: `Preview status: ${status}` + (details?.previewUrl ? ` url=${details.previewUrl}` : ""),
        createdAt: timestamp
      };
      build.logs.push(log);

      return {
        kind: "ok",
        response: {
          build: build.summary,
          lastError: build.lastError,
          ...toPhaseTimeline(build)
        },
        testDeployment: next
      };
    },

    async getTestDeployment(buildId: string): Promise<GetTestDeploymentResult> {
      const build = builds.get(buildId);
      if (!build) {
        return { kind: "not_found" };
      }
      if (!build.testDeployment) {
        return { kind: "not_requested" };
      }
      return { kind: "found", testDeployment: build.testDeployment };
    }
,
    async listBuilds(query: BuildListQuery): Promise<BuildListResponse> {
      // Build summaries 를 (1) status filter, (2) requestedBy filter,
      // (3) cursor skip, (4) createdAt desc 정렬, (5) limit 적용. cursor 는
      // buildId 기준 opaque pointer. requestedBy 는 StoredBuild 에 보관된
      // canonical owner key 로 매칭 (BuildSummary 에는 노출되지 않음).
      const stored = [...builds.values()];
      let all = stored.map((b) => b.summary);

      if (query.status) {
        all = all.filter((b) => b.status === query.status);
      }
      if (query.requestedBy) {
        const owner = query.requestedBy;
        const allowed = new Set(
          stored.filter((b) => b.requestedBy === owner).map((b) => b.summary.buildId)
        );
        all = all.filter((b) => allowed.has(b.buildId));
      }

      // Sort by createdAt desc (newest first) — primary stable order.
      all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      // Cursor: skip up to and including the row with this buildId.
      if (query.cursor) {
        const idx = all.findIndex((b) => b.buildId === query.cursor);
        if (idx >= 0) {
          all = all.slice(idx + 1);
        }
      }

      const page = all.slice(0, query.limit);
      const last = page[page.length - 1];
      const nextCursor =
        all.length > query.limit && last ? last.buildId : null;

      return { builds: page, nextCursor };
    },
    // Admin-only methods (ADMIN-003). The admin guard is enforced at the
    // route layer; this method reuses the same sort/filter/cursor logic
    // as listBuilds, then enriches each summary with the requestedBy
    // owner key (BuildSummary does not carry it because the user-facing
    // endpoints infer ownership from the caller).
    async listBuildsAcrossUsers(
      query: AdminListBuildsQuery
    ): Promise<AdminListBuildsResponse> {
      const result = await this.listBuilds(query as BuildListQuery);
      const stored = [...builds.values()];
      const ownerById = new Map(stored.map((b) => [b.summary.buildId, b.requestedBy]));
      const enriched: AdminUserBuildSummary[] = result.builds.map((b) => ({
        ...b,
        requestedBy: ownerById.get(b.buildId) ?? ""
      }));
      return { builds: enriched, nextCursor: result.nextCursor };
    },
    async listBuildOwners(): Promise<AdminUserListResponse> {
      // Aggregate by requestedBy across the in-memory store. Owners with
      // zero builds are not represented (they would have no row to derive
      // lastBuildAt from). Sorted by lastBuildAt desc so the admin UI
      // can show most-recent owners first.
      const agg = new Map<string, { count: number; latest: string }>();
      for (const entry of builds.values()) {
        const cur = agg.get(entry.requestedBy);
        if (!cur) {
          agg.set(entry.requestedBy, { count: 1, latest: entry.summary.createdAt });
        } else {
          cur.count += 1;
          if (entry.summary.createdAt > cur.latest) {
            cur.latest = entry.summary.createdAt;
          }
        }
      }
      const users: AdminUserSummary[] = [...agg.entries()]
        .map(([userId, info]) => ({
          userId,
          buildCount: info.count,
          lastBuildAt: info.latest
        }))
        .sort((a, b) => {
          const al = a.lastBuildAt ?? "";
          const bl = b.lastBuildAt ?? "";
          return bl.localeCompare(al);
        });
      return { users };
    }
  };
}


// TASK-050: terminal phase 헬퍼. BuildStatusResponse 의 currentPhase 가
// null 인지 (= build 가 terminal 상태인지) 결정한다. COMPLETED/FAILED 가
// canonical terminal 이고, EXPIRED 는 preview 의 terminal 이지만 build
// 자체는 COMPLETED/FAILED 로 끝나므로 여기선 두 phase 만 본다.
function isTerminalPhase(phase: string): boolean {
  return phase === "COMPLETED" || phase === "FAILED";
}

// TASK-050: StoredBuild → BuildStatusResponse 의 phase timeline 두 필드.
// in-flight phase 와 startedAt, 또는 terminal 이면 null.
function toPhaseTimeline(build: StoredBuild): {
  phaseHistory: { phase: BuildPhase; completedAt: string }[];
  currentPhase: { phase: BuildPhase; startedAt: string } | null;
} {
  return {
    phaseHistory: build.phaseHistory,
    currentPhase: isTerminalPhase(build.summary.phase)
      ? null
      : {
          phase: build.summary.phase,
          startedAt: build.currentPhaseStartedAt ?? build.summary.createdAt
        }
  };
}
