package deploy

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	defaultTargetType = "DOCKER_REGISTRY"
	defaultTargetRef  = "registry.example.com/docker-image-builder-system"
	defaultMode       = "skeleton"
	defaultDockerBin  = "docker"
	defaultPushTimeout = 120 * time.Second
)

// DeployOptions 는 Deploy 가 받아들이는 입력. SourceImage 는 local
// docker daemon 에 이미 존재하는 image tag (BuildImage 가 만든
// docker-image-builder-system/<buildMode>:<buildID> 형태) 다. cli
// mode 에선 이 image 를 targetRef:buildID 로 retag 한 뒤 push.
// skeleton mode 에선 SourceImage 는 무시되고 기존 동작 (deploy-result.json
// emit) 만 수행되므로 호출자가 image build 결과를 신경쓰지 않아도
// 된다.
type DeployOptions struct {
	SourceImage string
}

// Client 는 외부 deploy target 으의 adapter. 현재는 단일 target type
// (DOCKER_REGISTRY) 의 skeleton + cli 두 mode 를 지원한다. skeleton
// mode 는 기존처럼 deploy-result.json 만 workspace 에 emit 하고 실제
// 외부 호출은 없다 — test / dry-run 용. cli mode 는 docker tag + push
// 로 local image 를 targetRef:buildID 로 registry 에 올린다.
type Client struct {
	workspaceRoot string
	targetType    string
	targetRef     string
	mode          string
	dockerBin     string
	pushTimeout   time.Duration
	now           func() time.Time
	// tagImageCmd / pushImageCmd 는 cli mode 의 docker invocation 을
	// 갈아끼울 수 있게 한다. default 는 exec.CommandContext(dockerBin,
	// ...). tests 에서 fake command runner 로 교체해 docker daemon
	// 없이도 검증한다.
	tagImageCmd  func(ctx context.Context, args ...string) (string, error)
	pushImageCmd func(ctx context.Context, args ...string) (string, error)
}

type Result struct {
	TargetType          string
	TargetRef           string
	ResultRef           string
	ResponsePayloadJSON map[string]any
}

// ErrDeploySourceImageMissing 은 cli mode 에서 SourceImage 가 비어
// 있을 때 반환된다. BuildService.ProcessClaim 은 containerStatus.ImageTag
// 를 항상 채우므로 production 경로에선 발생하지 않지만, ad-hoc caller
// / test 가 빈 값을 흘릴 때 silent fallback 대신 명시적 에러로 표면화.
var ErrDeploySourceImageMissing = errors.New("deploy: SourceImage is required in cli mode")

func NewClient() *Client {
	workspaceRoot := os.Getenv("RUNNER_WORKSPACE_ROOT")
	if workspaceRoot == "" {
		workspaceRoot = filepath.Join(os.TempDir(), "docker-image-builder-runner")
	}

	targetType := os.Getenv("RUNNER_DEPLOY_TARGET_TYPE")
	if targetType == "" {
		targetType = defaultTargetType
	}

	targetRef := os.Getenv("RUNNER_DEPLOY_TARGET_REF")
	if targetRef == "" {
		targetRef = defaultTargetRef
	}

	mode := os.Getenv("RUNNER_DEPLOY_MODE")
	if mode == "" {
		mode = defaultMode
	}

	dockerBin := os.Getenv("RUNNER_DOCKER_BIN")
	if dockerBin == "" {
		dockerBin = defaultDockerBin
	}

	pushTimeout := defaultPushTimeout
	if v := os.Getenv("RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS"); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil && n > 0 {
			pushTimeout = time.Duration(n) * time.Second
		}
	}

	c := &Client{
		workspaceRoot: workspaceRoot,
		targetType:    targetType,
		targetRef:     targetRef,
		mode:          mode,
		dockerBin:     dockerBin,
		pushTimeout:   pushTimeout,
		now:           time.Now,
	}
	c.tagImageCmd = c.defaultTagImageCmd
	c.pushImageCmd = c.defaultPushImageCmd
	return c
}

// Mode 는 현재 deploy mode (`skeleton` / `cli`) 를 돌려준다. test 와
// ProcessClaim 의 조건부 분기에서 사용.
func (c *Client) Mode() string {
	return c.mode
}

// PushTimeout 는 cli mode 의 `docker push` timeout. test 가 shorter
// 값으로 단축 검증할 때 사용.
func (c *Client) PushTimeout() time.Duration {
	return c.pushTimeout
}

// WorkspaceDir 는 per-build workspace 경로. deploy-result.json 이
// emit 되는 위치와 같다.
func (c *Client) WorkspaceDir(buildID string) string {
	return filepath.Join(c.workspaceRoot, buildID)
}

// Deploy 는 buildID 에 대한 외부 deploy 단계를 수행한다.
//
// skeleton mode (default) 는 기존 동작 — workspace/<buildID>/deploy-result.json
// 을 emit 하고 Result{TargetType, TargetRef, ResultRef=<targetRef>:<buildID>}
// 를 돌려준다. responsePayload 에는 deliveryMode=POLLING, artifact=
// ResultRef 가 들어간다.
//
// cli mode 는 local SourceImage 를 targetRef:buildID 로 retag 한 뒤
// `docker push` 로 registry 에 올린다. push 가 성공하면 Result.ResultRef
// = targetRef:buildID 그대로, responsePayload 에는 deliveryMode +
// artifact + sourceImage 가 들어간다. docker tag / push 가 non-zero
// exit 으로 끝나면 그 단계의 stderr 를 error 에 포함해서 caller 가
// RunReportDeployment 의 errorMessage 로 그대로 노출한다. timeout
// 은 c.pushTimeout (default 120s, RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS
// override).
func (c *Client) Deploy(ctx context.Context, buildID string, opts DeployOptions) (*Result, error) {
	if buildID == "" {
		return nil, errors.New("deploy: buildID is required")
	}

	resultRef := fmt.Sprintf("%s:%s", c.targetRef, buildID)

	if c.mode != "cli" {
		return c.emitSkeleton(ctx, buildID, resultRef)
	}

	if opts.SourceImage == "" {
		return nil, ErrDeploySourceImageMissing
	}

	if err := c.runTag(ctx, opts.SourceImage, resultRef); err != nil {
		return nil, fmt.Errorf("deploy: docker tag %s -> %s failed: %w", opts.SourceImage, resultRef, err)
	}

	if err := c.runPush(ctx, resultRef); err != nil {
		return nil, fmt.Errorf("deploy: docker push %s failed: %w", resultRef, err)
	}

	if err := c.writeDeployResult(ctx, buildID, resultRef, opts.SourceImage, "POLLING"); err != nil {
		return nil, err
	}

	return &Result{
		TargetType: c.targetType,
		TargetRef:  c.targetRef,
		ResultRef:  resultRef,
		ResponsePayloadJSON: map[string]any{
			"deliveryMode": "POLLING",
			"artifact":     resultRef,
			"sourceImage":  opts.SourceImage,
			"deployedAt":   c.now().UTC().Format(time.RFC3339),
		},
	}, nil
}

func (c *Client) emitSkeleton(_ context.Context, buildID, resultRef string) (*Result, error) {
	workspaceDir := c.WorkspaceDir(buildID)
	if err := os.MkdirAll(workspaceDir, 0o755); err != nil {
		return nil, fmt.Errorf("deploy: mkdir %s: %w", workspaceDir, err)
	}

	payload := map[string]any{
		"buildId":      buildID,
		"deployedAt":   c.now().UTC().Format(time.RFC3339),
		"targetType":   c.targetType,
		"targetRef":    c.targetRef,
		"resultRef":    resultRef,
		"deliveryMode": "POLLING",
	}

	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("deploy: marshal payload: %w", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceDir, "deploy-result.json"), raw, 0o644); err != nil {
		return nil, fmt.Errorf("deploy: write deploy result: %w", err)
	}

	return &Result{
		TargetType: c.targetType,
		TargetRef:  c.targetRef,
		ResultRef:  resultRef,
		ResponsePayloadJSON: map[string]any{
			"deliveryMode": "POLLING",
			"artifact":     resultRef,
		},
	}, nil
}

// writeDeployResult 는 cli mode 가 성공한 뒤에도 workspace 에
// deploy-result.json 을 남긴다 — 운영자가 빌드 디렉터리만 봐도
// 어떤 image 가 registry 에 들어갔는지 추적 가능하도록. skeleton
// mode 의 emitSkeleton 과 같은 path.
func (c *Client) writeDeployResult(_ context.Context, buildID, resultRef, sourceImage, deliveryMode string) error {
	workspaceDir := c.WorkspaceDir(buildID)
	if err := os.MkdirAll(workspaceDir, 0o755); err != nil {
		return fmt.Errorf("deploy: mkdir %s: %w", workspaceDir, err)
	}

	payload := map[string]any{
		"buildId":      buildID,
		"deployedAt":   c.now().UTC().Format(time.RFC3339),
		"targetType":   c.targetType,
		"targetRef":    c.targetRef,
		"resultRef":    resultRef,
		"sourceImage":  sourceImage,
		"deliveryMode": deliveryMode,
	}

	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("deploy: marshal payload: %w", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceDir, "deploy-result.json"), raw, 0o644); err != nil {
		return fmt.Errorf("deploy: write deploy result: %w", err)
	}
	return nil
}

// runWithTimeout 는 cli mode 의 docker invocation (tag / push / future
// steps) 을 동일 pushTimeout 으로 강제 종료한다. v1 (TASK-068) 에서는
// push 단계에만 context.WithTimeout 을 걸었는데 (moby #35407 의 docker
// push stderr 진행률 + 1 retry 후 죽은 image 정리 의도), tag 단계는
// caller ctx 그대로라 registry 가 죽었을 때 docker tag 가 무한히 block
// 되는 운영 사고가 가능했다. TASK-071a 에서 tag 단계에도 같은 timeout
// 을 묶어 deploy 의 docker invocation 단계 전체가 동일 budget 으로
// 강제 종료되도록 한다.
func (c *Client) runWithTimeout(parentCtx context.Context, fn func(ctx context.Context, args ...string) (string, error), args ...string) error {
	timeoutCtx, cancel := context.WithTimeout(parentCtx, c.pushTimeout)
	defer cancel()
	_, err := fn(timeoutCtx, args...)
	return err
}

// runTag 는 docker tag 단계를 pushTimeout 안에서 수행한다. registry 가
// 죽어서 docker daemon 이 응답하지 않을 때 caller ctx 가 길게 잡혀있다면
// pushTimeout (default 120s, RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS 으로
// override) 안에서 끊긴다.
func (c *Client) runTag(ctx context.Context, sourceImage, targetRef string) error {
	return c.runWithTimeout(ctx, c.tagImageCmd, "tag", sourceImage, targetRef)
}

// runPush 는 docker push 단계에 pushTimeout 을 걸어 moby #35407 의
// stderr 진행률 출력 중에도 호출자가 정한 budget 안에서 끝낸다.
func (c *Client) runPush(ctx context.Context, targetRef string) error {
	return c.runWithTimeout(ctx, c.pushImageCmd, "push", targetRef)
}

// defaultTagImageCmd 는 exec.CommandContext 로 docker tag 를 호출한다.
// docker tag 는 진행률 출력이 거의 없어 stdout 을 부모 process 로 흘려
// 운영자가 docker daemon 의 응답을 실시간으로 본다. stderr 는 부모
// process 로 흘려보내면서 동시에 캡쳐해서 non-zero exit 시 caller 가
// errorMessage 로 노출할 수 있도록 한다 (docker 가 TLS / auth error 를
// stderr 로 내보내는 운영 케이스 보존).
func (c *Client) defaultTagImageCmd(ctx context.Context, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, c.dockerBin, args...)
	var stderr bytes.Buffer
	cmd.Stdout = os.Stdout
	cmd.Stderr = io.MultiWriter(os.Stderr, &stderr)
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%w (stderr=%s)", err, strings.TrimSpace(stderr.String()))
	}
	return "", nil
}

// defaultPushImageCmd 는 exec.CommandContext 로 docker push 를 호출한다.
// docker push 는 layer upload 진행률을 stderr 로 출력한다 — 운영자가
// `e2e-deploy-push.sh` 같은 live smoke 를 돌릴 때 실시간으로 push
// 진행률을 볼 수 있도록 stderr 를 부모 process 로 흘려보낸다 (TASK-067
// 의 defaultRunContainerCmd 패턴과 정합). 동시에 캡쳐해서 non-zero
// exit 시 caller 의 errorMessage 로 노출한다.
func (c *Client) defaultPushImageCmd(ctx context.Context, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, c.dockerBin, args...)
	var stderr bytes.Buffer
	cmd.Stdout = os.Stdout
	cmd.Stderr = io.MultiWriter(os.Stderr, &stderr)
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%w (stderr=%s)", err, strings.TrimSpace(stderr.String()))
	}
	return "", nil
}

// SetTagImageCmdForTest 는 cli mode 의 docker tag 호출을 가로채기 위한
// seam. production 코드에서는 호출하지 말 것 — 항상
// `defaultTagImageCmd` 가 설정된 채 NewClient 로 들어온다.
func (c *Client) SetTagImageCmdForTest(fn func(ctx context.Context, args ...string) (string, error)) {
	c.tagImageCmd = fn
}

// SetPushImageCmdForTest 는 cli mode 의 docker push 호출을 가로채기
// 위한 seam.
func (c *Client) SetPushImageCmdForTest(fn func(ctx context.Context, args ...string) (string, error)) {
	c.pushImageCmd = fn
}

// SetNowForTest 는 deploy-result.json 의 deployedAt 시각 기준을
// 고정한다. test 의 결과 비교에서 time.Now 의 변동을 제거.
func (c *Client) SetNowForTest(now func() time.Time) {
	c.now = now
}
