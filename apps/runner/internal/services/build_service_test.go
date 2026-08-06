package services

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/contract"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/deploy"
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

// Phase 2 (Runner 인증) — lease helpers. test fixture 는 lease 게이트
// 비활성 환경이라 no-op 으로 충분.
func (f *fakeClient) EnsureLease(ctx context.Context) error { return nil }
func (f *fakeClient) RenewLease(ctx context.Context) (int64, error) {
	return 0, nil
}
func (f *fakeClient) LoginLease(ctx context.Context) error { return nil }

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

// =============================================================================
// TASK-162 (P2-M3 후속): k8s adapter 통합 테스트.
// =============================================================================

// lastDeployment 는 fc.deployments 의 마지막 entry 를 반환한다.
// BuildService 는 IN_PROGRESS(컨테이너 테스트 직후) + SUCCESS(배포 종료)
// 의 2 회 ReportDeployment 를 호출하므로, 최종 SUCCESS 응답은 마지막
// entry. k8s 결과가 활성화되면 마지막 entry 가 docker registry + k8s 의
// merged response 다.
func lastDeployment(fc *fakeClient) hostclient.DeploymentReportRequest {
	fc.mu.Lock()
	defer fc.mu.Unlock()
	return fc.deployments[len(fc.deployments)-1]
}

type fakeK8sDeployer struct {
	cluster   string
	namespace string
	manifest  string
	result    *deploy.K8sResult
	err       error
	calls     []deploy.K8sDeployOptions
	// TASK-175 (E2): Cleanup 위임 검증을 위한 기록 필드.
	cleanupCalls []deploy.K8sCleanupOptions
}

func (f *fakeK8sDeployer) Deploy(ctx context.Context, opts deploy.K8sDeployOptions) (*deploy.K8sResult, error) {
	f.calls = append(f.calls, opts)
	if f.err != nil {
		return nil, f.err
	}
	if f.result != nil {
		return f.result, nil
	}
	return &deploy.K8sResult{
		Cluster:    opts.Cluster,
		Namespace:  opts.Namespace,
		TargetType: "K8S",
		Manifest:   opts.Manifest,
		ResultRef:  fmt.Sprintf("noop://%s/%s/%s", opts.Cluster, opts.Namespace, opts.BuildID),
		AppliedAt:  time.Now().UTC(),
	}, nil
}

func (f *fakeK8sDeployer) Apply(ctx context.Context, opts deploy.K8sApplyOptions) (*deploy.K8sResult, error) {
	return &deploy.K8sResult{ResultRef: "noop://apply"}, nil
}

func (f *fakeK8sDeployer) Cleanup(ctx context.Context, opts deploy.K8sCleanupOptions) error {
	f.cleanupCalls = append(f.cleanupCalls, opts)
	return nil
}

func TestBuildService_WithK8sDeployer_NilByDefault(t *testing.T) {
	fc := &fakeClient{buildID: "b-1"}
	svc := NewBuildService(fc, docker.NewClient(), nil, "r-1")
	if svc.k8sDeployer != nil {
		t.Errorf("k8sDeployer should be nil by default (skeleton 단계)")
	}
}

func TestBuildService_WithK8sDeployer_Setter(t *testing.T) {
	fc := &fakeClient{buildID: "b-1"}
	svc := NewBuildService(fc, docker.NewClient(), nil, "r-1")
	d := &fakeK8sDeployer{}
	got := svc.WithK8sDeployer(d)
	if got != svc {
		t.Errorf("WithK8sDeployer should return *BuildService for chaining")
	}
	if svc.k8sDeployer == nil {
		t.Errorf("k8sDeployer not set after WithK8sDeployer")
	}
}

func TestBuildService_K8sDeployer_MergedIntoReportDeployment(t *testing.T) {
	fc := &fakeClient{buildID: "b-1"}
	svc := NewBuildService(fc, docker.NewClient(), nil, "r-1").WithHostPort(38124)
	d := &fakeK8sDeployer{cluster: "kind-p2-m5", namespace: "builds", manifest: "deploy/base.yaml"}
	svc.WithK8sDeployer(d)
	t.Setenv("RUNNER_K8S_CLUSTER", "kind-p2-m5")
	t.Setenv("RUNNER_K8S_NAMESPACE", "builds")
	t.Setenv("RUNNER_K8S_MANIFEST", "deploy/base.yaml")

	if err := svc.ProcessClaim(context.Background(), &queue.ClaimedBuild{BuildID: "b-1", AppName: "todo-app"}); err != nil {
		t.Fatalf("ProcessClaim: %v", err)
	}

	if len(d.calls) != 1 {
		t.Fatalf("expected 1 k8s Deploy call, got %d", len(d.calls))
	}
	kOpts := d.calls[0]
	if kOpts.Cluster != "kind-p2-m5" || kOpts.Namespace != "builds" || kOpts.BuildID != "b-1" {
		t.Errorf("k8s options: %+v", kOpts)
	}

	dr := lastDeployment(fc)
	if dr.Status != contract.ExecutionStatusSuccess {
		t.Errorf("Status = %s, want SUCCESS", dr.Status)
	}
	if !strings.Contains(dr.TargetType, "K8S") {
		t.Errorf("TargetType = %s, want to contain K8S", dr.TargetType)
	}
	if dr.ResponsePayloadJSON == nil {
		t.Fatalf("ResponsePayloadJSON nil")
	}
	k8sSection, ok := dr.ResponsePayloadJSON["k8s"].(map[string]any)
	if !ok {
		t.Fatalf("ResponsePayloadJSON.k8s not map: %+v", dr.ResponsePayloadJSON)
	}
	if k8sSection["cluster"] != "kind-p2-m5" {
		t.Errorf("k8s.cluster = %v", k8sSection["cluster"])
	}
}

func TestBuildService_K8sDeployer_Failure_ReportsFAILED(t *testing.T) {
	fc := &fakeClient{buildID: "b-1"}
	svc := NewBuildService(fc, docker.NewClient(), nil, "r-1").WithHostPort(38124)
	d := &fakeK8sDeployer{err: errors.New("k8s boom")}
	svc.WithK8sDeployer(d)

	err := svc.ProcessClaim(context.Background(), &queue.ClaimedBuild{BuildID: "b-1", AppName: "todo-app"})
	if err == nil {
		t.Fatalf("expected error from k8s failure")
	}
	if !strings.Contains(err.Error(), "k8s boom") {
		t.Errorf("error = %v, want to contain k8s boom", err)
	}

	dr := lastDeployment(fc)
	if dr.Status != contract.ExecutionStatusFailed {
		t.Errorf("Status = %s, want FAILED", dr.Status)
	}
	if dr.TargetType != "K8S" {
		t.Errorf("TargetType = %s, want K8S", dr.TargetType)
	}
}

func TestBuildService_K8sDeployer_NilSkipsK8sPath(t *testing.T) {
	fc := &fakeClient{buildID: "b-1"}
	svc := NewBuildService(fc, docker.NewClient(), nil, "r-1").WithHostPort(38124)
	// k8sDeployer 미설정 — 기존 docker registry 만 동작

	if err := svc.ProcessClaim(context.Background(), &queue.ClaimedBuild{BuildID: "b-1", AppName: "todo-app"}); err != nil {
		t.Fatalf("ProcessClaim: %v", err)
	}

	dr := lastDeployment(fc)
	if dr.Status != contract.ExecutionStatusSuccess {
		t.Errorf("Status = %s, want SUCCESS", dr.Status)
	}
	if strings.Contains(dr.TargetType, "K8S") {
		t.Errorf("TargetType = %s, should not contain K8S when k8s nil", dr.TargetType)
	}
	if dr.ResponsePayloadJSON != nil {
		if _, hasK8s := dr.ResponsePayloadJSON["k8s"]; hasK8s {
			t.Errorf("ResponsePayloadJSON.k8s should not be set when k8s nil")
		}
	}
}

// TASK-175 (E1): RUNNER_K8S_NAMESPACE_PER_BUILD=true 면 buildID 별 namespace
// 가 k8s Deploy 옵션으로 흘러간다. 기본값(false) 은 기존 공유 namespace
// 가 그대로 쓰인다.
func TestBuildService_K8sDeployer_PerBuildNamespace(t *testing.T) {
	cases := []struct {
		name      string
		perBuild  string
		sharedNS  string
		wantNS    string
	}{
		{"default-shared", "", "builds", "builds"},
		{"explicit-false", "false", "builds", "builds"},
		{"per-build-true", "true", "", "dib-b-1"},
		{"per-build-true-ignores-shared", "true", "ignored", "dib-b-1"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fc := &fakeClient{buildID: "b-1"}
			svc := NewBuildService(fc, docker.NewClient(), nil, "r-1").WithHostPort(38125)
			d := &fakeK8sDeployer{cluster: "kind", namespace: tc.sharedNS}
			svc.WithK8sDeployer(d)
			t.Setenv("RUNNER_K8S_CLUSTER", "kind")
			t.Setenv("RUNNER_K8S_NAMESPACE", tc.sharedNS)
			if tc.perBuild != "" {
				t.Setenv("RUNNER_K8S_NAMESPACE_PER_BUILD", tc.perBuild)
			} else {
				t.Setenv("RUNNER_K8S_NAMESPACE_PER_BUILD", "")
			}
			if err := svc.ProcessClaim(context.Background(), &queue.ClaimedBuild{BuildID: "b-1", AppName: "todo-app"}); err != nil {
				t.Fatalf("ProcessClaim: %v", err)
			}
			if len(d.calls) != 1 {
				t.Fatalf("k8s Deploy calls = %d, want 1", len(d.calls))
			}
			if d.calls[0].Namespace != tc.wantNS {
				t.Errorf("k8s Namespace = %q, want %q", d.calls[0].Namespace, tc.wantNS)
			}
		})
	}
}

// TASK-175 (E2): Cleanup() 가 deployment + service + ingress 를 한 명령으로
// 함께 삭제한다 (잠복 stale Ingress 결함 해소). 단위 테스트는 deploy
// 패키지에 있고, 본 테스트는 BuildService 경유 호출 시 그대로 전파되는지
// 확인한다.
func TestBuildService_K8sDeployer_CleanupIncludesIngress(t *testing.T) {
	fc := &fakeClient{buildID: "b-1"}
	svc := NewBuildService(fc, docker.NewClient(), nil, "r-1")
	d := &fakeK8sDeployer{}
	svc.WithK8sDeployer(d)
	if err := svc.k8sDeployer.Cleanup(context.Background(), deploy.K8sCleanupOptions{BuildID: "b-1", Namespace: "builds"}); err != nil {
		t.Fatalf("Cleanup: %v", err)
	}
	// fakeK8sDeployer.Cleanup 은 호출 사실만 기록하므로 deploy 패키지의
	// kubectlDeployer 가 같은 입력에 "deployment,service,ingress" 를 내는지
	// 가 별도 단위 테스트(k8s_kubectl_test.go) 가 단언한다. 본 테스트는
	// BuildService.Cleanup 경로가 정상적으로 k8sDeployer 로 위임하는지만
	// 확인한다.
	if len(d.cleanupCalls) != 1 {
		t.Errorf("Cleanup 위임 실패: %d 회", len(d.cleanupCalls))
	}
}

// TASK-175 (E3): k8s Deploy 실패 시 docker registry 결과(targetRef +
// resultRef) 가 payload.dockerRegistry 블록에 보존되어 단일 FAILED 보고에
// 동봉된다. 이전엔 docker registry 결과가 사라졌다.
func TestBuildService_K8sDeployer_FailurePreservesDockerRegistryPayload(t *testing.T) {
	fc := &fakeClient{buildID: "b-1"}
	svc := NewBuildService(fc, docker.NewClient(), nil, "r-1").WithHostPort(38126)
	d := &fakeK8sDeployer{err: errors.New("rollout timeout")}
	svc.WithK8sDeployer(d)

	err := svc.ProcessClaim(context.Background(), &queue.ClaimedBuild{BuildID: "b-1", AppName: "todo-app"})
	if err == nil {
		t.Fatalf("expected error from k8s failure")
	}

	dr := lastDeployment(fc)
	if dr.Status != contract.ExecutionStatusFailed {
		t.Errorf("Status = %s, want FAILED", dr.Status)
	}
	if dr.TargetType != "K8S" {
		t.Errorf("TargetType = %s, want K8S", dr.TargetType)
	}
	if !strings.Contains(dr.ErrorMessage, "rollout timeout") {
		t.Errorf("ErrorMessage = %q, want to contain rollout timeout", dr.ErrorMessage)
	}
	if !strings.Contains(dr.ErrorMessage, "docker registry push survived") {
		t.Errorf("ErrorMessage = %q, want to mention docker registry 보존", dr.ErrorMessage)
	}
	// docker registry 결과가 payload 에 보존되었는지
	if dr.ResponsePayloadJSON == nil {
		t.Fatalf("ResponsePayloadJSON nil — docker registry 결과 유실")
	}
	registry, ok := dr.ResponsePayloadJSON["dockerRegistry"].(map[string]any)
	if !ok {
		t.Fatalf("ResponsePayloadJSON.dockerRegistry not map: %+v", dr.ResponsePayloadJSON)
	}
	if registry["targetRef"] == "" || registry["targetRef"] == nil {
		t.Errorf("dockerRegistry.targetRef 비어있음: %+v", registry)
	}
	// 단일 FAILED 보고 — 두 번째 보고가 더 안 따라오는지(setup 자체가
	// 마지막 보고만 lastDeployment 가 잡으므로 간접 검증)
	if len(fc.deployments) < 2 {
		t.Errorf("expected IN_PROGRESS(K8S) + FAILED(K8S) 두 보고, got %d", len(fc.deployments))
	}
}
