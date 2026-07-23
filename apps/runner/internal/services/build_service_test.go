package services

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/contract"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/docker"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/hostclient"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/queue"
)

// fakeClient 는 테스트용 hostclient.
type fakeClient struct {
	mu           sync.Mutex
	phases       []string
	phaseReports []hostclient.PhaseReport
	buildID      string
	runnerID     string
	reportErr    error
	started      []hostclient.StartContainerTestRequest
	testResults  []hostclient.ContainerTestResultRequest
	deployments  []hostclient.DeploymentReportRequest
}

func (f *fakeClient) ClaimNextBuild(ctx context.Context) (*hostclient.ClaimedBuildResponse, error) {
	return &hostclient.ClaimedBuildResponse{
		BuildID:         f.buildID,
		AppName:         "todo-app",
		Phase:           contract.PhaseQueueClaimed,
		Status:          contract.StatusPreparingSource,
		LifecycleStatus: contract.StatusPreparingSource,
	}, nil
}

func (f *fakeClient) ReportPhase(ctx context.Context, buildID string, report hostclient.PhaseReport) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.reportErr != nil {
		return f.reportErr
	}
	f.phases = append(f.phases, report.Phase)
	f.phaseReports = append(f.phaseReports, report)
	f.buildID = buildID
	f.runnerID = report.RunnerID
	return nil
}

func (f *fakeClient) StartContainerTest(ctx context.Context, buildID string, req hostclient.StartContainerTestRequest) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.started = append(f.started, req)
	return nil
}

func (f *fakeClient) ReportContainerTestResult(ctx context.Context, buildID string, req hostclient.ContainerTestResultRequest) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.testResults = append(f.testResults, req)
	return nil
}

func (f *fakeClient) ReportDeployment(ctx context.Context, buildID string, req hostclient.DeploymentReportRequest) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deployments = append(f.deployments, req)
	return nil
}

// TASK-066: DownloadSource added to keep fakeClient compatible
// with the expanded BuildControlClient interface. The services
// tests do not exercise the fetcher (the BuildService falls back
// to `PrepareSource` when `s.fetcher == nil`), so a no-op
// implementation is correct here.
func (f *fakeClient) DownloadSource(ctx context.Context, buildID string) ([]byte, string, int, error) {
	return nil, "", 0, nil
}

func TestProcessClaim_NilClaim_NoPhaseReports(t *testing.T) {
	fc := &fakeClient{}
	// TASK-066: `fetcher=nil` exercises the `PrepareSource`
	// fallback path so the test stays focused on the phase
	// reporting contract without dragging in the fetcher.
	svc := NewBuildService(fc, docker.NewClient(), nil, "r-1")
	if err := svc.ProcessClaim(context.Background(), nil); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(fc.phases) != 0 {
		t.Errorf("expected no phase reports, got %v", fc.phases)
	}
}

func TestProcessClaim_ReportsFullHappyPath(t *testing.T) {
	fc := &fakeClient{buildID: "b-1"}
	svc := NewBuildService(fc, docker.NewClient(), nil, "r-1")
	claim := &queue.ClaimedBuild{BuildID: "b-1"}
	if err := svc.ProcessClaim(context.Background(), claim); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	expected := []string{
		contract.PhaseSourcePrepared,
		contract.PhaseDockerBuildStarted,
		contract.PhaseDockerBuildCompleted,
		contract.PhaseCompleted,
	}
	if len(fc.phases) != len(expected) {
		t.Fatalf("expected %d phase reports, got %d: %v", len(expected), len(fc.phases), fc.phases)
	}
	for i, p := range expected {
		if fc.phases[i] != p {
			t.Errorf("phase[%d]: expected %s, got %s", i, p, fc.phases[i])
		}
	}
	if fc.runnerID != "r-1" {
		t.Errorf("expected runnerID r-1, got %s", fc.runnerID)
	}
}

func TestProcessClaim_PhaseReportError_Propagates(t *testing.T) {
	fc := &fakeClient{buildID: "b-1", reportErr: errors.New("boom")}
	svc := NewBuildService(fc, docker.NewClient(), nil, "r-1")
	claim := &queue.ClaimedBuild{BuildID: "b-1"}
	if err := svc.ProcessClaim(context.Background(), claim); err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestProcessClaim_StartsAndReportsContainerTestResult(t *testing.T) {
	fc := &fakeClient{buildID: "b-1"}
	svc := NewBuildService(fc, docker.NewClient(), nil, "r-1")
	claim := &queue.ClaimedBuild{BuildID: "b-1"}
	if err := svc.ProcessClaim(context.Background(), claim); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(fc.started) != 1 {
		t.Errorf("expected 1 container test start call, got %d", len(fc.started))
	}
	if fc.started[0].InternalPort != 8080 {
		t.Errorf("expected internalPort 8080, got %d", fc.started[0].InternalPort)
	}
	if len(fc.testResults) != 1 {
		t.Errorf("expected 1 container test result call, got %d", len(fc.testResults))
	}
	// TASK-161: 결과 보고는 canonical ExecutionStatus 를 실어야 한다.
	if fc.testResults[0].Status != contract.ExecutionStatusSuccess {
		t.Errorf("expected container test status SUCCESS, got %s", fc.testResults[0].Status)
	}
	if fc.testResults[0].HostPort != 38124 {
		t.Errorf("expected hostPort 38124, got %d", fc.testResults[0].HostPort)
	}
	if fc.testResults[0].ContainerRef != "container-b-1" {
		t.Errorf("expected containerRef container-b-1, got %s", fc.testResults[0].ContainerRef)
	}
	if !fc.testResults[0].HealthCheckPassed || !fc.testResults[0].PortOpen || !fc.testResults[0].StabilityWindowPassed {
		t.Errorf("expected container test booleans true, got %+v", fc.testResults[0])
	}
	if len(fc.deployments) != 2 {
		t.Fatalf("expected 2 deployment reports, got %d", len(fc.deployments))
	}
	if fc.deployments[0].Status != contract.ExecutionStatusInProgress {
		t.Errorf("expected first deployment status IN_PROGRESS, got %s", fc.deployments[0].Status)
	}
	if fc.deployments[1].Status != contract.ExecutionStatusSuccess {
		t.Errorf("expected second deployment status SUCCESS, got %s", fc.deployments[1].Status)
	}
}

// TASK-067: BuildService 가 docker.Client.RunContainer 의 ContainerStatus
// 값을 그대로 ReportContainerTestResult 의 입력으로 사용해야 한다. 새 docker
// Client (skeleton mode) 를 명시적으로 wire-up 해서 결과 보고에
// 들어간 host / hostPort / runtimeUrl / containerRef 가 ContainerStatus 의
// 그것과 일치하는지 확인.
func TestProcessClaim_PassesContainerStatusFromRunContainer(t *testing.T) {
	fc := &fakeClient{buildID: "b-67"}
	dockerClient := docker.NewClient()
	svc := NewBuildService(fc, dockerClient, nil, "r-67")
	claim := &queue.ClaimedBuild{BuildID: "b-67"}

	if err := svc.ProcessClaim(context.Background(), claim); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if len(fc.testResults) != 1 {
		t.Fatalf("expected 1 container test result call, got %d", len(fc.testResults))
	}
	req := fc.testResults[0]

	// BuildService 가 RunContainer(skeleton) 의 결과를 그대로 전달했는지 확인.
	// skeleton mode 의 default HostPort 는 38124 이고 containerRef 는
	// "container-<buildID>".
	if req.ContainerRef != "container-b-67" {
		t.Errorf("expected containerRef=container-b-67, got %s", req.ContainerRef)
	}
	if req.HostPort != 38124 {
		t.Errorf("expected hostPort=38124, got %d", req.HostPort)
	}
	if req.Host != "container-test.local" {
		t.Errorf("expected host=container-test.local, got %s", req.Host)
	}
	expectedRuntimeURL := "http://container-test.local:38124/"
	if req.RuntimeURL != expectedRuntimeURL {
		t.Errorf("expected runtimeURL=%s, got %s", expectedRuntimeURL, req.RuntimeURL)
	}
	if !req.HealthCheckPassed || !req.PortOpen || !req.StabilityWindowPassed {
		t.Errorf("expected all health flags true, got %+v", req)
	}
}

// RUNNER_STOP_CONTAINER_ON_DONE=true 일 때 ProcessClaim 종료 후
// defer StopContainer 가 호출되어야 한다. cli mode + fake runContainer /
// stopContainer + httptest health server 로 docker daemon 없이 검증.
// fake health server 의 port 를 WithHostPort 로 명시해 probe 가 정확히
// 그쪽을 향하도록 한다.
func TestProcessClaim_StopContainerOnDoneDefer(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DOCKER_BUILD_MODE", "skeleton")
	t.Setenv("RUNNER_DOCKER_RUN_MODE", "cli")
	t.Setenv("RUNNER_STOP_CONTAINER_ON_DONE", "true")
	t.Setenv("RUNNER_HEALTHCHECK_TIMEOUT_SECONDS", "5")

	// healthcheck 응답용 fake HTTP server — BuildService 가 이쪽으로
	// probe 하도록 WithHostPort 로 port 를 명시한다.
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	srvPort := srv.Listener.Addr().(*net.TCPAddr).Port

	fc := &fakeClient{buildID: "b-67"}
	dockerClient := docker.NewClient()
	dockerClient.SetRunContainerCmdForTest(func(ctx context.Context, args ...string) error {
		return nil
	})
	var stopCalls int
	dockerClient.SetStopContainerCmdForTest(func(ctx context.Context, args ...string) error {
		stopCalls++
		return nil
	})
	dockerClient.SetHealthClientForTest(srv.Client())

	svc := NewBuildService(fc, dockerClient, nil, "r-67").WithHostPort(srvPort)
	claim := &queue.ClaimedBuild{BuildID: "b-67"}

	if err := svc.ProcessClaim(context.Background(), claim); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if stopCalls != 1 {
		t.Errorf("expected exactly 1 stop container call, got %d", stopCalls)
	}
}

// TASK-162 (P2-M3): 컨테이너 테스트가 실패하면 runner 는 두 가지를 모두
// 보고해야 한다 — ① `test` 블록을 FAILED 로 닫고 ② phase FAILED 를 canonical
// errorCode(CONTAINER_TEST_FAILED)와 함께 보고. 이전에는 phase FAILED 만
// 보냈고 이유도 없어서, 호스트에서 build 는 FAILED 인데 test.status 는
// IN_PROGRESS 로 남고 lastError 는 null 이었다.
func TestProcessClaim_ContainerTestFailure_ReportsResultAndErrorCode(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DOCKER_BUILD_MODE", "skeleton")
	t.Setenv("RUNNER_DOCKER_RUN_MODE", "cli")
	t.Setenv("RUNNER_HEALTHCHECK_TIMEOUT_SECONDS", "1")

	// health probe 가 향할 곳에 아무도 없도록 즉시 닫은 listener 의 port 를
	// 쓴다 — healthcheck 는 timeout 으로 반드시 실패한다.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	deadPort := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()

	fc := &fakeClient{buildID: "b-fail"}
	dockerClient := docker.NewClient()
	dockerClient.SetRunContainerCmdForTest(func(ctx context.Context, args ...string) error {
		return nil
	})
	var stopCalls int
	dockerClient.SetStopContainerCmdForTest(func(ctx context.Context, args ...string) error {
		stopCalls++
		return nil
	})

	svc := NewBuildService(fc, dockerClient, nil, "r-fail").WithHostPort(deadPort)
	if err := svc.ProcessClaim(context.Background(), &queue.ClaimedBuild{BuildID: "b-fail"}); err == nil {
		t.Fatal("expected container test failure to surface as an error")
	}

	// ① test 블록이 FAILED 로 닫혔는가
	if len(fc.testResults) != 1 {
		t.Fatalf("expected 1 container test result report, got %d", len(fc.testResults))
	}
	result := fc.testResults[0]
	if result.Status != contract.ExecutionStatusFailed {
		t.Errorf("expected container test status FAILED, got %s", result.Status)
	}
	if result.ErrorCode != contract.ErrorCodeContainerTestFailed {
		t.Errorf("expected errorCode CONTAINER_TEST_FAILED, got %s", result.ErrorCode)
	}
	if result.ErrorMessage == "" {
		t.Error("expected a non-empty error message on the failed container test")
	}
	// 실패 보고에는 런타임 정보가 없어야 한다 (계약이 runtimeUrl 에 .url(),
	// host 에 .min(1) 을 걸어두어 빈 문자열은 400 이 된다 — omitempty 로 아예
	// 전송되지 않아야 한다).
	if result.RuntimeURL != "" || result.Host != "" {
		t.Errorf("expected no runtime info on a failed report, got url=%q host=%q", result.RuntimeURL, result.Host)
	}

	// ② phase FAILED 가 이유와 함께 보고됐는가
	var failed *hostclient.PhaseReport
	for i := range fc.phaseReports {
		if fc.phaseReports[i].Phase == contract.PhaseFailed {
			failed = &fc.phaseReports[i]
		}
	}
	if failed == nil {
		t.Fatalf("expected a FAILED phase report, got phases=%v", fc.phases)
	}
	if failed.ErrorCode != contract.ErrorCodeContainerTestFailed {
		t.Errorf("expected FAILED phase errorCode CONTAINER_TEST_FAILED, got %q", failed.ErrorCode)
	}
	if failed.ErrorMessage == "" {
		t.Error("expected a non-empty error message on the FAILED phase report")
	}

	// healthcheck 실패 시 컨테이너는 정리되어야 한다.
	if stopCalls != 1 {
		t.Errorf("expected exactly 1 stop container call after healthcheck failure, got %d", stopCalls)
	}
}

// TASK-162: docker build 실패는 canonical DOCKER_BUILD_FAILED 로 보고한다.
// 개명 전까지 이 코드를 emit 하는 곳이 하나도 없었다.
func TestProcessClaim_BuildFailure_ReportsDockerBuildFailed(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DOCKER_BUILD_MODE", "cli")
	// cli mode 의 `docker build` 가 확실히 실패하도록 존재하지 않는 바이너리를
	// 가리킨다 — docker daemon 없이도 결정적으로 실패한다.
	t.Setenv("RUNNER_DOCKER_BIN", filepath.Join(tmp, "no-such-docker"))

	fc := &fakeClient{buildID: "b-build"}
	dockerClient := docker.NewClient()

	svc := NewBuildService(fc, dockerClient, nil, "r-build")
	if err := svc.ProcessClaim(context.Background(), &queue.ClaimedBuild{BuildID: "b-build"}); err == nil {
		t.Fatal("expected build failure to surface as an error")
	}

	// 빌드 단계 실패이므로 컨테이너 테스트는 시작조차 하지 않는다.
	if len(fc.started) != 0 {
		t.Errorf("expected no container test start on a build failure, got %d", len(fc.started))
	}
	if len(fc.testResults) != 0 {
		t.Errorf("expected no container test result on a build failure, got %d", len(fc.testResults))
	}

	var failed *hostclient.PhaseReport
	for i := range fc.phaseReports {
		if fc.phaseReports[i].Phase == contract.PhaseFailed {
			failed = &fc.phaseReports[i]
		}
	}
	if failed == nil {
		t.Fatalf("expected a FAILED phase report, got phases=%v", fc.phases)
	}
	if failed.ErrorCode != contract.ErrorCodeDockerBuildFailed {
		t.Errorf("expected errorCode DOCKER_BUILD_FAILED, got %q", failed.ErrorCode)
	}
}
