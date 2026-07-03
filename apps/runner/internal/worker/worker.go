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
	config   config.Config
	claimer  queue.Claimer
	services *services.BuildService
}

func New(cfg config.Config) *Worker {
	client := hostclient.NewNoopBuildControlClient(cfg.HostServerBaseURL)

	return &Worker{
		config:   cfg,
		claimer:  queue.NewHostServerClaimer(client),
		services: services.NewBuildService(client, docker.NewClient()),
	}
}

func (w *Worker) Run(ctx context.Context) error {
	ticker := time.NewTicker(w.config.PollInterval)
	defer ticker.Stop()

	log.Printf("runner started with poll interval %s", w.config.PollInterval)

	for {
		select {
		case <-ctx.Done():
			log.Println("runner shutting down")
			return nil
		case <-ticker.C:
			claim, err := w.claimer.ClaimNext(ctx)
			if err != nil {
				return err
			}

			if err := w.services.ProcessClaim(ctx, claim); err != nil {
				return err
			}
		}
	}
}
