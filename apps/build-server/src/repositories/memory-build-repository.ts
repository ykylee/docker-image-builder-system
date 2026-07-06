import { createHash, randomUUID } from "node:crypto";

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
  DeploymentReportRequest,
  ExecutionStatus,
  SourceArchive,
  TestDeployment
} from "@docker-image-builder-system/shared-contract";

import { nowIsoString } from "../lib/time.js";
import type {
  AdminRunner,
  AdminRunnerListResponse,
  RunnerStatus
} from "@docker-image-builder-system/shared-contract";
import type {
  BuildRepository,
  ClaimNextBuildResult,
  CreateBuildResult,
  DeleteSourceArchiveResult,
  GetSourceArchiveMetadataResult,
  GetSourceArchiveResult,
  GetTestDeploymentResult,
  PreviewStatusDetails,
  QueueTestDeploymentResult,
  ReportDeploymentResult,
  ReportPreviewStatusResult,
  StoreSourceArchiveResult,
  UpdatePhaseResult
} from "./build-repository.js";
import {
  type BuildTestSnapshot,
  type DeploymentAttemptSnapshot,
  buildStatusResponseFromState,
  enrichBuildSummary
} from "./build-status-response.js";

type StoredBuild = {
  summary: BuildSummary;
  requestedBy: string;
  // TASK-066: declared `SourceArchive` metadata (objectKey +
  // checksumSha256 + sizeBytes) recorded at `POST /builds`. The Skill
  // commits to these values before the bytes are uploaded; the route
  // layer uses them to verify the eventual `POST
  // /builds/:buildId/source` payload. Kept on the build record
  // (not on the source archive store) because the metadata is the
  // canonical truth and the bytes are auxiliary.
  sourceArchive: SourceArchive;
  lastError: BuildError | null;
  logs: BuildLogEntry[];
  testDeployment: TestDeployment | null;
  buildTest: BuildTestSnapshot | null;
  deploymentAttempt: DeploymentAttemptSnapshot | null;
  // phase lifecycle timeline (TASK-050). 매 phase transition 마다
  // 직전 currentPhase 의 (phase, completedAt) 가 history 에 push 되고,
  // 새 currentPhase 가 시작된다 (startedAt 갱신). terminal phase
  // (COMPLETED, FAILED) 진입 시 currentPhaseStartedAt 은 null 로 —
  // currentPhase 자체가 없음을 의미.
  phaseHistory: { phase: BuildPhase; completedAt: string }[];
  currentPhaseStartedAt: string | null;
};

// TASK-069: stored runner registry state. The in-memory repo keeps a
// `StoredRunner` per registered id at module scope (same lifetime as
// `sourceArchives`). The fields mirror `AdminRunner` 1:1 — convert
// through `toAdminRunner` for the public shape.
type StoredRunner = {
  runnerId: string;
  status: RunnerStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  buildsClaimed: number;
  buildsCompleted: number;
  currentBuildId: string | null;
  lastError: string | null;
};
const runners = new Map<string, StoredRunner>();

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
        // TASK-066: preserve the declared SourceArchive metadata so
        // the upload route can verify an incoming payload against
        // these values without re-reading the original request.
        sourceArchive: input.sourceArchive,
        lastError: null,
        logs: [logEntry],
        testDeployment: null,
        buildTest: null,
        deploymentAttempt: null,
        phaseHistory: [],
        // REQUEST_ACCEPTED 가 initial phase. transition 이벤트가 들어오기
        // 전까지 in-flight.
        currentPhaseStartedAt: timestamp
      });

      return {
        kind: "accepted",
        response: buildStatusResponseFromState({
          summary,
          lastError: null,
          phaseHistory: [],
          currentPhase: {
            phase: "REQUEST_ACCEPTED",
            startedAt: timestamp
          },
          testDeployment: null,
          buildTest: null,
          deploymentAttempt: null
        })
      };
    },

    async getBuild(buildId: string): Promise<BuildStatusResponse | null> {
      const build = builds.get(buildId);
      if (!build) {
        return null;
      }

      return buildStatusResponseFromState({
        summary: build.summary,
        lastError: build.lastError,
        ...toPhaseTimeline(build),
        testDeployment: build.testDeployment,
        buildTest: build.buildTest,
        deploymentAttempt: build.deploymentAttempt
      });
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
          build: buildStatusResponseFromState({
            summary: active.summary,
            lastError: active.lastError,
            ...toPhaseTimeline(active),
            testDeployment: active.testDeployment,
            buildTest: active.buildTest,
            deploymentAttempt: active.deploymentAttempt
          })
        };
      }

      // TASK-080: skip builds whose source archive bytes have not been
      // uploaded yet. The Skill is expected to POST /builds/:id/source
      // immediately after POST /builds; the build is not eligible for
      // claim until the bytes arrive. Without this gate, a Runner that
      // claims the build before the Skill finishes uploading hits a
      // 404 on /builds/:id/source and the build fails immediately. See
      // `docs/operations/dogfood-e2e-2026-07-06.md` §3.2 for the
      // observed race (failed build ids d4b86bb8 / b20f5746 / b9d6d047).
      // The bytes live in the module-scoped `sourceArchives` Map
      // (keyed by buildId) — its presence mirrors the existence of a
      // row in the postgres `build_source` table.
      const next = queueOrder.find(
        (entry) =>
          entry.summary.status === "QUEUED" &&
          sourceArchives.has(entry.summary.buildId)
      );
      if (!next) {
        return { kind: "no_build_available" };
      }

      const timestamp = nowIsoString();
      next.summary = {
        ...enrichBuildSummary(next.summary),
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
        response: buildStatusResponseFromState({
          summary: next.summary,
          lastError: next.lastError,
          ...toPhaseTimeline(next),
          testDeployment: next.testDeployment,
          buildTest: next.buildTest,
          deploymentAttempt: next.deploymentAttempt
        })
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
          response: buildStatusResponseFromState({
            summary: build.summary,
            lastError: build.lastError,
            ...toPhaseTimeline(build),
            testDeployment: build.testDeployment,
            buildTest: build.buildTest,
            deploymentAttempt: build.deploymentAttempt
          })
        };
      }

      const timestamp = nowIsoString();
      let nextStatus = build.summary.status;
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

      // TASK-050: phase transition 마다 history 갱신.
      //   1) 직전 in-flight phase 의 (phase, completedAt) push. 같은 phase
      //      로의 no-op transition 은 push 하지 않음.
      //   2) terminal phase (COMPLETED/FAILED) 진입 시, terminal phase 자체도
      //      history 에 push. 이렇게 해야 client (PhaseTimeline) 가 build 의
      //      마지막 phase 를 "completed" 로 정확히 표시할 수 있다. terminal
      //      phase 가 in-flight 가 아니므로 currentPhase 는 null 로 유지.
      //   3) currentPhaseStartedAt 은 terminal 시 null, 그 외엔 timestamp.
      const prevPhase = build.summary.phase;
      const isTerminal = isTerminalPhase(phase);
      if (prevPhase !== phase) {
        build.phaseHistory.push({
          phase: prevPhase,
          completedAt: timestamp
        });
      }
      if (isTerminal) {
        build.phaseHistory.push({
          phase: phase as BuildPhase,
          completedAt: timestamp
        });
      }
      build.summary = {
        ...enrichBuildSummary(build.summary),
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
        response: buildStatusResponseFromState({
          summary: build.summary,
          lastError: build.lastError,
          phaseHistory: build.phaseHistory,
          currentPhase: isTerminal
            ? null
            : {
                phase: build.summary.phase,
                startedAt: build.currentPhaseStartedAt ?? build.summary.createdAt
          },
          testDeployment: build.testDeployment,
          buildTest: build.buildTest,
          deploymentAttempt: build.deploymentAttempt
        })
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
      build.buildTest = {
        status: "IN_PROGRESS",
        containerRef: null,
        runtimeUrl: null,
        healthCheckPassed: null,
        portOpen: null,
        stabilityWindowPassed: null
      };
      build.summary = {
        ...enrichBuildSummary(build.summary),
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
        response: buildStatusResponseFromState({
          summary: build.summary,
          lastError: build.lastError,
          ...toPhaseTimeline(build),
          testDeployment,
          buildTest: build.buildTest,
          deploymentAttempt: build.deploymentAttempt
        }),
        testDeployment
      };
    },

    async reportPreviewStatus(
      buildId: string,
      status: "PROVISIONING" | "READY" | "FAILED" | "EXPIRED",
      details?: PreviewStatusDetails
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

      const nextBuildTestStatus: ExecutionStatus =
        status === "READY" || status === "EXPIRED"
          ? "SUCCESS"
          : status === "FAILED"
            ? "FAILED"
            : "IN_PROGRESS";
      build.buildTest = {
        status: nextBuildTestStatus,
        containerRef: details?.containerRef ?? build.buildTest?.containerRef ?? null,
        runtimeUrl: next.previewUrl,
        healthCheckPassed:
          details?.healthCheckPassed ?? build.buildTest?.healthCheckPassed ?? null,
        portOpen: details?.portOpen ?? build.buildTest?.portOpen ?? null,
        stabilityWindowPassed:
          details?.stabilityWindowPassed ??
          (status === "EXPIRED"
            ? true
            : build.buildTest?.stabilityWindowPassed ?? null)
      };

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
        // Preview TTL elapsed but the container itself ran to completion; the
        // build stays at its current phase/status (typically PREVIEW_READY /
        // TEST_READY) so the operator can decide whether to run another
        // deployment cycle or to mark the build COMPLETED. We do NOT push
        // the prior phase into phaseHistory because the preview state
        // transition is orthogonal to the build lifecycle.
        nextPhase = build.summary.phase;
        nextStatus = build.summary.status;
      }

      build.summary = {
        ...enrichBuildSummary(build.summary),
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
        response: buildStatusResponseFromState({
          summary: build.summary,
          lastError: build.lastError,
          ...toPhaseTimeline(build),
          testDeployment: next,
          buildTest: build.buildTest,
          deploymentAttempt: build.deploymentAttempt
        }),
        testDeployment: next
      };
    },

    async reportDeploymentResult(
      buildId: string,
      input: DeploymentReportRequest
    ): Promise<ReportDeploymentResult> {
      const build = builds.get(buildId);
      if (!build) {
        return { kind: "not_found" };
      }

      const timestamp = nowIsoString();
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

      const prevPhase = build.summary.phase;
      if (prevPhase !== nextPhase) {
        build.phaseHistory.push({
          phase: prevPhase,
          completedAt: timestamp
        });
      }
      if (nextPhase === "FAILED") {
        build.phaseHistory.push({
          phase: "FAILED",
          completedAt: timestamp
        });
      }

      build.deploymentAttempt = {
        status: input.status,
        targetType: input.targetType,
        resultRef: input.resultRef ?? null,
        finishedAt:
          input.status === "SUCCESS" || input.status === "FAILED" ? timestamp : null
      };
      build.summary = {
        ...enrichBuildSummary(build.summary),
        phase: nextPhase,
        status: nextStatus,
        updatedAt: timestamp
      };
      build.currentPhaseStartedAt = nextPhase === "FAILED" ? null : timestamp;
      builds.set(buildId, build);

      build.logs.push({
        id: randomUUID(),
        buildId,
        phase: nextPhase,
        message:
          `Deployment status: ${input.status} targetType=${input.targetType}` +
          (input.resultRef ? ` resultRef=${input.resultRef}` : ""),
        createdAt: timestamp
      });

      return {
        kind: "ok",
        response: buildStatusResponseFromState({
          summary: build.summary,
          lastError: build.lastError,
          ...toPhaseTimeline(build),
          testDeployment: build.testDeployment,
          buildTest: build.buildTest,
          deploymentAttempt: build.deploymentAttempt
        })
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
      let all = stored.map((b) => enrichBuildSummary(b.summary));

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
    },

    // TASK-066: store the source archive bytes for `buildId`. The
    // supplied `bytes` are a `Uint8Array` (Fastify parses
    // `application/octet-stream` to Buffer which we coerce). The actual
    // SHA-256 is recomputed and compared against
    // `BuildRequest.sourceArchive.checksumSha256` (passed in as
    // `expectedChecksumSha256`) before the row is admitted. Size is
    // also verified against the metadata. The store is per-buildId; a
    // re-upload overwrites the previous bytes (last-write-wins). The
    // row is held in a `Map` separate from the build's metadata so
    // memory pressure from many concurrent archives is bounded by
    // their actual byte size, not the build state object.
    async storeSourceArchive(
      buildId: string,
      bytes: Uint8Array,
      expectedChecksumSha256: string,
      expectedSizeBytes: number
    ): Promise<StoreSourceArchiveResult> {
      const stored = builds.get(buildId);
      if (!stored) {
        return { kind: "not_found" };
      }

      // The bytes arrive as a Buffer (Fastify octet-stream) which is a
      // subclass of Uint8Array. We always recompute the SHA-256 from the
      // actual bytes — never trust the caller-supplied checksum header
      // alone — so a tampered body is detected here rather than at the
      // Runner side.
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

      sourceArchives.set(buildId, {
        bytes: new Uint8Array(bytes),
        checksumSha256: actualChecksumSha256,
        sizeBytes: actualSizeBytes
      });

      return {
        kind: "ok",
        checksumSha256: actualChecksumSha256,
        sizeBytes: actualSizeBytes
      };
    },

    // TASK-066: returns a defensive copy of the stored bytes. The
    // `Uint8Array` is copied so a route handler that holds the buffer
    // across an `await` cannot see the bytes get replaced by a
    // concurrent re-upload.
    async getSourceArchive(buildId: string): Promise<GetSourceArchiveResult> {
      const stored = sourceArchives.get(buildId);
      if (!stored) {
        return { kind: "not_found" };
      }
      return {
        kind: "ok",
        bytes: new Uint8Array(stored.bytes),
        checksumSha256: stored.checksumSha256,
        sizeBytes: stored.sizeBytes
      };
    },

    // TASK-066: read the declared `SourceArchive` metadata (the
    // checksum and size the Skill committed to at `POST /builds`).
    // Distinct from `getSourceArchive` which returns the uploaded
    // bytes — the metadata is always present once a build exists, so
    // this method only returns `not_found` for an unknown build.
    async getSourceArchiveMetadata(
      buildId: string
    ): Promise<GetSourceArchiveMetadataResult> {
      const stored = builds.get(buildId);
      if (!stored) {
        return { kind: "not_found" };
      }
      // `stored.sourceArchive` was recorded by `createBuild` from the
      // original `BuildRequest` payload. The shape is the
      // canonical `SourceArchive` (`objectKey`, `checksumSha256`,
      // `sizeBytes`).
      return {
        kind: "ok",
        sourceArchive: stored.sourceArchive
      };
    },

    // TASK-066: remove the stored archive bytes. The build row
    // (and its declared `sourceArchive` metadata) is intentionally
    // left intact — only the auxiliary blob is dropped. Returns
    // `not_found` in two distinct cases so the route layer can
    // surface a 404 for both:
    //   1. the buildId itself is unknown, OR
    //   2. the build exists but no archive row was present
    //      (i.e. a duplicate DELETE on the same buildId).
    // `Map.delete` returns the prior boolean so the two cases
    // are distinguishable without an extra `has` lookup.
    async deleteSourceArchive(
      buildId: string
    ): Promise<DeleteSourceArchiveResult> {
      const stored = builds.get(buildId);
      if (!stored) {
        return { kind: "not_found" };
      }
      const hadArchive = sourceArchives.delete(buildId);
      if (!hadArchive) {
        return { kind: "not_found" };
      }
      return { kind: "ok" };
    },

    // -------------------------------------------------------------------------
    // TASK-069: runner registry (admin menu backing store).
    //
    // registerRunner is idempotent — first claim from a runner id auto-
    // creates the record (status=ACTIVE, firstSeenAt=lastSeenAt=now). 
    // markRunnerSeen updates lastSeenAt + (optionally) currentBuildId and
    // bumps the counter that matches the lifecycle event. The Build
    // Service invokes registerRunner on every successful claim and
    // markRunnerSeen on claim / phase=DOCKER_BUILD_COMPLETED /
    // phase=FAILED.
    // -------------------------------------------------------------------------

    async registerRunner(runnerId: string): Promise<AdminRunner> {
      const now = nowIsoString();
      let stored = runners.get(runnerId);
      if (!stored) {
        stored = {
          runnerId,
          status: "ACTIVE",
          firstSeenAt: now,
          lastSeenAt: now,
          buildsClaimed: 0,
          buildsCompleted: 0,
          currentBuildId: null,
          lastError: null
        };
        runners.set(runnerId, stored);
      } else {
        // Idempotent re-register: leave status as-is (preserves admin's
        // DISABLE toggle across Runner restarts), refresh lastSeenAt so
        // the admin UI's freshness signal is current.
        stored.lastSeenAt = now;
      }
      return toAdminRunner(stored);
    },

    async markRunnerSeen(
      runnerId: string,
      currentBuildId: string | null,
      event: "claimed" | "completed" | "failed"
    ): Promise<AdminRunner | null> {
      const stored = runners.get(runnerId);
      if (!stored) {
        // 첫 markRunnerSeen 이 registerRunner 보다 먼저 호출되면 (예: phase
        // 보고가 claim 보다 앞에 있는 잘못된 호출 순서) — null 반환. 호출자는
        // registerRunner 를 먼저 부르는 것을 강제하지 않고, 정합만 보장.
        // 실제 phase machine 은 claim 이후에만 phase 보고를 받으므로 정상
        // 흐름에선 발생하지 않는다.
        return null;
      }
      stored.lastSeenAt = nowIsoString();
      if (event === "claimed") {
        stored.buildsClaimed += 1;
        stored.currentBuildId = currentBuildId;
      } else if (event === "completed") {
        stored.buildsCompleted += 1;
        // 빌드가 terminal 으로 끝나면 currentBuildId 를 비운다 (in-flight 가
        // 아니므로). admin UI 가 "지금 뭐 돌고 있지" 를 정확히 표시할 수 있도록.
        stored.currentBuildId = null;
        stored.lastError = null;
      } else {
        // failed: lastError 는 호출자가 별도로 채움 (Build Service 가
        // updatePhase 후 BuildError 값을 보유하고 있으므로 service 단에서
        // set 한다). 여기서는 currentBuildId 만 비운다.
        stored.currentBuildId = null;
      }
      return toAdminRunner(stored);
    },

    async listRunners(): Promise<AdminRunnerListResponse> {
      const sorted = Array.from(runners.values()).sort((a, b) =>
        a.runnerId.localeCompare(b.runnerId)
      );
      return { runners: sorted.map(toAdminRunner) };
    },

    async setRunnerStatus(runnerId: string, status: RunnerStatus) {
      const stored = runners.get(runnerId);
      if (!stored) {
        return null;
      }
      stored.status = status;
      return toAdminRunner(stored);
    },

    async deleteRunner(runnerId: string) {
      const existed = runners.delete(runnerId);
      return existed ? { removed: true as const } : { removed: false as const };
    },

    async getRunnerStatus(runnerId: string): Promise<RunnerStatus | null> {
      const stored = runners.get(runnerId);
      return stored ? stored.status : null;
    }
  };
}

// TASK-069: StoredRunner → AdminRunner 변환. Repo 내부 상태는 PII-free
// (UUID/canonical id 만 보관) — 변환은 단순히 field rename 만 한다.
function toAdminRunner(stored: StoredRunner): AdminRunner {
  return {
    runnerId: stored.runnerId,
    status: stored.status,
    firstSeenAt: stored.firstSeenAt,
    lastSeenAt: stored.lastSeenAt,
    buildsClaimed: stored.buildsClaimed,
    buildsCompleted: stored.buildsCompleted,
    currentBuildId: stored.currentBuildId,
    lastError: stored.lastError
  };
}

// TASK-066: separate Map so the archive buffer does not bloat
// `StoredBuild` and so a future eviction policy can target archives
// independently. Kept at module scope so re-creating the repository
// (e.g. in tests) does not lose previously-stored bytes — tests
// construct a fresh repository per scenario and would otherwise need
// to re-upload for every test.
type StoredSourceArchive = {
  bytes: Uint8Array;
  checksumSha256: string;
  sizeBytes: number;
};
const sourceArchives = new Map<string, StoredSourceArchive>();


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
