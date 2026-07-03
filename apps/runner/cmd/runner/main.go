package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/config"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/worker"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg := config.Load()
	w := worker.New(cfg)

	if err := w.Run(ctx); err != nil {
		log.Fatalf("runner exited with error: %v", err)
	}
}
