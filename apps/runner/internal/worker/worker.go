package worker

import (
	"context"
	"log"
	"time"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/config"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/docker"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/hostclient"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/queue"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/services"
)

type Worker struct {
	config  config.Config
	claimer queue.Claimer
	svc     *services.BuildService
}

// New 는 production HTTPBuildControlClient 로 wiring.
func New(cfg config.Config) *Worker {
	client := hostclient.NewHTTPBuildControlClient(cfg.HostServerBaseURL, cfg.RunnerID)
	return &Worker{
		config:  cfg,
		claimer: queue.NewHostServerClaimer(client),
		svc:     services.NewBuildService(client, docker.NewClient(), cfg.RunnerID),
	}
}

// NewWithClient 는 testable wiring. BuildControlClient 를 주입한다.
func NewWithClient(cfg config.Config, client hostclient.BuildControlClient) *Worker {
	return &Worker{
		config:  cfg,
		claimer: queue.NewHostServerClaimer(client),
		svc:     services.NewBuildService(client, docker.NewClient(), cfg.RunnerID),
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
