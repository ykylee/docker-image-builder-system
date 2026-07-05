package contract

import (
	"sort"
	"testing"
)

// TASK-069: canonical RunnerStatuses (TS/Python/Go 3-way sync anchor).
// Shared-contract `runnerStatusSchema` enum 은 2 값 (ACTIVE / DISABLED).
// 본 테스트가 망가지면 sync 가 깨진 것 — drift checker 가 cross-check.

func TestRunnerStatusesCount(t *testing.T) {
	if got := len(RunnerStatuses); got != 2 {
		t.Errorf("expected 2 runner statuses, got %d: %v", got, RunnerStatuses)
	}
}

func TestRunnerStatusesAreUnique(t *testing.T) {
	seen := make(map[string]struct{}, len(RunnerStatuses))
	for _, v := range RunnerStatuses {
		if _, dup := seen[v]; dup {
			t.Errorf("duplicate runner status: %q", v)
		}
		seen[v] = struct{}{}
	}
}

func TestRunnerStatusesAreUpperSnake(t *testing.T) {
	for _, v := range RunnerStatuses {
		if !isUpperSnake(v) {
			t.Errorf("runner status %q must be UPPER_SNAKE_CASE", v)
		}
	}
}

func TestRunnerStatusesSortedConsistency(t *testing.T) {
	// 정렬 결과가 일정한지 (drift checker 가 sort 후 비교하므로).
	sorted := make([]string, len(RunnerStatuses))
	copy(sorted, RunnerStatuses)
	sort.Strings(sorted)
	for i := range sorted {
		if sorted[i] != RunnerStatuses[i] {
			t.Errorf("RunnerStatuses[%d] mismatch: got=%s sorted=%s", i, RunnerStatuses[i], sorted[i])
		}
	}
}

func TestRunnerStatusConstLookup(t *testing.T) {
	if RunnerStatusActive != "ACTIVE" {
		t.Errorf("RunnerStatusActive = %q, want ACTIVE", RunnerStatusActive)
	}
	if RunnerStatusDisabled != "DISABLED" {
		t.Errorf("RunnerStatusDisabled = %q, want DISABLED", RunnerStatusDisabled)
	}
}
