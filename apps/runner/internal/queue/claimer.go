package queue

import (
	"context"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/hostclient"
)

type ClaimedBuild struct {
	BuildID string
	AppName string
	Status  string
	Phase   string
	// TASK-167 (P3-M2): 호스팅 입력. 배포(Ingress) 시 사용.
	ContextPath string
	RuntimePort int
	// TASK-169 (P3-M4): Ingress prefix strip 여부(기본 true).
	StripPrefix bool
	// TASK-172 (v0.5.0): 호스팅 URL 스킴(path|subdomain, 기본 path).
	HostingScheme        string
	EffectiveTier        string
	ServiceSize          string
	HostingPolicyVersion string
	Resources            *hostclient.ResourceProfile
	DockerfileMode       string
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
		BuildID:              response.BuildID,
		AppName:              response.AppName,
		Status:               response.Status,
		Phase:                response.Phase,
		ContextPath:          response.ContextPath,
		RuntimePort:          response.RuntimePort,
		StripPrefix:          response.StripPrefix,
		HostingScheme:        response.HostingScheme,
		EffectiveTier:        response.EffectiveTier,
		ServiceSize:          response.ServiceSize,
		HostingPolicyVersion: response.HostingPolicyVersion,
		Resources:            response.Resources,
		DockerfileMode:       response.DockerfileMode,
	}, nil
}
