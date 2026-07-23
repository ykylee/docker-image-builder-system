package worker

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/config"
	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/contract"
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
		return &hostclient.ClaimedBuildResponse{
			BuildID:         c.buildID,
			AppName:         "todo-app",
			Phase:           contract.PhaseQueueClaimed,
			Status:          contract.StatusPreparingSource,
			LifecycleStatus: contract.StatusPreparingSource,
		}, nil
	}
	return nil, nil
}

func (c *tickerClient) ReportPhase(ctx context.Context, buildID, phase, runnerID string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.phases = append(c.phases, phase)
	return nil
}

func (c *tickerClient) QueueTestDeployment(ctx context.Context, buildID string, req hostclient.QueueTestDeploymentRequest) error {
	return nil
}

func (c *tickerClient) ReportPreviewReady(ctx context.Context, buildID string, req hostclient.PreviewReadyRequest) error {
	return nil
}

func (c *tickerClient) ReportDeployment(ctx context.Context, buildID string, req hostclient.DeploymentReportRequest) error {
	return nil
}

// TASK-066: DownloadSource added to keep tickerClient
// compatible with the expanded BuildControlClient interface. The
// worker tests do not exercise the fetcher (the BuildService
// falls back to `PrepareSource` when `s.fetcher == nil`), so a
// no-op implementation is correct here.
func (c *tickerClient) DownloadSource(ctx context.Context, buildID string) ([]byte, string, int, error) {
	return nil, "", 0, nil
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

// TestWorker_ClaimBackoff_ExponentialWithCap 은 consecutive failure 에 대한
// backoff 가 exponential 로 증가하고 5분 cap 을 넘지 않는지 검증.
//
//	pollInterval = 1s 기준:
//	  failures=0 → 0
//	  failures=1 → 1s
//	  failures=2 → 2s
//	  failures=3 → 4s
//	  failures=10 → 5m (cap)
func TestWorker_ClaimBackoff_ExponentialWithCap(t *testing.T) {
	cfg := config.Config{
		PollInterval: 1 * time.Second,
	}
	w := &Worker{config: cfg}

	tests := []struct {
		failures int
		want     time.Duration
	}{
		{0, 0},
		{1, 1 * time.Second},
		{2, 2 * time.Second},
		{3, 4 * time.Second},
		{4, 8 * time.Second},
		{10, 5 * time.Minute}, // cap
		{100, 5 * time.Minute},
	}
	for _, tc := range tests {
		got := w.claimBackoff(tc.failures)
		if got != tc.want {
			t.Errorf("claimBackoff(%d) = %s, want %s", tc.failures, got, tc.want)
		}
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
