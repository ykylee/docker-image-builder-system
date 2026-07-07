package docker

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"text/template"
	"time"
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

// TASK-067: RunContainer 의 skeleton mode 동작 — 실제 docker 호출 없이
// mock ContainerStatus 를 반환하고 ReportPreviewReady 의 입력으로
// 그대로 사용 가능해야 한다.
func TestRunContainerSkeletonMode(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DOCKER_BUILD_MODE", "skeleton")
	t.Setenv("RUNNER_DOCKER_RUN_MODE", "skeleton")

	client := NewClient()
	status, err := client.RunContainer(context.Background(), ContainerRunOptions{
		ImageTag:        client.ImageTagFor("b-67"),
		ContainerName:   "container-b-67",
		InternalPort:    8080,
		HealthcheckPath: "/",
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if status.HostPort != 38124 {
		t.Errorf("expected default host port 38124 in skeleton mode, got %d", status.HostPort)
	}
	if status.Host != "preview.local" {
		t.Errorf("expected host=preview.local, got %s", status.Host)
	}
	if status.RuntimeURL != "http://preview.local:38124/" {
		t.Errorf("unexpected runtime URL: %s", status.RuntimeURL)
	}
	if !status.Running {
		t.Errorf("expected Running=true")
	}
}

// WaitForHealth 의 skeleton mode 도 즉시 success 를 반환해야 한다.
func TestWaitForHealthSkeletonMode(t *testing.T) {
	client := NewClient()
	client.runMode = "skeleton"

	status := &ContainerStatus{Host: "preview.local", HostPort: 38124, RuntimeURL: "http://preview.local:38124/"}
	out, err := client.WaitForHealth(context.Background(), status, time.Second)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if !out.HealthCheckPassed || !out.PortOpen || !out.StabilityWindowPassed {
		t.Errorf("expected all health flags true, got %+v", out)
	}
}

// cli mode 의 docker run invocation 을 fake command runner 로 가로채서
// 호출 인자 / port mapping / image tag 가 정확히 emit 되는지 확인한다.
func TestRunContainerCliModeInvokesDockerWithExpectedArgs(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DOCKER_BUILD_MODE", "skeleton")
	t.Setenv("RUNNER_DOCKER_RUN_MODE", "cli")

	client := NewClient()
	var captured []string
	client.runContainerCmd = func(ctx context.Context, args ...string) error {
		captured = append([]string(nil), args...)
		return nil
	}
	// HostPort=0 일 때 docker 가 auto-assign 하도록 port mapping 은
	// "<internalPort>" 만 emit 되어야 한다.
	status, err := client.RunContainer(context.Background(), ContainerRunOptions{
		ImageTag:        "docker-image-builder-system/skeleton:b-67",
		ContainerName:   "container-b-67",
		HostPort:        0,
		InternalPort:    9090,
		HealthcheckPath: "/healthz",
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(captured) != 7 || captured[0] != "run" || captured[1] != "-d" || captured[2] != "--name" ||
		captured[3] != "container-b-67" || captured[4] != "-p" || captured[5] != "9090" ||
		captured[6] != "docker-image-builder-system/skeleton:b-67" {
		t.Errorf("unexpected docker run args: %v", captured)
	}
	// HostPort=0 + skeleton image tag 그대로. inspect 가 호출되지 않으므로
	// HostPort 는 0 그대로 유지된다 (caller 가 WaitForHealth 의 port probe
	// 로 재시도할 수 있도록 status 가 열린 port 를 노출하지 않음).
	if status.HostPort != 0 {
		t.Errorf("expected HostPort=0 (auto-assign pending), got %d", status.HostPort)
	}
}

// HostPort 가 명시된 경우엔 docker run 에 "<host>:<internal>" 포트 매핑이
// 그대로 emit 되어야 한다.
func TestRunContainerCliModeExplicitHostPort(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DOCKER_BUILD_MODE", "skeleton")
	t.Setenv("RUNNER_DOCKER_RUN_MODE", "cli")

	client := NewClient()
	var captured []string
	client.runContainerCmd = func(ctx context.Context, args ...string) error {
		captured = append([]string(nil), args...)
		return nil
	}
	_, err := client.RunContainer(context.Background(), ContainerRunOptions{
		ImageTag:      "img:tag",
		ContainerName: "container-b-67",
		HostPort:      38124,
		InternalPort:  8080,
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	foundPortMapping := false
	for i := 0; i+1 < len(captured); i++ {
		if captured[i] == "-p" {
			if captured[i+1] != "38124:8080" {
				t.Errorf("expected port mapping 38124:8080, got %s", captured[i+1])
			}
			foundPortMapping = true
		}
	}
	if !foundPortMapping {
		t.Errorf("expected -p 38124:8080 in args: %v", captured)
	}
}

// StopContainer 는 cli mode + skeleton mode 모두에서 idempotent.
func TestStopContainerIdempotent(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DOCKER_BUILD_MODE", "skeleton")
	t.Setenv("RUNNER_DOCKER_RUN_MODE", "skeleton")

	client := NewClient()
	if err := client.StopContainer(context.Background(), "container-b-67"); err != nil {
		t.Fatalf("expected skeleton stop no-op, got %v", err)
	}

	// cli mode: fake command runner 가 호출되는지만 확인.
	client.runMode = "cli"
	var calls int32
	client.stopContainerCmd = func(ctx context.Context, args ...string) error {
		atomic.AddInt32(&calls, 1)
		return nil
	}
	if err := client.StopContainer(context.Background(), "container-b-67"); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if atomic.LoadInt32(&calls) != 1 {
		t.Errorf("expected 1 stop call, got %d", calls)
	}
}

// probePort / probeHealth 가 httptest.Server + 실제 listening port 로
// 정확히 동작하는지 확인. 이 두 함수가 WaitForHealth 의 핵심 primitive.
func TestProbePortAndHealth(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	// srv.Listener.Addr() 에서 host/port 추출 후 probe/health 에 그대로 넘긴다.
	host, portStr, err := net.SplitHostPort(srv.Listener.Addr().String())
	if err != nil {
		t.Fatalf("split host/port: %v", err)
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		t.Fatalf("parse port: %v", err)
	}

	if !probePort(host, port) {
		t.Errorf("expected probePort(%s:%d) = true", host, port)
	}
	if !probeHealth(srv.Client(), host, port, srv.URL+"/healthz") {
		t.Errorf("expected probeHealth = true")
	}
	if probeHealth(srv.Client(), host, port, srv.URL+"/missing") {
		t.Errorf("expected probeHealth(/missing) = false")
	}
}

// pickFreePort 가 OS ephemeral port 를 받아오는지 검증 — 현재는
// BuildService.WithHostPort=0 + cli mode 의 host-side port pre-allocation
// 용도로 정의돼 있고, RunContainer 의 hostPort=0 path 는 docker auto-assign
// 으로 처리한다. 후속 TASK (port collision retry) 에서 실제 호출처가 생길
// 예정이지만 지금은 dead code 가 되지 않도록 직접 호출 테스트로 커버.
func TestPickFreePortReturnsEphemeral(t *testing.T) {
	p, err := pickFreePort()
	if err != nil {
		t.Fatalf("pickFreePort: %v", err)
	}
	if p <= 0 || p > 65535 {
		t.Errorf("expected ephemeral port in 1..65535, got %d", p)
	}
}

// HostPort=0 auto-assign path 의 docker inspect format template 검증.
// Scenario 5 의 live container smoke 가 `index ... ... "HostPort"` 형태의 trailing
// argument 가 Go template parser 에서 "can't give argument to non-function index"
// 로 실패함을 발견했다 (TASK-067 1차 PR 의 버그). client.go 의 fix 는
// `(index (index ...) 0).HostPort` 로 끝 key 를 field access 로 표현. 본
// 테스트는 format string 이 `text/template` 으로 정상 parse 되고, 모킹된
// docker inspect 출력 (NetworkSettings.Ports 호환 구조체) 을 사용해 host port
// 가 정확히 추출됨을 보장한다.
func TestRunContainerCliModeInspectTemplateParsesAndExtractsHostPort(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DOCKER_BUILD_MODE", "skeleton")
	t.Setenv("RUNNER_DOCKER_RUN_MODE", "cli")

	client := NewClient()

	const inspectTemplate = `{{(index (index .NetworkSettings.Ports "8080/tcp") 0).HostPort}}`
	if _, err := template.New("inspect").Parse(inspectTemplate); err != nil {
		t.Fatalf("template parse failed (regression of Scenario 5 bug): %v", err)
	}

	// RunContainer 의 inspect-format 빌드식이 위와 같은 문자열을 emit 하는지 검증.
	var captured []string
	client.SetRunDockerInspectCmdForTest(func(ctx context.Context, args []string) (string, error) {
		captured = append([]string(nil), args...)
		// auto-assign 으로 docker 가 32771 같은 OS ephemeral port 를 골랐다고 가정.
		return "32771", nil
	})
	client.runContainerCmd = func(ctx context.Context, args ...string) error {
		return nil
	}
	status, err := client.RunContainer(context.Background(), ContainerRunOptions{
		ImageTag:        "img:tag",
		ContainerName:   "container-test-inspect",
		HostPort:        0,
		InternalPort:    8080,
		HealthcheckPath: "/",
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if len(captured) != 4 || captured[0] != "inspect" || captured[1] != "--format" ||
		captured[3] != "container-test-inspect" {
		t.Errorf("unexpected inspect args: %v", captured)
	}
	if !strings.Contains(captured[2], ".HostPort}}") {
		t.Errorf("inspect format must end with .HostPort}} for host-port field access, got: %q", captured[2])
	}
	if captured[2] == `{{(index (index .NetworkSettings.Ports "8080/tcp") 0) "HostPort"}}` {
		t.Errorf("regression: trailing \"HostPort\" arg form re-introduced")
	}
	if status.HostPort != 32771 {
		t.Errorf("expected HostPort=32771 from inspect readback, got %d", status.HostPort)
	}
	if !strings.Contains(status.RuntimeURL, "127.0.0.1:32771") {
		t.Errorf("expected RuntimeURL to embed introspected host port, got %s", status.RuntimeURL)
	}
}

// TASK-085 보강: docker run -d 가 즉시 return 해도 container 의 NetworkSettings.Ports
// 가 docker daemon 의 port binding 종료 시점까지 populate 되지 않을 수 있다. inspect 가
// 너무 빨리 호출되면 empty 응답 → hostPort=0 → healthcheck port 0 timeout. RunContainer
// 가 최대 5 회까지 retry 해서 port 가 보일 때까지 대기해야 한다.
func TestRunContainerCliModeInspectRetriesUntilPortAppears(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DOCKER_BUILD_MODE", "skeleton")
	t.Setenv("RUNNER_DOCKER_RUN_MODE", "cli")

	client := NewClient()

	// 처음 2 회는 empty 응답 (port binding 미완), 3 회째에 32776 응답.
	// retry loop 가 HostPort=32776 으로 확정하고 break 해야 한다.
	attemptCount := 0
	client.SetRunDockerInspectCmdForTest(func(ctx context.Context, args []string) (string, error) {
		attemptCount++
		if attemptCount < 3 {
			return "", nil
		}
		return "32776", nil
	})
	client.runContainerCmd = func(ctx context.Context, args ...string) error {
		return nil
	}

	status, err := client.RunContainer(context.Background(), ContainerRunOptions{
		ImageTag:        "img:tag",
		ContainerName:   "container-test-retry",
		HostPort:        0,
		InternalPort:    8080,
		HealthcheckPath: "/",
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if attemptCount != 3 {
		t.Errorf("expected 3 inspect attempts (2 empty + 1 success), got %d", attemptCount)
	}
	if status.HostPort != 32776 {
		t.Errorf("expected HostPort=32776 from inspect retry, got %d", status.HostPort)
	}
}

// TASK-085 보강: 모든 inspect 시도 (5 회) 가 empty 응답이면 hostPort 가 0 으로
// 남고 caller (WaitForHealth) 가 port 0 으로 healthcheck 시도해 timeout 으로
// fail 한다. 이는 caller 의 명시적 port (s.hostPortOverride) 또는 BuildService
// 의 port collision retry 정책으로 보강되어야 하지만, 현재의 silent fallback
// 동작을 회귀 가드로 박제 — silent 0 → 명확한 0.
func TestRunContainerCliModeInspectAllAttemptsEmptyLeavesHostPortZero(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DOCKER_BUILD_MODE", "skeleton")
	t.Setenv("RUNNER_DOCKER_RUN_MODE", "cli")

	client := NewClient()

	attemptCount := 0
	client.SetRunDockerInspectCmdForTest(func(ctx context.Context, args []string) (string, error) {
		attemptCount++
		return "", nil
	})
	client.runContainerCmd = func(ctx context.Context, args ...string) error {
		return nil
	}

	status, err := client.RunContainer(context.Background(), ContainerRunOptions{
		ImageTag:        "img:tag",
		ContainerName:   "container-test-empty",
		HostPort:        0,
		InternalPort:    8080,
		HealthcheckPath: "/",
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if attemptCount != 5 {
		t.Errorf("expected 5 inspect attempts (max retry), got %d", attemptCount)
	}
	if status.HostPort != 0 {
		t.Errorf("expected HostPort=0 after all retries failed, got %d", status.HostPort)
	}
	if !strings.Contains(status.RuntimeURL, ":0/") {
		t.Errorf("expected RuntimeURL to embed port=0 fallback, got %s", status.RuntimeURL)
	}
}
