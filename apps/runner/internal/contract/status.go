package contract

// Canonical build lifecycle statuses. Mirrors
// `packages/shared-contract/src/build/status.ts` `canonicalBuildStatuses`.
// 12 values aligned with the SDLC docs:
//
//   build (PREPARING_SOURCE / BUILDING / BUILD_SUCCESS) ->
//   container test (TESTING / TEST_SUCCESS) ->
//   external deployment (DEPLOYING / DEPLOY_SUCCESS) ->
//   terminal (COMPLETED / FAILED / CANCELLED).
const (
	StatusReceived           = "RECEIVED"
	StatusQueued             = "QUEUED"
	StatusPreparingSource    = "PREPARING_SOURCE"
	StatusBuilding           = "BUILDING"
	StatusBuildSuccess       = "BUILD_SUCCESS"
	StatusTesting            = "TESTING"
	StatusTestSuccess        = "TEST_SUCCESS"
	StatusDeploying          = "DEPLOYING"
	StatusDeploySuccess      = "DEPLOY_SUCCESS"
	StatusCompleted          = "COMPLETED"
	StatusFailed             = "FAILED"
	StatusCancelled          = "CANCELLED"
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

// Legacy adapter statuses. Mirrors `legacyBuildStatuses` (TS) /
// `apps.skill_mcp.contract.canonical.LEGACY_BUILD_STATUSES`. Build Server
// 가 migration 기간 동안 여전히 emit 할 수 있는 shim 상태 — Runner 가
// 입력으로 받을 수는 있지만 출력으로는 절대 emit 하면 안 된다.
const (
	StatusLegacyClaimed  = "CLAIMED"
	StatusLegacyTestReady = "TEST_READY"
)

// LegacyBuildStatuses — 2 값.
var LegacyBuildStatuses = []string{
	StatusLegacyClaimed,
	StatusLegacyTestReady,
}

// AllBuildStatuses — canonical 12 + legacy 2 = 14.
// Runner 가 claim 응답 / GET /builds/:id 등에서 받을 수 있는 모든 status
// 값의 union. Host Server 가 emit 하는 public union 과 정합.
var AllBuildStatuses = append(append([]string{}, CanonicalBuildStatuses...), LegacyBuildStatuses...)

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
