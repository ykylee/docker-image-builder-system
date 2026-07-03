package queue

import (
	"context"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/hostclient"
)

type ClaimedBuild struct {
	BuildID string
}

type Claimer interface {
	ClaimNext(ctx context.Context) (*ClaimedBuild, error)
}

type HostServerClaimer struct {
	client hostclient.BuildControlClient
}

func NewHostServerClaimer(client hostclient.BuildControlClient) *HostServerClaimer {
	return &HostServerClaimer{
		client: client,
	}
}

func (c *HostServerClaimer) ClaimNext(ctx context.Context) (*ClaimedBuild, error) {
	response, err := c.client.ClaimNextBuild(ctx)
	if err != nil {
		return nil, err
	}

	if response == nil {
		return nil, nil
	}

	return &ClaimedBuild{
		BuildID: response.BuildID,
	}, nil
}
