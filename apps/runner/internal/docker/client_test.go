package docker

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestPrepareSourceCreatesWorkspaceSkeleton(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DOCKER_BUILD_MODE", "skeleton")

	client := NewClient()
	if err := client.PrepareSource(context.Background(), "b-1"); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	sourceMarker := filepath.Join(tmp, "b-1", "src", "source-prepared.txt")
	if _, err := os.Stat(sourceMarker); err != nil {
		t.Fatalf("expected source marker at %s: %v", sourceMarker, err)
	}
}

func TestBuildImageWritesDockerfileAndManifestInSkeletonMode(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DOCKER_BUILD_MODE", "skeleton")

	client := NewClient()
	if err := client.BuildImage(context.Background(), "b-2"); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	dockerfilePath := filepath.Join(tmp, "b-2", "Dockerfile")
	manifestPath := filepath.Join(tmp, "b-2", "build-manifest.json")

	if _, err := os.Stat(dockerfilePath); err != nil {
		t.Fatalf("expected Dockerfile at %s: %v", dockerfilePath, err)
	}
	if _, err := os.Stat(manifestPath); err != nil {
		t.Fatalf("expected build manifest at %s: %v", manifestPath, err)
	}
}
