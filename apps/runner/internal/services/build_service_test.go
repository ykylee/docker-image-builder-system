package services

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/contract"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/docker"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/hostclient"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/queue"
)

// fakeClient 는 테스트용 hostclient.
type fakeClient struct {
	mu          sync.Mutex
	phases      []string
	buildID     string
	runnerID    string
	reportErr   error
	queued      []hostclient.StartContainerTestRequest
	previewReady []hostclient.ContainerTestResultRequest
	deployments []hostclient.DeploymentReportRequest
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

func (f *fakeClient) ReportPhase(ctx context.Context, buildID, phase, runnerID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.reportErr != nil {
		return f.reportErr
	}
	f.phases = append(f.phases, phase)
	f.buildID = buildID
	f.runnerID = runnerID
	return nil
}

func (f *fakeClient) StartContainerTest(ctx context.Context, buildID string, req hostclient.StartContainerTestRequest) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.queued = append(f.queued, req)
	return nil
}

func (f *fakeClient) ReportContainerTestResult(ctx context.Context, buildID string, req hostclient.ContainerTestResultRequest) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.previewReady = append(f.previewReady, req)
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


func TestProcessClaim_QueuesAndReportsPreviewReady(t *testing.T) {
	fc := &fakeClient{buildID: "b-1"}
	svc := NewBuildService(fc, docker.NewClient(), nil, "r-1")
	claim := &queue.ClaimedBuild{BuildID: "b-1"}
	if err := svc.ProcessClaim(context.Background(), claim); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(fc.queued) != 1 {
		t.Errorf("expected 1 queue call, got %d", len(fc.queued))
	}
	if fc.queued[0].InternalPort != 8080 {
		t.Errorf("expected internalPort 8080, got %d", fc.queued[0].InternalPort)
	}
	if len(fc.previewReady) != 1 {
		t.Errorf("expected 1 preview ready call, got %d", len(fc.previewReady))
	}
	if fc.previewReady[0].HostPort != 38124 {
		t.Errorf("expected hostPort 38124, got %d", fc.previewReady[0].HostPort)
	}
	if fc.previewReady[0].ContainerRef != "container-b-1" {
		t.Errorf("expected containerRef container-b-1, got %s", fc.previewReady[0].ContainerRef)
	}
	if !fc.previewReady[0].HealthCheckPassed || !fc.previewReady[0].PortOpen || !fc.previewReady[0].StabilityWindowPassed {
		t.Errorf("expected preview ready booleans true, got %+v", fc.previewReady[0])
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
// Client (skeleton mode) 를 명시적으로 wire-up 해서 ReportContainerTestResult 에
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

	if len(fc.previewReady) != 1 {
		t.Fatalf("expected 1 preview ready call, got %d", len(fc.previewReady))
	}
	req := fc.previewReady[0]

	// BuildService 가 RunContainer(skeleton) 의 결과를 그대로 전달했는지 확인.
	// skeleton mode 의 default HostPort 는 38124 이고 containerRef 는
	// "container-<buildID>".
	if req.ContainerRef != "container-b-67" {
		t.Errorf("expected containerRef=container-b-67, got %s", req.ContainerRef)
	}
	if req.HostPort != 38124 {
		t.Errorf("expected hostPort=38124, got %d", req.HostPort)
	}
	if req.Host != "preview.local" {
		t.Errorf("expected host=preview.local, got %s", req.Host)
	}
	expectedRuntimeURL := "http://preview.local:38124/"
	if req.RuntimeURL != expectedRuntimeURL {
		t.Errorf("expected previewURL=%s, got %s", expectedRuntimeURL, req.RuntimeURL)
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
