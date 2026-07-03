import type {
  BuildAcceptedResponse,
  BuildDuplicateResponse,
  BuildLogsResponse,
  BuildRequest,
  BuildStatusResponse,
  ClaimResponse
} from "@docker-image-builder-system/shared-contract";

import type { BuildRepository } from "../repositories/build-repository.js";

export type ReportPhaseOutcome =
  | { kind: "ok"; response: BuildStatusResponse }
  | { kind: "not_found" }
  | { kind: "invalid_transition"; fromPhase: string; toPhase: string };

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
}
