package contract

// Build phase enum. Mirrors
// `packages/shared-contract/src/build/phase.ts` `buildPhases`.
// Drives host-side status transitions and is the canonical state
// machine for PKG-005 / 006 / 008.
//
// Runner 의 `ProcessClaim` (apps/runner/internal/services/build_service.go) 가
// `SOURCE_PREPARED → DOCKER_BUILD_STARTED → ...` 순으로 emit 하는 phase 가
// 바로 이 enum 이다.
const (
	PhaseRequestAccepted      = "REQUEST_ACCEPTED"
	PhaseQueueClaimed         = "QUEUE_CLAIMED"
	PhaseSourcePrepared       = "SOURCE_PREPARED"
	PhaseDockerBuildStarted   = "DOCKER_BUILD_STARTED"
	PhaseDockerBuildCompleted = "DOCKER_BUILD_COMPLETED"
	PhaseContainerTestStarted = "CONTAINER_TEST_STARTED"
	PhaseContainerTestPassed  = "CONTAINER_TEST_PASSED"
	PhaseDeploymentStarted    = "DEPLOYMENT_STARTED"
	PhaseDeploymentCompleted  = "DEPLOYMENT_COMPLETED"
	PhaseCompleted            = "COMPLETED"
	// TASK-165 (P2-M5 Step 1): 결과 전달 phase. **build-server 가 emit** 한다
	// (runner 는 COMPLETED 까지만). runner 코드에서 직접 쓰지는 않지만 canonical
	// enum 미러링을 위해 정의를 유지한다.
	PhaseResultDeliveryStarted = "RESULT_DELIVERY_STARTED"
	PhaseResultDelivered       = "RESULT_DELIVERED"
	PhaseFailed                = "FAILED"
)

// BuildPhases — canonical 13-phase list. Mirrors
// `apps.skill_mcp.contract.canonical.BUILD_PHASES` (Python) /
// `buildPhases` (TS). TASK-165 (P2-M5): result-delivery 2종 추가.
var BuildPhases = []string{
	PhaseRequestAccepted,
	PhaseQueueClaimed,
	PhaseSourcePrepared,
	PhaseDockerBuildStarted,
	PhaseDockerBuildCompleted,
	PhaseContainerTestStarted,
	PhaseContainerTestPassed,
	PhaseDeploymentStarted,
	PhaseDeploymentCompleted,
	PhaseCompleted,
	PhaseResultDeliveryStarted,
	PhaseResultDelivered,
	PhaseFailed,
}
