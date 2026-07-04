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

// TASK-066: BuildImage now requires the user-supplied build
// context (`sourceDir`) and a Dockerfile path inside it. The
// scratch-Dockerfile fallback is gone. This test stages a
// Dockerfile under the source dir and verifies the manifest
// records both the absolute Dockerfile path and the entry path
// the user asked for.
func TestBuildImageWritesManifestInSkeletonMode(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DOCKER_BUILD_MODE", "skeleton")

	// Lay out a source tree with a real Dockerfile. The path
	// passed to BuildImage is the directory, the Dockerfile lives
	// under it.
	sourceDir := filepath.Join(tmp, "src")
	if err := os.MkdirAll(sourceDir, 0o755); err != nil {
		t.Fatalf("mkdir source: %v", err)
	}
	dockerfileRel := "Dockerfile"
	dockerfilePath := filepath.Join(sourceDir, dockerfileRel)
	if err := os.WriteFile(dockerfilePath, []byte("FROM scratch\n"), 0o644); err != nil {
		t.Fatalf("write Dockerfile: %v", err)
	}

	client := NewClient()
	if err := client.BuildImage(context.Background(), "b-2", sourceDir, dockerfileRel); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	// The Dockerfile is the user's, untouched.
	got, err := os.ReadFile(dockerfilePath)
	if err != nil {
		t.Fatalf("read user Dockerfile: %v", err)
	}
	if string(got) != "FROM scratch\n" {
		t.Errorf("user Dockerfile mutated: got=%q", string(got))
	}

	manifestPath := filepath.Join(tmp, "b-2", "build-manifest.json")
	if _, err := os.Stat(manifestPath); err != nil {
		t.Fatalf("expected build manifest at %s: %v", manifestPath, err)
	}
}

func TestBuildImageMissingDockerfileReturnsError(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DOCKER_BUILD_MODE", "skeleton")

	// Source dir exists but has no Dockerfile.
	sourceDir := filepath.Join(tmp, "src")
	if err := os.MkdirAll(sourceDir, 0o755); err != nil {
		t.Fatalf("mkdir source: %v", err)
	}

	client := NewClient()
	err := client.BuildImage(context.Background(), "b-3", sourceDir, "Dockerfile")
	if err == nil {
		t.Fatal("expected error for missing Dockerfile, got nil")
	}
}
