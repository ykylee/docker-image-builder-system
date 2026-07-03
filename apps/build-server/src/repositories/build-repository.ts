import type {
  BuildDuplicateResponse,
  BuildListQuery,
  BuildListResponse,
  BuildLogEntry,
  BuildRequest,
  BuildStatusResponse,
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
    details?: { previewUrl?: string; host?: string; hostPort?: number }
  ): Promise<ReportPreviewStatusResult>;
  getTestDeployment(buildId: string): Promise<GetTestDeploymentResult>;
  listBuilds(query: BuildListQuery): Promise<BuildListResponse>;
}
