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
	PhaseRequestAccepted       = "REQUEST_ACCEPTED"
	PhaseQueueClaimed          = "QUEUE_CLAIMED"
	PhaseSourcePrepared        = "SOURCE_PREPARED"
	PhaseDockerBuildStarted    = "DOCKER_BUILD_STARTED"
	PhaseDockerBuildCompleted  = "DOCKER_BUILD_COMPLETED"
	PhasePreviewQueued         = "PREVIEW_QUEUED"
	PhasePreviewReady          = "PREVIEW_READY"
	PhaseDeploymentStarted     = "DEPLOYMENT_STARTED"
	PhaseDeploymentCompleted   = "DEPLOYMENT_COMPLETED"
	PhaseCompleted             = "COMPLETED"
	PhaseFailed                = "FAILED"
)

// BuildPhases — canonical 11-phase list. Mirrors
// `apps.skill_mcp.contract.canonical.BUILD_PHASES` (Python) /
// `buildPhases` (TS).
var BuildPhases = []string{
	PhaseRequestAccepted,
	PhaseQueueClaimed,
	PhaseSourcePrepared,
	PhaseDockerBuildStarted,
	PhaseDockerBuildCompleted,
	PhasePreviewQueued,
	PhasePreviewReady,
	PhaseDeploymentStarted,
	PhaseDeploymentCompleted,
	PhaseCompleted,
	PhaseFailed,
}
