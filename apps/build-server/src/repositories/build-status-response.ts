import type {
  BuildCurrentPhase,
  BuildError,
  BuildPhase,
  BuildPhaseHistoryEntry,
  BuildStatusResponse,
  BuildSummary,
  CanonicalBuildStatus,
  ContainerTestResult,
  DeploymentResult,
  ExecutionStatus,
  PreviewStatus,
  ResultDelivery,
  TestDeployment
} from "@docker-image-builder-system/shared-contract";

export type BuildTestSnapshot = {
  status: ExecutionStatus;
  containerRef?: string | null;
  runtimeUrl?: string | null;
  healthCheckPassed?: boolean | null;
  portOpen?: boolean | null;
  stabilityWindowPassed?: boolean | null;
};

export type DeploymentAttemptSnapshot = {
  status: ExecutionStatus;
  targetType?: DeploymentResult["targetType"];
  resultRef?: string | null;
  finishedAt?: string | null;
};

function deriveLifecycleStatus(summary: BuildSummary): CanonicalBuildStatus {
  switch (summary.phase) {
    case "REQUEST_ACCEPTED":
      return "QUEUED";
    case "QUEUE_CLAIMED":
    case "SOURCE_PREPARED":
      return "PREPARING_SOURCE";
    case "DOCKER_BUILD_STARTED":
      return "BUILDING";
    case "DOCKER_BUILD_COMPLETED":
      return "BUILD_SUCCESS";
    case "CONTAINER_TEST_STARTED":
      return "TESTING";
    case "CONTAINER_TEST_PASSED":
      return "TEST_SUCCESS";
    case "DEPLOYMENT_STARTED":
      return "DEPLOYING";
    case "DEPLOYMENT_COMPLETED":
      return "DEPLOY_SUCCESS";
    case "COMPLETED":
      return "COMPLETED";
    case "FAILED":
      return "FAILED";
    default:
      return summary.status === "FAILED" ? "FAILED" : "QUEUED";
  }
}

function mapPreviewStatusToExecutionStatus(
  previewStatus: PreviewStatus
): ExecutionStatus {
  switch (previewStatus) {
    case "NOT_REQUESTED":
      return "NOT_STARTED";
    case "QUEUED":
    case "PROVISIONING":
      return "IN_PROGRESS";
    case "READY":
      return "SUCCESS";
    case "FAILED":
      return "FAILED";
    case "EXPIRED":
      return "SUCCESS";
    default:
      return "NOT_STARTED";
  }
}

function buildTestResult(
  buildTest?: BuildTestSnapshot | null
): ContainerTestResult {
  // TASK-160 (P2-M1 Step 3): canonical `build_test` 전용으로 축소.
  //
  // 이전에는 buildTest 가 없으면 legacy `testDeployment.status` /
  // `summary.previewStatus` 로 폴백했다. 그 shim 이 제거됐고, memory /
  // postgres **양쪽 저장소 모두 build_test 를 채우므로** 폴백이 필요 없다.
  // buildTest 가 없다 = 아직 컨테이너 테스트를 시작하지 않았다.
  if (!buildTest) {
    return {
      status: "NOT_STARTED",
      containerRunning: null,
      healthCheckPassed: null,
      portOpen: null,
      stabilityWindowPassed: null
    };
  }
  return {
    status: buildTest.status,
    containerRunning:
      buildTest.status === "SUCCESS"
        ? true
        : buildTest.status === "FAILED"
          ? false
          : null,
    healthCheckPassed: buildTest.healthCheckPassed ?? null,
    portOpen: buildTest.portOpen ?? null,
    stabilityWindowPassed: buildTest.stabilityWindowPassed ?? null
  };
}

function buildDeployResult(
  deploymentAttempt?: DeploymentAttemptSnapshot | null
): DeploymentResult {
  if (deploymentAttempt) {
    return {
      status: deploymentAttempt.status,
      targetType: deploymentAttempt.targetType ?? null,
      resultRef: deploymentAttempt.resultRef ?? null
    };
  }

  return {
    status: "NOT_STARTED",
    targetType: null,
    resultRef: null
  };
}

function buildResultDelivery(input: {
  summary: BuildSummary;
  deploymentAttempt?: DeploymentAttemptSnapshot | null;
}): ResultDelivery {
  if (input.deploymentAttempt && isTerminalPhase(input.summary.phase)) {
    return {
      status: "SUCCESS",
      mode: "POLLING",
      deliveredAt: input.deploymentAttempt.finishedAt ?? input.summary.updatedAt
    };
  }

  if (input.deploymentAttempt) {
    return {
      status: input.deploymentAttempt.status === "FAILED" ? "NOT_STARTED" : "IN_PROGRESS",
      mode: "POLLING",
      deliveredAt: null
    };
  }

  return {
    status: "NOT_STARTED",
    mode: "POLLING",
    deliveredAt: null
  };
}

export function enrichBuildSummary(summary: BuildSummary): BuildSummary {
  return {
    ...summary,
    lifecycleStatus: deriveLifecycleStatus(summary)
  };
}

export function buildStatusResponseFromState(input: {
  summary: BuildSummary;
  lastError: BuildError | null;
  phaseHistory: BuildPhaseHistoryEntry[];
  currentPhase: BuildCurrentPhase;
  testDeployment?: TestDeployment | null;
  buildTest?: BuildTestSnapshot | null;
  deploymentAttempt?: DeploymentAttemptSnapshot | null;
}): BuildStatusResponse {
  const summary = enrichBuildSummary(input.summary);
  const lifecycleStatus = summary.lifecycleStatus ?? deriveLifecycleStatus(summary);

  return {
    build: summary,
    lastError: input.lastError,
    phaseHistory: input.phaseHistory,
    currentPhase: input.currentPhase,
    lifecycle: {
      status: lifecycleStatus,
      startedAt: summary.createdAt,
      finishedAt: isTerminalPhase(summary.phase) ? summary.updatedAt : null
    },
    image: null,
    test: buildTestResult(input.buildTest ?? null),
    deploy: buildDeployResult(input.deploymentAttempt ?? null),
    resultDelivery: buildResultDelivery({
      summary,
      deploymentAttempt: input.deploymentAttempt ?? null
    })
  };
}

function isTerminalPhase(phase: BuildPhase): boolean {
  return phase === "COMPLETED" || phase === "FAILED";
}
