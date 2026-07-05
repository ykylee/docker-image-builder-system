package docker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	defaultBuildMode = "skeleton"
	// defaultRunMode 가 "skeleton" 일 때는 실제 docker 호출 없이 mock
	// ContainerStatus 를 돌려준다 (test / dry-run). "cli" 일 때만
	// `docker run` + curl healthcheck + net.Dial port probe 를 수행한다.
	defaultRunMode = "skeleton"
)

// ContainerRunOptions 는 RunContainer 가 받아들이는 입력. ImageTag 는
// BuildImage 가 emit 한 docker image tag 와 일치해야 한다. HostPort 가
// 0 이면 docker 가 자동으로 host port 를 할당한다 (skeleton 모드는
// 38124 고정). InternalPort 는 container 안에서 서비스가 listening 하는
// port. HealthcheckPath 는 healthcheck HTTP GET 의 path (보통 "/").
type ContainerRunOptions struct {
	ImageTag            string
	ContainerName       string
	HostPort            int
	InternalPort        int
	HealthcheckPath     string
	HealthcheckTimeout  time.Duration
	StabilityWindow     time.Duration
	// HealthcheckScheme 은 "http" (default) 또는 "https". 컨테이너
	// 가 TLS terminate 할 때만 사용. healthcheck 가 단순 TCP port
	// open probe 면 HealthcheckPath 는 무시된다.
	HealthcheckScheme string
	// Network 는 docker run --network 옵션. 비어 있으면 default bridge.
	Network string
}

// ContainerStatus 는 RunContainer + WaitForHealth 가 채워서 돌려주는
// container lifecycle snapshot. BuildService.ProcessClaim 은 이 값을
// 그대로 ReportPreviewReady 의 입력으로 사용한다.
type ContainerStatus struct {
	ContainerRef          string
	ImageTag              string
	Host                  string
	HostPort              int
	InternalPort          int
	RuntimeURL            string
	Running               bool
	HealthCheckPassed     bool
	PortOpen              bool
	StabilityWindowPassed bool
	StartedAt             time.Time
	StoppedAt             *time.Time
}

type Client struct {
	workspaceRoot string
	buildMode     string
	runMode       string
	dockerBin     string
	healthClient  *http.Client
	// now 은 WaitForHealth 의 stability window sampling 기준 시각.
	// test 에서 fake clock 으로 교체할 수 있다.
	now func() time.Time
	// runContainerCmd / stopContainerCmd 는 RunContainer / StopContainer 의
	// 실제 docker invocation 을 갈아끼울 수 있게 한다. default 는
	// exec.CommandContext(dockerBin, ...). tests 에서 fake command runner
	// 로 교체할 수 있다.
	runContainerCmd func(ctx context.Context, args ...string) error
	stopContainerCmd func(ctx context.Context, args ...string) error
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

	runMode := os.Getenv("RUNNER_DOCKER_RUN_MODE")
	if runMode == "" {
		runMode = defaultRunMode
	}

	dockerBin := os.Getenv("RUNNER_DOCKER_BIN")
	if dockerBin == "" {
		dockerBin = "docker"
	}

	c := &Client{
		workspaceRoot: workspaceRoot,
		buildMode:     buildMode,
		runMode:       runMode,
		dockerBin:     dockerBin,
		healthClient:  &http.Client{Timeout: 2 * time.Second},
		now:           time.Now,
	}
	c.runContainerCmd = c.defaultRunContainerCmd
	c.stopContainerCmd = c.defaultStopContainerCmd
	return c
}

// WorkspaceDir returns the per-build workspace root. Public so callers
// (e.g. `BuildService.ProcessClaim`) can compute stable paths for the
// extracted source tree, fallback Dockerfile, and container metadata
// without re-implementing the path join.
func (c *Client) WorkspaceDir(buildID string) string {
	return c.workspaceDir(buildID)
}

// BuildMode returns the configured build mode (`cli` / `skeleton`).
// Exposed for callers that need to compose the image tag without
// reaching into the unexported field.
func (c *Client) BuildMode() string {
	return c.buildMode
}

// ImageTagFor builds the canonical image tag for a build. Mirrors the
// formula used inside `BuildImage` so callers (e.g. `RunContainer`)
// don't have to re-derive it.
func (c *Client) ImageTagFor(buildID string) string {
	return fmt.Sprintf("docker-image-builder-system/%s:%s", c.buildMode, buildID)
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
	imageTag := c.ImageTagFor(buildID)

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

// ErrContainerHealthcheckTimeout 은 WaitForHealth 가 timeout 내에
// healthcheck / port open 을 통과하지 못할 때 반환된다. caller (BuildService)
// 는 이 에러를 받아서 container 를 stop 한 뒤 FAILED phase 를 보고한다.
var ErrContainerHealthcheckTimeout = errors.New("docker: container healthcheck timed out")

// RunContainer 는 BuildImage 가 만든 image 로부터 docker container 를
// 띄운다. runMode == "skeleton" 일 때는 mock ContainerStatus 를 반환하고
// 실제 docker 호출은 없다. runMode == "cli" 일 때는 `docker run -d
// --name <name> -p <host>:<internal> <image>` 를 호출하고, 성공 시 실제
// 호스트에서 매핑된 port 를 status 에 채워서 반환한다.
//
// docker run 의 stdout/stderr 는 BuildImage 와 마찬가지로 운영자가 직접
// 볼 수 있도록 부모 process 로 흘려 보낸다.
func (c *Client) RunContainer(ctx context.Context, opts ContainerRunOptions) (*ContainerStatus, error) {
	if opts.ImageTag == "" {
		return nil, errors.New("run container: ImageTag is required")
	}
	if opts.ContainerName == "" {
		return nil, errors.New("run container: ContainerName is required")
	}
	if opts.InternalPort <= 0 || opts.InternalPort > 65535 {
		return nil, fmt.Errorf("run container: invalid InternalPort %d", opts.InternalPort)
	}
	if opts.HealthcheckPath == "" {
		opts.HealthcheckPath = "/"
	}
	if opts.HealthcheckScheme == "" {
		opts.HealthcheckScheme = "http"
	}
	if opts.HealthcheckTimeout == 0 {
		opts.HealthcheckTimeout = 30 * time.Second
	}
	if opts.StabilityWindow == 0 {
		opts.StabilityWindow = 5 * time.Second
	}

	hostPort := opts.HostPort
	if hostPort <= 0 {
		// skeleton 모드에선 port 38124 로 고정 (이전 ReportPreviewReady 의
		// mock 과 정합), cli 모드에선 docker 가 자동 할당하도록 0 으로 둔다.
		if c.runMode != "cli" {
			hostPort = 38124
		}
	}

	if c.runMode != "cli" {
		return &ContainerStatus{
			ContainerRef:          opts.ContainerName,
			ImageTag:              opts.ImageTag,
			Host:                  "preview.local",
			HostPort:              hostPort,
			InternalPort:          opts.InternalPort,
			RuntimeURL:            fmt.Sprintf("%s://preview.local:%d%s", opts.HealthcheckScheme, hostPort, opts.HealthcheckPath),
			Running:               true,
			HealthCheckPassed:     true,
			PortOpen:              true,
			StabilityWindowPassed: true,
			StartedAt:             c.now().UTC(),
		}, nil
	}

	// cli mode: docker run -d --name <name> -p <host>:<internal> <image>
	// HostPort 가 0 이면 -p <internal> 만 지정 (auto-assign).
	portMapping := fmt.Sprintf("%d:%d", hostPort, opts.InternalPort)
	if hostPort == 0 {
		portMapping = strconv.Itoa(opts.InternalPort)
	}
	args := []string{"run", "-d", "--name", opts.ContainerName, "-p", portMapping}
	if opts.Network != "" {
		args = append(args, "--network", opts.Network)
	}
	args = append(args, opts.ImageTag)

	if err := c.runContainerCmd(ctx, args...); err != nil {
		return nil, fmt.Errorf("run container: docker run failed: %w", err)
	}

	// host port 가 0 이었으면 docker 가 자동 할당한 port 를 조회한다.
	// `docker inspect --format '{{ (index (index .NetworkSettings.Ports "<internalPort>/tcp") 0) "HostPort" }}' <name>`.
	// inspect 실패 (docker daemon race / inspect format mismatch / 빈 응답)
	// 시 status.HostPort == 0 으로 그대로 반환한다 — caller (BuildService) 가
	// 그대로 ReportPreviewReady 에 :0 URL 을 흘려보내면 downstream 에서 잘못된
	// previewUrl 이 노출되므로, BuildService 가 HostPort=0 으로 빌드할 때는
	// pickFreePort 로 OS ephemeral port 를 미리 잡아 host 포트로 명시적으로
	// 넘기는 편이 안전하다. 그 경로는 후속 TASK 의 port-collision retry 정책과
	// 함께 도입 예정 (현재는 docker auto-assign + best-effort inspect).
	if hostPort == 0 {
		inspectArgs := []string{
			"inspect",
			"--format",
			fmt.Sprintf("{{ (index (index .NetworkSettings.Ports \"%d/tcp\") 0) \"HostPort\" }}", opts.InternalPort),
			opts.ContainerName,
		}
		hostPortStr, err := c.runDockerInspect(ctx, inspectArgs)
		if err == nil && hostPortStr != "" {
			if p, parseErr := strconv.Atoi(strings.TrimSpace(hostPortStr)); parseErr == nil {
				hostPort = p
			}
		}
	}

	return &ContainerStatus{
		ContainerRef: opts.ContainerName,
		ImageTag:     opts.ImageTag,
		Host:         "127.0.0.1",
		HostPort:     hostPort,
		InternalPort: opts.InternalPort,
		RuntimeURL:   fmt.Sprintf("%s://127.0.0.1:%d%s", opts.HealthcheckScheme, hostPort, opts.HealthcheckPath),
		Running:      true,
		StartedAt:    c.now().UTC(),
	}, nil
}

// WaitForHealth 는 container 가 ready 상태가 될 때까지 (1) healthcheck
// HTTP GET 이 2xx 를 돌려주고 (2) TCP port 가 열려 있는 상태가
// 연속으로 3 회 polling 동안 유지될 때까지 기다린다. polling 주기는
// 250ms. timeout 시 ErrContainerHealthcheckTimeout 반환. caller 는
// container 를 stop 한 뒤 FAILED phase 를 보고해야 한다.
//
// StabilityWindow 는 "ready 가 된 시점부터 최소 N 초 동안 유지되어야
// stability 인정" 정책의 hint 로 받는다. 현 구현은 consecutive-3
// polling 으로 stability 를 보장하므로 StabilityWindow 는 timeout 의
// soft cap 으로만 활용한다 — caller 가 0 을 넘겨주면 timeout 이 그것을
// 넘지 않도록 cap.
//
// skeleton 모드일 때는 즉시 success 상태를 반환한다.
func (c *Client) WaitForHealth(ctx context.Context, status *ContainerStatus, timeout time.Duration) (*ContainerStatus, error) {
	if status == nil {
		return nil, errors.New("wait for health: status is nil")
	}
	if c.runMode != "cli" {
		status.HealthCheckPassed = true
		status.PortOpen = true
		status.StabilityWindowPassed = true
		return status, nil
	}

	if timeout == 0 {
		timeout = 30 * time.Second
	}
	deadline := c.now().Add(timeout)
	const requiredConsecutive = 3
	consecutive := 0

	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		portOpen := probePort(status.Host, status.HostPort)
		healthOK := false
		if portOpen {
			healthOK = probeHealth(c.healthClient, status.Host, status.HostPort, status.RuntimeURL)
		}

		if portOpen && healthOK {
			consecutive++
			if consecutive >= requiredConsecutive {
				status.PortOpen = true
				status.HealthCheckPassed = true
				status.StabilityWindowPassed = true
				return status, nil
			}
		} else {
			consecutive = 0
			status.PortOpen = portOpen
			status.HealthCheckPassed = healthOK
		}

		if c.now().After(deadline) {
			status.StabilityWindowPassed = false
			return status, ErrContainerHealthcheckTimeout
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
}

// StopContainer 는 container 를 gracefully stop 한 뒤 remove 한다.
// 이미 stopped / removed 상태에서도 idempotent. caller (BuildService
// 또는 e2e script) 가 cleanup 단계에서 호출. error 가 발생해도 caller
// 가 무시할 수 있도록 에러를 wrapping 만 하고 fatal 처리하지 않는다.
func (c *Client) StopContainer(ctx context.Context, containerName string) error {
	if containerName == "" {
		return errors.New("stop container: containerName is required")
	}
	if c.runMode != "cli" {
		return nil
	}
	// `docker rm -f <name>` — stopped / running 둘 다 idempotent.
	if err := c.stopContainerCmd(ctx, "rm", "-f", containerName); err != nil {
		return fmt.Errorf("stop container: docker rm -f %s failed: %w", containerName, err)
	}
	stopped := c.now().UTC()
	_ = stopped // Reserved for status.StoppedAt wiring in follow-up PRs.
	return nil
}

// defaultRunContainerCmd 는 exec.CommandContext 로 docker CLI 를 호출한다.
func (c *Client) defaultRunContainerCmd(ctx context.Context, args ...string) error {
	cmd := exec.CommandContext(ctx, c.dockerBin, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// defaultStopContainerCmd 는 exec.CommandContext 로 docker CLI 를 호출한다.
func (c *Client) defaultStopContainerCmd(ctx context.Context, args ...string) error {
	cmd := exec.CommandContext(ctx, c.dockerBin, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// SetStopContainerCmdForTest 는 test 에서 cli mode 의 docker rm -f 호출을
// 가로채기 위한 seam. production 코드에서는 호출하지 말 것 — 항상
// `defaultStopContainerCmd` 가 설정된 채 NewClient 로 들어온다.
func (c *Client) SetStopContainerCmdForTest(fn func(ctx context.Context, args ...string) error) {
	c.stopContainerCmd = fn
}

// SetRunContainerCmdForTest 는 test 에서 cli mode 의 docker run 호출을
// 가로채기 위한 seam. `defaultRunContainerCmd` 가 실제 docker 데몬에
// 접속하는 것을 막아 unit test 가 docker daemon 없이도 동작하게 한다.
func (c *Client) SetRunContainerCmdForTest(fn func(ctx context.Context, args ...string) error) {
	c.runContainerCmd = fn
}

// SetHealthClientForTest 는 test 에서 cli mode 의 HTTP healthcheck probe
// 가 가리키는 transport 를 fake 로 교체한다. httptest.NewServer.Client()
// 와 같은 *http.Client 를 넘기면 그쪽 URL 로 probe 가 향한다.
func (c *Client) SetHealthClientForTest(client *http.Client) {
	c.healthClient = client
}

// runDockerInspect 는 `docker inspect` 호출 + 결과 string 반환 (cli mode 한정).
func (c *Client) runDockerInspect(ctx context.Context, args []string) (string, error) {
	cmd := exec.CommandContext(ctx, c.dockerBin, args...)
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

// probePort 는 net.Dial 로 TCP port 가 listening 인지 확인한다.
// timeout 500ms — healthcheck loop 가 빠르게 진행될 수 있도록 짧게.
func probePort(host string, port int) bool {
	if port <= 0 {
		return false
	}
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	conn, err := net.DialTimeout("tcp", addr, 500*time.Millisecond)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

// probeHealth 는 HTTP GET <runtimeURL> 가 2xx 를 반환하는지 확인한다.
// c.healthClient 가 timeout 2s 로 설정되어 있어 healthcheck loop 가
// stale container 에 매달리지 않는다.
func probeHealth(client *http.Client, host string, _ int, runtimeURL string) bool {
	if client == nil {
		client = &http.Client{Timeout: 2 * time.Second}
	}
	req, err := http.NewRequest(http.MethodGet, runtimeURL, nil)
	if err != nil {
		return false
	}
	_ = host // reserved for Host header routing — runtimeURL 이 이미 host 포함.
	res, err := client.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	return res.StatusCode >= 200 && res.StatusCode < 300
}

// pickFreePort 는 OS 가 알려주는 ephemeral port 를 잡아 즉시 닫는다.
// docker 가 같은 port 를 즉시 잡을 수 있도록 race window 는 짧다.
// 후속 TASK 에서 port collision retry 정책 도입 예정.
func pickFreePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

func (c *Client) workspaceDir(buildID string) string {
	return filepath.Join(c.workspaceRoot, buildID)
}