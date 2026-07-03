package contract

// Canonical error codes. Mirrors
// `packages/shared-contract/src/build/errors.ts` `errorCodes`.
// 9 values (TASK-062 extended from 8 by adding DEPLOYMENT_FAILED).
//
// Runner 의 `apps/runner/internal/services/build_service.go` 가 외부 배포
// 단계 실패를 보고할 때 (ErrorCode "DEPLOYMENT_FAILED") 본 enum 의 상수를
// 사용한다 — Python / TS layer 와 동일 constant 한 곳에서.
const (
	ErrorCodeActiveBuildExists     = "ACTIVE_BUILD_EXISTS"
	ErrorCodeInvalidRequest        = "INVALID_REQUEST"
	ErrorCodeBuildNotFound         = "BUILD_NOT_FOUND"
	ErrorCodeLogsNotFound          = "LOGS_NOT_FOUND"
	ErrorCodeQueueClaimFailed      = "QUEUE_CLAIM_FAILED"
	ErrorCodeDockerBuildFailed     = "DOCKER_BUILD_FAILED"
	ErrorCodePreviewProvisionFailed = "PREVIEW_PROVISION_FAILED"
	// TASK-062: external deployment phase failure (parallel to
	// PREVIEW_PROVISION_FAILED at the test environment provisioning step).
	ErrorCodeDeploymentFailed      = "DEPLOYMENT_FAILED"
	ErrorCodeUnknownError          = "UNKNOWN_ERROR"
)

// ErrorCodes — canonical 9-value list. Mirrors
// `apps.skill_mcp.contract.canonical.ERROR_CODES` (Python) /
// `errorCodes` (TS).
var ErrorCodes = []string{
	ErrorCodeActiveBuildExists,
	ErrorCodeInvalidRequest,
	ErrorCodeBuildNotFound,
	ErrorCodeLogsNotFound,
	ErrorCodeQueueClaimFailed,
	ErrorCodeDockerBuildFailed,
	ErrorCodePreviewProvisionFailed,
	ErrorCodeDeploymentFailed,
	ErrorCodeUnknownError,
}
