package services

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/docker"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/hostclient"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/queue"
)

type BuildService struct {
	hostClient   hostclient.BuildControlClient
	docker       *docker.Client
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
		runnerID:     runnerID,
		internalPort: port,
	}
}

// ProcessClaim: claim → SOURCE_PREPARED → DOCKER_BUILD_STARTED → docker.BuildImage → DOCKER_BUILD_COMPLETED
// → queueTestDeployment → PROVISIONING → PREVIEW_READY → COMPLETED
// (PKG-005+PKG-006 1차 골격)
func (s *BuildService) ProcessClaim(ctx context.Context, claim *queue.ClaimedBuild) error {
	if claim == nil {
		return nil
	}

	buildID := claim.BuildID
	log.Printf("runner %s processing build %s", s.runnerID, buildID)

	if err := s.reportPhase(ctx, buildID, "SOURCE_PREPARED"); err != nil {
		return err
	}

	if err := s.reportPhase(ctx, buildID, "DOCKER_BUILD_STARTED"); err != nil {
		return err
	}

	if err := s.docker.BuildImage(ctx, buildID); err != nil {
		_ = s.reportPhase(ctx, buildID, "FAILED")
		return err
	}

	if err := s.reportPhase(ctx, buildID, "DOCKER_BUILD_COMPLETED"); err != nil {
		return err
	}

	// PKG-006: queue test deployment with internalPort
	if err := s.hostClient.QueueTestDeployment(ctx, buildID, hostclient.QueueTestDeploymentRequest{
		InternalPort: s.internalPort,
		TtlMinutes:   60,
		RunnerID:     s.runnerID,
	}); err != nil {
		_ = s.reportPhase(ctx, buildID, "FAILED")
		return err
	}

	// report PROVISIONING -> DOCKER_BUILD_COMPLETED phase already set; status=PROVISIONING transitions to PREVIEW_QUEUED
	if err := s.hostClient.QueueTestDeployment(ctx, buildID, hostclient.QueueTestDeploymentRequest{
		InternalPort: s.internalPort,
		TtlMinutes:   60,
		RunnerID:     s.runnerID,
	}); err != nil {
		// already queued; ignore second call's error (idempotent)
		log.Printf("runner %s second queue call (no-op): buildID=%s err=%v", s.runnerID, buildID, err)
	}

	// report PREVIEW_READY (test deployment URL)
	previewURL := fmt.Sprintf("http://preview.local/%s", buildID)
	host := "preview.local"
	hostPort := 38124
	if err := s.hostClient.ReportPreviewReady(ctx, buildID, hostclient.PreviewReadyRequest{
		PreviewURL: previewURL,
		Host:       host,
		HostPort:   hostPort,
		RunnerID:   s.runnerID,
	}); err != nil {
		_ = s.reportPhase(ctx, buildID, "FAILED")
		return err
	}

	if err := s.reportPhase(ctx, buildID, "COMPLETED"); err != nil {
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
