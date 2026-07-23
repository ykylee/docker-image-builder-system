package contract

// Canonical build lifecycle statuses. Mirrors
// `packages/shared-contract/src/build/status.ts` `canonicalBuildStatuses`.
// 12 values aligned with the SDLC docs:
//
//	build (PREPARING_SOURCE / BUILDING / BUILD_SUCCESS) ->
//	container test (TESTING / TEST_SUCCESS) ->
//	external deployment (DEPLOYING / DEPLOY_SUCCESS) ->
//	terminal (COMPLETED / FAILED / CANCELLED).
const (
	StatusReceived        = "RECEIVED"
	StatusQueued          = "QUEUED"
	StatusPreparingSource = "PREPARING_SOURCE"
	StatusBuilding        = "BUILDING"
	StatusBuildSuccess    = "BUILD_SUCCESS"
	StatusTesting         = "TESTING"
	StatusTestSuccess     = "TEST_SUCCESS"
	StatusDeploying       = "DEPLOYING"
	StatusDeploySuccess   = "DEPLOY_SUCCESS"
	StatusCompleted       = "COMPLETED"
	StatusFailed          = "FAILED"
	StatusCancelled       = "CANCELLED"
)

// CanonicalBuildStatuses is the canonical 12-value list. Mirrors
// `apps.skill_mcp.contract.canonical.CANONICAL_BUILD_STATUSES` (Python)
// and `canonicalBuildStatuses` (TS).
var CanonicalBuildStatuses = []string{
	StatusReceived,
	StatusQueued,
	StatusPreparingSource,
	StatusBuilding,
	StatusBuildSuccess,
	StatusTesting,
	StatusTestSuccess,
	StatusDeploying,
	StatusDeploySuccess,
	StatusCompleted,
	StatusFailed,
	StatusCancelled,
}

// TASK-159 (P2-M1 Step 2): legacy adapter status 제거.
//   CLAIMED    → StatusPreparingSource
//   TEST_READY → StatusTestSuccess
// 외부 소비자가 없어 alias 유예 없이 즉시 제거. 이제 AllBuildStatuses 는
// canonical 과 동일하다 (TS `buildStatuses` / Python `BUILD_STATUSES` 정합).

// AllBuildStatuses — canonical 12.
var AllBuildStatuses = append([]string{}, CanonicalBuildStatuses...)

// Generic step/result status used by BuildStatusResponse.lifecycle /
// .image / .test / .deploy / .resultDelivery blocks. Mirrors
// `packages/shared-contract/src/build/status.ts` `executionStatuses`.
// 5 values.
//
// Runner 의 deployment step (apps/runner/internal/services/build_service.go)
// 가 ReportDeployment 의 `status` 필드에 본 상수를 쓴다. lifecycle
// status 와는 별개 enum 이라는 점이 canonical contract 의 핵심.
const (
	ExecutionStatusNotStarted = "NOT_STARTED"
	ExecutionStatusInProgress = "IN_PROGRESS"
	ExecutionStatusSuccess    = "SUCCESS"
	ExecutionStatusFailed     = "FAILED"
	ExecutionStatusSkipped    = "SKIPPED"
)

// ExecutionStatuses — canonical 5-value list. Mirrors
// `apps.skill_mcp.contract.canonical.EXECUTION_STATUSES` (Python) /
// `executionStatuses` (TS).
var ExecutionStatuses = []string{
	ExecutionStatusNotStarted,
	ExecutionStatusInProgress,
	ExecutionStatusSuccess,
	ExecutionStatusFailed,
	ExecutionStatusSkipped,
}
