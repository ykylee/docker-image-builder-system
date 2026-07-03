package deploy

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestDeploy_WritesDeploymentArtifact(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DEPLOY_TARGET_TYPE", "DOCKER_REGISTRY")
	t.Setenv("RUNNER_DEPLOY_TARGET_REF", "registry.example.com/test-app")

	client := NewClient()
	result, err := client.Deploy(context.Background(), "build-1")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result.TargetType != "DOCKER_REGISTRY" {
		t.Fatalf("expected target type DOCKER_REGISTRY, got %s", result.TargetType)
	}
	if result.ResultRef != "registry.example.com/test-app:build-1" {
		t.Fatalf("unexpected resultRef: %s", result.ResultRef)
	}

	deployResultPath := filepath.Join(tmp, "build-1", "deploy-result.json")
	if _, err := os.Stat(deployResultPath); err != nil {
		t.Fatalf("expected deploy-result.json to exist: %v", err)
	}
}
