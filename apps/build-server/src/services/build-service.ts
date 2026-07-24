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
  HostedService,
  RunnerStatus,
} from "@docker-image-builder-system/shared-contract";

import type {
  BuildRepository,
  ContentRangeParts,
  DeleteSourceArchiveResult,
  GetSourceArchiveMetadataResult,
  GetSourceArchiveResult,
  ContainerTestDetails,
  PhaseFailureDetails,
  StoreSourceArchiveResult,
  StoreSourceChunkResult
} from "../repositories/build-repository.js";
import { validateContextPath } from "./context-path.js";
import { createKubectlK8sAdmin, type K8sAdmin } from "./k8s-admin.js";

export type ReportPhaseOutcome =
  | { kind: "ok"; response: BuildStatusResponse }
  | { kind: "not_found" }
  | { kind: "invalid_transition"; fromPhase: string; toPhase: string };

// TASK-166 (P3-M1): createBuild 결과 — 호스팅 context path 할당 실패를 포함.
export type CreateBuildOutcome =
  | { kind: "accepted"; response: BuildAcceptedResponse }
  | { kind: "duplicate"; response: BuildDuplicateResponse }
  | { kind: "context_path_invalid"; reason: string }
  | { kind: "context_path_taken"; contextPath: string; appName: string };

// TASK-168 (P3-M3): 호스팅 관리(stop/start/remove) 결과.
export type HostingActionOutcome =
  | { kind: "ok"; service: HostedService }
  | { kind: "not_found" }
  | { kind: "k8s_error"; message: string };

// TASK-161 (P2-M2): 컨테이너 테스트 outcome 은 canonical BuildStatusResponse
// 하나만 돌려준다. 구 TestDeployment payload 는 `test` 블록과 중복이었다.
export type StartContainerTestOutcome =
  | { kind: "ok"; response: BuildStatusResponse }
  | { kind: "not_found" }
  | { kind: "invalid_state"; reason: string };

export type ReportContainerTestOutcome =
  | { kind: "ok"; response: BuildStatusResponse }
  | { kind: "not_found" };

export type ReportDeploymentOutcome =
  | { kind: "ok"; response: BuildStatusResponse }
  | { kind: "not_found" };

// TASK-165 (P2-M5): webhook POST helper. Node 20+ 의 global fetch 사용.
// 5s timeout 으로 매달림을 막고, 2xx 가 아니면 throw 해 deliverResult 가
// best-effort 로 흡수하게 한다.
async function postResultWebhook(
  url: string,
  payload: BuildStatusResponse
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`webhook returned HTTP ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export class BuildService {
  // TASK-110: STRICT_CONTENT_RANGE env flag mirror. Default `false`
  // (TASK-108 / TASK-109 lenient semantics preserved for existing
  // callers). The route layer reads the env flag at startup via
  // create-app.ts env loader and passes the boolean here. When the
  // flag flips to `true`, `storeSourceChunk` rejects callers that
  // supply `Content-Range` with `*` total — they must provide a
  // numeric total to satisfy the cross-check. Operators toggle this
  // via `STRICT_CONTENT_RANGE=true` when they're ready to enforce
  // numeric totals as a deployment policy.
  constructor(
    private readonly repository: BuildRepository,
    private readonly runtime: {
      strictContentRange: boolean;
      // TASK-165 (P2-M5): 설정되면 build 가 terminal(COMPLETED/FAILED) 에
      // 도달할 때 canonical BuildStatusResponse 를 이 URL 로 POST 한다
      // (webhook = NOTIFICATION 모드 결과 전달). 미설정이면 기존 POLLING
      // 만 — 소비자가 GET /builds/:id 로 조회.
      resultWebhookUrl?: string;
      // TASK-167 (P3-M2): 호스팅 base host. 설정되면 배포 성공 보고 시
      // HostedService 를 upsert 하고 url = `https://<host>/<contextPath>/`
      // 를 조립한다. 미설정이면 호스팅 비활성(k8s 배포는 되지만 registry
      // upsert 안 함 — opt-in, 설계 §9-3).
      hostingBaseHost?: string;
    } = {
      strictContentRange: false
    },
    // TASK-168 (P3-M3): 호스팅 관리(scale/delete)용 k8s 헬퍼. build-server 가
    // kubectl 을 직접 shell-out 한다(§9-1). 테스트가 fake 를 주입한다.
    private readonly k8sAdmin: K8sAdmin = createKubectlK8sAdmin()
  ) {}

  // TASK-166 (P3-M1): createBuild 는 이제 호스팅 context path 를 할당·검증한다.
  // 정규화(appName 파생 포함) → 예약어/빈값 거부 → registry 유일성(다른 앱이
  // 이미 점유했으면 CONTEXT_PATH_TAKEN) → 해소된 contextPath 를 build 에 저장.
  async createBuild(input: BuildRequest): Promise<CreateBuildOutcome> {
    const raw = input.contextPath ?? input.appName;
    const validation = validateContextPath(raw);
    if (!validation.ok) {
      return { kind: "context_path_invalid", reason: validation.reason };
    }
    const contextPath = validation.contextPath;

    const existing =
      await this.repository.getHostedServiceByContextPath(contextPath);
    if (existing && existing.appName !== input.appName) {
      return {
        kind: "context_path_taken",
        contextPath,
        appName: existing.appName
      };
    }

    const result = await this.repository.createBuild({ ...input, contextPath });

    if (result.kind === "duplicate") {
      return { kind: "duplicate", response: result.response };
    }

    return {
      kind: "accepted",
      response: {
        accepted: true,
        duplicate: false,
        build: result.response.build
      }
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

  // ---- Hosting management (TASK-166 / P3-M1) --------------------------------
  listHostedServices() {
    return this.repository.listHostedServices();
  }

  getHostedService(appName: string) {
    return this.repository.getHostedServiceByAppName(appName);
  }

  // TASK-168 (P3-M3): 호스팅 수명 관리. stop=scale 0 / start=scale 1 /
  // remove=k8s 자원 삭제 + registry 제거(contextPath 반환). k8s 실패는
  // registry 를 바꾸지 않고 k8s_error 로 표면화한다.
  async stopHostedService(appName: string): Promise<HostingActionOutcome> {
    return this.#scaleHostedService(appName, 0, "STOPPED");
  }

  async startHostedService(appName: string): Promise<HostingActionOutcome> {
    return this.#scaleHostedService(appName, 1, "RUNNING");
  }

  async #scaleHostedService(
    appName: string,
    replicas: number,
    nextStatus: string
  ): Promise<HostingActionOutcome> {
    const svc = await this.repository.getHostedServiceByAppName(appName);
    if (!svc) {
      return { kind: "not_found" };
    }
    try {
      await this.k8sAdmin.scale(svc.namespace, svc.deploymentName, replicas);
    } catch (err) {
      return {
        kind: "k8s_error",
        message: err instanceof Error ? err.message : String(err)
      };
    }
    const updated = await this.repository.updateHostedServiceStatus(
      appName,
      nextStatus
    );
    return { kind: "ok", service: updated ?? svc };
  }

  async removeHostedService(appName: string): Promise<HostingActionOutcome> {
    const svc = await this.repository.getHostedServiceByAppName(appName);
    if (!svc) {
      return { kind: "not_found" };
    }
    try {
      await this.k8sAdmin.remove(svc.namespace, svc.deploymentName);
    } catch (err) {
      return {
        kind: "k8s_error",
        message: err instanceof Error ? err.message : String(err)
      };
    }
    // registry 에서 제거 → context path 반환.
    await this.repository.deleteHostedService(appName);
    return { kind: "ok", service: { ...svc, status: "REMOVED" } };
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
    runnerId?: string,
    failure?: PhaseFailureDetails
  ): Promise<ReportPhaseOutcome> {
    const result = await this.repository.updatePhase(buildId, phase, failure);
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

    // TASK-165 (P2-M5): terminal 도달 시 webhook 결과 전달(NOTIFICATION).
    // best-effort — 전달 실패가 phase 보고(=빌드 파이프라인)를 깨지 않는다.
    // 결과 전달은 build 파이프라인 이후의 외부 알림이므로 여기서 result 를
    // 덮어쓰지 않고 원래 phase 결과를 그대로 돌려준다.
    if (
      result.kind === "ok" &&
      (phase === "COMPLETED" || phase === "FAILED") &&
      this.runtime.resultWebhookUrl
    ) {
      await this.deliverResult(
        buildId,
        result.response,
        this.runtime.resultWebhookUrl
      );
    }

    return result;
  }

  /**
   * TASK-165 (P2-M5): webhook 결과 전달. terminal 도달 후 1회 실행.
   * 1) RESULT_DELIVERY_STARTED phase 를 history 에 append (idempotent —
   *    이미 있으면 아무것도 하지 않고 조기 반환해 재전송을 막는다).
   * 2) canonical BuildStatusResponse 를 webhook 으로 POST.
   * 3) 성공 시 RESULT_DELIVERED append. 실패해도 예외를 삼킨다(best-effort);
   *    STARTED 만 남으면 resultDelivery 가 NOTIFICATION/FAILED 로 파생된다.
   */
  private async deliverResult(
    buildId: string,
    payload: BuildStatusResponse,
    webhookUrl: string
  ): Promise<void> {
    const started = await this.repository.recordResultDeliveryPhase(
      buildId,
      "RESULT_DELIVERY_STARTED"
    );
    if (started.kind !== "ok" || !started.appended) {
      // 이미 전달을 시작(또는 완료)했음 — 중복 전송 방지.
      return;
    }

    try {
      await postResultWebhook(webhookUrl, payload);
      await this.repository.recordResultDeliveryPhase(
        buildId,
        "RESULT_DELIVERED"
      );
    } catch (err) {
      // best-effort: 로그만 남기고 빌드 흐름은 진행. resultDelivery 는
      // RESULT_DELIVERY_STARTED 만 있는 상태에서 NOTIFICATION/FAILED 로 파생.
      console.warn(
        `[result-delivery] webhook POST failed for build ${buildId}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  async startContainerTest(
    buildId: string,
    internalPort: number
  ): Promise<StartContainerTestOutcome> {
    const result = await this.repository.startContainerTest(
      buildId,
      internalPort
    );
    if (result.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (result.kind === "invalid_state") {
      return { kind: "invalid_state", reason: result.reason };
    }
    return {
      kind: "ok",
      response: result.response
    };
  }

  async reportContainerTestResult(
    buildId: string,
    status: "IN_PROGRESS" | "SUCCESS" | "FAILED",
    details?: ContainerTestDetails
  ): Promise<ReportContainerTestOutcome> {
    const result = await this.repository.reportContainerTestResult(buildId, status, details);
    if (result.kind === "not_found") {
      return { kind: "not_found" };
    }
    return {
      kind: "ok",
      response: result.response
    };
  }

  async reportDeploymentResult(
    buildId: string,
    input: DeploymentReportRequest
  ): Promise<ReportDeploymentOutcome> {
    const result = await this.repository.reportDeploymentResult(buildId, input);

    // TASK-167 (P3-M2): 배포 성공 + 호스팅 좌표 보고 + HOSTING_BASE_HOST 설정
    // 시 HostedService 를 upsert(앱당 1개 교체). registry 가 호스팅 SSOT 다.
    if (
      result.kind === "ok" &&
      input.status === "SUCCESS" &&
      input.contextPath &&
      this.runtime.hostingBaseHost
    ) {
      const build = result.response.build;
      const contextPath = input.contextPath;
      await this.repository.upsertHostedService({
        appName: build.appName,
        contextPath,
        namespace: input.namespace ?? "dib-hosted",
        deploymentName: input.deploymentName ?? `dib-${contextPath}`,
        containerPort: build.runtimePort ?? 8080,
        stripPrefix: true,
        status: "RUNNING",
        url: `https://${this.runtime.hostingBaseHost}/${contextPath}/`,
        currentBuildId: buildId,
        imageRef: input.resultRef ?? null
      });
    }

    return result;
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
      contentRange,
      this.runtime.strictContentRange
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
