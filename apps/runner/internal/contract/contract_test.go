package contract

import (
	"testing"
)

// TestCanonicalStatusCount 는 BuildStatuses 가 TS / Python layer 와
// 같은 개수를 가지는지 확인한다. canonical contract 변경 시 (add/remove) 세
// layer 모두 동시 수정 필수 — 본 테스트가 structural guard.
func TestCanonicalStatusCount(t *testing.T) {
	if got, want := len(CanonicalBuildStatuses), 12; got != want {
		t.Errorf("CanonicalBuildStatuses size = %d, want %d (TS+Python mirror must match)", got, want)
	}
	// TASK-159: legacy status 제거 후 All == Canonical.
	if got, want := len(AllBuildStatuses), 12; got != want {
		t.Errorf("AllBuildStatuses size = %d, want %d (canonical only)", got, want)
	}
}

func TestBuildPhasesCount(t *testing.T) {
	if got, want := len(BuildPhases), 11; got != want {
		t.Errorf("BuildPhases size = %d, want %d (TS+Python mirror must match)", got, want)
	}
}

func TestExecutionStatusesCount(t *testing.T) {
	if got, want := len(ExecutionStatuses), 5; got != want {
		t.Errorf("ExecutionStatuses size = %d, want %d (TS+Python mirror must match)", got, want)
	}
}

func TestErrorCodesCount(t *testing.T) {
	if got, want := len(ErrorCodes), 9; got != want {
		t.Errorf("ErrorCodes size = %d, want %d (TASK-062: 9 = 8+DEPLOYMENT_FAILED)", got, want)
	}
}

// TestCanonicalValuesAreUnique 는 모든 enum list 가 중복 없이 unique 함을 확인한다.
// 중복이 들어오면 build/claim 응답의 switch 문이 잘못 분기될 수 있으므로
// 안전 검증.
func TestCanonicalValuesAreUnique(t *testing.T) {
	check := func(name string, vs []string) {
		t.Helper()
		seen := make(map[string]struct{}, len(vs))
		for _, v := range vs {
			if _, dup := seen[v]; dup {
				t.Errorf("%s: duplicate value %q", name, v)
			}
			seen[v] = struct{}{}
		}
	}
	check("CanonicalBuildStatuses", CanonicalBuildStatuses)
	check("BuildPhases", BuildPhases)
	check("ErrorCodes", ErrorCodes)
}

// TestCanonicalValuesAreUpperSnake 는 canonical v2 의 enum 값이
// UPPER_SNAKE_CASE 만 쓰는지 확인. TS `as const` /\ Python frozenset
// 와 같은 표면 검증 — drift checker 가 잡기 어려운 keyword/identifier
// 누출을 잡는다 (예: "build_success" 가 섞이는 경우).
func TestCanonicalValuesAreUpperSnake(t *testing.T) {
	check := func(name string, vs []string) {
		t.Helper()
		for _, v := range vs {
			if !isUpperSnake(v) {
				t.Errorf("%s: %q is not UPPER_SNAKE_CASE", name, v)
			}
		}
	}
	check("CanonicalBuildStatuses", CanonicalBuildStatuses)
	check("BuildPhases", BuildPhases)
	check("ErrorCodes", ErrorCodes)
}

func isUpperSnake(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		switch {
		case r >= 'A' && r <= 'Z':
		case r >= '0' && r <= '9':
		case r == '_':
		default:
			return false
		}
	}
	return true
}

// TestLegacyBuildStatusEmittedInCanonical 는 canonical 12 statuses 안에
// legacy adapter 2 종이 **없음** 을 보장한다. Build Server 가 migration
// 기간에만 emit 하는 shim 이므로 canonical lifecycle set 에 섞이면 안 된다.
// TestStatusConstLookup 은 각 const 가 빌드 status 값을 정확히 들고 있는지 확인.
// 새 항목이 추가됐는데 const 선언을 빠뜨리는 함정을 잡는다.
func TestStatusConstLookup(t *testing.T) {
	for _, v := range CanonicalBuildStatuses {
		found := false
		for _, decl := range []string{
			StatusReceived, StatusQueued, StatusPreparingSource,
			StatusBuilding, StatusBuildSuccess, StatusTesting,
			StatusTestSuccess, StatusDeploying, StatusDeploySuccess,
			StatusCompleted, StatusFailed, StatusCancelled,
		} {
			if decl == v {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("CanonicalBuildStatuses entry %q has no matching const declaration", v)
		}
	}
}

// TestErrorCodeConstLookup 는 ErrorCodes 9 종 모두 const 로 선언됐는지 확인.
func TestErrorCodeConstLookup(t *testing.T) {
	for _, v := range ErrorCodes {
		found := false
		for _, decl := range []string{
			ErrorCodeActiveBuildExists, ErrorCodeInvalidRequest,
			ErrorCodeBuildNotFound, ErrorCodeLogsNotFound,
			ErrorCodeQueueClaimFailed, ErrorCodeDockerBuildFailed,
			ErrorCodeContainerTestFailed, ErrorCodeDeploymentFailed,
			ErrorCodeUnknownError,
		} {
			if decl == v {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("ErrorCodes entry %q has no matching const declaration", v)
		}
	}
}

// TestPhaseConstLookup 는 BuildPhases 11 종 모두 const 로 선언됐는지 확인.
func TestPhaseConstLookup(t *testing.T) {
	for _, v := range BuildPhases {
		found := false
		for _, decl := range []string{
			PhaseRequestAccepted, PhaseQueueClaimed, PhaseSourcePrepared,
			PhaseDockerBuildStarted, PhaseDockerBuildCompleted,
			PhaseContainerTestStarted, PhaseContainerTestPassed,
			PhaseDeploymentStarted, PhaseDeploymentCompleted,
			PhaseCompleted, PhaseFailed,
		} {
			if decl == v {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("BuildPhases entry %q has no matching const declaration", v)
		}
	}
}
