import type {
  BuildAcceptedResponse,
  BuildDuplicateResponse,
  BuildListQuery,
  BuildListResponse,
  BuildLogsResponse,
  BuildRequest,
  BuildStatusResponse,
  ClaimResponse,
  TestDeployment,
  TestDeploymentQueueResponse
} from "@docker-image-builder-system/shared-contract";

import type { BuildRepository } from "../repositories/build-repository.js";

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
    details?: { previewUrl?: string; host?: string; hostPort?: number }
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

  async getTestDeployment(buildId: string): Promise<GetTestDeploymentOutcome> {
    return this.repository.getTestDeployment(buildId);
  }

  async listBuilds(query: BuildListQuery): Promise<BuildListResponse> {
    return this.repository.listBuilds(query);
  }
}
