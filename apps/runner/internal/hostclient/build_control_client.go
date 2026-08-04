package hostclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

// BuildControlClient 는 Host Server 의 build control endpoint 들을 호출한다.
// - ClaimNextBuild: POST /builds/claim
// - ReportPhase: POST /builds/:buildId/phase
// - StartContainerTest: POST /builds/:buildId/container-test/start
// - ReportContainerTestResult: POST /builds/:buildId/container-test/result
// - ReportDeployment: POST /builds/:buildId/deployment
// - DownloadSource: GET /builds/:buildId/source (TASK-066)
type BuildControlClient interface {
	ClaimNextBuild(ctx context.Context) (*ClaimedBuildResponse, error)
	ReportPhase(ctx context.Context, buildID string, report PhaseReport) error
	StartContainerTest(ctx context.Context, buildID string, req StartContainerTestRequest) error
	ReportContainerTestResult(ctx context.Context, buildID string, req ContainerTestResultRequest) error
	ReportDeployment(ctx context.Context, buildID string, req DeploymentReportRequest) error
	// DownloadSource fetches the raw source archive bytes for `buildID`
	// (TASK-066). Returns the body bytes, the SHA-256 reported by the
	// server in the `X-Source-Checksum-Sha256` response header, and
	// the byte count from `X-Source-Size-Bytes`. The caller is
	// expected to verify the checksum against the bytes (or against
	// the build's `sourceArchive.checksumSha256` metadata) before
	// trusting the payload.
	DownloadSource(ctx context.Context, buildID string) ([]byte, string, int, error)
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
	// TASK-167 (P3-M2): 호스팅 입력. 서버가 build 생성 시 할당한 context path 와
	// 앱 컨테이너 포트. runner 가 k8s 배포(Ingress) 시 사용한다.
	ContextPath string `json:"contextPath"`
	RuntimePort int    `json:"runtimePort"`
	// TASK-169 (P3-M4): Ingress prefix strip 여부(기본 true).
	StripPrefix bool `json:"stripPrefix"`
	// TASK-172 (v0.5.0): 호스팅 URL 스킴(path|subdomain, 기본 path).
	HostingScheme        string           `json:"hostingScheme"`
	EffectiveTier        string           `json:"effectiveTier"`
	ServiceSize          string           `json:"serviceSize"`
	HostingPolicyVersion string           `json:"hostingPolicyVersion"`
	Resources            *ResourceProfile `json:"resources"`
	DockerfileMode       string           `json:"dockerfileMode"`
}

type ResourceProfile struct {
	CPURequest    string `json:"cpuRequest"`
	MemoryRequest string `json:"memoryRequest"`
	CPULimit      string `json:"cpuLimit"`
	MemoryLimit   string `json:"memoryLimit"`
	Replicas      int    `json:"replicas"`
}

type claimResponseBody struct {
	Claimed bool                     `json:"claimed"`
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
	BuildID              string           `json:"buildId"`
	AppName              string           `json:"appName"`
	Status               string           `json:"status"`
	Phase                string           `json:"phase"`
	LifecycleStatus      string           `json:"lifecycleStatus"`
	UpdatedAt            string           `json:"updatedAt"`
	ContextPath          string           `json:"contextPath"`
	RuntimePort          int              `json:"runtimePort"`
	StripPrefix          bool             `json:"stripPrefix"`
	HostingScheme        string           `json:"hostingScheme"`
	EffectiveTier        string           `json:"effectiveTier"`
	ServiceSize          string           `json:"serviceSize"`
	HostingPolicyVersion string           `json:"hostingPolicyVersion"`
	Resources            *ResourceProfile `json:"resources"`
	DockerfileMode       string           `json:"dockerfileMode"`
}

// PhaseReport 는 phase 보고 payload. TASK-162 (P2-M3) 에서 ErrorCode /
// ErrorMessage 를 추가했다 — 이전에는 채널 자체가 없어 runner 가 어느
// 단계에서 왜 실패했는지 호스트에 전달할 방법이 없었고, 그 결과 모든 실패
// 빌드의 `lastError` 가 null 이었다. FAILED 가 아닌 phase 에서는 두 필드가
// 비어 있고 `omitempty` 로 전송에서 빠진다.
type PhaseReport struct {
	Phase        string `json:"phase"`
	RunnerID     string `json:"runnerId"`
	ErrorCode    string `json:"errorCode,omitempty"`
	ErrorMessage string `json:"errorMessage,omitempty"`
}

// HTTPBuildControlClient 는 Host Server 와 HTTP 로 통신하는 client.
type HTTPBuildControlClient struct {
	baseURL  string
	runnerID string
	http     *http.Client
}

func NewHTTPBuildControlClient(baseURL, runnerID string) *HTTPBuildControlClient {
	return &HTTPBuildControlClient{
		baseURL:  baseURL,
		runnerID: runnerID,
		http:     &http.Client{Timeout: 10 * time.Second},
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
		BuildID:              inner.BuildID,
		AppName:              inner.AppName,
		Status:               inner.Status,
		Phase:                inner.Phase,
		LifecycleStatus:      inner.LifecycleStatus,
		UpdatedAt:            inner.UpdatedAt,
		ContextPath:          inner.ContextPath,
		RuntimePort:          inner.RuntimePort,
		StripPrefix:          inner.StripPrefix,
		HostingScheme:        inner.HostingScheme,
		EffectiveTier:        inner.EffectiveTier,
		ServiceSize:          inner.ServiceSize,
		HostingPolicyVersion: inner.HostingPolicyVersion,
		Resources:            inner.Resources,
		DockerfileMode:       inner.DockerfileMode,
	}, nil
}

func (c *HTTPBuildControlClient) ReportPhase(ctx context.Context, buildID string, report PhaseReport) error {
	body, _ := json.Marshal(report)
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
	return fmt.Errorf("report phase failed: buildID=%s phase=%s status=%d body=%s", buildID, report.Phase, res.StatusCode, string(raw))
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

func (c *NoopBuildControlClient) ReportPhase(context.Context, string, PhaseReport) error {
	return nil
}

func (c *NoopBuildControlClient) StartContainerTest(context.Context, string, StartContainerTestRequest) error {
	return nil
}

func (c *NoopBuildControlClient) ReportContainerTestResult(context.Context, string, ContainerTestResultRequest) error {
	return nil
}

func (c *NoopBuildControlClient) ReportDeployment(context.Context, string, DeploymentReportRequest) error {
	return nil
}

func (c *NoopBuildControlClient) DownloadSource(context.Context, string) ([]byte, string, int, error) {
	// Noop variant returns (nil, "", 0, nil) so callers that ignore the
	// archive can use the same plumbing as production. Production
	// callers check for an empty payload and treat it as "no archive
	// available" rather than as an error.
	return nil, "", 0, nil
}

// DownloadSource: GET /builds/:buildId/source (TASK-066).
//
// Returns the response body as a byte slice plus the
// `X-Source-Checksum-Sha256` and `X-Source-Size-Bytes` response
// header values. Errors are wrapped with the HTTP status and a
// truncated body excerpt so a CI log can correlate a download
// failure with a server-side error. The body is read with
// `io.ReadAll` so the entire archive is materialised in memory —
// the route is bounded by the build server's `bodyLimit` (256 MiB
// for the upload side) and the Runner has the same upper bound
// implicitly via the size header.
func (c *HTTPBuildControlClient) DownloadSource(ctx context.Context, buildID string) ([]byte, string, int, error) {
	url := fmt.Sprintf("%s/builds/%s/source", c.baseURL, buildID)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, "", 0, err
	}
	req.Header.Set("Accept", "application/octet-stream")

	res, err := c.http.Do(req)
	if err != nil {
		return nil, "", 0, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(res.Body)
		return nil, "", 0, fmt.Errorf("download source failed: buildID=%s status=%d body=%s", buildID, res.StatusCode, string(raw))
	}

	checksum := res.Header.Get("X-Source-Checksum-Sha256")
	sizeHeader := res.Header.Get("X-Source-Size-Bytes")
	size, err := strconv.Atoi(sizeHeader)
	if err != nil {
		return nil, "", 0, fmt.Errorf("download source: invalid X-Source-Size-Bytes header %q: %w", sizeHeader, err)
	}

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, "", 0, fmt.Errorf("download source: read body: %w", err)
	}
	return body, checksum, size, nil
}

// StartContainerTest: POST /builds/:buildId/container-test/start
// TASK-161 (P2-M2): 구 `QueueTestDeployment` (POST /builds/:buildId/preview).
// preview-era 의 `ttlMinutes` 는 계약에서 제거됐다 — 테스트 컨테이너의 수명은
// runner 가 결과 보고 시점에 직접 정리한다.
type StartContainerTestRequest struct {
	InternalPort int    `json:"internalPort"`
	RunnerID     string `json:"runnerId"`
}

func (c *HTTPBuildControlClient) StartContainerTest(ctx context.Context, buildID string, req StartContainerTestRequest) error {
	body, _ := json.Marshal(req)
	url := fmt.Sprintf("%s/builds/%s/container-test/start", c.baseURL, buildID)
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
	return fmt.Errorf("start container test failed: buildID=%s status=%d body=%s", buildID, res.StatusCode, string(raw))
}

// ReportContainerTestResult: POST /builds/:buildId/container-test/result
// TASK-161 (P2-M2): 구 `ReportPreviewReady` (POST .../test-deployment/ready).
// 호스트가 ready/status 두 엔드포인트를 하나로 흡수했으므로 상태를
// canonical ExecutionStatus ("IN_PROGRESS" / "SUCCESS" / "FAILED") 로 실어
// 보낸다.
type ContainerTestResultRequest struct {
	Status string `json:"status"`
	// TASK-162: 실패 보고에는 런타임 정보가 없다. 계약이 runtimeUrl 에
	// `.url()`, host 에 `.min(1)` 을 걸어두어 빈 문자열을 보내면 400 이
	// 되므로 두 필드는 반드시 omitempty 여야 한다.
	RuntimeURL            string `json:"runtimeUrl,omitempty"`
	Host                  string `json:"host,omitempty"`
	HostPort              int    `json:"hostPort"`
	ContainerRef          string `json:"containerRef,omitempty"`
	HealthCheckPassed     bool   `json:"healthCheckPassed"`
	PortOpen              bool   `json:"portOpen"`
	StabilityWindowPassed bool   `json:"stabilityWindowPassed"`
	// TASK-162: status=FAILED 일 때의 실패 이유.
	ErrorCode    string `json:"errorCode,omitempty"`
	ErrorMessage string `json:"errorMessage,omitempty"`
	RunnerID     string `json:"runnerId"`
}

type DeploymentReportRequest struct {
	Status       string `json:"status"`
	TargetType   string `json:"targetType"`
	TargetRef    string `json:"targetRef,omitempty"`
	ResultRef    string `json:"resultRef,omitempty"`
	ErrorCode    string `json:"errorCode,omitempty"`
	ErrorMessage string `json:"errorMessage,omitempty"`
	// TASK-167 (P3-M2): 호스팅 좌표. 배포 성공 시 build-server 가 이 값으로
	// HostedService 를 upsert 한다(§9-2).
	ContextPath         string         `json:"contextPath,omitempty"`
	Namespace           string         `json:"namespace,omitempty"`
	DeploymentName      string         `json:"deploymentName,omitempty"`
	RunnerID            string         `json:"runnerId"`
	ResponsePayloadJSON map[string]any `json:"responsePayloadJson,omitempty"`
}

func (c *HTTPBuildControlClient) ReportContainerTestResult(ctx context.Context, buildID string, req ContainerTestResultRequest) error {
	body, _ := json.Marshal(req)
	url := fmt.Sprintf("%s/builds/%s/container-test/result", c.baseURL, buildID)
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
	return fmt.Errorf("report container test result failed: buildID=%s status=%d body=%s", buildID, res.StatusCode, string(raw))
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
