package hostclient

import "context"

type BuildControlClient interface {
	ClaimNextBuild(ctx context.Context) (*ClaimedBuildResponse, error)
	MarkBuildClaimed(ctx context.Context, buildID string) error
}

type ClaimedBuildResponse struct {
	BuildID string
}

type NoopBuildControlClient struct {
	baseURL string
}

func NewNoopBuildControlClient(baseURL string) *NoopBuildControlClient {
	return &NoopBuildControlClient{
		baseURL: baseURL,
	}
}

func (c *NoopBuildControlClient) ClaimNextBuild(context.Context) (*ClaimedBuildResponse, error) {
	return nil, nil
}

func (c *NoopBuildControlClient) MarkBuildClaimed(context.Context, string) error {
	return nil
}
