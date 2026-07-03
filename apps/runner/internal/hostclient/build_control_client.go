package hostclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// BuildControlClient 는 Host Server 의 build control endpoint 들을 호출한다.
// - ClaimNextBuild: POST /builds/claim
// - ReportPhase: POST /builds/:buildId/phase
type BuildControlClient interface {
	ClaimNextBuild(ctx context.Context) (*ClaimedBuildResponse, error)
	ReportPhase(ctx context.Context, buildID, phase, runnerID string) error
	QueueTestDeployment(ctx context.Context, buildID string, req QueueTestDeploymentRequest) error
	ReportPreviewReady(ctx context.Context, buildID string, req PreviewReadyRequest) error
	ReportDeployment(ctx context.Context, buildID string, req DeploymentReportRequest) error
}

// ClaimedBuildResponse 는 Host Server POST /builds/claim 응답에서
// claimed=true 일 때만 사용. claimed=false (NO_BUILD_AVAILABLE / ACTIVE_BUILD_EXISTS)
// 일 때는 nil + error nil 로 표현.
type ClaimedBuildResponse struct {
	BuildID         string `json:"buildId"`
	AppName         string `json:"appName"`
	Status          string `json:"status"`
	Phase           string `json:"phase"`
	LifecycleStatus string `json:"lifecycleStatus"`
	UpdatedAt       string `json:"updatedAt"`
}

type claimResponseBody struct {
	Claimed bool                    `json:"claimed"`
	Build   *buildStatusResponseBody `json:"build"`
	// Reason is omitted from the wire when empty so the server-side zod
	// `z.enum([...]).nullable()` does not reject a successful no-op
	// (claimed=false) response with an empty reason string.
	Reason string `json:"reason,omitempty"`
}

// buildStatusResponseBody 는 Host Server BuildStatusResponse 의 한 단계 풀린 wrapper.
// 실제로는 { build: BuildSummary, lastError } 이므로 그 한 단계 더 풀어야 함.
type buildStatusResponseBody struct {
	Build     *buildSummaryBody `json:"build"`
	LastError any               `json:"lastError"`
}

type buildSummaryBody struct {
	BuildID         string `json:"buildId"`
	AppName         string `json:"appName"`
	Status          string `json:"status"`
	Phase           string `json:"phase"`
	LifecycleStatus string `json:"lifecycleStatus"`
	UpdatedAt       string `json:"updatedAt"`
}

type phaseRequestBody struct {
	Phase    string `json:"phase"`
	RunnerID string `json:"runnerId"`
}

// HTTPBuildControlClient 는 Host Server 와 HTTP 로 통신하는 client.
type HTTPBuildControlClient struct {
	baseURL string
	runnerID string
	http    *http.Client
}

func NewHTTPBuildControlClient(baseURL, runnerID string) *HTTPBuildControlClient {
	return &HTTPBuildControlClient{
		baseURL: baseURL,
		runnerID: runnerID,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *HTTPBuildControlClient) ClaimNextBuild(ctx context.Context) (*ClaimedBuildResponse, error) {
	body, _ := json.Marshal(map[string]any{"runnerId": c.runnerID})
	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/builds/claim", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("claim failed: status=%d body=%s", res.StatusCode, string(raw))
	}

	var resp claimResponseBody
	if err := json.NewDecoder(res.Body).Decode(&resp); err != nil {
		return nil, fmt.Errorf("claim: failed to decode response: %w", err)
	}

	if !resp.Claimed {
		// NO_BUILD_AVAILABLE / ACTIVE_BUILD_EXISTS 둘 다 nil 응답.
		return nil, nil
	}

	if resp.Build == nil || resp.Build.Build == nil {
		return nil, fmt.Errorf("claim: claimed=true but build is null")
	}
	inner := resp.Build.Build

	return &ClaimedBuildResponse{
		BuildID:         inner.BuildID,
		AppName:         inner.AppName,
		Status:          inner.Status,
		Phase:           inner.Phase,
		LifecycleStatus: inner.LifecycleStatus,
		UpdatedAt:       inner.UpdatedAt,
	}, nil
}

func (c *HTTPBuildControlClient) ReportPhase(ctx context.Context, buildID, phase, runnerID string) error {
	body, _ := json.Marshal(phaseRequestBody{Phase: phase, RunnerID: runnerID})
	url := fmt.Sprintf("%s/builds/%s/phase", c.baseURL, buildID)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusOK {
		return nil
	}

	raw, _ := io.ReadAll(res.Body)
	return fmt.Errorf("report phase failed: buildID=%s phase=%s status=%d body=%s", buildID, phase, res.StatusCode, string(raw))
}

// NoopBuildControlClient 는 테스트 / dry-run 용. 모든 호출이 no-op.
type NoopBuildControlClient struct {
	BaseURL string
}

func NewNoopBuildControlClient(baseURL string) *NoopBuildControlClient {
	return &NoopBuildControlClient{BaseURL: baseURL}
}

func (c *NoopBuildControlClient) ClaimNextBuild(context.Context) (*ClaimedBuildResponse, error) {
	return nil, nil
}

func (c *NoopBuildControlClient) ReportPhase(context.Context, string, string, string) error {
	return nil
}

func (c *NoopBuildControlClient) QueueTestDeployment(context.Context, string, QueueTestDeploymentRequest) error {
	return nil
}

func (c *NoopBuildControlClient) ReportPreviewReady(context.Context, string, PreviewReadyRequest) error {
	return nil
}

func (c *NoopBuildControlClient) ReportDeployment(context.Context, string, DeploymentReportRequest) error {
	return nil
}

// QueueTestDeployment: POST /builds/:buildId/preview
type QueueTestDeploymentRequest struct {
	InternalPort int    `json:"internalPort"`
	TtlMinutes   int    `json:"ttlMinutes"`
	RunnerID     string `json:"runnerId"`
}

func (c *HTTPBuildControlClient) QueueTestDeployment(ctx context.Context, buildID string, req QueueTestDeploymentRequest) error {
	body, _ := json.Marshal(req)
	url := fmt.Sprintf("%s/builds/%s/preview", c.baseURL, buildID)
	r, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	r.Header.Set("Content-Type", "application/json")

	res, err := c.http.Do(r)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusAccepted || res.StatusCode == http.StatusOK {
		return nil
	}
	raw, _ := io.ReadAll(res.Body)
	return fmt.Errorf("queue preview failed: buildID=%s status=%d body=%s", buildID, res.StatusCode, string(raw))
}

// ReportPreviewReady: POST /builds/:buildId/test-deployment/ready
type PreviewReadyRequest struct {
	PreviewURL            string `json:"previewUrl"`
	Host                  string `json:"host"`
	HostPort              int    `json:"hostPort"`
	ContainerRef          string `json:"containerRef,omitempty"`
	HealthCheckPassed     bool   `json:"healthCheckPassed"`
	PortOpen              bool   `json:"portOpen"`
	StabilityWindowPassed bool   `json:"stabilityWindowPassed"`
	RunnerID              string `json:"runnerId"`
}

type DeploymentReportRequest struct {
	Status              string         `json:"status"`
	TargetType          string         `json:"targetType"`
	TargetRef           string         `json:"targetRef,omitempty"`
	ResultRef           string         `json:"resultRef,omitempty"`
	ErrorCode           string         `json:"errorCode,omitempty"`
	ErrorMessage        string         `json:"errorMessage,omitempty"`
	RunnerID            string         `json:"runnerId"`
	ResponsePayloadJSON map[string]any `json:"responsePayloadJson,omitempty"`
}

func (c *HTTPBuildControlClient) ReportPreviewReady(ctx context.Context, buildID string, req PreviewReadyRequest) error {
	body, _ := json.Marshal(req)
	url := fmt.Sprintf("%s/builds/%s/test-deployment/ready", c.baseURL, buildID)
	r, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	r.Header.Set("Content-Type", "application/json")

	res, err := c.http.Do(r)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusOK {
		return nil
	}
	raw, _ := io.ReadAll(res.Body)
	return fmt.Errorf("report preview ready failed: buildID=%s status=%d body=%s", buildID, res.StatusCode, string(raw))
}

func (c *HTTPBuildControlClient) ReportDeployment(ctx context.Context, buildID string, req DeploymentReportRequest) error {
	body, _ := json.Marshal(req)
	url := fmt.Sprintf("%s/builds/%s/deployment", c.baseURL, buildID)
	r, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	r.Header.Set("Content-Type", "application/json")

	res, err := c.http.Do(r)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusOK {
		return nil
	}
	raw, _ := io.ReadAll(res.Body)
	return fmt.Errorf("report deployment failed: buildID=%s status=%d body=%s", buildID, res.StatusCode, string(raw))
}
