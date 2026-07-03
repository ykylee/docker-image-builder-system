package hostclient

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
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
					"buildId":         "b-1",
					"appName":         "todo-app",
					"status":          "CLAIMED",
					"phase":           "QUEUE_CLAIMED",
					"lifecycleStatus": "PREPARING_SOURCE",
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
	if resp.Phase != "QUEUE_CLAIMED" {
		t.Errorf("expected phase QUEUE_CLAIMED, got %s", resp.Phase)
	}
	if resp.AppName != "todo-app" {
		t.Errorf("expected appName todo-app, got %s", resp.AppName)
	}
	if resp.LifecycleStatus != "PREPARING_SOURCE" {
		t.Errorf("expected lifecycleStatus PREPARING_SOURCE, got %s", resp.LifecycleStatus)
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
		var body phaseRequestBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode body: %v", err)
		}
		if body.Phase != "DOCKER_BUILD_STARTED" {
			t.Errorf("expected phase DOCKER_BUILD_STARTED, got %s", body.Phase)
		}
		if body.RunnerID != "runner-1" {
			t.Errorf("expected runnerId runner-1, got %s", body.RunnerID)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"build":{"buildId":"b-42","phase":"DOCKER_BUILD_STARTED","status":"BUILDING"}}`))
	}))
	defer srv.Close()

	c := NewHTTPBuildControlClient(srv.URL, "runner-1")
	err := c.ReportPhase(context.Background(), "b-42", "DOCKER_BUILD_STARTED", "runner-1")
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
	err := c.ReportPhase(context.Background(), "b-1", "NOPE", "r")
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
	if err := c.ReportPhase(context.Background(), "b", "p", "r"); err != nil {
		t.Errorf("noop report should return nil, got %v", err)
	}
}

func TestHTTPBuildControlClient_QueueTestDeployment_OK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/builds/b-100/preview" {
			t.Errorf("expected path /builds/b-100/preview, got %s", r.URL.Path)
		}
		var body QueueTestDeploymentRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if body.InternalPort != 8080 {
			t.Errorf("expected internalPort 8080, got %d", body.InternalPort)
		}
		if body.TtlMinutes != 60 {
			t.Errorf("expected ttlMinutes 60, got %d", body.TtlMinutes)
		}
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"testDeployment":{"status":"QUEUED"}}`))
	}))
	defer srv.Close()

	c := NewHTTPBuildControlClient(srv.URL, "runner-1")
	err := c.QueueTestDeployment(context.Background(), "b-100", QueueTestDeploymentRequest{
		InternalPort: 8080,
		TtlMinutes:   60,
		RunnerID:     "r-1",
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
}

func TestHTTPBuildControlClient_ReportPreviewReady_OK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/builds/b-200/test-deployment/ready" {
			t.Errorf("expected path /builds/b-200/test-deployment/ready, got %s", r.URL.Path)
		}
		var body PreviewReadyRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if body.PreviewURL != "http://preview.local/x" {
			t.Errorf("expected previewUrl http://preview.local/x, got %s", body.PreviewURL)
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
		_, _ = w.Write([]byte(`{"build":{"buildId":"b-200","status":"TEST_READY","phase":"PREVIEW_READY","lifecycleStatus":"TEST_SUCCESS"}}`))
	}))
	defer srv.Close()

	c := NewHTTPBuildControlClient(srv.URL, "runner-1")
	err := c.ReportPreviewReady(context.Background(), "b-200", PreviewReadyRequest{
		PreviewURL:            "http://preview.local/x",
		Host:                  "preview.local",
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
		if body.Status != "SUCCESS" {
			t.Errorf("expected status SUCCESS, got %s", body.Status)
		}
		if body.TargetType != "DOCKER_REGISTRY" {
			t.Errorf("expected targetType DOCKER_REGISTRY, got %s", body.TargetType)
		}
		if body.ResultRef != "registry.example.com/test:build-1" {
			t.Errorf("unexpected resultRef: %s", body.ResultRef)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"build":{"buildId":"b-300","status":"DEPLOY_SUCCESS","phase":"DEPLOYMENT_COMPLETED","lifecycleStatus":"DEPLOY_SUCCESS"}}`))
	}))
	defer srv.Close()

	c := NewHTTPBuildControlClient(srv.URL, "runner-1")
	err := c.ReportDeployment(context.Background(), "b-300", DeploymentReportRequest{
		Status:     "SUCCESS",
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
