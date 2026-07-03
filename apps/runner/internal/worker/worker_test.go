package worker

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/config"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/hostclient"
)

// tickerClient: claim 호출 시 *count++* 하고, 매번 다른 buildID 반환.
type tickerClient struct {
	mu      sync.Mutex
	count   int32
	phases  []string
	buildID string
}

func (c *tickerClient) ClaimNextBuild(ctx context.Context) (*hostclient.ClaimedBuildResponse, error) {
	n := atomic.AddInt32(&c.count, 1)
	if n == 1 {
		return &hostclient.ClaimedBuildResponse{BuildID: c.buildID, Phase: "QUEUE_CLAIMED", Status: "CLAIMED"}, nil
	}
	return nil, nil
}

func (c *tickerClient) ReportPhase(ctx context.Context, buildID, phase, runnerID string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.phases = append(c.phases, phase)
	return nil
}

func TestWorker_StopsOnContextCancel(t *testing.T) {
	fc := &tickerClient{buildID: "b-1"}
	cfg := config.Config{
		PollInterval:      50 * time.Millisecond,
		HostServerBaseURL: "http://test",
		RunnerID:          "r-1",
	}
	w := NewWithClient(cfg, fc)
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan error, 1)
	go func() { done <- w.Run(ctx) }()

	time.Sleep(180 * time.Millisecond)
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("expected nil on graceful stop, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("worker did not stop within 2s")
	}
	if atomic.LoadInt32(&fc.count) == 0 {
		t.Error("expected at least one claim tick")
	}
}

func TestWorker_HappyPath_PhasesReported(t *testing.T) {
	fc := &tickerClient{buildID: "b-7"}
	cfg := config.Config{
		PollInterval:      50 * time.Millisecond,
		HostServerBaseURL: "http://test",
		RunnerID:          "r-7",
	}
	w := NewWithClient(cfg, fc)
	ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
	defer cancel()

	_ = w.Run(ctx)

	fc.mu.Lock()
	defer fc.mu.Unlock()
	if len(fc.phases) == 0 {
		t.Fatal("expected phases to be reported")
	}
	wantFirst := "SOURCE_PREPARED"
	if fc.phases[0] != wantFirst {
		t.Errorf("expected first phase %s, got %s", wantFirst, fc.phases[0])
	}
}
