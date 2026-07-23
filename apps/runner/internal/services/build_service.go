package services

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/contract"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/deploy"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/docker"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/hostclient"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/queue"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/source"
)

type BuildService struct {
	hostClient     hostclient.BuildControlClient
	docker         *docker.Client
	fetcher        *source.Fetcher
	deployer       *deploy.Client
	runnerID       string
	internalPort   int // default 8080, env override PREVIEW_INTERNAL_PORT
	dockerfilePath string // default "Dockerfile", env override RUNNER_DOCKERFILE_PATH
	// hostPort 는 ReportContainerTestResult 가 노출할 container 의 host port.
	// 0 이면 RunContainer 가 cli mode 에서 OS 가 알려주는 ephemeral
	// port 를 잡는다 (default). test 는 BuildService.WithHostPort 로
	// fake health server 의 port 를 명시적으로 주입해 probe 결과를
	// 결정적으로 만든다.
	hostPortOverride int
	// healthcheckPath 와 healthcheckTimeout 은 BuildRequest 의 그것을
	// 그대로 받아쓰지 않고 env override (RUNNER_HEALTHCHECK_PATH /
	// RUNNER_HEALTHCHECK_TIMEOUT_SECONDS) 도 받는다. 1차 PR 은
	// BuildRequest 에 두 필드를 노출하지 않고 env 만 사용 — 후속 PR 에서
	// BuildRequest 의 optional 필드로 정식 승격.
	healthcheckPath    string
	healthcheckTimeout time.Duration
	// stopContainerOnDone 가 true 면 ReportContainerTestResult 가 끝난 뒤
	// container 를 stop + remove 한다. 1차 PR 은 false 가 기본 —
	// preview URL 이 test deployment 동안 살아있어야 하므로. e2e
	// script 가 RUNNER_STOP_CONTAINER_ON_DONE=true 로 켜고 검증.
	stopContainerOnDone bool
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
	healthcheckPath := os.Getenv("RUNNER_HEALTHCHECK_PATH")
	if healthcheckPath == "" {
		healthcheckPath = "/"
	}
	healthcheckTimeout := 30 * time.Second
	if v := os.Getenv("RUNNER_HEALTHCHECK_TIMEOUT_SECONDS"); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil && n > 0 {
			healthcheckTimeout = time.Duration(n) * time.Second
		}
	}
	stopOnDone := os.Getenv("RUNNER_STOP_CONTAINER_ON_DONE") == "true"

	return &BuildService{
		hostClient:          hostClient,
		docker:              dockerClient,
		fetcher:             fetcher,
		deployer:            deploy.NewClient(),
		runnerID:            runnerID,
		internalPort:        port,
		dockerfilePath:      dockerfilePath,
		healthcheckPath:     healthcheckPath,
		healthcheckTimeout:  healthcheckTimeout,
		stopContainerOnDone: stopOnDone,
	}
}

// ProcessClaim: claim → SOURCE_PREPARED →
// source.Fetcher.Fetch (TASK-066) → DOCKER_BUILD_STARTED →
// docker.BuildImage → DOCKER_BUILD_COMPLETED → queueTestDeployment →
// CONTAINER_TEST_PASSED → DEPLOYMENT_STARTED/COMPLETED → COMPLETED.
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
	if err := s.hostClient.StartContainerTest(ctx, buildID, hostclient.StartContainerTestRequest{
		InternalPort: s.internalPort,
		TtlMinutes:   60,
		RunnerID:     s.runnerID,
	}); err != nil {
		_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
		return err
	}

	// TASK-067: real container run + healthcheck. StartContainerTest 가
	// 받아들여진 직후 BuildImage 가 만든 image 로 docker container 를 띄우고
	// HTTP healthcheck / TCP port open 이 안정될 때까지 polling 한다.
	// 성공 시 ContainerStatus 의 runtimeUrl / host / hostPort / containerRef
	// 를 그대로 ReportContainerTestResult 에 전달한다 — mock 값 (preview.local,
	// 38124, container-<id>) 대신 진짜 binding 정보를 노출한다.
	//
	// hostPort=0 으로 두면 RunContainer 가 cli mode 일 때 OS 가 알려주는
	// ephemeral port 를 잡아 그걸 사용하고, skeleton mode 일 때는 기존
	// 38124 fallback 을 그대로 사용한다. BuildService 는 그 결정에
	// 개입하지 않아 두 mode 사이의 일관성을 유지한다.
	containerName := fmt.Sprintf("container-%s", buildID)
	runOpts := docker.ContainerRunOptions{
		ImageTag:           s.docker.ImageTagFor(buildID),
		ContainerName:      containerName,
		HostPort:           s.hostPortOverride,
		InternalPort:       s.internalPort,
		HealthcheckPath:    s.healthcheckPath,
		HealthcheckTimeout: s.healthcheckTimeout,
		StabilityWindow:    5 * time.Second,
	}

	containerStatus, err := s.docker.RunContainer(ctx, runOpts)
	if err != nil {
		_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
		return fmt.Errorf("runner %s: run container: %w", s.runnerID, err)
	}

	if _, err := s.docker.WaitForHealth(ctx, containerStatus, s.healthcheckTimeout); err != nil {
		// healthcheck 실패는 terminal — container stop 후 FAILED 보고.
		_ = s.docker.StopContainer(context.Background(), containerStatus.ContainerRef)
		_ = s.reportPhase(ctx, buildID, contract.PhaseFailed)
		return fmt.Errorf("runner %s: container healthcheck: %w", s.runnerID, err)
	}

	// 1차 PR scope: container 가 CONTAINER_TEST_PASSED 동안 살아있어야 하므로
	// 자동 stop 안 함. e2e script 가 RUNNER_STOP_CONTAINER_ON_DONE=true 로
	// 켜고 cleanup 검증.
	if s.stopContainerOnDone {
		defer func() {
			if err := s.docker.StopContainer(context.Background(), containerStatus.ContainerRef); err != nil {
				log.Printf("runner %s stop container failed: %v", s.runnerID, err)
			}
		}()
	}

	if err := s.hostClient.ReportContainerTestResult(ctx, buildID, hostclient.ContainerTestResultRequest{
		RuntimeURL:            containerStatus.RuntimeURL,
		Host:                  containerStatus.Host,
		HostPort:              containerStatus.HostPort,
		ContainerRef:          containerStatus.ContainerRef,
		HealthCheckPassed:     containerStatus.HealthCheckPassed,
		PortOpen:              containerStatus.PortOpen,
		StabilityWindowPassed: containerStatus.StabilityWindowPassed,
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

	// TASK-068: cli mode 의 deploy adapter 는 local SourceImage
	// (`docker-image-builder-system/<buildMode>:<buildID>`) 를
	// registry 에 push 한다. skeleton mode 는 SourceImage 가 local
	// docker daemon 에 없을 수 있어 opts.SourceImage 를 비워두고
	// 그대로 skeleton 동작을 탄다 (기존과 동일 — workspace 에
	// deploy-result.json 만 emit).
	deployResult, err := s.deployer.Deploy(ctx, buildID, deploy.DeployOptions{
		SourceImage: containerStatus.ImageTag,
	})
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

// WithHostPort 는 BuildService 가 RunContainer 에 넘길 host port 를
// 명시적으로 강제한다. port 0 이면 RunContainer 가 cli mode 일 때
// 자체 결정 (ephemeral port) 으로 돌아간다. test 가 fake health
// server 의 port 와 probe / report 를 동기화할 때 사용.
func (s *BuildService) WithHostPort(port int) *BuildService {
	s.hostPortOverride = port
	return s
}
