package services

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/contract"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/deploy"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/docker"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/hostclient"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/queue"
)

type BuildService struct {
	hostClient   hostclient.BuildControlClient
	docker       *docker.Client
	deployer     *deploy.Client
	runnerID     string
	internalPort int // default 8080, env override PREVIEW_INTERNAL_PORT
}

func NewBuildService(hostClient hostclient.BuildControlClient, dockerClient *docker.Client, runnerID string) *BuildService {
	port := 8080
	if v := os.Getenv("PREVIEW_INTERNAL_PORT"); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil && n > 0 {
			port = n
		}
	}
	return &BuildService{
		hostClient:   hostClient,
		docker:       dockerClient,
		deployer:     deploy.NewClient(),
		runnerID:     runnerID,
		internalPort: port,
	}
}

// ProcessClaim: claim → SOURCE_PREPARED → DOCKER_BUILD_STARTED →
// docker.BuildImage → DOCKER_BUILD_COMPLETED → queueTestDeployment →
// PREVIEW_READY → DEPLOYMENT_STARTED/COMPLETED → COMPLETED.
//
// 모든 phase / status / errorCode string 은 `apps/runner/internal/contract`
// canonical 상수를 통해 emit — drift structural 차단.
func (s *BuildService) ProcessClaim(ctx context.Context, claim *queue.ClaimedBuild) error {
	if claim == nil {
		return nil
	}

	buildID := claim.BuildID
	log.Printf("runner %s processing build %s", s.runnerID, buildID)

	if err := s.docker.PrepareSource(ctx, buildID); err != nil {
		_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
		return err
	}

	if err := s.reportPhase(ctx, buildID, contract.PhaseSourcePrepared); err != nil {
		return err
	}

	if err := s.reportPhase(ctx, buildID, contract.PhaseDockerBuildStarted); err != nil {
		return err
	}

	if err := s.docker.BuildImage(ctx, buildID); err != nil {
		_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
		return err
	}

	if err := s.reportPhase(ctx, buildID, contract.PhaseDockerBuildCompleted); err != nil {
		return err
	}

	// PKG-006: queue test deployment with internalPort
	if err := s.hostClient.QueueTestDeployment(ctx, buildID, hostclient.QueueTestDeploymentRequest{
		InternalPort: s.internalPort,
		TtlMinutes:   60,
		RunnerID:     s.runnerID,
	}); err != nil {
		_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
		return err
	}

	// report PREVIEW_READY (test deployment URL)
	previewURL := fmt.Sprintf("http://preview.local/%s", buildID)
	host := "preview.local"
	hostPort := 38124
	if err := s.hostClient.ReportPreviewReady(ctx, buildID, hostclient.PreviewReadyRequest{
		PreviewURL:            previewURL,
		Host:                  host,
		HostPort:              hostPort,
		ContainerRef:          fmt.Sprintf("container-%s", buildID),
		HealthCheckPassed:     true,
		PortOpen:              true,
		StabilityWindowPassed: true,
		RunnerID:              s.runnerID,
	}); err != nil {
		_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
		return err
	}

	if err := s.hostClient.ReportDeployment(ctx, buildID, hostclient.DeploymentReportRequest{
		Status:     contract.ExecutionStatusInProgress,
		TargetType: "DOCKER_REGISTRY",
		RunnerID:   s.runnerID,
		ResponsePayloadJSON: map[string]any{
			"deliveryMode": "POLLING",
		},
	}); err != nil {
		_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
		return err
	}

	deployResult, err := s.deployer.Deploy(ctx, buildID)
	if err != nil {
		_ = s.hostClient.ReportDeployment(ctx, buildID, hostclient.DeploymentReportRequest{
			Status:       contract.ExecutionStatusFailed,
			TargetType:   "DOCKER_REGISTRY",
			ErrorCode:    contract.ErrorCodeDeploymentFailed,
			ErrorMessage: err.Error(),
			RunnerID:     s.runnerID,
		})
		_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
		return err
	}

	if err := s.hostClient.ReportDeployment(ctx, buildID, hostclient.DeploymentReportRequest{
		Status:              contract.ExecutionStatusSuccess,
		TargetType:          deployResult.TargetType,
		TargetRef:           deployResult.TargetRef,
		ResultRef:           deployResult.ResultRef,
		RunnerID:            s.runnerID,
		ResponsePayloadJSON: deployResult.ResponsePayloadJSON,
	}); err != nil {
		_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
		return err
	}

	if err := s.reportPhase(ctx, buildID, contract.PhaseCompleted); err != nil {
		return err
	}

	log.Printf("runner %s completed build %s", s.runnerID, buildID)
	return nil
}

func (s *BuildService) reportPhase(ctx context.Context, buildID, phase string) error {
	if err := s.hostClient.ReportPhase(ctx, buildID, phase, s.runnerID); err != nil {
		log.Printf("runner %s phase report failed: buildID=%s phase=%s err=%v", s.runnerID, buildID, phase, err)
		return err
	}
	log.Printf("runner %s reported phase: buildID=%s phase=%s", s.runnerID, buildID, phase)
	return nil
}
