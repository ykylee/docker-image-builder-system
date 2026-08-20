package hostclient

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/contract"
)

func TestHTTPBuildControlClient_ClaimNextBuild_ClaimedTrue(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/builds/claim" || r.Method != "POST" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		raw, _ := io.ReadAll(r.Body)
		if string(raw) != `{"runnerId":"runner-1"}` {
			t.Errorf("expected runnerId payload, got %s", string(raw))
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"claimed": true,
			"build": map[string]any{
				"build": map[string]any{
					"buildId":        "b-1",
					"appName":        "todo-app",
					"status":         contract.StatusPreparingSource,
					"phase":          contract.PhaseQueueClaimed,
					"dockerfileMode": "auto",
					"artifactProfile": map[string]any{
						"version": 1, "ecosystem": "npm", "mode": "required",
						"factoryUrl": "https://factory.internal", "prefetchEnabled": true,
						"maxBuildRetries": 1,
					},
					"database": map[string]any{
						"enabled":          true,
						"migrationCommand": "npm run db:migrate",
					},
					"lifecycleStatus": contract.StatusPreparingSource,
					"updatedAt":       "2026-07-03T00:00:00Z",
				},
				"lastError": nil,
			},
			"reason": nil,
		})
	}))
	defer srv.Close()

	c := NewHTTPBuildControlClient(srv.URL, "runner-1")
	resp, err := c.ClaimNextBuild(context.Background())
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if resp == nil {
		t.Fatal("expected non-nil response on claimed=true")
	}
	if resp.BuildID != "b-1" {
		t.Errorf("expected buildId b-1, got %s", resp.BuildID)
	}
	if resp.Phase != contract.PhaseQueueClaimed {
		t.Errorf("expected phase QUEUE_CLAIMED, got %s", resp.Phase)
	}
	if resp.AppName != "todo-app" {
		t.Errorf("expected appName todo-app, got %s", resp.AppName)
	}
	if resp.LifecycleStatus != contract.StatusPreparingSource {
		t.Errorf("expected lifecycleStatus PREPARING_SOURCE, got %s", resp.LifecycleStatus)
	}
	if resp.DockerfileMode != "auto" {
		t.Errorf("expected dockerfileMode auto, got %s", resp.DockerfileMode)
	}
	if resp.Database == nil || resp.Database.MigrationCommand != "npm run db:migrate" {
		t.Errorf("expected database migration policy, got %+v", resp.Database)
	}
	if resp.ArtifactProfile == nil || resp.ArtifactProfile.Ecosystem != "npm" || !resp.ArtifactProfile.PrefetchEnabled {
		t.Errorf("expected artifact profile, got %+v", resp.ArtifactProfile)
	}
}

func TestHTTPBuildControlClient_SendsConfiguredBearerToken(t *testing.T) {
	const want = "signed-runner-token"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer "+want {
			t.Errorf("expected bearer token, got %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"claimed": false, "reason": "NO_BUILD_AVAILABLE"})
	}))
	defer srv.Close()

	c := NewHTTPBuildControlClient(srv.URL, "runner-1", "  "+want+"  ")
	if _, err := c.ClaimNextBuild(context.Background()); err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
}

func TestHTTPBuildControlClient_ClaimNextBuild_NoBuildAvailable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"claimed": false,
			"build":   nil,
			"reason":  "NO_BUILD_AVAILABLE",
		})
	}))
	defer srv.Close()

	c := NewHTTPBuildControlClient(srv.URL, "runner-1")
	resp, err := c.ClaimNextBuild(context.Background())
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if resp != nil {
		t.Errorf("expected nil response on NO_BUILD_AVAILABLE, got %+v", resp)
	}
}

func TestHTTPBuildControlClient_ReportPhase_OK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		expectedPath := "/builds/b-42/phase"
		if r.URL.Path != expectedPath {
			t.Errorf("expected path %s, got %s", expectedPath, r.URL.Path)
		}
		var body PhaseReport
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode body: %v", err)
		}
		if body.Phase != contract.PhaseDockerBuildStarted {
			t.Errorf("expected phase DOCKER_BUILD_STARTED, got %s", body.Phase)
		}
		if body.RunnerID != "runner-1" {
			t.Errorf("expected runnerId runner-1, got %s", body.RunnerID)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"build":{"buildId":"b-42","phase":contract.PhaseDockerBuildStarted,"status":"BUILDING"}}`))
	}))
	defer srv.Close()

	c := NewHTTPBuildControlClient(srv.URL, "runner-1")
	err := c.ReportPhase(context.Background(), "b-42", PhaseReport{Phase: contract.PhaseDockerBuildStarted, RunnerID: "runner-1"})
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
}

func TestHTTPBuildControlClient_ReportPhase_400(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"message":"Invalid phase"}`))
	}))
	defer srv.Close()

	c := NewHTTPBuildControlClient(srv.URL, "runner-1")
	err := c.ReportPhase(context.Background(), "b-1", PhaseReport{Phase: "NOPE", RunnerID: "r"})
	if err == nil {
		t.Fatal("expected error on 400, got nil")
	}
}

func TestNoopBuildControlClient(t *testing.T) {
	c := NewNoopBuildControlClient("http://x")
	resp, err := c.ClaimNextBuild(context.Background())
	if err != nil || resp != nil {
		t.Errorf("noop claim should return nil/nil, got resp=%v err=%v", resp, err)
	}
	if err := c.ReportPhase(context.Background(), "b", PhaseReport{Phase: "p", RunnerID: "r"}); err != nil {
		t.Errorf("noop report should return nil, got %v", err)
	}
}

func TestHTTPBuildControlClient_StartContainerTest_OK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/builds/b-100/container-test/start" {
			t.Errorf("expected path /builds/b-100/container-test/start, got %s", r.URL.Path)
		}
		var body StartContainerTestRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if body.InternalPort != 8080 {
			t.Errorf("expected internalPort 8080, got %d", body.InternalPort)
		}
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"build":{"buildId":"b-100"}}`))
	}))
	defer srv.Close()

	c := NewHTTPBuildControlClient(srv.URL, "runner-1")
	err := c.StartContainerTest(context.Background(), "b-100", StartContainerTestRequest{
		InternalPort: 8080,
		RunnerID:     "r-1",
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
}

func TestHTTPBuildControlClient_ReportContainerTestResult_OK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/builds/b-200/container-test/result" {
			t.Errorf("expected path /builds/b-200/container-test/result, got %s", r.URL.Path)
		}
		var body ContainerTestResultRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if body.Status != contract.ExecutionStatusSuccess {
			t.Errorf("expected status SUCCESS, got %s", body.Status)
		}
		if body.RuntimeURL != "http://127.0.0.1:38124/" {
			t.Errorf("expected runtimeUrl http://127.0.0.1:38124/, got %s", body.RuntimeURL)
		}
		if body.HostPort != 38124 {
			t.Errorf("expected hostPort 38124, got %d", body.HostPort)
		}
		if body.ContainerRef != "container-b-200" {
			t.Errorf("expected containerRef container-b-200, got %s", body.ContainerRef)
		}
		if !body.HealthCheckPassed || !body.PortOpen || !body.StabilityWindowPassed {
			t.Errorf("expected all test result booleans true, got %+v", body)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"build":{"buildId":"b-200","status":contract.StatusTestSuccess,"phase":contract.PhaseContainerTestPassed,"lifecycleStatus":contract.StatusTestSuccess}}`))
	}))
	defer srv.Close()

	c := NewHTTPBuildControlClient(srv.URL, "runner-1")
	err := c.ReportContainerTestResult(context.Background(), "b-200", ContainerTestResultRequest{
		Status:                contract.ExecutionStatusSuccess,
		RuntimeURL:            "http://127.0.0.1:38124/",
		Host:                  "127.0.0.1",
		HostPort:              38124,
		ContainerRef:          "container-b-200",
		HealthCheckPassed:     true,
		PortOpen:              true,
		StabilityWindowPassed: true,
		RunnerID:              "r-1",
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
}

func TestHTTPBuildControlClient_ReportDeployment_OK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/builds/b-300/deployment" {
			t.Errorf("expected path /builds/b-300/deployment, got %s", r.URL.Path)
		}
		var body DeploymentReportRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if body.Status != contract.ExecutionStatusSuccess {
			t.Errorf("expected status SUCCESS, got %s", body.Status)
		}
		if body.TargetType != "DOCKER_REGISTRY" {
			t.Errorf("expected targetType DOCKER_REGISTRY, got %s", body.TargetType)
		}
		if body.ResultRef != "registry.example.com/test:build-1" {
			t.Errorf("unexpected resultRef: %s", body.ResultRef)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"build":{"buildId":"b-300","status":contract.StatusDeploySuccess,"phase":contract.PhaseDeploymentCompleted,"lifecycleStatus":contract.StatusDeploySuccess}}`))
	}))
	defer srv.Close()

	c := NewHTTPBuildControlClient(srv.URL, "runner-1")
	err := c.ReportDeployment(context.Background(), "b-300", DeploymentReportRequest{
		Status:     contract.ExecutionStatusSuccess,
		TargetType: "DOCKER_REGISTRY",
		TargetRef:  "registry.example.com/test",
		ResultRef:  "registry.example.com/test:build-1",
		RunnerID:   "r-1",
		ResponsePayloadJSON: map[string]any{
			"deliveryMode": "POLLING",
		},
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
}

// TASK-066: DownloadSource returns the body bytes plus the
// X-Source-Checksum-Sha256 and X-Source-Size-Bytes response
// headers. The server side enforces both fields; this test
// verifies the client parses them and surfaces 4xx / 5xx as
// errors rather than silently returning empty bytes.
func TestHTTPBuildControlClient_DownloadSource_Success(t *testing.T) {
	body := []byte("hello source archive")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/builds/b-1/source" || r.Method != "GET" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Accept") != "application/octet-stream" {
			t.Errorf("expected Accept application/octet-stream, got %q", r.Header.Get("Accept"))
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("X-Source-Checksum-Sha256", "deadbeef")
		w.Header().Set("X-Source-Size-Bytes", "21")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}))
	defer srv.Close()

	c := NewHTTPBuildControlClient(srv.URL, "runner-1")
	got, checksum, size, err := c.DownloadSource(context.Background(), "b-1")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if string(got) != string(body) {
		t.Errorf("body mismatch: got=%q want=%q", string(got), string(body))
	}
	if checksum != "deadbeef" {
		t.Errorf("checksum: got=%q want=%q", checksum, "deadbeef")
	}
	if size != 21 {
		t.Errorf("size: got=%d want=%d", size, 21)
	}
}

func TestHTTPBuildControlClient_DownloadSource_NotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"message":"Source archive not found for build."}`))
	}))
	defer srv.Close()

	c := NewHTTPBuildControlClient(srv.URL, "runner-1")
	_, _, _, err := c.DownloadSource(context.Background(), "b-missing")
	if err == nil {
		t.Fatal("expected error for 404, got nil")
	}
}
