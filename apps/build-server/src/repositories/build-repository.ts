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
  DeploymentReportRequest,
  RunnerStatus,
  TestDeployment
} from "@docker-image-builder-system/shared-contract";

export type CreateBuildResult =
  | {
      kind: "accepted";
      response: BuildStatusResponse;
    }
  | {
      kind: "duplicate";
      response: BuildDuplicateResponse;
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

export type QueueTestDeploymentResult =
  | {
      kind: "queued";
      response: BuildStatusResponse;
      testDeployment: TestDeployment;
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "invalid_state";
      reason: string;
    };

export type ReportPreviewStatusResult =
  | {
      kind: "ok";
      response: BuildStatusResponse;
      testDeployment: TestDeployment;
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

export type PreviewStatusDetails = {
  previewUrl?: string;
  host?: string;
  hostPort?: number;
  containerRef?: string;
  healthCheckPassed?: boolean;
  portOpen?: boolean;
  stabilityWindowPassed?: boolean;
};

export type GetTestDeploymentResult =
  | {
      kind: "found";
      testDeployment: TestDeployment;
    }
  | {
      kind: "not_requested";
    }
  | {
      kind: "not_found";
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
  | { kind: "idx_out_of_range"; idx: number; totalChunks: number };

/** Wire format for `Content-Range` header parsing. */
export interface ContentRangeParts {
  start: number;
  end: number;
  total: number;
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
  getBuildLogs(buildId: string): Promise<BuildLogEntry[] | null>;
  claimNextBuild(): Promise<ClaimNextBuildResult>;
  updatePhase(buildId: string, phase: string): Promise<UpdatePhaseResult>;
  queueTestDeployment(
    buildId: string,
    internalPort: number,
    ttlMinutes: number
  ): Promise<QueueTestDeploymentResult>;
  reportPreviewStatus(
    buildId: string,
    status: "PROVISIONING" | "READY" | "FAILED" | "EXPIRED",
    details?: PreviewStatusDetails
  ): Promise<ReportPreviewStatusResult>;
  reportDeploymentResult(
    buildId: string,
    input: DeploymentReportRequest
  ): Promise<ReportDeploymentResult>;
  getTestDeployment(buildId: string): Promise<GetTestDeploymentResult>;
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
    declaredTotalSizeBytes: number
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
}
