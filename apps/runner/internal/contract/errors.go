package contract

// Canonical error codes. Mirrors
// `packages/shared-contract/src/build/errors.ts` `errorCodes`.
// 13 values (TASK-062 extended from 8 by adding DEPLOYMENT_FAILED; hosting
// policy and capacity errors were added to the shared contract afterward).
//
// Runner 의 `apps/runner/internal/services/build_service.go` 가 외부 배포
// 단계 실패를 보고할 때 (ErrorCode "DEPLOYMENT_FAILED") 본 enum 의 상수를
// 사용한다 — Python / TS layer 와 동일 constant 한 곳에서.
const (
	ErrorCodeActiveBuildExists = "ACTIVE_BUILD_EXISTS"
	ErrorCodeInvalidRequest    = "INVALID_REQUEST"
	ErrorCodeBuildNotFound     = "BUILD_NOT_FOUND"
	ErrorCodeLogsNotFound      = "LOGS_NOT_FOUND"
	ErrorCodeQueueClaimFailed  = "QUEUE_CLAIM_FAILED"
	ErrorCodeDockerBuildFailed = "DOCKER_BUILD_FAILED"
	// TASK-162 (P2-M3): preview-era 이름 PREVIEW_PROVISION_FAILED 의 canonical
	// 개명. 컨테이너 기동 실패 / healthcheck 미통과 / port 미개방 등
	// **컨테이너 테스트 단계의 실패**를 가리킨다.
	ErrorCodeContainerTestFailed = "CONTAINER_TEST_FAILED"
	// TASK-062: external deployment phase failure (parallel to
	// CONTAINER_TEST_FAILED at the container test step).
	ErrorCodeDeploymentFailed = "DEPLOYMENT_FAILED"
	// TASK-166 (P3-M1): 호스팅 context path 가 다른 앱에 이미 할당됨.
	ErrorCodeContextPathTaken = "CONTEXT_PATH_TAKEN"
	// Hosting admission/policy failures. These are emitted by the build server
	// before a runner can start the deployment, but remain part of the shared
	// error contract so Go consumers can decode every canonical error code.
	ErrorCodeHostingTierUpgradeRequired   = "HOSTING_TIER_UPGRADE_REQUIRED"
	ErrorCodeHostingResourceLimitExceeded = "HOSTING_RESOURCE_LIMIT_EXCEEDED"
	ErrorCodeHostingCapacityExceeded      = "HOSTING_CAPACITY_EXCEEDED"
	ErrorCodeUnknownError                 = "UNKNOWN_ERROR"
)

// ErrorCodes — canonical 13-value list. Mirrors
// `apps.skill_mcp.contract.canonical.ERROR_CODES` (Python) /
// `errorCodes` (TS).
var ErrorCodes = []string{
	ErrorCodeActiveBuildExists,
	ErrorCodeInvalidRequest,
	ErrorCodeBuildNotFound,
	ErrorCodeLogsNotFound,
	ErrorCodeQueueClaimFailed,
	ErrorCodeDockerBuildFailed,
	ErrorCodeContainerTestFailed,
	ErrorCodeDeploymentFailed,
	ErrorCodeContextPathTaken,
	ErrorCodeHostingTierUpgradeRequired,
	ErrorCodeHostingResourceLimitExceeded,
	ErrorCodeHostingCapacityExceeded,
	ErrorCodeUnknownError,
}
