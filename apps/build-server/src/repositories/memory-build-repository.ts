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
  HostedService,
  DeploymentReportRequest,
  ExecutionStatus,
  SourceArchive,
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
  RecordResultDeliveryResult,
  UpsertHostedServiceInput
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
  buildTest: BuildTestSnapshot | null;
  deploymentAttempt: DeploymentAttemptSnapshot | null;
  // phase lifecycle timeline (TASK-050). 매 phase transition 마다
  // 직전 currentPhase 의 (phase, completedAt) 가 history 에 push 되고,
  // 새 currentPhase 가 시작된다 (startedAt 갱신). terminal phase
  // (COMPLETED, FAILED) 진입 시 currentPhaseStartedAt 은 null 로 —
  // currentPhase 자체가 없음을 의미.
  phaseHistory: { phase: BuildPhase; completedAt: string }[];
  currentPhaseStartedAt: string | null;
  // TASK-166 (P3-M1): 할당된 호스팅 context path + 앱 컨테이너 포트.
  // build 생성 시 서비스가 정규화/검증해 채운다. runner 가 배포(P3-M2) 시 사용.
  contextPath: string | null;
  runtimePort: number;
  // TASK-169 (P3-M4): Ingress prefix strip 여부(기본 true).
  stripPrefix: boolean;
  // TASK-172 (v0.5.0): 호스팅 URL 스킴(기본 path).
  hostingScheme: string;
};

// TASK-166 (P3-M1): 호스팅 registry(앱당 1개). deployment 성공 시 upsert.
type StoredHostedService = {
  appName: string;
  contextPath: string;
  namespace: string;
  deploymentName: string;
  containerPort: number;
  stripPrefix: boolean;
  hostingScheme: string;
  status: string;
  url: string | null;
  currentBuildId: string | null;
  imageRef: string | null;
  createdAt: string;
  updatedAt: string;
  lastDeployedAt: string | null;
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


export function createMemoryBuildRepository(): BuildRepository {
  const builds = new Map<string, StoredBuild>();
  // TASK-166 (P3-M1): 호스팅 registry — appName 기준(앱당 1개).
  const hostedServices = new Map<string, StoredHostedService>();

  return {
    async createBuild(input: BuildRequest): Promise<CreateBuildResult> {
      // Active-build deduplication is keyed on appName only. The previous
      // (projectId, repositoryId) pair was collapsed to appName in the
      // BuildRequest schema — see shared-contract/src/build/request.ts.
      const activeBuild = [...builds.values()].find((entry) => {
        return (
          entry.summary.appName === input.appName &&
          ["QUEUED", "PREPARING_SOURCE", "BUILDING", "TEST_SUCCESS"].includes(entry.summary.status)
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
        runtimeUrl: null,
        // TASK-167 (P3-M2): 할당된 호스팅 입력을 summary 에 실어 claim 응답으로
        // runner 에 전달한다.
        contextPath: input.contextPath ?? null,
        runtimePort: input.runtimePort ?? 8080,
        stripPrefix: input.stripPrefix ?? true,
        hostingScheme: input.hostingScheme ?? "path",
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
        buildTest: null,
        deploymentAttempt: null,
        phaseHistory: [],
        // REQUEST_ACCEPTED 가 initial phase. transition 이벤트가 들어오기
        // 전까지 in-flight.
        currentPhaseStartedAt: timestamp,
        contextPath: input.contextPath ?? null,
        runtimePort: input.runtimePort ?? 8080,
        stripPrefix: input.stripPrefix ?? true,
        hostingScheme: input.hostingScheme ?? "path"
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

    // TASK-080: a QUEUED build is only eligible for claim once
    // its source archive bytes have been uploaded (mirrors the
    // INNER JOIN against `build_source` in the postgres repo).
    // Without this gate the Runner hits a 404 on
    // `/builds/:id/source` immediately after the claim —
    // see `docs/operations/dogfood-e2e-2026-07-06.md` §3.2.
    async claimNextBuild(): Promise<ClaimNextBuildResult> {
      const queueOrder = [...builds.values()].sort((a, b) => {
        return a.summary.createdAt.localeCompare(b.summary.createdAt);
      });

      const active = queueOrder.find((entry) =>
        ["PREPARING_SOURCE", "BUILDING", "TEST_SUCCESS"].includes(entry.summary.status)
      );
      if (active) {
        return {
          kind: "active_build_exists",
          build: buildStatusResponseFromState({
            summary: active.summary,
            lastError: active.lastError,
            ...toPhaseTimeline(active),
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
      //
      // TASK-154: chunked 업로드(`sourceArchivesChunked`)는 첫 chunk 에서
      // legacy `sourceArchives` 항목을 지우므로, legacy Map 만 보면
      // chunked 로 올린 build 가 **영원히 claim 되지 않는다**. postgres
      // repo 와 동일하게 (legacy 존재) OR (chunk 1건 이상 + 누적 size 가
      // 선언 total 이상 = 업로드 완료) 를 자격으로 본다.
      const hasClaimableSource = (buildId: string): boolean => {
        if (sourceArchives.has(buildId)) {
          return true;
        }
        const envelope = sourceArchivesChunked.get(buildId);
        if (!envelope || envelope.chunks.size === 0) {
          return false;
        }
        let cumulative = 0;
        for (const chunk of envelope.chunks.values()) {
          cumulative += chunk.sizeBytes;
        }
        return cumulative >= envelope.totalSizeBytes;
      };
      const next = queueOrder.find(
        (entry) =>
          entry.summary.status === "QUEUED" &&
          hasClaimableSource(entry.summary.buildId)
      );
      if (!next) {
        return { kind: "no_build_available" };
      }

      const timestamp = nowIsoString();
      next.summary = {
        ...enrichBuildSummary(next.summary),
        status: "PREPARING_SOURCE",
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
          buildTest: next.buildTest,
          deploymentAttempt: next.deploymentAttempt
        })
      };
    },

    async updatePhase(
      buildId: string,
      phase: string,
      failure?: PhaseFailureDetails
    ): Promise<UpdatePhaseResult> {
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
      // TASK-162: postgres 저장소와 동일 semantics — FAILED 는 실패 이유를
      // 남기고, FAILED 가 아닌 phase 로 전이하면 이전 오류를 지운다.
      build.lastError =
        phase === "FAILED"
          ? {
              code: failure?.errorCode ?? "UNKNOWN_ERROR",
              message:
                failure?.errorMessage ?? `Build failed during phase ${prevPhase}.`
            }
          : null;
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
          buildTest: build.buildTest,
          deploymentAttempt: build.deploymentAttempt
        })
      };
    },

    // TASK-165 (P2-M5): 결과 전달 phase 를 history 에 idempotent append.
    // build.summary.phase(terminal) 는 그대로 두고 history 에만 push 한다 —
    // 일반 updatePhase 의 prevPhase push 를 거치지 않아 COMPLETED 중복 push
    // 를 피한다.
    async recordResultDeliveryPhase(
      buildId: string,
      phase: ResultDeliveryPhase
    ): Promise<RecordResultDeliveryResult> {
      const build = builds.get(buildId);
      if (!build) {
        return { kind: "not_found" };
      }

      const already = build.phaseHistory.some((e) => e.phase === phase);
      if (!already) {
        build.phaseHistory.push({
          phase: phase as BuildPhase,
          completedAt: nowIsoString()
        });
        builds.set(buildId, build);
      }

      const isTerminal = isTerminalPhase(build.summary.phase);
      return {
        kind: "ok",
        appended: !already,
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
          buildTest: build.buildTest,
          deploymentAttempt: build.deploymentAttempt
        })
      };
    },

    async startContainerTest(
      buildId: string,
      internalPort: number
    ): Promise<StartContainerTestResult> {
      const build = builds.get(buildId);
      if (!build) {
        return { kind: "not_found" };
      }

      if (!["DOCKER_BUILD_COMPLETED", "TEST_SUCCESS"].includes(build.summary.phase) &&
          !["BUILDING", "TEST_SUCCESS"].includes(build.summary.status)) {
        return {
          kind: "invalid_state",
          reason: `cannot start container test from phase=${build.summary.phase} status=${build.summary.status}`
        };
      }

      const timestamp = nowIsoString();
      // TASK-050: CONTAINER_TEST_STARTED 진입 시 직전 phase 의 completedAt 기록.
      const prevPhase6 = build.summary.phase;
      if (prevPhase6 !== "CONTAINER_TEST_STARTED") {
        build.phaseHistory.push({ phase: prevPhase6, completedAt: timestamp });
      }
      // TASK-161: canonical build_test 만 기록한다 (구 TestDeployment 저장 제거).
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
        phase: "CONTAINER_TEST_STARTED",
        runtimeUrl: null,
        updatedAt: timestamp
      };
      build.currentPhaseStartedAt = timestamp;
      builds.set(buildId, build);

      const log: BuildLogEntry = {
        id: randomUUID(),
        buildId,
        phase: "CONTAINER_TEST_STARTED",
        message: `Container test started: internalPort=${internalPort}`,
        createdAt: timestamp
      };
      build.logs.push(log);

      return {
        kind: "started",
        response: buildStatusResponseFromState({
          summary: build.summary,
          lastError: build.lastError,
          ...toPhaseTimeline(build),
          buildTest: build.buildTest,
          deploymentAttempt: build.deploymentAttempt
        })
      };
    },

    async reportContainerTestResult(
      buildId: string,
      status: "IN_PROGRESS" | "SUCCESS" | "FAILED",
      details?: ContainerTestDetails
    ): Promise<ReportContainerTestResult> {
      const build = builds.get(buildId);
      if (!build) {
        return { kind: "not_found" };
      }

      const timestamp = nowIsoString();
      // TASK-161: canonical build_test 단일 기록. 구 TestDeployment 저장과
      // previewStatus→executionStatus 이중 매핑이 사라졌다.
      const runtimeUrl = details?.runtimeUrl ?? build.buildTest?.runtimeUrl ?? null;
      build.buildTest = {
        status,
        containerRef: details?.containerRef ?? build.buildTest?.containerRef ?? null,
        runtimeUrl,
        healthCheckPassed:
          details?.healthCheckPassed ?? build.buildTest?.healthCheckPassed ?? null,
        portOpen: details?.portOpen ?? build.buildTest?.portOpen ?? null,
        stabilityWindowPassed:
          details?.stabilityWindowPassed ?? build.buildTest?.stabilityWindowPassed ?? null
      };

      // ExecutionStatus → build phase/status
      let nextPhase = build.summary.phase;
      let nextStatus = build.summary.status;
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

      build.summary = {
        ...enrichBuildSummary(build.summary),
        runtimeUrl,
        phase: nextPhase as BuildPhase,
        status: nextStatus,
        updatedAt: timestamp
      };
      // TASK-162: 컨테이너 테스트 실패도 build-level lastError 로 노출한다.
      // postgres 는 build_test.error_code 컬럼에 같은 값을 적는다.
      build.lastError =
        status === "FAILED"
          ? {
              code: details?.errorCode ?? "CONTAINER_TEST_FAILED",
              message: details?.errorMessage ?? "Container test failed."
            }
          : build.lastError;
      builds.set(buildId, build);

      const log: BuildLogEntry = {
        id: randomUUID(),
        buildId,
        phase: nextPhase as BuildPhase,
        message: `Container test: ${status}` + (runtimeUrl ? ` url=${runtimeUrl}` : ""),
        createdAt: timestamp
      };
      build.logs.push(log);

      return {
        kind: "ok",
        response: buildStatusResponseFromState({
          summary: build.summary,
          lastError: build.lastError,
          ...toPhaseTimeline(build),
          buildTest: build.buildTest,
          deploymentAttempt: build.deploymentAttempt
        })
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
          buildTest: build.buildTest,
          deploymentAttempt: build.deploymentAttempt
        })
      };
    },

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
      // TASK-106: a re-upload via the legacy single-shot path wipes
      // any prior chunked upload for the same buildId, so the two
      // sides never disagree on which bytes are current.
      sourceArchivesChunked.delete(buildId);

      return {
        kind: "ok",
        checksumSha256: actualChecksumSha256,
        sizeBytes: actualSizeBytes
      };
    },

    // TASK-106: chunked upload. The caller supplies one chunk's bytes
    // + the chunk's recomputed SHA-256 + the declared total archive
    // size (BuildRequest.sourceArchive.sizeBytes). The chunk index is
    // derived from `bytes.length` rolling against `MAX_CHUNK_SIZE`
    // (the caller may also pass an explicit `idx` — see
    // `StoreSourceChunkRequest` in the routes layer). The first chunk
    // creates the per-build envelope; subsequent chunks fill it. The
    // final chunk is determined by `bytes.length * (idx+1) ==
    // declaredTotalSizeBytes`, at which point the per-build
    // `checksumSha256` is the one declared at `POST /builds`.
    async storeSourceChunk(
      buildId: string,
      bytes: Uint8Array,
      perChunkChecksumSha256: string,
      declaredTotalSizeBytes: number,
      contentRange?: ContentRangeParts,
      strictContentRange: boolean = false
    ): Promise<StoreSourceChunkResult> {
      const stored = builds.get(buildId);
      if (!stored) {
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
      // TASK-108: RFC 7233 Content-Range total cross-check. When the
      // caller supplies a Content-Range header the `total` field is
      // the declared archive size per their own framing; if it
      // disagrees with the build's `declaredTotalSizeBytes` we
      // surface a 400 `content_range_mismatch` rather than silently
      // trusting either side.
      //
      // TASK-109: when `total` is `*` (RFC 7233 §4.2 unknown total)
      // the numeric equality check is inapplicable. We still
      // enforce that the chunk's `[start, start + size)` range
      // lies within `declaredTotalSizeBytes` because the build's
      // declared metadata is the server-side source-of-truth (the
      // caller is the devlier; build_request row is canonical).
      // A stricter alternative — reject `*` outright and force the
      // caller to supply a numeric total — is documented in
      // `docs/operations/content-range-rfc-7233-star-2026-07-20.md`
      // as the "strict" path; we adopt the lenient default to let
      // existing callers adopt RFC 7233 incrementally.
      //
      // TASK-110: STRICT_CONTENT_RANGE env flag mirror. When the
      // route layer sets this flag (via create-app.ts env loader)
      // the repository rejects callers that supply `Content-Range`
      // with `*` total — they must provide a numeric total to
      // satisfy the cross-check. This is the operationally enforced
      // variant of the "strict" alternative noted above; operators
      // flip it on once they're ready to require numeric totals.
      if (contentRange) {
        if (strictContentRange && contentRange.total === 0) {
          // TASK-110: STRICT_CONTENT_RANGE=true 인 경우 `*` total
          // 거부. caller 가 numeric total 을 보내면 다음 분기에서
          // 정상 cross-check.
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
        // `*` 케이스 — total 부재 (ContentRangeParts.total=0 sentinel
        // from the parser). chunk 의 end+1 이 declared 를 넘어가면
        // size_mismatch 로 거절.
        if (contentRange.total === 0 && contentRange.end + 1 > declaredTotalSizeBytes) {
          return {
            kind: "size_mismatch",
            expected: declaredTotalSizeBytes,
            actual: contentRange.end + 1
          };
        }
      }
      let envelope = sourceArchivesChunked.get(buildId);
      if (!envelope) {
        envelope = {
          chunks: new Map<number, StoredSourceChunk>(),
          totalSizeBytes: declaredTotalSizeBytes,
          checksumSha256: stored.sourceArchive.checksumSha256
        };
        sourceArchivesChunked.set(buildId, envelope);
        // A fresh chunked upload also clears the legacy single-shot
        // storage, so the two sides never disagree.
        sourceArchives.delete(buildId);
      }
      // The next chunk index is the current chunk count for this
      // buildId. We assign indices in monotonically increasing
      // sequence (0, 1, 2, ...) regardless of the bytes-per-chunk
      // distribution — this keeps the (build_id, idx) uniqueness
      // invariant simple and lets the caller size chunks freely. The
      // total chunk count is derived from `totalSizeBytes` divided by
      // the maximal *expected* chunk size below; a chunk that would
      // extend past that count is rejected with `idx_out_of_range`.
      // TASK-108: 의미 C bipartite — semantic A (Content-Range
      // trusted) vs semantic B (monotonic sequence). The two paths
      // share `(build_id, idx)` uniqueness so a caller can mix
      // semantic-B uploads (no header) and semantic-A uploads
      // (with header) within the same archive, but semantic-A
      // constraints apply if and only if a Content-Range was
      // supplied for this call.
      let idx: number;
      if (contentRange) {
        // Semantic A: derive idx from the chunk's start offset. With
        // MAX_CHUNK_SIZE = 16 MiB, idx = start / MAX_CHUNK_SIZE so
        // multiple callers can independently pick a non-contiguous
        // range and write to a specific index.
        const MAX_CHUNK_SIZE_FOR_DERIVATION = 16 * 1024 * 1024;
        idx = Math.floor(contentRange.start / MAX_CHUNK_SIZE_FOR_DERIVATION);
        // Content-Range's end must equal start + bytes.length - 1
        // (RFC 7233 single-range inclusive). A mismatch means the
        // bytes on the wire don't fill the declared range, which
        // is a client bug — surface a 400.
        const expectedEnd = contentRange.start + actualSizeBytes - 1;
        if (contentRange.end !== expectedEnd) {
          return { kind: "content_range_invalid" };
        }
        // Semantic A also accepts out-of-order uploads (since
        // idx is derived from start) but rejects ranges that would
        // extend past the declared total.
        if (contentRange.start + actualSizeBytes > declaredTotalSizeBytes) {
          return { kind: "size_mismatch", expected: declaredTotalSizeBytes, actual: contentRange.start + actualSizeBytes };
        }
      } else {
        // Semantic B (TASK-106 default): monotonic sequence.
        idx = envelope.chunks.size;
      }
      // Conservative total-chunk cap: declare at most one chunk per
      // 1 KiB so a 1 GiB archive allows up to 1 M chunks; if a caller
      // uploads smaller chunks than this, the actual chunk count is
      // still bounded by `chunks.size`. Picked to be larger than any
      // realistic archive could ever need while remaining < 2^53 (JS
      // safe-integer range).
      const totalChunks = Math.ceil(declaredTotalSizeBytes / 1024);
      if (idx >= totalChunks) {
        return { kind: "idx_out_of_range", idx, totalChunks };
      }
      envelope.chunks.set(idx, {
        bytes: new Uint8Array(bytes),
        checksumSha256: actualChecksumSha256,
        sizeBytes: actualSizeBytes
      });
      // The "final" chunk is the one that completes the upload —
      // i.e. after this write the cumulative size equals (or
      // exceeds) the declared total. This is independent of
      // `totalChunks` which is just the cap used for
      // `idx_out_of_range` rejection.
      let cumulative = 0;
      for (const [, prior] of envelope.chunks) {
        cumulative += prior.sizeBytes;
      }
      const isFinalChunk = cumulative >= envelope.totalSizeBytes;
      return {
        kind: "ok",
        checksumSha256: actualChecksumSha256,
        sizeBytes: actualSizeBytes,
        idx,
        isFinalChunk
      };
    },

    // TASK-066 / TASK-106: returns a defensive copy of the stored
    // bytes. Chunked uploads (TASK-106) take precedence over the
    // legacy single-shot storage (TASK-066) — when both sides have
    // data for a buildId the chunked side is authoritative because it
    // is the more recent upload path. The legacy side is wiped on
    // any chunked first-upload (and vice versa, in `storeSourceArchive`),
    // so the precedence only matters when an operator ran both paths
    // against the same build across a boundary. The `Uint8Array` is
    // copied so a route handler that holds the buffer across an
    // `await` cannot see the bytes get replaced by a concurrent
    // re-upload.
    async getSourceArchive(buildId: string): Promise<GetSourceArchiveResult> {
      const chunked = sourceArchivesChunked.get(buildId);
      if (chunked) {
        const sortedEntries = Array.from(chunked.chunks.entries()).sort(
          ([a], [b]) => a - b
        );
        const totalSize = sortedEntries.reduce(
          (acc, [, c]) => acc + c.sizeBytes,
          0
        );
        const out = new Uint8Array(totalSize);
        let offset = 0;
        for (const [, c] of sortedEntries) {
          out.set(c.bytes, offset);
          offset += c.sizeBytes;
        }
        return {
          kind: "ok",
          bytes: out,
          checksumSha256: chunked.checksumSha256,
          sizeBytes: totalSize
        };
      }
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
      const hadChunked = sourceArchivesChunked.delete(buildId);
      const hadLegacy = sourceArchives.delete(buildId);
      if (!hadChunked && !hadLegacy) {
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

    // TASK-077: admin-initiated runner registration. Distinct surface from
    // self-register on first claim — admin UI's "Register Runner" button
    // creates a placeholder record so the admin can see which runner is
    // expected to start, even before the runner process boots. Returns
    // `{ kind: "duplicate" }` if the runnerId is already in the registry
    // — admin UI surfaces this as 409 (the runner might have been
    // pre-registered earlier, or might have self-registered on a prior
    // claim; the operator should DELETE the stale record first if they
    // want to re-register).
    async createAdminRunner(
      runnerId: string
    ): Promise<
      | { kind: "created"; runner: AdminRunner }
      | { kind: "duplicate" }
    > {
      if (runners.has(runnerId)) {
        return { kind: "duplicate" };
      }
      const now = nowIsoString();
      const stored: StoredRunner = {
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
      return { kind: "created", runner: toAdminRunner(stored) };
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
    },

    // ---- Hosting registry (TASK-166 / P3-M1) --------------------------------
    async listHostedServices(): Promise<HostedService[]> {
      return [...hostedServices.values()]
        .map(toHostedService)
        .sort((a, b) => a.appName.localeCompare(b.appName));
    },
    async getHostedServiceByAppName(
      appName: string
    ): Promise<HostedService | null> {
      const stored = hostedServices.get(appName);
      return stored ? toHostedService(stored) : null;
    },
    async getHostedServiceByContextPath(
      contextPath: string
    ): Promise<HostedService | null> {
      const stored = [...hostedServices.values()].find(
        (s) => s.contextPath === contextPath
      );
      return stored ? toHostedService(stored) : null;
    },
    async upsertHostedService(
      input: UpsertHostedServiceInput
    ): Promise<HostedService> {
      const now = nowIsoString();
      const existing = hostedServices.get(input.appName);
      const stored: StoredHostedService = {
        ...input,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        lastDeployedAt: now
      };
      hostedServices.set(input.appName, stored);
      return toHostedService(stored);
    },
    async updateHostedServiceStatus(
      appName: string,
      status: string
    ): Promise<HostedService | null> {
      const stored = hostedServices.get(appName);
      if (!stored) {
        return null;
      }
      stored.status = status;
      stored.updatedAt = nowIsoString();
      hostedServices.set(appName, stored);
      return toHostedService(stored);
    },
    async deleteHostedService(appName: string): Promise<boolean> {
      return hostedServices.delete(appName);
    }
  };
}

// TASK-166 (P3-M1): StoredHostedService → HostedService 계약. 구조가 동일해
// url 만 명시적으로 null 정규화.
function toHostedService(s: StoredHostedService): HostedService {
  return {
    appName: s.appName,
    contextPath: s.contextPath,
    namespace: s.namespace,
    deploymentName: s.deploymentName,
    containerPort: s.containerPort,
    stripPrefix: s.stripPrefix,
    hostingScheme: s.hostingScheme as HostedService["hostingScheme"],
    status: s.status as HostedService["status"],
    url: s.url,
    currentBuildId: s.currentBuildId,
    imageRef: s.imageRef,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    lastDeployedAt: s.lastDeployedAt
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

// TASK-106: chunked upload storage. Each buildId has its own ordered
// list of chunks uploaded via `POST /builds/:buildId/source/chunk`.
// `totalSizeBytes` is the declared total from `SourceArchive.sizeBytes`
// and is used as the cap for `idx * MAX_CHUNK_SIZE <= start`. The map
// is wiped by `deleteSourceArchive` so a re-upload starts clean.
type StoredSourceChunk = {
  bytes: Uint8Array;
  checksumSha256: string;
  sizeBytes: number;
};
type StoredSourceChunked = {
  chunks: Map<number, StoredSourceChunk>;
  totalSizeBytes: number;
  checksumSha256: string;
};
const sourceArchivesChunked = new Map<string, StoredSourceChunked>();
/** Suggested maximum bytes per chunk (matches the FK CASCADE chunked split). */
const MAX_CHUNK_SIZE = 16 * 1024 * 1024; // 16 MiB


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
