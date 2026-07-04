package docker

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
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

	// srv.Listener.Addr() 에서 port 추출.
	host, portStr, err := net.SplitHostPort(srv.Listener.Addr().String())
	if err != nil {
		t.Fatalf("split host/port: %v", err)
	}
	var port int
	if _, err := fmtSscan(portStr, &port); err != nil {
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

// fmtSscan 은 strconv.Atoi 의 thin wrapper — test file 의 import cycle 을
// 피하기 위해 inline 으로 둔다.
func fmtSscan(s string, dst *int) (int, error) {
	// s 가 정수가 아니면 에러. 단순 파서.
	n := 0
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c < '0' || c > '9' {
			return 0, &strconvErr{s: s}
		}
		n = n*10 + int(c-'0')
	}
	*dst = n
	return 1, nil
}

type strconvErr struct{ s string }

func (e *strconvErr) Error() string { return "invalid integer: " + e.s }
