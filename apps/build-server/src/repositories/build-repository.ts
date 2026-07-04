import type {
  AdminListBuildsQuery,
  AdminListBuildsResponse,
  AdminUserListResponse,
  BuildDuplicateResponse,
  BuildListQuery,
  BuildListResponse,
  BuildLogEntry,
  BuildRequest,
  BuildStatusResponse,
  DeploymentReportRequest,
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
export type DeleteSourceArchiveResult =
  | { kind: "ok" }
  | { kind: "not_found" };

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
}
