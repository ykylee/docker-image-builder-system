package config

import (
	"os"
	"testing"
	"time"
)

// TASK-073 보강: RUNNER_REGISTRY_CONFIG_DIR env 가 Config.RegistryConfigDir
// 로 정확히 read 되는지 — default 가 빈 string 으로 (docker default
// `~/.docker/config.json` 가 그대로 사용됨) 잡혀야 한다.
func TestLoadRegistryConfigDirDefaultEmpty(t *testing.T) {
	// 다른 env 가 test 에 영향 안 주도록 cleanup.
	for _, k := range []string{
		"RUNNER_POLL_INTERVAL", "HOST_SERVER_BASE_URL", "RUNNER_ID",
		"RUNNER_REGISTRY_CONFIG_DIR",
	} {
		t.Setenv(k, "")
	}
	cfg := Load()
	if cfg.RegistryConfigDir != "" {
		t.Errorf("expected RegistryConfigDir to default to empty, got %q", cfg.RegistryConfigDir)
	}
}

func TestLoadRegistryConfigDirFromEnv(t *testing.T) {
	const want = "/secrets/registry"
	t.Setenv("RUNNER_REGISTRY_CONFIG_DIR", want)
	// 다른 env 가 test 에 영향 안 주도록 cleanup.
	t.Setenv("RUNNER_POLL_INTERVAL", "")
	t.Setenv("HOST_SERVER_BASE_URL", "")
	t.Setenv("RUNNER_ID", "")
	cfg := Load()
	if cfg.RegistryConfigDir != want {
		t.Errorf("expected RegistryConfigDir=%q, got %q", want, cfg.RegistryConfigDir)
	}
}

// TASK-073 보강: 다른 env var 들이 정상 parse 됨 + RUNNER_REGISTRY_CONFIG_DIR
// 동시 read — regression guard.
func TestLoadAllFieldsWithEnv(t *testing.T) {
	t.Setenv("RUNNER_POLL_INTERVAL", "10s")
	t.Setenv("HOST_SERVER_BASE_URL", "http://build-server:3000")
	t.Setenv("RUNNER_ID", "runner-test")
	t.Setenv("RUNNER_REGISTRY_CONFIG_DIR", "/secrets/registry")

	cfg := Load()
	if cfg.PollInterval != 10*time.Second {
		t.Errorf("expected PollInterval=10s, got %s", cfg.PollInterval)
	}
	if cfg.HostServerBaseURL != "http://build-server:3000" {
		t.Errorf("expected HostServerBaseURL=http://build-server:3000, got %q", cfg.HostServerBaseURL)
	}
	if cfg.RunnerID != "runner-test" {
		t.Errorf("expected RunnerID=runner-test, got %q", cfg.RunnerID)
	}
	if cfg.RegistryConfigDir != "/secrets/registry" {
		t.Errorf("expected RegistryConfigDir=/secrets/registry, got %q", cfg.RegistryConfigDir)
	}
}

// TASK-073 보강: RUNNER_POLL_INTERVAL 가 빈 문자열이면 default 5s 로
// 돌아가는 regression guard — config parse 시 env 가 빈 string 일 수 있는
// 경우를 처리하는 동작이 변경되지 않았음을 보장.
func TestLoadPollIntervalDefaults(t *testing.T) {
	t.Setenv("RUNNER_POLL_INTERVAL", "")
	cfg := Load()
	if cfg.PollInterval != 5*time.Second {
		t.Errorf("expected default PollInterval=5s, got %s", cfg.PollInterval)
	}
}

// RUNNER_POLL_INTERVAL 가 integer (초) 만 적어도 time.Duration 으로
// 인정되어야 한다 — shell 에서 `5` (단위 없이) 적는 사용성 회귀 방지.
func TestLoadPollIntervalAcceptsBareIntegerSeconds(t *testing.T) {
	t.Setenv("RUNNER_POLL_INTERVAL", "7")
	cfg := Load()
	if cfg.PollInterval != 7*time.Second {
		t.Errorf("expected PollInterval=7s, got %s", cfg.PollInterval)
	}
}

// os.Setenv 가 propagate 했을 때의 side effect sanity check — task
// 작성 시점에 `os.Setenv` 가 동일 process 내에서 효과 있다는 표준 동작만
// 확인. 실제 `cmd/runner/main.go` 는 `os.Setenv("DOCKER_CONFIG", ...)` 를
// 호출하지만 본 unit test 는 그 행동을 직접 검증하지 않는다 — runtime
// 동작은 e2e-registry-push.sh 가 검증.
func TestSetenvIsObservableWithinSameProcess(t *testing.T) {
	const k = "RUNNER_REGISTRY_CONFIG_DIR"
	t.Setenv(k, "/tmp/registry-test")
	if v := os.Getenv(k); v != "/tmp/registry-test" {
		t.Fatalf("setup: expected env to be set, got %q", v)
	}
}
