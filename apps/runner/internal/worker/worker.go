package worker

import (
	"context"
	"log"
	"os"
	"strings"
	"time"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/config"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/deploy"
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
	svc := services.NewBuildService(client, dockerClient, fetcher, cfg.RunnerID)

	// TASK-165 (P2-M5): k8s adapter 배선. cfg.K8sMode 가 설정된 경우에만
	// K8sDeployer 를 주입한다. "" 이면 미주입(기존 docker registry 배포만).
	// "k8s" = kubectl 실구현, "noop"/"skeleton" = noop. 지원하지 않는
	// mode 는 NewK8sDeployer 가 에러를 돌려주므로 로그만 남기고 미주입한다
	// (배포 자체가 optional 이라 runner 부팅을 막지 않는다).
	if cfg.K8sMode != "" {
		k8sDeployer, err := deploy.NewK8sDeployer(cfg.K8sMode, deploy.K8sDeployOptions{
			Cluster:               cfg.K8sCluster,
			Namespace:             cfg.K8sNamespace,
			Manifest:              cfg.K8sManifest,
			HelmChart:             cfg.HelmChart,
			HelmRelease:           cfg.HelmRelease,
			HelmValuesFile:        cfg.HelmValuesFile,
			HelmSetValues:         splitHelmSetValues(cfg.HelmSetValues),
			ArgoCDNamespace:       cfg.ArgoCDNamespace,
			ArgoCDProject:         cfg.ArgoCDProject,
			ArgoCDRepoURL:         cfg.ArgoCDRepoURL,
			ArgoCDPath:            cfg.ArgoCDPath,
			ArgoCDTargetRevision:  cfg.ArgoCDTargetRevision,
			ArgoCDDestinationHost: cfg.ArgoCDDestinationHost,
		})
		if err != nil {
			log.Printf("runner %s: k8s adapter 비활성 (mode=%q): %v", cfg.RunnerID, cfg.K8sMode, err)
		} else {
			svc = svc.WithK8sDeployer(k8sDeployer)
			log.Printf("runner %s: k8s adapter 활성 (mode=%q, namespace=%q)", cfg.RunnerID, cfg.K8sMode, cfg.K8sNamespace)
		}
	}

	return &Worker{
		config:  cfg,
		claimer: queue.NewHostServerClaimer(client),
		svc:     svc,
	}
}

func splitHelmSetValues(raw string) []string {
	var values []string
	for _, item := range strings.Split(raw, ",") {
		item = strings.TrimSpace(item)
		if item != "" {
			values = append(values, item)
		}
	}
	return values
}

// claimBackoff 는 연속 claim 실패에 대한 exponential backoff.
//
//	attempt 1: 1 × pollInterval
//	attempt 2: 2 × pollInterval
//	attempt 3: 4 × pollInterval
//	attempt 4: 8 × pollInterval
//	... capped at 5 min.
//
// claim 자체가 err 가 아니거나 claim 이 nil 인 경우는 정상 (server healthy
// / no builds available) — backoff 카운트 미증가.
//
// 일반 process claim 실패 (build 는 받았지만 실행 중 에러) 는 별개 —
// phase reporter 가 build server 에 FAILED 상태로 보고하므로 backoff 와
// 분리. process failure 가 누적되어도 poll 자체는 계속.
func (w *Worker) claimBackoff(consecutiveFailures int) time.Duration {
	if consecutiveFailures <= 0 {
		return 0
	}
	maxBackoff := 5 * time.Minute
	base := w.config.PollInterval
	d := base
	for i := 0; i < consecutiveFailures-1 && d < maxBackoff; i++ {
		d *= 2
	}
	if d > maxBackoff {
		d = maxBackoff
	}
	return d
}

func (w *Worker) Run(ctx context.Context) error {
	ticker := time.NewTicker(w.config.PollInterval)
	defer ticker.Stop()

	log.Printf("runner started: id=%s host=%s poll=%s", w.config.RunnerID, w.config.HostServerBaseURL, w.config.PollInterval)

	// consecutive claim *error* count. claim 이 nil 이면 reset, err 면
	// increment. process failure 는 별도.
	var consecutiveClaimErrors int
	// log suppression — 같은 에러의 반복 출력 rate limit (5초 throttle).
	var lastLogTime time.Time
	const logThrottle = 5 * time.Second

	for {
		select {
		case <-ctx.Done():
			log.Println("runner shutting down")
			return nil
		case <-ticker.C:
			claim, err := w.claimer.ClaimNext(ctx)
			if err != nil {
				consecutiveClaimErrors++
				backoff := w.claimBackoff(consecutiveClaimErrors)
				now := time.Now()
				if now.Sub(lastLogTime) >= logThrottle || consecutiveClaimErrors == 1 {
					log.Printf("claim error (failure=%d, backoff=%s): %v",
						consecutiveClaimErrors, backoff, err)
					lastLogTime = now
				}
				// backoff sleep — ctx cancel 시 즉시 종료.
				if backoff > 0 {
					select {
					case <-ctx.Done():
						return nil
					case <-time.After(backoff):
					}
				}
				continue
			}
			// claim 성공 (or 정상적으로 nil) — error count reset.
			if consecutiveClaimErrors > 0 {
				log.Printf("claim recovered after %d consecutive failures", consecutiveClaimErrors)
				consecutiveClaimErrors = 0
			}
			if claim == nil {
				continue
			}
			if err := w.svc.ProcessClaim(ctx, claim); err != nil {
				// process failure 는 build server 가 FAILED phase 로 보고받음.
				// poll loop 자체는 계속.
				log.Printf("process claim error: buildID=%s err=%v", claim.BuildID, err)
			}
		}
	}
}
