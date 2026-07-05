package deploy

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestDeploy_WritesDeploymentArtifact(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DEPLOY_TARGET_TYPE", "DOCKER_REGISTRY")
	t.Setenv("RUNNER_DEPLOY_TARGET_REF", "registry.example.com/test-app")

	client := NewClient()
	result, err := client.Deploy(context.Background(), "build-1", DeployOptions{})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result.TargetType != "DOCKER_REGISTRY" {
		t.Fatalf("expected target type DOCKER_REGISTRY, got %s", result.TargetType)
	}
	if result.ResultRef != "registry.example.com/test-app:build-1" {
		t.Fatalf("unexpected resultRef: %s", result.ResultRef)
	}

	deployResultPath := filepath.Join(tmp, "build-1", "deploy-result.json")
	if _, err := os.Stat(deployResultPath); err != nil {
		t.Fatalf("expected deploy-result.json to exist: %v", err)
	}
}

func TestDeploy_SkeletonResponsePayloadShape(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DEPLOY_TARGET_REF", "registry.example.com/app")

	client := NewClient()
	result, err := client.Deploy(context.Background(), "build-skel", DeployOptions{})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result.ResponsePayloadJSON["deliveryMode"] != "POLLING" {
		t.Fatalf("expected deliveryMode POLLING, got %v", result.ResponsePayloadJSON["deliveryMode"])
	}
	if result.ResponsePayloadJSON["artifact"] != "registry.example.com/app:build-skel" {
		t.Fatalf("unexpected artifact: %v", result.ResponsePayloadJSON["artifact"])
	}
	// skeleton mode does NOT populate sourceImage — production callers
	// (BuildService.ProcessClaim) 가 cli mode 가 아닌 한 opts.SourceImage
	// 를 비워서 넘기므로 responsePayload 도 sourceImage 없음이 정합.
	if _, ok := result.ResponsePayloadJSON["sourceImage"]; ok {
		t.Fatalf("skeleton mode should not include sourceImage in responsePayload, got %v", result.ResponsePayloadJSON)
	}
}

func TestDeploy_EmptyBuildID_ReturnsError(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)

	client := NewClient()
	if _, err := client.Deploy(context.Background(), "", DeployOptions{}); err == nil {
		t.Fatal("expected error for empty buildID, got nil")
	}
}

func TestDeploy_CLIMode_TagAndPushArgs(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DEPLOY_MODE", "cli")
	t.Setenv("RUNNER_DEPLOY_TARGET_REF", "registry.example.com/test-app")
	t.Setenv("RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS", "60")

	var tagCalls [][]string
	var pushCalls [][]string
	client := NewClient()
	client.SetTagImageCmdForTest(func(ctx context.Context, args ...string) (string, error) {
		tagCalls = append(tagCalls, args)
		return "", nil
	})
	client.SetPushImageCmdForTest(func(ctx context.Context, args ...string) (string, error) {
		pushCalls = append(pushCalls, args)
		return "", nil
	})

	sourceImage := "docker-image-builder-system/cli:b-1"
	result, err := client.Deploy(context.Background(), "b-1", DeployOptions{SourceImage: sourceImage})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(tagCalls) != 1 {
		t.Fatalf("expected 1 docker tag call, got %d", len(tagCalls))
	}
	wantTag := []string{"tag", sourceImage, "registry.example.com/test-app:b-1"}
	if !equalStrings(tagCalls[0], wantTag) {
		t.Fatalf("unexpected tag args: got=%v want=%v", tagCalls[0], wantTag)
	}
	if len(pushCalls) != 1 {
		t.Fatalf("expected 1 docker push call, got %d", len(pushCalls))
	}
	wantPush := []string{"push", "registry.example.com/test-app:b-1"}
	if !equalStrings(pushCalls[0], wantPush) {
		t.Fatalf("unexpected push args: got=%v want=%v", pushCalls[0], wantPush)
	}
	if result.ResultRef != "registry.example.com/test-app:b-1" {
		t.Fatalf("unexpected resultRef: %s", result.ResultRef)
	}
	if result.ResponsePayloadJSON["sourceImage"] != sourceImage {
		t.Fatalf("expected sourceImage %q in responsePayload, got %v", sourceImage, result.ResponsePayloadJSON["sourceImage"])
	}

	// cli mode 성공 시에도 workspace 에 deploy-result.json 이 emit 되어야
	// 운영자가 빌드 디렉터리만 봐도 어떤 image 가 registry 에 들어갔는지
	// 추적 가능.
	deployResultPath := filepath.Join(tmp, "b-1", "deploy-result.json")
	if _, err := os.Stat(deployResultPath); err != nil {
		t.Fatalf("expected deploy-result.json after cli mode push: %v", err)
	}
}

func TestDeploy_CLIMode_SourceImageMissing_ReturnsError(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DEPLOY_MODE", "cli")

	client := NewClient()
	client.SetTagImageCmdForTest(func(ctx context.Context, args ...string) (string, error) {
		t.Fatal("docker tag should not be invoked when SourceImage is empty")
		return "", nil
	})
	client.SetPushImageCmdForTest(func(ctx context.Context, args ...string) (string, error) {
		t.Fatal("docker push should not be invoked when SourceImage is empty")
		return "", nil
	})

	_, err := client.Deploy(context.Background(), "b-1", DeployOptions{})
	if !errors.Is(err, ErrDeploySourceImageMissing) {
		t.Fatalf("expected ErrDeploySourceImageMissing, got %v", err)
	}
}

func TestDeploy_CLIMode_TagFail_PropagatesError(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DEPLOY_MODE", "cli")
	t.Setenv("RUNNER_DEPLOY_TARGET_REF", "registry.example.com/test-app")

	client := NewClient()
	client.SetTagImageCmdForTest(func(ctx context.Context, args ...string) (string, error) {
		return "", errors.New("tag failed: No such image")
	})
	client.SetPushImageCmdForTest(func(ctx context.Context, args ...string) (string, error) {
		t.Fatal("docker push should not be invoked when tag fails")
		return "", nil
	})

	_, err := client.Deploy(context.Background(), "b-1", DeployOptions{SourceImage: "missing-image:latest"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "docker tag") {
		t.Fatalf("expected error to mention docker tag, got: %v", err)
	}
	if !strings.Contains(err.Error(), "tag failed: No such image") {
		t.Fatalf("expected error to surface underlying stderr message, got: %v", err)
	}
}

func TestDeploy_CLIMode_PushFail_PropagatesError(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DEPLOY_MODE", "cli")
	t.Setenv("RUNNER_DEPLOY_TARGET_REF", "registry.example.com/test-app")

	client := NewClient()
	client.SetTagImageCmdForTest(func(ctx context.Context, args ...string) (string, error) {
		return "", nil
	})
	client.SetPushImageCmdForTest(func(ctx context.Context, args ...string) (string, error) {
		return "", errors.New("push failed: denied")
	})

	_, err := client.Deploy(context.Background(), "b-1", DeployOptions{SourceImage: "docker-image-builder-system/cli:b-1"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "docker push") {
		t.Fatalf("expected error to mention docker push, got: %v", err)
	}
	if !strings.Contains(err.Error(), "push failed: denied") {
		t.Fatalf("expected error to surface underlying stderr message, got: %v", err)
	}
}

func TestDeploy_CLIMode_PushTimeout_PropagatesContextDeadline(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("RUNNER_WORKSPACE_ROOT", tmp)
	t.Setenv("RUNNER_DEPLOY_MODE", "cli")
	t.Setenv("RUNNER_DEPLOY_TARGET_REF", "registry.example.com/test-app")
	// push timeout 1s + push 가 5s 멈춰있음 → context deadline 으로 끊김.
	t.Setenv("RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS", "1")

	client := NewClient()
	client.SetTagImageCmdForTest(func(ctx context.Context, args ...string) (string, error) {
		return "", nil
	})
	client.SetPushImageCmdForTest(func(ctx context.Context, args ...string) (string, error) {
		// ctx.Done() 을 살피면서 5s 대기. pushTimeout(1s) 이 먼저
		// 걸리도록 의도.
		select {
		case <-time.After(5 * time.Second):
			return "", errors.New("push took too long")
		case <-ctx.Done():
			return "", fmt.Errorf("push context done: %w", ctx.Err())
		}
	})

	start := time.Now()
	_, err := client.Deploy(context.Background(), "b-1", DeployOptions{SourceImage: "docker-image-builder-system/cli:b-1"})
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "docker push") {
		t.Fatalf("expected error to mention docker push, got: %v", err)
	}
	if elapsed > 3*time.Second {
		t.Fatalf("expected push to be cancelled by timeout within 3s, took %s", elapsed)
	}
}

func TestNewClient_DefaultsAndEnvOverrides(t *testing.T) {
	t.Setenv("RUNNER_DEPLOY_MODE", "")
	t.Setenv("RUNNER_DEPLOY_TARGET_TYPE", "")
	t.Setenv("RUNNER_DEPLOY_TARGET_REF", "")
	t.Setenv("RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS", "")
	t.Setenv("RUNNER_DOCKER_BIN", "")

	c := NewClient()
	if c.Mode() != "skeleton" {
		t.Fatalf("expected default mode skeleton, got %s", c.Mode())
	}
	if c.PushTimeout() != 120*time.Second {
		t.Fatalf("expected default push timeout 120s, got %s", c.PushTimeout())
	}

	t.Setenv("RUNNER_DEPLOY_MODE", "cli")
	t.Setenv("RUNNER_DEPLOY_TARGET_TYPE", "HTTP_API")
	t.Setenv("RUNNER_DEPLOY_TARGET_REF", "ghcr.io/foo/bar")
	t.Setenv("RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS", "30")
	c2 := NewClient()
	if c2.Mode() != "cli" {
		t.Fatalf("expected mode cli, got %s", c2.Mode())
	}
	if c2.targetType != "HTTP_API" {
		t.Fatalf("expected targetType HTTP_API, got %s", c2.targetType)
	}
	if c2.targetRef != "ghcr.io/foo/bar" {
		t.Fatalf("expected targetRef ghcr.io/foo/bar, got %s", c2.targetRef)
	}
	if c2.PushTimeout() != 30*time.Second {
		t.Fatalf("expected push timeout 30s, got %s", c2.PushTimeout())
	}
}

func TestNewClient_InvalidPushTimeout_FallsBackToDefault(t *testing.T) {
	t.Setenv("RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS", "not-a-number")

	c := NewClient()
	if c.PushTimeout() != defaultPushTimeout {
		t.Fatalf("expected default push timeout on invalid env, got %s", c.PushTimeout())
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}