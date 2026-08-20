package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/artifact"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/contract"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/deploy"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/docker"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/dockerfile"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/hostclient"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/queue"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/source"
)

type BuildService struct {
	hostClient hostclient.BuildControlClient
	docker     *docker.Client
	fetcher    *source.Fetcher
	deployer   *deploy.Client
	// k8sDeployer 는 TASK-162 (P2-M3 후속) 의 k8s adapter 1호. nil 이면
	// (기본값) 기존 docker registry 배포만 동작하고 k8s 분기는 skip 된다.
	// 프로덕션 배선은 아직 없고 (worker/main 미주입), 테스트가
	// WithK8sDeployer 로 주입해 검증한다 — skeleton 단계.
	k8sDeployer    deploy.K8sDeployer
	runnerID       string
	internalPort   int    // default 8080, env override RUNNER_INTERNAL_PORT
	dockerfilePath string // default "Dockerfile", env override RUNNER_DOCKERFILE_PATH
	// hostPort 는 컨테이너 테스트 결과가 노출할 container 의 host port.
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
	// stopContainerOnDone 가 true 면 컨테이너 테스트 결과 보고가 끝난 뒤
	// container 를 stop + remove 한다. 1차 PR 은 false 가 기본 —
	// 런타임 URL 이 컨테이너 테스트 동안 살아있어야 하므로. e2e
	// script 가 RUNNER_STOP_CONTAINER_ON_DONE=true 로 켜고 검증.
	stopContainerOnDone bool
	artifactClient      artifactClient
}

// artifactClient is intentionally small so the build service can be tested
// without a live factory. The concrete HTTP client is wired by worker.New.
type artifactClient interface {
	Get(context.Context, artifact.Ecosystem, string) (artifact.Manifest, error)
	Prefetch(context.Context, artifact.PrefetchRequest) (artifact.Manifest, error)
}

func parsePositiveEnv(key string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(os.Getenv(key)))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

// serviceDatabaseSecretName mirrors the Build Server provisioning helper.
// The Secret reference is optional in every hosted Deployment, so services
// without database opt-in continue to run while opted-in services receive
// DATABASE_URL from the platform-created Secret.
func serviceDatabaseSecretName(appName string) string {
	normalized := strings.TrimSpace(appName)
	slug := strings.ToLower(normalized)
	slug = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		slug = "service"
	}
	if len(slug) > 30 {
		slug = slug[:30]
	}
	digest := sha256.Sum256([]byte(normalized))
	return fmt.Sprintf("dib-service-%s-%s-db", slug, hex.EncodeToString(digest[:])[:12])
}

func databaseSecretName(appName string, policy *hostclient.DatabasePolicy) string {
	if policy == nil || !policy.Enabled {
		return ""
	}
	return serviceDatabaseSecretName(appName)
}

func databaseMigrationCommand(policy *hostclient.DatabasePolicy) string {
	if policy == nil || !policy.Enabled {
		return ""
	}
	return strings.TrimSpace(policy.MigrationCommand)
}

func NewBuildService(hostClient hostclient.BuildControlClient, dockerClient *docker.Client, fetcher *source.Fetcher, runnerID string) *BuildService {
	port := 8080
	// TASK-162 (P2-M3): preview-era env 이름 PREVIEW_INTERNAL_PORT 를
	// RUNNER_INTERNAL_PORT 로 개명. 나머지 runner env 가 전부 RUNNER_ 접두사를
	// 쓰는데 이것만 예외였다.
	if v := os.Getenv("RUNNER_INTERNAL_PORT"); v != "" {
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

// WithArtifactClient enables claim-scoped artifact preflight. It is separate
// from the constructor to keep existing tests and local skeleton mode simple.
func (s *BuildService) WithArtifactClient(client artifactClient) *BuildService {
	s.artifactClient = client
	return s
}

// ProcessClaim 은 claim 된 build 하나를 canonical 실행 순서대로 처리한다:
//
//	claim → source prepare → docker build → container test → deploy → finalize
//
// TASK-162 (P2-M3): 그 순서를 **코드 구조로** 표현한다. 이전에는 200줄 단일
// 함수에 여섯 단계가 섞여 있었고, 실패 처리도 단계마다 손으로 복사된
// `reportPhase(FAILED)` 한 줄이라 **어느 단계에서 왜 실패했는지가 호스트에
// 전혀 전달되지 않았다**(모든 실패 빌드의 `lastError` 가 null 이었다).
//
// 이제 각 단계는 실패 시 canonical errorCode 를 실은 `*stageFailure` 를
// 돌려주고, `fail` 이 그것을 호스트에 보고한다. 컨테이너 테스트 단계의
// 실패는 phase FAILED 뿐 아니라 **`test` 블록도 FAILED 로 닫는다** — 이전엔
// 닫지 않아 실패한 빌드의 컨테이너 테스트가 영원히 IN_PROGRESS 로 남았다.
//
// 모든 phase / status / errorCode string 은 `apps/runner/internal/contract`
// canonical 상수를 통해 emit — drift structural 차단.
func (s *BuildService) ProcessClaim(ctx context.Context, claim *queue.ClaimedBuild) error {
	if claim == nil {
		return nil
	}

	buildID := claim.BuildID
	log.Printf("runner %s processing build %s", s.runnerID, buildID)

	sourceDir, failure := s.prepareSource(ctx, buildID, claim.DockerfileMode)
	if failure != nil {
		return s.fail(ctx, buildID, failure)
	}

	if failure := s.prepareArtifact(ctx, claim.ArtifactProfile); failure != nil {
		return s.fail(ctx, buildID, failure)
	}

	if failure := s.buildImage(ctx, buildID, sourceDir, claim.ArtifactProfile); failure != nil {
		return s.fail(ctx, buildID, failure)
	}

	internalPort := s.internalPort
	if claim.RuntimePort > 0 {
		internalPort = claim.RuntimePort
	}
	containerStatus, failure := s.runContainerTest(ctx, buildID, internalPort)
	if failure != nil {
		return s.fail(ctx, buildID, failure)
	}

	if failure := s.deployImage(ctx, buildID, containerStatus, claim.AppName, claim.ContextPath, claim.RuntimePort, claim.StripPrefix, claim.HostingScheme, claim.EffectiveTier, claim.Resources, claim.Database); failure != nil {
		return s.fail(ctx, buildID, failure)
	}

	if err := s.reportPhase(ctx, buildID, contract.PhaseCompleted); err != nil {
		return err
	}

	log.Printf("runner %s completed build %s", s.runnerID, buildID)
	return nil
}

// prepareArtifact validates the claimed coordinate against the factory before
// Docker starts. The coordinate and optional prefetch digests come from the
// Runner environment until lockfile extraction becomes ecosystem-specific.
// An absent coordinate keeps legacy builds unchanged; a configured profile is
// still carried through the claim contract and can be enabled incrementally.
func (s *BuildService) prepareArtifact(ctx context.Context, profile *hostclient.ArtifactFactoryProfile) *stageFailure {
	if profile == nil || s.artifactClient == nil {
		return nil
	}
	coordinate := strings.TrimSpace(os.Getenv("RUNNER_ARTIFACT_COORDINATE"))
	if coordinate == "" {
		if profile.Mode == "required" {
			return &stageFailure{
				errorCode: contract.ErrorCodeUnknownError,
				err:       fmt.Errorf("artifact profile requires RUNNER_ARTIFACT_COORDINATE"),
			}
		}
		log.Printf("runner %s artifact profile present but RUNNER_ARTIFACT_COORDINATE is empty; skipping lookup", s.runnerID)
		return nil
	}
	ecosystem := artifact.Ecosystem(profile.Ecosystem)
	if _, err := s.artifactClient.Get(ctx, ecosystem, coordinate); err == nil {
		return nil
	} else if !profile.PrefetchEnabled || !errors.Is(err, artifact.ErrUnavailable) && !errors.Is(err, artifact.ErrUpstreamBlocked) {
		return &stageFailure{errorCode: contract.ErrorCodeUnknownError, err: fmt.Errorf("artifact lookup: %w", err)}
	} else {
		manifest, prefetchErr := s.artifactClient.Prefetch(ctx, artifact.PrefetchRequest{
			Ecosystem:      ecosystem,
			Coordinate:     coordinate,
			LockfileDigest: strings.TrimSpace(os.Getenv("RUNNER_ARTIFACT_LOCKFILE_DIGEST")),
			RecipeDigest:   strings.TrimSpace(os.Getenv("RUNNER_ARTIFACT_RECIPE_DIGEST")),
		})
		if prefetchErr != nil {
			return &stageFailure{errorCode: contract.ErrorCodeUnknownError, err: fmt.Errorf("artifact prefetch: %w", prefetchErr)}
		}
		log.Printf("runner %s prefetched artifact: coordinate=%s artifactID=%s", s.runnerID, coordinate, manifest.ArtifactID)
	}
	return nil
}

// stageFailure 는 한 단계의 실패를 canonical errorCode 와 함께 나른다.
// containerTest 가 true 면 `fail` 이 phase 보고에 더해 컨테이너 테스트
// 결과도 FAILED 로 닫는다.
type stageFailure struct {
	errorCode     string
	err           error
	containerTest bool
	// containerRef 가 비어있지 않으면 `fail` 이 정리(stop)까지 책임진다.
	containerRef string
}

func (f *stageFailure) Error() string { return f.err.Error() }

// fail 은 실패를 호스트에 **이유와 함께** 보고하고 그 error 를 반환한다.
// 보고 자체가 실패해도 원래 실패 원인을 덮지 않는다 — 원인 유실이 훨씬
// 나쁘기 때문에 보고 오류는 로그로만 남긴다.
func (s *BuildService) fail(ctx context.Context, buildID string, f *stageFailure) error {
	if f.containerRef != "" {
		_ = s.docker.StopContainer(context.Background(), f.containerRef)
	}

	if f.containerTest {
		// 컨테이너 테스트 단계의 실패는 `test` 블록도 닫아야 한다. 이걸
		// 안 하면 build 는 FAILED 인데 test.status 는 IN_PROGRESS 로 남아
		// 두 값이 모순된다.
		if err := s.hostClient.ReportContainerTestResult(ctx, buildID, hostclient.ContainerTestResultRequest{
			Status:       contract.ExecutionStatusFailed,
			ErrorCode:    f.errorCode,
			ErrorMessage: f.err.Error(),
			RunnerID:     s.runnerID,
		}); err != nil {
			log.Printf("runner %s container test failure report failed: buildID=%s err=%v", s.runnerID, buildID, err)
		}
	}

	if err := s.hostClient.ReportPhase(ctx, buildID, hostclient.PhaseReport{
		Phase:        contract.PhaseFailed,
		RunnerID:     s.runnerID,
		ErrorCode:    f.errorCode,
		ErrorMessage: f.err.Error(),
	}); err != nil {
		log.Printf("runner %s failure phase report failed: buildID=%s err=%v", s.runnerID, buildID, err)
	}

	log.Printf("runner %s build failed: buildID=%s errorCode=%s err=%v", s.runnerID, buildID, f.errorCode, f.err)
	return f.err
}

// prepareSource — claim 직후 단계. 호스트에서 source archive 를 받아
// (`GET /builds/:buildId/source`, TASK-066) SHA-256 을 검증하고 per-build
// workspace 에 풀어 놓는다. 반환값은 `docker build` 의 context 디렉터리.
func (s *BuildService) prepareSource(ctx context.Context, buildID, dockerfileMode string) (string, *stageFailure) {
	if err := s.reportPhase(ctx, buildID, contract.PhaseSourcePrepared); err != nil {
		// phase 보고 실패는 호스트와의 통신 문제다 — 실패 보고를 또 시도해봐야
		// 같은 이유로 실패한다. 그대로 올려보낸다.
		return "", &stageFailure{errorCode: contract.ErrorCodeUnknownError, err: err}
	}

	if s.fetcher == nil {
		return s.prepareSourceFallback(ctx, buildID)
	}

	extracted, err := s.fetcher.Fetch(ctx, buildID)
	if err != nil {
		return "", &stageFailure{
			errorCode: contract.ErrorCodeUnknownError,
			err:       fmt.Errorf("runner %s: fetch source: %w", s.runnerID, err),
		}
	}
	log.Printf("runner %s fetched source: buildID=%s archiveBytes=%d sourceDir=%s checksum=%s",
		s.runnerID, buildID, extracted.SizeBytes, extracted.SourceDir, extracted.Checksum)
	mode := dockerfile.Mode(dockerfileMode)
	if mode == "" {
		mode = dockerfile.ModeRequired
	}
	result, err := dockerfile.Ensure(extracted.SourceDir, s.dockerfilePath, mode)
	if err != nil {
		return "", &stageFailure{errorCode: contract.ErrorCodeDockerBuildFailed, err: err}
	}
	if result.Generated {
		log.Printf("runner %s generated Dockerfile: buildID=%s template=%s", s.runnerID, buildID, result.Template)
	}
	return extracted.SourceDir, nil
}

// prepareSourceFallback — fetcher 가 wire 되지 않은 경우(phase 보고 경로만
// 검증하는 단위 테스트)의 결정적 workspace. `PrepareSource` 는 디렉터리
// 골격만 만들고, 여기서 최소 Dockerfile 을 심어 `BuildImage` 가 resolve 할
// 수 있게 한다.
//
// fallback Dockerfile 이 의도적으로 최소(`FROM scratch`, COPY 없음)인 이유:
// `BuildImage` 는 build manifest 를 `<workspaceDir>/build-manifest.json` 에
// 쓰지 sourceDir 안에 쓰지 않는다. 그래서 `COPY build-manifest.json ...` 은
// 실제 `docker build`(buildMode=cli)에서 실패한다.
func (s *BuildService) prepareSourceFallback(ctx context.Context, buildID string) (string, *stageFailure) {
	if err := s.docker.PrepareSource(ctx, buildID); err != nil {
		return "", &stageFailure{errorCode: contract.ErrorCodeUnknownError, err: err}
	}
	sourceDir := fmt.Sprintf("%s/src", s.docker.WorkspaceDir(buildID))
	if err := os.WriteFile(
		filepath.Join(sourceDir, s.dockerfilePath),
		[]byte("FROM scratch\n"),
		0o644,
	); err != nil {
		return "", &stageFailure{
			errorCode: contract.ErrorCodeUnknownError,
			err:       fmt.Errorf("runner %s: write fallback Dockerfile: %w", s.runnerID, err),
		}
	}
	return sourceDir, nil
}

// buildImage — docker build 단계. 실패는 canonical DOCKER_BUILD_FAILED 로
// 보고한다 (TASK-162 이전에는 이 코드를 emit 하는 곳이 없었다).
func (s *BuildService) buildImage(ctx context.Context, buildID, sourceDir string, profile *hostclient.ArtifactFactoryProfile) *stageFailure {
	if err := s.reportPhase(ctx, buildID, contract.PhaseDockerBuildStarted); err != nil {
		return &stageFailure{errorCode: contract.ErrorCodeUnknownError, err: err}
	}

	options := docker.ArtifactBuildOptions{}
	if profile != nil {
		options = docker.ArtifactBuildOptions{
			FactoryURL: profile.FactoryURL, PackageProxyURL: profile.PackageProxyURL,
			RegistryMirrorURL: profile.RegistryMirrorURL, Ecosystem: profile.Ecosystem,
		}
	}
	if err := s.docker.BuildImageWithOptions(ctx, buildID, sourceDir, s.dockerfilePath, options); err != nil {
		return &stageFailure{errorCode: contract.ErrorCodeDockerBuildFailed, err: err}
	}

	if err := s.reportPhase(ctx, buildID, contract.PhaseDockerBuildCompleted); err != nil {
		return &stageFailure{errorCode: contract.ErrorCodeUnknownError, err: err}
	}
	return nil
}

// runContainerTest — 컨테이너 테스트 단계. 빌드된 이미지를 실제로 띄우고
// HTTP healthcheck / TCP port open 이 안정될 때까지 polling 한 뒤, 결과를
// canonical `test` 블록에 보고한다.
//
// hostPort=0 으로 두면 RunContainer 가 cli mode 일 때 OS 가 알려주는
// ephemeral port 를 잡고, skeleton mode 일 때는 38124 fallback 을 쓴다.
// BuildService 는 그 결정에 개입하지 않아 두 mode 사이의 일관성을 유지한다.
func (s *BuildService) runContainerTest(ctx context.Context, buildID string, internalPort int) (*docker.ContainerStatus, *stageFailure) {
	if err := s.hostClient.StartContainerTest(ctx, buildID, hostclient.StartContainerTestRequest{
		InternalPort: internalPort,
		RunnerID:     s.runnerID,
	}); err != nil {
		return nil, &stageFailure{errorCode: contract.ErrorCodeUnknownError, err: err}
	}

	runOpts := docker.ContainerRunOptions{
		ImageTag:           s.docker.ImageTagFor(buildID),
		ContainerName:      fmt.Sprintf("container-%s", buildID),
		HostPort:           s.hostPortOverride,
		InternalPort:       internalPort,
		HealthcheckPath:    s.healthcheckPath,
		HealthcheckTimeout: s.healthcheckTimeout,
		StabilityWindow:    5 * time.Second,
	}

	containerStatus, err := s.docker.RunContainer(ctx, runOpts)
	if err != nil {
		return nil, &stageFailure{
			errorCode:     contract.ErrorCodeContainerTestFailed,
			err:           fmt.Errorf("runner %s: run container: %w", s.runnerID, err),
			containerTest: true,
		}
	}

	if _, err := s.docker.WaitForHealth(ctx, containerStatus, s.healthcheckTimeout); err != nil {
		// healthcheck 실패는 terminal — `fail` 이 container stop 까지 처리한다.
		return nil, &stageFailure{
			errorCode:     contract.ErrorCodeContainerTestFailed,
			err:           fmt.Errorf("runner %s: container healthcheck: %w", s.runnerID, err),
			containerTest: true,
			containerRef:  containerStatus.ContainerRef,
		}
	}

	if err := s.hostClient.ReportContainerTestResult(ctx, buildID, hostclient.ContainerTestResultRequest{
		// 여기까지 왔다는 것은 RunContainer + WaitForHealth 가 모두 통과했다는
		// 뜻이므로 canonical SUCCESS 다 (TASK-161).
		Status:                contract.ExecutionStatusSuccess,
		RuntimeURL:            containerStatus.RuntimeURL,
		Host:                  containerStatus.Host,
		HostPort:              containerStatus.HostPort,
		ContainerRef:          containerStatus.ContainerRef,
		HealthCheckPassed:     containerStatus.HealthCheckPassed,
		PortOpen:              containerStatus.PortOpen,
		StabilityWindowPassed: containerStatus.StabilityWindowPassed,
		RunnerID:              s.runnerID,
	}); err != nil {
		return nil, &stageFailure{
			errorCode:    contract.ErrorCodeUnknownError,
			err:          err,
			containerRef: containerStatus.ContainerRef,
		}
	}

	return containerStatus, nil
}

// deployImage — 외부 배포 단계. cli mode 의 adapter 는 local SourceImage
// (`docker-image-builder-system/<buildMode>:<buildID>`) 를 registry 에
// push 한다. skeleton mode 는 SourceImage 가 local docker daemon 에 없을 수
// 있어 opts.SourceImage 를 비워두고 skeleton 동작을 탄다 (workspace 에
// deploy-result.json 만 emit).
func (s *BuildService) deployImage(
	ctx context.Context,
	buildID string,
	containerStatus *docker.ContainerStatus,
	appName string,
	contextPath string,
	runtimePort int,
	stripPrefix bool,
	hostingScheme string,
	effectiveTier string,
	resources *hostclient.ResourceProfile,
	database *hostclient.DatabasePolicy,
) *stageFailure {
	// 컨테이너는 컨테이너 테스트가 끝난 뒤 정리한다. e2e script 가
	// RUNNER_STOP_CONTAINER_ON_DONE=true 로 켜고 cleanup 을 검증한다.
	if s.stopContainerOnDone {
		defer func() {
			if err := s.docker.StopContainer(context.Background(), containerStatus.ContainerRef); err != nil {
				log.Printf("runner %s stop container failed: %v", s.runnerID, err)
			}
		}()
	}

	if err := s.hostClient.ReportDeployment(ctx, buildID, hostclient.DeploymentReportRequest{
		Status:     contract.ExecutionStatusInProgress,
		TargetType: "DOCKER_REGISTRY",
		RunnerID:   s.runnerID,
		ResponsePayloadJSON: map[string]any{
			"deliveryMode": "POLLING",
		},
	}); err != nil {
		return &stageFailure{errorCode: contract.ErrorCodeUnknownError, err: err}
	}

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
		return &stageFailure{errorCode: contract.ErrorCodeDeploymentFailed, err: err}
	}

	// TASK-162 (P2-M3 후속): k8s adapter 1호 통합. k8sDeployer 가 주입된
	// 경우에만 동작하고 (기본값 nil → skip), 실패 시 TargetType="K8S" 로
	// FAILED 를 보고하고 배포 단계를 실패 처리한다.
	reportPayload := deployResult.ResponsePayloadJSON
	reportTargetType := deployResult.TargetType
	var k8sResult *deploy.K8sResult
	if s.k8sDeployer != nil {
		if node := strings.TrimSpace(os.Getenv("RUNNER_K8S_KIND_NODE")); node != "" {
			if err := s.docker.LoadImageToKind(ctx, containerStatus.ImageTag, node); err != nil {
				return &stageFailure{errorCode: contract.ErrorCodeDeploymentFailed, err: err}
			}
		}
		// TASK-175 (v0.8.0, E1): per-build namespace 옵트인.
		// RUNNER_K8S_NAMESPACE_PER_BUILD=true 면 buildID 별 namespace 로
		// 격리(deployment/ingress DNS 충돌 + audit). 기본값(false) 은
		// RUNNER_K8S_NAMESPACE 공유.
		ns := os.Getenv("RUNNER_K8S_NAMESPACE")
		if perBuild := os.Getenv("RUNNER_K8S_NAMESPACE_PER_BUILD"); perBuild == "true" {
			ns = "dib-" + dns1123Label(buildID)
		}
		// TASK-175 (E3): k8s 분기 시작에 IN_PROGRESS(K8S) 를 보고한다.
		// docker registry IN_PROGRESS(DOCKER_REGISTRY) 와 별도로 운영자가
		// 빌드 조회로 두 adapter 의 진행을 분리해 본다. best-effort 보고
		// (실패해도 kubernetes Deploy 자체를 막진 않음).
		_ = s.hostClient.ReportDeployment(ctx, buildID, hostclient.DeploymentReportRequest{
			Status:              contract.ExecutionStatusInProgress,
			TargetType:          "K8S",
			RunnerID:            s.runnerID,
			ResponsePayloadJSON: map[string]any{"deliveryMode": "POLLING"},
		})
		kRes, kErr := s.k8sDeployer.Deploy(ctx, deploy.K8sDeployOptions{
			SourceImage:              containerStatus.ImageTag,
			Cluster:                  os.Getenv("RUNNER_K8S_CLUSTER"),
			Namespace:                ns,
			Manifest:                 os.Getenv("RUNNER_K8S_MANIFEST"),
			BuildID:                  buildID,
			ContextPath:              contextPath,
			ContainerPort:            runtimePort,
			StripPrefix:              stripPrefix,
			HostingScheme:            hostingScheme,
			BaseHost:                 os.Getenv("RUNNER_HOSTING_BASE_HOST"),
			Resources:                resourceProfile(effectiveTier, resources),
			APIServiceName:           strings.TrimSpace(os.Getenv("RUNNER_K8S_API_SERVICE")),
			APIServicePort:           parsePositiveEnv("RUNNER_K8S_API_PORT", 3000),
			DatabaseSecretName:       databaseSecretName(appName, database),
			DatabaseMigrationCommand: databaseMigrationCommand(database),
		})
		if kErr != nil {
			// TASK-175 (E3): k8s 실패 시 docker registry 결과(payload, targetRef)
			// 를 단일 FAILED 보고에 동봉한다. registry push 는 성공했지만 k8s
			// 배포가 실패한 케이스에서 docker registry 결과가 사라지지 않는다.
			if reportPayload == nil {
				reportPayload = map[string]any{}
			}
			reportPayload["dockerRegistry"] = map[string]any{
				"targetRef":  deployResult.TargetRef,
				"resultRef":  deployResult.ResultRef,
				"survivedAt": time.Now().UTC(),
			}
			_ = s.hostClient.ReportDeployment(ctx, buildID, hostclient.DeploymentReportRequest{
				Status:              contract.ExecutionStatusFailed,
				TargetType:          "K8S",
				ErrorCode:           contract.ErrorCodeDeploymentFailed,
				ErrorMessage:        fmt.Sprintf("k8s deploy failed: %v (docker registry push survived: %s)", kErr, deployResult.TargetRef),
				TargetRef:           deployResult.TargetRef,
				ResultRef:           deployResult.ResultRef,
				RunnerID:            s.runnerID,
				ResponsePayloadJSON: reportPayload,
			})
			return &stageFailure{errorCode: contract.ErrorCodeDeploymentFailed, err: kErr}
		}
		k8sResult = kRes
		// docker registry 결과를 payload 의 k8s section 으로 합친다. 호스팅이
		// 활성이면 TargetType 은 "K8S" 로 보고한다(서버가 HostedService 를
		// upsert 하고 canonical enum 을 만족하도록 — P2-M5 의 ",K8S" 병합은
		// 서버 enum 에 없어 거부됐다, TASK-167).
		if reportPayload == nil {
			reportPayload = map[string]any{}
		}
		reportPayload["k8s"] = map[string]any{
			"cluster":   k8sResult.Cluster,
			"namespace": k8sResult.Namespace,
			"manifest":  k8sResult.Manifest,
			"resultRef": k8sResult.ResultRef,
			"appliedAt": k8sResult.AppliedAt,
		}
		reportTargetType = "K8S"
	}

	successReport := hostclient.DeploymentReportRequest{
		Status:              contract.ExecutionStatusSuccess,
		TargetType:          reportTargetType,
		TargetRef:           deployResult.TargetRef,
		ResultRef:           deployResult.ResultRef,
		RunnerID:            s.runnerID,
		ResponsePayloadJSON: reportPayload,
	}
	// TASK-167 (P3-M2): 호스팅 좌표를 실어 build-server 가 HostedService 를
	// upsert 하게 한다.
	if k8sResult != nil {
		successReport.ContextPath = k8sResult.ContextPath
		successReport.Namespace = k8sResult.Namespace
		successReport.DeploymentName = k8sResult.DeploymentID
		successReport.ResultRef = k8sResult.ResultRef
		if baseHost := strings.TrimSpace(os.Getenv("RUNNER_HOSTING_BASE_HOST")); baseHost != "" {
			if hostingScheme == "subdomain" {
				successReport.RuntimeURL = fmt.Sprintf("http://%s.%s/", k8sResult.ContextPath, baseHost)
			} else {
				successReport.RuntimeURL = fmt.Sprintf("http://%s/%s/", baseHost, k8sResult.ContextPath)
			}
		}
	}
	if err := s.hostClient.ReportDeployment(ctx, buildID, successReport); err != nil {
		return &stageFailure{errorCode: contract.ErrorCodeUnknownError, err: err}
	}
	return nil
}

func resourceProfile(tier string, input *hostclient.ResourceProfile) *deploy.ResourceProfile {
	if input == nil {
		return nil
	}
	return &deploy.ResourceProfile{
		Tier:       tier,
		CPURequest: input.CPURequest, MemoryRequest: input.MemoryRequest,
		CPULimit: input.CPULimit, MemoryLimit: input.MemoryLimit, Replicas: input.Replicas,
	}
}

func (s *BuildService) reportPhase(ctx context.Context, buildID, phase string) error {
	if err := s.hostClient.ReportPhase(ctx, buildID, hostclient.PhaseReport{
		Phase:    phase,
		RunnerID: s.runnerID,
	}); err != nil {
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

// WithK8sDeployer 는 BuildService 에 k8s adapter 를 주입한다. nil 을
// 넘기면 k8s 분기 skip (기존 docker registry 만 동작). TASK-162
// (P2-M3 후속) 의 1호 통합 경로. K8sMode 가 "noop" / "skeleton" 인
// 경우도 nil 로 안전 — worker 가 cfg.K8sMode 로 분기해 결정한다.
func (s *BuildService) WithK8sDeployer(d deploy.K8sDeployer) *BuildService {
	s.k8sDeployer = d
	return s
}

// TASK-175 (v0.8.0, E1): per-build namespace 옵트인 시 buildID 를
// DNS-1123 label 로 정제. deploy/deploymentName 규약과 일치(소문자 +
// 비허용문자 '-' + 63자 제한 + 양끝 trim). 정규식이 패키지 내부 의존을
// 피하기 위해 inline 으로 둔다.
var dns1123InvalidRE = regexp.MustCompile(`[^a-z0-9-]`)

func dns1123Label(buildID string) string {
	s := strings.ToLower(buildID)
	s = dns1123InvalidRE.ReplaceAllString(s, "-")
	if len(s) > 53 { // "dib-"(4) + 53 = 57 + 여유 < 63
		s = s[:53]
	}
	s = strings.Trim(s, "-")
	if s == "" {
		s = "build"
	}
	return s
}
