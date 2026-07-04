package worker

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/config"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/docker"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/hostclient"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/queue"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/services"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/source"
)

type Worker struct {
	config  config.Config
	claimer queue.Claimer
	svc     *services.BuildService
}

// New 는 production HTTPBuildControlClient 로 wiring. The
// `RUNNER_WORKSPACE_ROOT` env (already read by `docker.NewClient`)
// is reused by the source fetcher so the per-build source tree
// lives under the same root as the docker workspace.
func New(cfg config.Config) *Worker {
	client := hostclient.NewHTTPBuildControlClient(cfg.HostServerBaseURL, cfg.RunnerID)
	return newWorkerWithDeps(cfg, client)
}

// NewWithClient 는 testable wiring. BuildControlClient 를 주입한다.
func NewWithClient(cfg config.Config, client hostclient.BuildControlClient) *Worker {
	return newWorkerWithDeps(cfg, client)
}

// newWorkerWithDeps is the shared wiring path for both New and
// NewWithClient. Pulled out so the production and testable
// constructors differ only in how the BuildControlClient is
// obtained; the fetcher, docker client, and BuildService are
// identical.
func newWorkerWithDeps(cfg config.Config, client hostclient.BuildControlClient) *Worker {
	workspaceRoot := os.Getenv("RUNNER_WORKSPACE_ROOT")
	if workspaceRoot == "" {
		workspaceRoot = os.TempDir()
	}
	dockerClient := docker.NewClient()
	fetcher := source.NewFetcher(client, workspaceRoot)
	return &Worker{
		config:  cfg,
		claimer: queue.NewHostServerClaimer(client),
		svc:     services.NewBuildService(client, dockerClient, fetcher, cfg.RunnerID),
	}
}

func (w *Worker) Run(ctx context.Context) error {
	ticker := time.NewTicker(w.config.PollInterval)
	defer ticker.Stop()

	log.Printf("runner started: id=%s host=%s poll=%s", w.config.RunnerID, w.config.HostServerBaseURL, w.config.PollInterval)

	for {
		select {
		case <-ctx.Done():
			log.Println("runner shutting down")
			return nil
		case <-ticker.C:
			claim, err := w.claimer.ClaimNext(ctx)
			if err != nil {
				log.Printf("claim error: %v", err)
				continue
			}
			if claim == nil {
				continue
			}
			if err := w.svc.ProcessClaim(ctx, claim); err != nil {
				log.Printf("process claim error: buildID=%s err=%v", claim.BuildID, err)
			}
		}
	}
}
