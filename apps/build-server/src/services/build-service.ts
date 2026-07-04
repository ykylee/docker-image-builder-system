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
  TestDeployment,
  TestDeploymentQueueResponse
} from "@docker-image-builder-system/shared-contract";

import type {
  BuildRepository,
  DeleteSourceArchiveResult,
  GetSourceArchiveMetadataResult,
  GetSourceArchiveResult,
  PreviewStatusDetails,
  StoreSourceArchiveResult
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

  async claimNextBuild(): Promise<ClaimResponse> {
    const result = await this.repository.claimNextBuild();

    if (result.kind === "no_build_available") {
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

    return {
      claimed: true,
      build: result.response,
      reason: null
    };
  }

  async reportPhase(
    buildId: string,
    phase: string
  ): Promise<ReportPhaseOutcome> {
    const result = await this.repository.updatePhase(buildId, phase);
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
