import type {
  AdminListBuildsQuery,
  AdminListBuildsResponse,
  AdminRunner,
  AdminRunnerListResponse,
  AdminUserListResponse,
  BuildDuplicateResponse,
  BuildListQuery,
  BuildListResponse,
  BuildLogEntry,
  BuildRequest,
  BuildStatusResponse,
  HostedService,
  ServiceManifest,
  ServiceManifestResponse,
  ServiceManifestRevisionListResponse,
  DeploymentReportRequest,
  ErrorCode,
  RunnerStatus,
} from "@docker-image-builder-system/shared-contract";

export type CreateBuildResult =
  | {
      kind: "accepted";
      response: BuildStatusResponse;
    }
  | {
      kind: "duplicate";
      response: BuildDuplicateResponse;
    }
  | {
      kind: "hosting_capacity_exceeded";
      tier: "sandbox" | "standard" | "production";
    }
  | {
      kind: "context_path_taken";
      contextPath: string;
      appName: string;
    };

export type ClaimNextBuildResult =
  | {
      kind: "claimed";
      response: BuildStatusResponse;
    }
  | {
      kind: "no_build_available";
    }
  | {
      kind: "active_build_exists";
      build: BuildStatusResponse;
    }
  | {
      // TASK-069: admin 이 /admin/runners/:runnerId PATCH 로 status=DISABLED
      // 로 토글한 러너의 후속 claim. 호스트 측은 200 + `{claimed: false, reason: "RUNNER_DISABLED"}`
      // 으로 받아들이고 poll loop 가 짧게 backoff 한다. cancelled build 는
      // NO_BUILD_AVAILABLE 와 동급 — 활성 빌드 claim 다음 cycle 의 자연스러운
      // 후보이다.
      kind: "runner_disabled";
      runnerId: string;
    }
  | {
      // claim 시점에 admin 이 러너를 DELETE 했거나, DELETE 후 새로 들어온
      // claim 의 본인 runner id 가 unknown 인 경우. 이 경우 Build Server 가
      // 자동으로 empty record 를 생성하고 (self-register) claim 을 받아들인다.
      // explicit "unknown runner" result 는 사용하지 않는다 — runner 가 항상
      // 자기 자신을 등록한 후 claim 이 가능하도록 self-register 후 길을 탄다.
      kind: "runner_id_required";
    };

export type UpdatePhaseResult =
  | {
      kind: "ok";
      response: BuildStatusResponse;
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "invalid_transition";
      fromPhase: string;
      toPhase: string;
    };

// TASK-165 (P2-M5): 결과 전달(webhook) phase 를 phase history 에 append 한다.
// terminal(COMPLETED/FAILED) 이후의 후처리라 build_request 의 phase/status 는
// 건드리지 않고 history 에만 기록한다 — 일반 updatePhase 의 terminal-transition
// 로직(prevPhase push, currentPhase=null)을 우회해 중복 push 를 피한다.
// `appended`=false 는 이미 기록됨(idempotent no-op)을 뜻해 서버가 webhook 을
// 두 번 쏘지 않게 한다.
export type ResultDeliveryPhase =
  | "RESULT_DELIVERY_STARTED"
  | "RESULT_DELIVERED";

export type RecordResultDeliveryResult =
  | {
      kind: "ok";
      appended: boolean;
      response: BuildStatusResponse;
    }
  | {
      kind: "not_found";
    };

// TASK-161 (P2-M2): preview-era 의 TestDeployment 반환을 걷어냈다. 컨테이너
// 테스트 상태는 BuildStatusResponse 의 canonical `test` 블록이 이미 담고
// 있어 별도 payload 를 되돌려줄 이유가 없다.
export type StartContainerTestResult =
  | {
      kind: "started";
      response: BuildStatusResponse;
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "invalid_state";
      reason: string;
    };

export type ReportContainerTestResult =
  | {
      kind: "ok";
      response: BuildStatusResponse;
    }
  | {
      kind: "not_found";
    };

export type ReportDeploymentResult =
  | {
      kind: "ok";
      response: BuildStatusResponse;
    }
  | {
      kind: "not_found";
    };

// TASK-162 (P2-M3): FAILED phase 보고에 실려 오는 실패 이유.
export type PhaseFailureDetails = {
  errorCode?: ErrorCode;
  errorMessage?: string;
};

export type ContainerTestDetails = {
  runtimeUrl?: string;
  host?: string;
  hostPort?: number;
  containerRef?: string;
  healthCheckPassed?: boolean;
  portOpen?: boolean;
  stabilityWindowPassed?: boolean;
  // TASK-162: status=FAILED 일 때의 실패 이유. 이전에는 postgres 저장소가
  // 계약에 없는 `TEST_DEPLOYMENT_FAILED` 를 하드코딩했고 memory 저장소는
  // 아예 기록하지 않아 backend 별로 동작이 갈렸다.
  errorCode?: ErrorCode;
  errorMessage?: string;
};

// TASK-066: source archive storage. The Skill uploads the raw archive
// bytes (e.g. tar.gz) after `POST /builds` via `POST /builds/:buildId/source`.
// The Runner downloads them via `GET /builds/:buildId/source` before
// running `docker build`.
//
// `expectedChecksumSha256` is the BuildRequest.sourceArchive.checksumSha256
// already recorded on the build. The repository compares the supplied
// checksum against the actual SHA-256 of `bytes` and reports a
// `checksum_mismatch` if they differ so the caller can surface a 400.
// `expectedSizeBytes` is the BuildRequest.sourceArchive.sizeBytes; a
// mismatch is reported as `size_mismatch` for the same reason.
//
// `ok` returns the actual size (after any in-memory truncation) so the
// caller can include it in a 201 response without re-measuring.
export type StoreSourceArchiveResult =
  | {
      kind: "ok";
      checksumSha256: string;
      sizeBytes: number;
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "checksum_mismatch";
      expected: string;
      actual: string;
    }
  | {
      kind: "size_mismatch";
      expected: number;
      actual: number;
    };

export type GetSourceArchiveResult =
  | {
      kind: "ok";
      bytes: Uint8Array;
      checksumSha256: string;
      sizeBytes: number;
    }
  | {
      kind: "not_found";
    };

// TASK-066: delete the stored source archive bytes. The route
// is `DELETE /builds/:buildId/source`. This intentionally does not
// touch `build_request.source_archive_*` — those columns record
// the declared `SourceArchive` metadata (recorded at `POST
// /builds` time) and remain valid even after the bytes are
// removed, so the metadata stays the canonical truth of "what
// the Skill committed to" while the bytes themselves are an
// auxiliary blob. Distinguished from `not_found` for the build
// (no such buildId) vs `ok` (build exists but no archive to
// delete — same semantic, returned as `ok` because the desired
// state is "no archive present").
//
// TASK-106: this also clears the chunked upload (all rows in
// `build_source_chunk` for this buildId) so a re-upload via either
// the legacy single-shot or the chunked endpoint starts from a
// clean slate. The legacy `build_source` row (TASK-066) is also
// removed so the two storage sides stay in sync.
export type DeleteSourceArchiveResult =
  | { kind: "ok" }
  | { kind: "not_found" };

// TASK-106: chunked upload. The Skill / tooling breaks a > bodyLimit
// archive into N chunks and uploads each via `POST
// /builds/:buildId/source/chunk` with a `Content-Range: bytes
// <start>-<end>/<total>` header. The repository stores each chunk as
// one row in `build_source_chunk` keyed by `(build_id, idx)` and
// reassembles bytes in ascending idx order on `getSourceArchive`.
//
// `start` and `end` are inclusive byte offsets in the assembled
// archive; `total` is the total size of the assembled archive (the
// `BuildRequest.sourceArchive.sizeBytes` value recorded at `POST
// /builds` time). `idx` is the 0-based chunk index derived from
// `floor(start / CHUNK_SUGGESTED_SIZE)` — the caller may also pass
// `idx` explicitly via the `X-Chunk-Idx` header.
//
// `expectedChecksumSha256` and `expectedSizeBytes` are the per-chunk
// invariants: every chunk's recomputed SHA-256 must match the supplied
// checksum, and the sum of every chunk's `sizeBytes` for the buildId
// must equal the declared `totalSizeBytes`. The repository verifies
// per-chunk checksum here; the whole-archive checksum verification
// happens once the final chunk of the upload arrives (`idx == total_chunks - 1`)
// via the aggregation path in `getSourceArchive`.
export type StoreSourceChunkResult =
  | {
      kind: "ok";
      checksumSha256: string;
      sizeBytes: number;
      idx: number;
      /** True when this chunk completes the upload (next idx would be out of range). */
      isFinalChunk: boolean;
    }
  | { kind: "not_found" }
  | { kind: "checksum_mismatch"; expected: string; actual: string }
  | { kind: "size_mismatch"; expected: number; actual: number }
  | { kind: "idx_out_of_range"; idx: number; totalChunks: number }
  | { kind: "content_range_invalid" }
  | { kind: "content_range_mismatch"; declared: number; supplied: number };

/** Wire format for `Content-Range` header parsing. */
export interface ContentRangeParts {
  start: number;
  end: number;
  total: number;
}

// TASK-108: RFC 7233 Content-Range header parser. The format is
// `bytes <start>-<end>/<total>` for single-range uploads, or
// `bytes <start>-<end>/*` (no total — receiver must determine) for
// trailer-append scenarios. We accept the full RFC 7233 grammar for
// the single-range case and ignore `*` totals (treat as
// `declaredTotalSizeBytes` from the build metadata).
//
// The returned shape is the same `ContentRangeParts` interface plus
// a few invariants (start ≤ end, start ≥ 0, total ≥ 0 or undefined
// for the `*` case).
export type ContentRangeParse =
  | { kind: "ok"; parts: ContentRangeParts; totalIsStar: boolean }
  | { kind: "invalid_format" }
  | { kind: "invalid_range"; reason: "start_after_end" | "negative_offset" | "non_numeric" };

export const MAX_CONTENT_RANGE_TOTAL_BYTES = 1_073_741_824; // 1 GiB hard cap

/**
 * Parse a `Content-Range` header value per RFC 7233 §4.2. Accepts
 * `bytes <start>-<end>/<total>` (single range) and
 * `bytes <start>-<end>/*` (unknown total). Returns a typed
 * `ContentRangeParse` so the route layer can distinguish a missing
 * header (`null`) from an unparseable header (`invalid_format`).
 */
export function parseContentRange(header: string | null): ContentRangeParse | null {
  if (header === null || header === "") {
    return null;
  }
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/.exec(header.trim());
  if (!match) {
    return { kind: "invalid_format" };
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  const totalRaw = match[3];
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { kind: "invalid_range", reason: "non_numeric" };
  }
  if (start < 0 || end < 0) {
    return { kind: "invalid_range", reason: "negative_offset" };
  }
  if (start > end) {
    return { kind: "invalid_range", reason: "start_after_end" };
  }
  if (totalRaw === "*") {
    return { kind: "ok", parts: { start, end, total: 0 }, totalIsStar: true };
  }
  const total = Number(totalRaw);
  if (total <= 0 || total > MAX_CONTENT_RANGE_TOTAL_BYTES) {
    return { kind: "invalid_range", reason: "non_numeric" };
  }
  return { kind: "ok", parts: { start, end, total }, totalIsStar: false };
}

// TASK-066: read just the declared `SourceArchive` metadata for a
// build. This is the metadata that was recorded at `POST /builds`
// (the canonical checksum and size the Skill committed to) — the
// route layer uses it to validate an incoming `POST
// /builds/:buildId/source` upload without having to expose
// `sourceArchive` on the public `BuildSummary` shape (which would be
// a wider contract change than the current slice needs).
export type GetSourceArchiveMetadataResult =
  | {
      kind: "ok";
      sourceArchive: {
        objectKey: string;
        checksumSha256: string;
        sizeBytes: number;
      };
    }
  | {
      kind: "not_found";
    };

export interface BuildRepository {
  createBuild(input: BuildRequest): Promise<CreateBuildResult>;
  getBuild(buildId: string): Promise<BuildStatusResponse | null>;
  getBuildOwner(buildId: string): Promise<string | null>;
  getBuildLogs(buildId: string): Promise<BuildLogEntry[] | null>;
  claimNextBuild(): Promise<ClaimNextBuildResult>;
  /** Requeues non-terminal builds whose lease heartbeat has gone stale. */
  recoverStaleBuilds(olderThan: Date): Promise<number>;
  // TASK-162 (P2-M3): FAILED phase 는 실패 이유를 함께 받는다. 이전에는
  // 채널이 없어 `build_request.last_error_code/message` 가 한 번도 기록되지
  // 않았고 모든 실패 빌드의 `lastError` 가 null 이었다.
  updatePhase(
    buildId: string,
    phase: string,
    failure?: PhaseFailureDetails
  ): Promise<UpdatePhaseResult>;
  // TASK-165 (P2-M5): 결과 전달 phase 를 history 에 idempotent append.
  recordResultDeliveryPhase(
    buildId: string,
    phase: ResultDeliveryPhase
  ): Promise<RecordResultDeliveryResult>;
  startContainerTest(
    buildId: string,
    internalPort: number
  ): Promise<StartContainerTestResult>;
  reportContainerTestResult(
    buildId: string,
    status: "IN_PROGRESS" | "SUCCESS" | "FAILED",
    details?: ContainerTestDetails
  ): Promise<ReportContainerTestResult>;
  reportDeploymentResult(
    buildId: string,
    input: DeploymentReportRequest
  ): Promise<ReportDeploymentResult>;
  listBuilds(query: BuildListQuery): Promise<BuildListResponse>;
  storeSourceArchive(
    buildId: string,
    bytes: Uint8Array,
    expectedChecksumSha256: string,
    expectedSizeBytes: number
  ): Promise<StoreSourceArchiveResult>;
  // TASK-106: chunked upload. Same invariants as `storeSourceArchive`
  // but writes one chunk at a time; the caller passes the chunk index
  // explicitly via `Content-Range: bytes <start>-<end>/<total>` (the
  // repository parses the header) or `X-Chunk-Idx` (callers that
  // already computed the index). The declaration matches the actual
  // values from `SourceUploadChunkRequest` in the routes layer.
  storeSourceChunk(
    buildId: string,
    bytes: Uint8Array,
    perChunkChecksumSha256: string,
    declaredTotalSizeBytes: number,
    /**
     * TASK-108: optional RFC 7233 Content-Range parts. When supplied
     * the repository treats the chunk as writing the bytes at
     * `[parts.start, parts.end]` of the assembled archive (semantic
     * A — RFC 7233 start-offset trusted). When omitted the
     * repository falls back to the monotonically-increasing index
     * derived from the existing chunks (semantic B, TASK-106
     * default). The route layer implements the bipartite dispatch
     * via `parseContentRange`: callers that send a `Content-Range`
     * header land on the trusted path; callers that omit the header
     * land on the legacy monotonic-sequence path. Both paths share
     * the same `(build_id, idx)` uniqueness invariant.
     */
    contentRange?: ContentRangeParts,
    /**
     * TASK-110: STRICT_CONTENT_RANGE env flag mirror. When `true`
     * the repository rejects callers that supply `Content-Range`
     * with `*` total (RFC 7233 §4.2 unknown total) and forces them
     * to supply a numeric total. The route layer reads the env
     * flag at startup via the runtime settings and forwards it on
     * every chunk upload. Defaults to `false` (lenient — TASK-109
     * semantics preserved for existing callers).
     */
    strictContentRange?: boolean
  ): Promise<StoreSourceChunkResult>;
  getSourceArchive(buildId: string): Promise<GetSourceArchiveResult>;
  getSourceArchiveMetadata(
    buildId: string
  ): Promise<GetSourceArchiveMetadataResult>;
  deleteSourceArchive(buildId: string): Promise<DeleteSourceArchiveResult>;
  // Admin-only operations (ADMIN-*). Both methods intentionally bypass
  // owner filtering at the service layer; the admin route layer is the
  // single guard that ensures the caller is in the configured ADMIN_IDS
  // list.
  listBuildsAcrossUsers(query: AdminListBuildsQuery): Promise<AdminListBuildsResponse>;
  listBuildOwners(): Promise<AdminUserListResponse>;

  // TASK-069: runner registry operations. The Runner self-registers on its
  // first claim (idempotent — calling registerRunner with an existing
  // runnerId returns the existing record). markRunnerSeen updates
  // lastSeenAt + (optionally) currentBuildId + bumps the relevant counter.
  // Admin endpoints (PATCH/DELETE) drive setRunnerStatus / deleteRunner.
  // listRunners returns the full registry in stable id order for the
  // /admin/runners page.
  registerRunner(runnerId: string): Promise<AdminRunner>;
  // TASK-077: admin-initiated runner registration. Distinct from the
  // self-register on first claim — admin UI's "Register Runner" button
  // creates a placeholder record so the admin can see which runner is
  // expected to start, even before the runner process boots. Returns
  // `{ kind: "created", runner }` on success, `{ kind: "duplicate" }`
  // when the runnerId already exists in the registry. Idempotency is
  // intentional at the storage level (registerRunner is idempotent for
  // self-register), but at the admin-intent level a duplicate runnerId
  // is a misconfiguration that the admin UI surfaces as 409.
  createAdminRunner(
    runnerId: string
  ): Promise<
    | { kind: "created"; runner: AdminRunner }
    | { kind: "duplicate" }
  >;
  markRunnerSeen(
    runnerId: string,
    currentBuildId: string | null,
    event: "claimed" | "completed" | "failed"
  ): Promise<AdminRunner | null>;
  listRunners(): Promise<AdminRunnerListResponse>;
  setRunnerStatus(runnerId: string, status: RunnerStatus): Promise<AdminRunner | null>;
  deleteRunner(runnerId: string): Promise<{ removed: true } | { removed: false }>;
  // Read-only helper used by `BuildService.claimNextBuild` to gate the
  // call against the registry. Returns ACTIVE / DISABLED / null (unknown).
  // Unknown runners are auto-registered on first claim, so `null` means
  // "first time we've seen this id — let the call proceed and then
  // register".
  getRunnerStatus(runnerId: string): Promise<RunnerStatus | null>;

  // ---- Hosting registry (Phase 3 / TASK-166) --------------------------------
  // 앱당 1개 활성 호스팅. 배포 성공 시 upsert(appName 기준 교체).
  listHostedServices(): Promise<HostedService[]>;
  listHostedServicesByOwner(requestedBy: string): Promise<HostedService[]>;
  getHostedServiceByAppName(appName: string): Promise<HostedService | null>;
  getHostedServiceByContextPath(
    contextPath: string
  ): Promise<HostedService | null>;
  upsertHostedService(input: UpsertHostedServiceInput): Promise<HostedService>;
  // TASK-168 (P3-M3): 관리 라이프사이클 — status 만 갱신(scale stop/start).
  updateHostedServiceStatus(
    appName: string,
    status: string
  ): Promise<HostedService | null>;
  // TASK-174 (v0.7.0): 호스팅 status 캐시 — live 필드(availableReplicas +
  // lastSyncedAt)만 갱신한다. desired lifecycle `status` 는 건드리지 않아
  // 주기 sync 가 관리 명령과 충돌하지 않는다. lastSyncedAt 은 repo 가 stamp.
  updateHostedServiceLiveStatus(
    appName: string,
    availableReplicas: number
  ): Promise<HostedService | null>;
  deleteHostedService(appName: string): Promise<boolean>;
  getServiceManifest(appName: string): Promise<ServiceManifestResponse | null>;
  updateServiceManifest(
    appName: string,
    manifest: ServiceManifest,
    updatedBy: string
  ): Promise<ServiceManifestResponse>;
  listServiceManifestRevisions(appName: string): Promise<ServiceManifestRevisionListResponse>;
  getHostingCapacityUsage(): Promise<import("../services/hosting-capacity.js").HostingCapacity>;
  reserveHostingCapacity(
    reservation: import("../services/hosting-capacity.js").HostingCapacityReservation
  ): Promise<boolean>;
  releaseHostingCapacity(buildId: string): Promise<boolean>;
}

// TASK-166 (P3-M1): 호스팅 upsert 입력. appName 기준으로 기존 row 를 교체한다.
export type UpsertHostedServiceInput = {
  appName: string;
  contextPath: string;
  namespace: string;
  deploymentName: string;
  containerPort: number;
  stripPrefix: boolean;
  hostingScheme: string;
  serviceSize?: string;
  effectiveTier?: string;
  hostingPolicyVersion?: string;
  resources?: {
    cpuRequest: string;
    memoryRequest: string;
    cpuLimit: string;
    memoryLimit: string;
    replicas: number;
  };
  status: string;
  url: string | null;
  currentBuildId: string | null;
  imageRef: string | null;
};
