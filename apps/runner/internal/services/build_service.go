package services

import (
	"context"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/docker"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/hostclient"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/queue"
)

type BuildService struct {
	hostClient hostclient.BuildControlClient
	docker     *docker.Client
}

func NewBuildService(hostClient hostclient.BuildControlClient, dockerClient *docker.Client) *BuildService {
	return &BuildService{
		hostClient: hostClient,
		docker:     dockerClient,
	}
}

func (s *BuildService) ProcessClaim(ctx context.Context, claim *queue.ClaimedBuild) error {
	if claim == nil {
		return nil
	}

	if err := s.hostClient.MarkBuildClaimed(ctx, claim.BuildID); err != nil {
		return err
	}

	return s.docker.BuildImage(ctx, claim.BuildID)
}
