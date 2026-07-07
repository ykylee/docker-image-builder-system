package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	PollInterval      time.Duration
	HostServerBaseURL string
	RunnerID          string
	// TASK-073 보강: docker CLI 의 registry 인증 config dir. nil/empty 면
	// docker default (`~/.docker/config.json`) 를 그대로 사용 — cli mode
	// deploy 가 local daemon 만 사용하거나 insecure localhost registry
	// 환경에서 동작. private Docker Hub / ECR / GCR 인증이 필요할 때
	// 는 운영자가 directory 하나를 host 의 안전한 위치에 두고 그 path 를
	// env 로 주입 — 실제 secret 은 build-server / runner 이미지에 노출되지
	// 않는다. `Run` (worker.New 후) 에서 `os.Setenv("DOCKER_CONFIG", value)`
	// 로 propagate 되어 이후 모든 docker CLI invocation (`docker tag` /
	// `docker push`) 이 그 dir 의 config.json 을 사용한다.
	RegistryConfigDir string
}

func Load() Config {
	return Config{
		PollInterval:      parseDuration("RUNNER_POLL_INTERVAL", 5*time.Second),
		HostServerBaseURL: parseString("HOST_SERVER_BASE_URL", "http://127.0.0.1:3000"),
		RunnerID:          parseString("RUNNER_ID", "runner-default"),
		RegistryConfigDir: parseString("RUNNER_REGISTRY_CONFIG_DIR", ""),
	}
}

func parseString(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func parseDuration(key string, def time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	if d, err := time.ParseDuration(v); err == nil {
		return d
	}
	if n, err := strconv.Atoi(v); err == nil {
		return time.Duration(n) * time.Second
	}
	return def
}
