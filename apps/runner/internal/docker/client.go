package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

const (
	defaultBuildMode = "skeleton"
)

type Client struct {
	workspaceRoot string
	buildMode     string
	dockerBin     string
}

type buildManifest struct {
	BuildID      string `json:"buildId"`
	GeneratedAt  string `json:"generatedAt"`
	BuildMode    string `json:"buildMode"`
	WorkspaceDir string `json:"workspaceDir"`
	Dockerfile   string `json:"dockerfilePath"`
	ImageTag     string `json:"imageTag"`
}

func NewClient() *Client {
	workspaceRoot := os.Getenv("RUNNER_WORKSPACE_ROOT")
	if workspaceRoot == "" {
		workspaceRoot = filepath.Join(os.TempDir(), "docker-image-builder-runner")
	}

	buildMode := os.Getenv("RUNNER_DOCKER_BUILD_MODE")
	if buildMode == "" {
		buildMode = defaultBuildMode
	}

	dockerBin := os.Getenv("RUNNER_DOCKER_BIN")
	if dockerBin == "" {
		dockerBin = "docker"
	}

	return &Client{
		workspaceRoot: workspaceRoot,
		buildMode:     buildMode,
		dockerBin:     dockerBin,
	}
}

func (c *Client) PrepareSource(_ context.Context, buildID string) error {
	workspaceDir := c.workspaceDir(buildID)
	sourceDir := filepath.Join(workspaceDir, "src")
	if err := os.MkdirAll(sourceDir, 0o755); err != nil {
		return fmt.Errorf("prepare source: mkdir %s: %w", sourceDir, err)
	}

	sourceNote := []byte(fmt.Sprintf("buildId=%s\npreparedAt=%s\n", buildID, time.Now().UTC().Format(time.RFC3339)))
	if err := os.WriteFile(filepath.Join(sourceDir, "source-prepared.txt"), sourceNote, 0o644); err != nil {
		return fmt.Errorf("prepare source: write source marker: %w", err)
	}

	return nil
}

// sourceMarkerPath returns the path of the source-prepared marker file. When
// the marker is present the workspace has already been prepared by an earlier
// call (typically BuildService.ProcessClaim), so BuildImage can skip the
// redundant directory/marker setup.
func (c *Client) sourceMarkerPath(buildID string) string {
	return filepath.Join(c.workspaceDir(buildID), "src", "source-prepared.txt")
}

func (c *Client) BuildImage(ctx context.Context, buildID string) error {
	// Idempotent guard: BuildService.ProcessClaim already calls PrepareSource
	// before BuildImage, so the marker file is present in the happy path.
	// Only re-run the prepare step when a caller invokes BuildImage directly
	// (e.g. unit tests, ad-hoc runners).
	if _, err := os.Stat(c.sourceMarkerPath(buildID)); err != nil {
		if !os.IsNotExist(err) {
			return fmt.Errorf("build image: stat source marker: %w", err)
		}
		if err := c.PrepareSource(ctx, buildID); err != nil {
			return err
		}
	}

	workspaceDir := c.workspaceDir(buildID)
	dockerfilePath := filepath.Join(workspaceDir, "Dockerfile")
	manifestPath := filepath.Join(workspaceDir, "build-manifest.json")
	imageTag := fmt.Sprintf("docker-image-builder-system/%s:%s", c.buildMode, buildID)

	dockerfile := []byte("FROM scratch\nCOPY build-manifest.json /build-manifest.json\n")
	if err := os.WriteFile(dockerfilePath, dockerfile, 0o644); err != nil {
		return fmt.Errorf("build image: write Dockerfile: %w", err)
	}

	manifest := buildManifest{
		BuildID:      buildID,
		GeneratedAt:  time.Now().UTC().Format(time.RFC3339),
		BuildMode:    c.buildMode,
		WorkspaceDir: workspaceDir,
		Dockerfile:   dockerfilePath,
		ImageTag:     imageTag,
	}
	payload, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("build image: marshal manifest: %w", err)
	}
	if err := os.WriteFile(manifestPath, payload, 0o644); err != nil {
		return fmt.Errorf("build image: write manifest: %w", err)
	}

	if c.buildMode != "cli" {
		return nil
	}

	cmd := exec.CommandContext(
		ctx,
		c.dockerBin,
		"build",
		"-f",
		dockerfilePath,
		"-t",
		imageTag,
		workspaceDir,
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("build image: docker build failed: %w", err)
	}

	return nil
}

func (c *Client) workspaceDir(buildID string) string {
	return filepath.Join(c.workspaceRoot, buildID)
}
