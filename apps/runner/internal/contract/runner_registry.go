package contract

// TASK-069: Runner registry canonical types (TS / Python / Go 3-way sync).
// Mirrors `packages/shared-contract/src/build/runner-registry.ts`.
//
// Runner lifecycle state. ACTIVE = claim 수락. DISABLED = admin 이
// 명시적으로 멈춤. Build Server 측 /admin/runners/:runnerId PATCH 로
// 토글되며, 다음 claim 부터 reason=RUNNER_DISABLED 로 거부된다.
const (
	RunnerStatusActive   = "ACTIVE"
	RunnerStatusDisabled = "DISABLED"
)

// RunnerStatuses — canonical 2-value list.
var RunnerStatuses = []string{
	RunnerStatusActive,
	RunnerStatusDisabled,
}
