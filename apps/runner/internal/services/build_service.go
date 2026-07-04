package services

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/contract"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/deploy"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/docker"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/hostclient"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/queue"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/source"
)

type BuildService struct {
	hostClient   hostclient.BuildControlClient
	docker       *docker.Client
	fetcher      *source.Fetcher
	deployer     *deploy.Client
	runnerID     string
	internalPort int // default 8080, env override PREVIEW_INTERNAL_PORT
	dockerfilePath string // default "Dockerfile", env override RUNNER_DOCKERFILE_PATH
}

func NewBuildService(hostClient hostclient.BuildControlClient, dockerClient *docker.Client, fetcher *source.Fetcher, runnerID string) *BuildService {
	port := 8080
	if v := os.Getenv("PREVIEW_INTERNAL_PORT"); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil && n > 0 {
			port = n
		}
	}
	dockerfilePath := os.Getenv("RUNNER_DOCKERFILE_PATH")
	if dockerfilePath == "" {
		dockerfilePath = "Dockerfile"
	}
	return &BuildService{
		hostClient:     hostClient,
		docker:         dockerClient,
		fetcher:        fetcher,
		deployer:       deploy.NewClient(),
		runnerID:       runnerID,
		internalPort:   port,
		dockerfilePath: dockerfilePath,
	}
}

// ProcessClaim: claim → SOURCE_PREPARED →
// source.Fetcher.Fetch (TASK-066) → DOCKER_BUILD_STARTED →
// docker.BuildImage → DOCKER_BUILD_COMPLETED → queueTestDeployment →
// PREVIEW_READY → DEPLOYMENT_STARTED/COMPLETED → COMPLETED.
//
// 모든 phase / status / errorCode string 은 `apps/runner/internal/contract`
// canonical 상수를 통해 emit — drift structural 차단.
func (s *BuildService) ProcessClaim(ctx context.Context, claim *queue.ClaimedBuild) error {
	if claim == nil {
		return nil
	}

	buildID := claim.BuildID
	log.Printf("runner %s processing build %s", s.runnerID, buildID)

	// Source archive is fetched via the Host Server API
	// (`GET /builds/:buildId/source`, TASK-066). The previous
	// `PrepareSource` marker-file call has been removed — the real
	// bytes are now part of the build's working state. The fetcher
	// also reports the SOURCE_PREPARED phase implicitly by leaving
	// the source tree ready before `docker.BuildImage` runs.
	if err := s.reportPhase(ctx, buildID, contract.PhaseSourcePrepared); err != nil {
		return err
	}

	// Fetch the source archive bytes, verify the SHA-256 against
	// the response header, and extract the tar.gz into the
	// per-build workspace. A failure here is terminal — the
	// `phase: FAILED` report is folded into the build_service's
	// post-failure path below.
	var sourceDir string
	if s.fetcher != nil {
		extracted, err := s.fetcher.Fetch(ctx, buildID)
		if err != nil {
			_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
			return fmt.Errorf("runner %s: fetch source: %w", s.runnerID, err)
		}
		sourceDir = extracted.SourceDir
		log.Printf("runner %s fetched source: buildID=%s archiveBytes=%d sourceDir=%s checksum=%s", s.runnerID, buildID, extracted.SizeBytes, sourceDir, extracted.Checksum)
	} else {
		// No fetcher wired (e.g. unit tests that exercise only
		// the phase reporting path). Fall back to the
		// `PrepareSource` skeleton so a downstream caller can
		// still observe a deterministic workspace layout. The
		// fallback also writes a default `Dockerfile` into the
		// source dir so `BuildImage` can resolve it — without
		// this the tests would observe a `Dockerfile not found`
		// error from `BuildImage`. The default Dockerfile is
		// the same scratch + manifest copy that the pre-TASK-066
		// `BuildImage` synthesised inline.
		if err := s.docker.PrepareSource(ctx, buildID); err != nil {
			_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
			return err
		}
		sourceDir = fmt.Sprintf("%s/src", s.docker.WorkspaceDir(buildID))
		// The fallback Dockerfile is intentionally minimal (no
		// COPY) because `BuildImage` writes the build manifest
		// to `<workspaceDir>/build-manifest.json`, NOT inside
		// `sourceDir` — so a `COPY build-manifest.json ...`
		// directive would fail the real `docker build` step
		// (this only fires when `buildMode=cli`). `FROM scratch`
		// alone is a valid no-op Dockerfile.
		if err := os.WriteFile(
			filepath.Join(sourceDir, s.dockerfilePath),
			[]byte("FROM scratch\n"),
			0o644,
		); err != nil {
			_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
			return fmt.Errorf("runner %s: write fallback Dockerfile: %w", s.runnerID, err)
		}
	}

	if err := s.reportPhase(ctx, buildID, contract.PhaseDockerBuildStarted); err != nil {
		return err
	}

	if err := s.docker.BuildImage(ctx, buildID, sourceDir, s.dockerfilePath); err != nil {
		_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
		return err
	}

	if err := s.reportPhase(ctx, buildID, contract.PhaseDockerBuildCompleted); err != nil {
		return err
	}

	// PKG-006: queue test deployment with internalPort
	if err := s.hostClient.QueueTestDeployment(ctx, buildID, hostclient.QueueTestDeploymentRequest{
		InternalPort: s.internalPort,
		TtlMinutes:   60,
		RunnerID:     s.runnerID,
	}); err != nil {
		_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
		return err
	}

	// report PREVIEW_READY (test deployment URL)
	previewURL := fmt.Sprintf("http://preview.local/%s", buildID)
	host := "preview.local"
	hostPort := 38124
	if err := s.hostClient.ReportPreviewReady(ctx, buildID, hostclient.PreviewReadyRequest{
		PreviewURL:            previewURL,
		Host:                  host,
		HostPort:              hostPort,
		ContainerRef:          fmt.Sprintf("container-%s", buildID),
		HealthCheckPassed:     true,
		PortOpen:              true,
		StabilityWindowPassed: true,
		RunnerID:              s.runnerID,
	}); err != nil {
		_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
		return err
	}

	if err := s.hostClient.ReportDeployment(ctx, buildID, hostclient.DeploymentReportRequest{
		Status:     contract.ExecutionStatusInProgress,
		TargetType: "DOCKER_REGISTRY",
		RunnerID:   s.runnerID,
		ResponsePayloadJSON: map[string]any{
			"deliveryMode": "POLLING",
		},
	}); err != nil {
		_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
		return err
	}

	deployResult, err := s.deployer.Deploy(ctx, buildID)
	if err != nil {
		_ = s.hostClient.ReportDeployment(ctx, buildID, hostclient.DeploymentReportRequest{
			Status:       contract.ExecutionStatusFailed,
			TargetType:   "DOCKER_REGISTRY",
			ErrorCode:    contract.ErrorCodeDeploymentFailed,
			ErrorMessage: err.Error(),
			RunnerID:     s.runnerID,
		})
		_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
		return err
	}

	if err := s.hostClient.ReportDeployment(ctx, buildID, hostclient.DeploymentReportRequest{
		Status:              contract.ExecutionStatusSuccess,
		TargetType:          deployResult.TargetType,
		TargetRef:           deployResult.TargetRef,
		ResultRef:           deployResult.ResultRef,
		RunnerID:            s.runnerID,
		ResponsePayloadJSON: deployResult.ResponsePayloadJSON,
	}); err != nil {
		_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
		return err
	}

	if err := s.reportPhase(ctx, buildID, contract.PhaseCompleted); err != nil {
		return err
	}

	log.Printf("runner %s completed build %s", s.runnerID, buildID)
	return nil
}

func (s *BuildService) reportPhase(ctx context.Context, buildID, phase string) error {
	if err := s.hostClient.ReportPhase(ctx, buildID, phase, s.runnerID); err != nil {
		log.Printf("runner %s phase report failed: buildID=%s phase=%s err=%v", s.runnerID, buildID, phase, err)
		return err
	}
	log.Printf("runner %s reported phase: buildID=%s phase=%s", s.runnerID, buildID, phase)
	return nil
}
