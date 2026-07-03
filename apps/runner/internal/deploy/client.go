package deploy

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const (
	defaultTargetType = "DOCKER_REGISTRY"
	defaultTargetRef  = "registry.example.com/docker-image-builder-system"
)

type Client struct {
	workspaceRoot string
	targetType    string
	targetRef     string
}

type Result struct {
	TargetType          string
	TargetRef           string
	ResultRef           string
	ResponsePayloadJSON map[string]any
}

func NewClient() *Client {
	workspaceRoot := os.Getenv("RUNNER_WORKSPACE_ROOT")
	if workspaceRoot == "" {
		workspaceRoot = filepath.Join(os.TempDir(), "docker-image-builder-runner")
	}

	targetType := os.Getenv("RUNNER_DEPLOY_TARGET_TYPE")
	if targetType == "" {
		targetType = defaultTargetType
	}

	targetRef := os.Getenv("RUNNER_DEPLOY_TARGET_REF")
	if targetRef == "" {
		targetRef = defaultTargetRef
	}

	return &Client{
		workspaceRoot: workspaceRoot,
		targetType:    targetType,
		targetRef:     targetRef,
	}
}

func (c *Client) Deploy(_ context.Context, buildID string) (*Result, error) {
	workspaceDir := filepath.Join(c.workspaceRoot, buildID)
	if err := os.MkdirAll(workspaceDir, 0o755); err != nil {
		return nil, fmt.Errorf("deploy: mkdir %s: %w", workspaceDir, err)
	}

	resultRef := fmt.Sprintf("%s:%s", c.targetRef, buildID)
	payload := map[string]any{
		"buildId":      buildID,
		"deployedAt":   time.Now().UTC().Format(time.RFC3339),
		"targetType":   c.targetType,
		"targetRef":    c.targetRef,
		"resultRef":    resultRef,
		"deliveryMode": "POLLING",
	}

	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("deploy: marshal payload: %w", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceDir, "deploy-result.json"), raw, 0o644); err != nil {
		return nil, fmt.Errorf("deploy: write deploy result: %w", err)
	}

	return &Result{
		TargetType: c.targetType,
		TargetRef:  c.targetRef,
		ResultRef:  resultRef,
		ResponsePayloadJSON: map[string]any{
			"deliveryMode": "POLLING",
			"artifact":     resultRef,
		},
	}, nil
}
