import type {
  BuildDuplicateResponse,
  BuildLogEntry,
  BuildRequest,
  BuildStatusResponse
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

export interface BuildRepository {
  createBuild(input: BuildRequest): Promise<CreateBuildResult>;
  getBuild(buildId: string): Promise<BuildStatusResponse | null>;
  getBuildLogs(buildId: string): Promise<BuildLogEntry[] | null>;
}
