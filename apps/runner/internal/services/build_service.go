package services

import (
	"context"
	"log"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/docker"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/hostclient"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/queue"
)

type BuildService struct {
	hostClient hostclient.BuildControlClient
	docker     *docker.Client
	runnerID   string
}

func NewBuildService(hostClient hostclient.BuildControlClient, dockerClient *docker.Client, runnerID string) *BuildService {
	return &BuildService{
		hostClient: hostClient,
		docker:     dockerClient,
		runnerID:   runnerID,
	}
}

// ProcessClaim 은 Host Server 가 응답한 claimed build 에 대해
// SOURCE_PREPARED → DOCKER_BUILD_STARTED → DOCKER_BUILD_COMPLETED → COMPLETED 흐름으로
// phase 를 보고하고 docker image build 를 호출한다.
// 현 단계(PKG-005 1차 골격) 에서는 SOURCE_PREPARED + DOCKER_BUILD_STARTED 까지 report 하고
// docker.BuildImage 는 noop 으로 둔다 (실제 docker 통합은 후속).
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
		// docker build 실패 시 FAILED phase 보고
		_ = s.reportPhase(ctx, buildID, "FAILED")
		return err
	}

	if err := s.reportPhase(ctx, buildID, "DOCKER_BUILD_COMPLETED"); err != nil {
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
