package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/config"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/worker"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("runner configuration invalid: %v", err)
	}

	// TASK-073 보강: docker CLI 의 registry 인증 config dir 를
	// `RUNNER_REGISTRY_CONFIG_DIR` env 로 주입 가능. nil/empty 면 docker
	// default (`~/.docker/config.json`) 그대로 사용. cli mode 의 `docker
	// tag` / `docker push` 가 `DOCKER_CONFIG` env 를 inherit 해서 사용.
	// operator 가 host 의 안전한 위치 (e.g. `/secrets/registry/`) 에 미리
	// `config.json` 을 두고 runner container 에 volume mount 한 뒤
	// `RUNNER_REGISTRY_CONFIG_DIR=/secrets/registry` 로 주입.
	if cfg.RegistryConfigDir != "" {
		if err := os.Setenv("DOCKER_CONFIG", cfg.RegistryConfigDir); err != nil {
			log.Fatalf("runner: failed to export DOCKER_CONFIG=%s: %v", cfg.RegistryConfigDir, err)
		}
		log.Printf("runner: DOCKER_CONFIG=%s exported (private registry auth)", cfg.RegistryConfigDir)
	}

	w := worker.New(cfg)

	if err := w.Run(ctx); err != nil {
		log.Fatalf("runner exited with error: %v", err)
	}
}
