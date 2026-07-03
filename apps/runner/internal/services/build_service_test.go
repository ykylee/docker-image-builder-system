package services

import (
	"context"
	"errors"
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
	queued      []hostclient.QueueTestDeploymentRequest
	previewReady []hostclient.PreviewReadyRequest
	deployments []hostclient.DeploymentReportRequest
}

func (f *fakeClient) ClaimNextBuild(ctx context.Context) (*hostclient.ClaimedBuildResponse, error) {
	return &hostclient.ClaimedBuildResponse{
		BuildID:         f.buildID,
		AppName:         "todo-app",
		Phase:           contract.PhaseQueueClaimed,
		Status:          contract.StatusLegacyClaimed,
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

func (f *fakeClient) QueueTestDeployment(ctx context.Context, buildID string, req hostclient.QueueTestDeploymentRequest) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.queued = append(f.queued, req)
	return nil
}

func (f *fakeClient) ReportPreviewReady(ctx context.Context, buildID string, req hostclient.PreviewReadyRequest) error {
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

func TestProcessClaim_NilClaim_NoPhaseReports(t *testing.T) {
	fc := &fakeClient{}
	svc := NewBuildService(fc, docker.NewClient(), "r-1")
	if err := svc.ProcessClaim(context.Background(), nil); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(fc.phases) != 0 {
		t.Errorf("expected no phase reports, got %v", fc.phases)
	}
}

func TestProcessClaim_ReportsFullHappyPath(t *testing.T) {
	fc := &fakeClient{buildID: "b-1"}
	svc := NewBuildService(fc, docker.NewClient(), "r-1")
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
	svc := NewBuildService(fc, docker.NewClient(), "r-1")
	claim := &queue.ClaimedBuild{BuildID: "b-1"}
	if err := svc.ProcessClaim(context.Background(), claim); err == nil {
		t.Fatal("expected error, got nil")
	}
}


func TestProcessClaim_QueuesAndReportsPreviewReady(t *testing.T) {
	fc := &fakeClient{buildID: "b-1"}
	svc := NewBuildService(fc, docker.NewClient(), "r-1")
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
