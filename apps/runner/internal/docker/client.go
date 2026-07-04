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
	BuildID         string `json:"buildId"`
	GeneratedAt     string `json:"generatedAt"`
	BuildMode       string `json:"buildMode"`
	WorkspaceDir    string `json:"workspaceDir"`
	// SourceDir is the user-supplied build context extracted by
	// `internal/source.Fetcher` (TASK-066). The Dockerfile and any
	// other build inputs live under this directory.
	SourceDir       string `json:"sourceDir"`
	Dockerfile      string `json:"dockerfilePath"`
	// DockerfileEntry is the `BuildRequest.dockerfilePath` value
	// (e.g. "Dockerfile" or "docker/Dockerfile.prod"). Captured
	// alongside the absolute `Dockerfile` so a dry-run manifest
	// can show what the user asked for vs. what the Runner
	// resolved.
	DockerfileEntry string `json:"dockerfileEntry"`
	ImageTag        string `json:"imageTag"`
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

// BuildImage runs (or simulates) a docker build using `sourceDir` as
// the build context (TASK-066). The actual user source — and the
// Dockerfile the user authored — live in `sourceDir`; this method
// does not synthesise a scratch Dockerfile. The Dockerfile path
// inside the context is `sourceDir/<dockerfileRelPath>` (the
// `BuildRequest.dockerfilePath` from the Skill, default `Dockerfile`).
//
// In `skeleton` mode (the default) the actual `docker build` is
// skipped and a `build-manifest.json` is written next to the
// workspace so a unit-test or a dry-run can verify the path
// resolution. In `cli` mode a real `docker build` is invoked
// against `sourceDir` as the build context and the image is
// tagged with the build ID. The scratch-Dockerfile path is gone:
// the user's Dockerfile is the source of truth.
func (c *Client) BuildImage(ctx context.Context, buildID, sourceDir, dockerfileRelPath string) error {
	workspaceDir := c.workspaceDir(buildID)
	// TASK-066: ensure the per-build workspace exists. The
	// fetcher usually creates this before BuildImage runs, but
	// tests and ad-hoc callers may invoke BuildImage directly
	// without going through the fetcher. The directory is
	// idempotent (`MkdirAll` returns nil if it already exists).
	if err := os.MkdirAll(workspaceDir, 0o755); err != nil {
		return fmt.Errorf("build image: mkdir workspace %s: %w", workspaceDir, err)
	}
	manifestPath := filepath.Join(workspaceDir, "build-manifest.json")
	imageTag := fmt.Sprintf("docker-image-builder-system/%s:%s", c.buildMode, buildID)

	// Resolve the Dockerfile path inside the user's source tree.
	// An empty `dockerfileRelPath` falls back to the canonical
	// "Dockerfile" name so the call site does not have to guard
	// against the BuildRequest default.
	if dockerfileRelPath == "" {
		dockerfileRelPath = "Dockerfile"
	}
	dockerfilePath := filepath.Join(sourceDir, dockerfileRelPath)

	// Verify the Dockerfile exists before we try to build against
	// it. A missing Dockerfile is a real user error and should be
	// reported, not silently fall back to a scratch one. The error
	// includes both the build context and the relative Dockerfile
	// path so the Runner log can correlate with the build request.
	if _, err := os.Stat(dockerfilePath); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("build image: Dockerfile not found at %s (build context %s)", dockerfilePath, sourceDir)
		}
		return fmt.Errorf("build image: stat Dockerfile: %w", err)
	}

	manifest := buildManifest{
		BuildID:         buildID,
		GeneratedAt:     time.Now().UTC().Format(time.RFC3339),
		BuildMode:       c.buildMode,
		WorkspaceDir:    workspaceDir,
		SourceDir:       sourceDir,
		Dockerfile:      dockerfilePath,
		DockerfileEntry: dockerfileRelPath,
		ImageTag:        imageTag,
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
		sourceDir,
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("build image: docker build failed: %w", err)
	}

	return nil
}

func (c *Client) WorkspaceDir(buildID string) string {
	return filepath.Join(c.workspaceRoot, buildID)
}

// workspaceDir is the package-private alias used by other methods
// of `*Client` so the public WorkspaceDir above remains the only
// cross-package surface. Keeping both is intentional — it lets the
// internal call sites stay unqualified and gives external callers
// (e.g. `internal/services.BuildService`) a single documented
// public method.
func (c *Client) workspaceDir(buildID string) string {
	return filepath.Join(c.workspaceRoot, buildID)
}
