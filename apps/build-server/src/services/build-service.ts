import type {
  AdminListBuildsQuery,
  AdminListBuildsResponse,
  AdminUserListResponse,
  BuildAcceptedResponse,
  BuildDuplicateResponse,
  BuildListQuery,
  BuildListResponse,
  BuildLogsResponse,
  BuildRequest,
  BuildStatusResponse,
  ClaimResponse,
  DeploymentReportRequest,
  RunnerStatus,
  TestDeployment,
  TestDeploymentQueueResponse
} from "@docker-image-builder-system/shared-contract";

import type {
  BuildRepository,
  ContentRangeParts,
  DeleteSourceArchiveResult,
  GetSourceArchiveMetadataResult,
  GetSourceArchiveResult,
  PreviewStatusDetails,
  StoreSourceArchiveResult,
  StoreSourceChunkResult
} from "../repositories/build-repository.js";

export type ReportPhaseOutcome =
  | { kind: "ok"; response: BuildStatusResponse }
  | { kind: "not_found" }
  | { kind: "invalid_transition"; fromPhase: string; toPhase: string };

export type QueuePreviewOutcome =
  | { kind: "ok"; response: TestDeploymentQueueResponse }
  | { kind: "not_found" }
  | { kind: "invalid_state"; reason: string };

export type ReportPreviewOutcome =
  | { kind: "ok"; response: BuildStatusResponse; testDeployment: TestDeployment }
  | { kind: "not_found" };

export type ReportDeploymentOutcome =
  | { kind: "ok"; response: BuildStatusResponse }
  | { kind: "not_found" };

export type GetTestDeploymentOutcome =
  | { kind: "found"; testDeployment: TestDeployment }
  | { kind: "not_requested" }
  | { kind: "not_found" };

export class BuildService {
  constructor(private readonly repository: BuildRepository) {}

  async createBuild(
    input: BuildRequest
  ): Promise<BuildAcceptedResponse | BuildDuplicateResponse> {
    const result = await this.repository.createBuild(input);

    if (result.kind === "duplicate") {
      return result.response;
    }

    return {
      accepted: true,
      duplicate: false,
      build: result.response.build
    };
  }

  async getBuild(buildId: string): Promise<BuildStatusResponse | null> {
    return this.repository.getBuild(buildId);
  }

  async getBuildLogs(buildId: string): Promise<BuildLogsResponse | null> {
    const logs = await this.repository.getBuildLogs(buildId);
    if (!logs) {
      return null;
    }

    return {
      buildId,
      logs
    };
  }

  // TASK-080: the underlying repository enforces a source-archive
  // gate — a QUEUED build is only claimable once its
  // `POST /builds/:id/source` upload has landed. Callers therefore
  // see either a `claimed` result (source already on the server)
  // or a `NO_BUILD_AVAILABLE` result (build is still QUEUED with
  // no source bytes yet). This is intentional: the runner
  // retries on the next poll cycle after the Skill finishes its
  // upload.
  async claimNextBuild(runnerId?: string): Promise<ClaimResponse> {
    // Runner 가 자기 id 를 안 보냈거나 빈 문자열 — 호환을 위해 fallback id 로
    // auto-register 한다. 기존 빌드서버 호출 (runner_id 미전송) 도 그대로 동작.
    // 단, 신규 러너는 모두 id 를 보내므로 fallback branch 는 사실상
    // smoke / e2e / 테스트 전용.
    const trimmedRunnerId = runnerId && runnerId.trim() !== "" ? runnerId.trim() : "_anonymous";

    // 사전 gate — admin 이 DISABLED 토글한 러너의 claim 은 runner_disabled
    // 로 거절. runner 가 unknown 이면 self-register 가 registerRunner 안에서
    // 새 record 를 만든다 (idempotent). _anonymous 는 anonymous caller 의
    // 식별 — DISABLED 토글되면 (admin 이 의도적으로 anonymous claim 차단) 이
    // 경로를 통해 거부된다. 일반적으론 Anonymous 가 DISABLED 가 될 일은
    // 없지만 admin 의 실수 / 디버그용으로 가능.
    const runnerStatus =
      await this.repository.getRunnerStatus(trimmedRunnerId);
    if (runnerStatus === "DISABLED") {
      return {
        claimed: false,
        build: null,
        reason: "RUNNER_DISABLED"
      };
    }

    const result = await this.repository.claimNextBuild();

    if (result.kind === "no_build_available") {
      // claim 으로 잡힐 빌드가 없어도 runner record 는 유지/갱신 — 그래야
      // admin UI 의 "이 러너 마지막 본 시각" 이 정확하다.
      await this.repository.registerRunner(trimmedRunnerId);
      return {
        claimed: false,
        build: null,
        reason: "NO_BUILD_AVAILABLE"
      };
    }

    if (result.kind === "active_build_exists") {
      return {
        claimed: false,
        build: result.build,
        reason: "ACTIVE_BUILD_EXISTS"
      };
    }

    if (result.kind === "runner_disabled") {
      return {
        claimed: false,
        build: null,
        reason: "RUNNER_DISABLED"
      };
    }

    if (result.kind === "runner_id_required") {
      return {
        claimed: false,
        build: null,
        reason: "RUNNER_ID_REQUIRED"
      };
    }

    // claimed — registry 갱신 + claim counter ++
    await this.repository.registerRunner(trimmedRunnerId);
    await this.repository.markRunnerSeen(
      trimmedRunnerId,
      result.response.build.buildId,
      "claimed"
    );
    return {
      claimed: true,
      build: result.response,
      reason: null
    };
  }

  /**
   * Helper for admin endpoints — wraps the registry methods. The
   * runnerId is the canonical id (matches the `RUNNER_ID` env value
   * the runner booted with). Marking a runner seen is invoked by the
   * service's reportPhase path on terminal phases (COMPLETED / FAILED).
   */
  async onPhaseTerminal(
    runnerId: string,
    buildId: string,
    phase: "COMPLETED" | "FAILED"
  ): Promise<void> {
    if (!runnerId) {
      return;
    }
    if (phase === "COMPLETED") {
      await this.repository.markRunnerSeen(runnerId, null, "completed");
    } else {
      await this.repository.markRunnerSeen(runnerId, null, "failed");
    }
    // runnerId 가 아니어도 buildId 채로 runner 를 식별하지는 않는다
    // (claim 시점의 runnerId 만 canonical). buildId param 은 후속
    // lastError attach hook 를 위해 받지만 v1 scope 에선 미사용.
    void buildId;
  }

  /**
   * Admin endpoints 의 thin wrapper — service 가 repo 를 한 단계 더 거치면
   * routes 가 repository 직접 호출하지 않아도 되고, 라우팅 책임이 service
   * (도메인) 안에 모인다. v1 에선 단순 위임.
   */
   listAdminRunners() {
    return this.repository.listRunners();
  }

  // TASK-077: admin-initiated runner registration. Distinct surface from
  // the self-register on first claim — admin UI's "Register Runner" button
  // creates a placeholder record so the admin can see which runner is
  // expected to start, even before the runner process boots. The thin
  // domain wrapper exists so the route can map the repo's
  // `{ kind: "created" | "duplicate" }` discriminated union to a 201
  // (Created) / 409 (Conflict) response cleanly, without leaking repo
  // types into the route handler.
  async createAdminRunner(runnerId: string) {
    return this.repository.createAdminRunner(runnerId);
  }

  setAdminRunnerStatus(runnerId: string, status: RunnerStatus) {
    return this.repository.setRunnerStatus(runnerId, status);
  }

  deleteAdminRunner(runnerId: string) {
    return this.repository.deleteRunner(runnerId);
  }

  async reportPhase(
    buildId: string,
    phase: string,
    runnerId?: string
  ): Promise<ReportPhaseOutcome> {
    const result = await this.repository.updatePhase(buildId, phase);
    // TASK-069: terminal phase 진입 시 runner registry 의 counter + currentBuildId
    // 를 갱신한다. INVALID_TRANSITION result 라도 registry 는 best-effort 로
    // 갱신 (runner 가 잘못된 phase 를 한 번 더 보내더라도 counter 가 정직하게
    // 반영되어야 한다 — 실제 flow 상 terminal phase 가 한 번 도달하면 그 후로
    // invalid_transition 결과가 와도 marker 자체는 지워졌다는 사실이 admin
    // UI 에 정확히 노출되어야 함).
    if (runnerId && runnerId.trim() !== "") {
      const trimmed = runnerId.trim();
      // self-register — 첫 phase 보고가 claim 보다 먼저 오는 비정상 호출도
      // 가볍게 흡수한다 (claim 시점에 정합).
      await this.repository.registerRunner(trimmed);
      if (phase === "COMPLETED") {
        await this.repository.markRunnerSeen(trimmed, null, "completed");
      } else if (phase === "FAILED") {
        await this.repository.markRunnerSeen(trimmed, null, "failed");
      }
    }
    return result;
  }

  async queueTestDeployment(
    buildId: string,
    internalPort: number,
    ttlMinutes: number
  ): Promise<QueuePreviewOutcome> {
    const result = await this.repository.queueTestDeployment(
      buildId,
      internalPort,
      ttlMinutes
    );
    if (result.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (result.kind === "invalid_state") {
      return { kind: "invalid_state", reason: result.reason };
    }
    return {
      kind: "ok",
      response: { testDeployment: result.testDeployment }
    };
  }

  async reportPreviewStatus(
    buildId: string,
    status: "PROVISIONING" | "READY" | "FAILED" | "EXPIRED",
    details?: PreviewStatusDetails
  ): Promise<ReportPreviewOutcome> {
    const result = await this.repository.reportPreviewStatus(buildId, status, details);
    if (result.kind === "not_found") {
      return { kind: "not_found" };
    }
    return {
      kind: "ok",
      response: result.response,
      testDeployment: result.testDeployment
    };
  }

  async reportDeploymentResult(
    buildId: string,
    input: DeploymentReportRequest
  ): Promise<ReportDeploymentOutcome> {
    return this.repository.reportDeploymentResult(buildId, input);
  }

  async getTestDeployment(buildId: string): Promise<GetTestDeploymentOutcome> {
    return this.repository.getTestDeployment(buildId);
  }

  async listBuilds(query: BuildListQuery): Promise<BuildListResponse> {
    return this.repository.listBuilds(query);
  }

  // Admin-only operations (ADMIN-004). The repository methods bypass owner
  // filtering; the route layer is the single guard that limits these calls
  // to ids present in runtime.adminIds.
  async listBuildsAcrossUsers(
    query: AdminListBuildsQuery
  ): Promise<AdminListBuildsResponse> {
    return this.repository.listBuildsAcrossUsers(query);
  }

  async listBuildOwners(): Promise<AdminUserListResponse> {
    return this.repository.listBuildOwners();
  }

  // TASK-066: thin wrappers around the repository for the source
  // archive upload/download endpoints. The repository owns the
  // SHA-256 + size verification (it re-computes the checksum from the
  // actual bytes) so the service is only responsible for surfacing
  // the result to the route layer. `storeSourceArchive` and
  // `getSourceArchive` are the canonical verbs across both the
  // memory and postgres backends — see the repository for the
  // mismatch semantics.
  storeSourceArchive(
    buildId: string,
    bytes: Uint8Array,
    expectedChecksumSha256: string,
    expectedSizeBytes: number
  ): Promise<StoreSourceArchiveResult> {
    return this.repository.storeSourceArchive(
      buildId,
      bytes,
      expectedChecksumSha256,
      expectedSizeBytes
    );
  }

  // TASK-106: chunked upload (per-chunk). Routes layer's
  // `POST /builds/:buildId/source/chunk` calls this once per chunk.
  // The repository validates the per-chunk SHA-256, derives the
  // chunk index from cumulative chunk sizes, writes the row, and
  // reports whether the caller has just uploaded the final chunk.
  //
  // TASK-108: optional Content-Range header is forwarded as the
  // fifth argument. The routes layer parses the header with
  // `parseContentRange` before reaching this method; when the
  // header is missing the routes layer omits the argument and the
  // repository falls back to the monotonic-sequence semantic-B path
  // (TASK-106 default).
  storeSourceChunk(
    buildId: string,
    bytes: Uint8Array,
    perChunkChecksumSha256: string,
    declaredTotalSizeBytes: number,
    contentRange?: ContentRangeParts
  ): Promise<StoreSourceChunkResult> {
    return this.repository.storeSourceChunk(
      buildId,
      bytes,
      perChunkChecksumSha256,
      declaredTotalSizeBytes,
      contentRange
    );
  }

  getSourceArchive(buildId: string): Promise<GetSourceArchiveResult> {
    return this.repository.getSourceArchive(buildId);
  }

  // TASK-066: read the declared `SourceArchive` metadata for a
  // build. The upload route uses this to validate an incoming
  // payload without re-fetching the full build. See
  // `getSourceArchiveMetadata` in `build-repository.ts` for the
  // shape and the `not_found` semantics.
  getSourceArchiveMetadata(
    buildId: string
  ): Promise<GetSourceArchiveMetadataResult> {
    return this.repository.getSourceArchiveMetadata(buildId);
  }

  // TASK-066: remove the stored archive bytes (admin cleanup /
  // test teardown). The declared `SourceArchive` metadata on
  // the build row is preserved — the row's source_archive_*
  // columns remain the canonical record of what the Skill
  // committed to.
  deleteSourceArchive(buildId: string): Promise<DeleteSourceArchiveResult> {
    return this.repository.deleteSourceArchive(buildId);
  }
}
