import type {
  BuildAcceptedResponse,
  BuildDuplicateResponse,
  BuildLogsResponse,
  BuildRequest,
  BuildStatusResponse
} from "@docker-image-builder-system/shared-contract";

import type { BuildRepository } from "../repositories/build-repository.js";

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
}
