package deploy

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// recordingRunner 는 kubectl 호출을 기록하는 테스트 seam.
type recordedCall struct {
	stdin string
	args  []string
}

func newRecordingDeployer(seed K8sDeployOptions) (*kubectlDeployer, *[]recordedCall) {
	d := newKubectlDeployer(seed)
	calls := &[]recordedCall{}
	d.runCmd = func(_ context.Context, stdin string, args ...string) (string, error) {
		*calls = append(*calls, recordedCall{stdin: stdin, args: args})
		return "", nil
	}
	return d, calls
}

func TestNewK8sDeployer_K8sMode_ReturnsKubectl(t *testing.T) {
	d, err := NewK8sDeployer("k8s", K8sDeployOptions{})
	if err != nil {
		t.Fatalf("NewK8sDeployer(k8s): %v", err)
	}
	if _, ok := d.(*kubectlDeployer); !ok {
		t.Errorf("expected *kubectlDeployer for mode k8s, got %T", d)
	}
}

func TestKubectlDeploy_AppliesManifestAndWaitsRollout(t *testing.T) {
	d, calls := newRecordingDeployer(K8sDeployOptions{Namespace: "builds"})
	res, err := d.Deploy(context.Background(), K8sDeployOptions{
		SourceImage: "docker-image-builder-system/cli:b-1",
		Namespace:   "builds",
		BuildID:     "b-1",
	})
	if err != nil {
		t.Fatalf("Deploy: %v", err)
	}

	if len(*calls) != 2 {
		t.Fatalf("expected 2 kubectl calls (apply + rollout), got %d", len(*calls))
	}
	apply := (*calls)[0]
	if !containsArg(apply.args, "apply") || !containsArg(apply.args, "-f") || !containsArg(apply.args, "-") {
		t.Errorf("apply args = %v, want `apply -f -`", apply.args)
	}
	// manifest 가 stdin 으로 흐르고 image + deployment 이름을 포함
	if !strings.Contains(apply.stdin, "docker-image-builder-system/cli:b-1") {
		t.Errorf("manifest missing image:\n%s", apply.stdin)
	}
	if !strings.Contains(apply.stdin, "name: dib-b-1") {
		t.Errorf("manifest missing deployment name dib-b-1:\n%s", apply.stdin)
	}
	if !strings.Contains(apply.stdin, "imagePullPolicy: IfNotPresent") {
		t.Errorf("manifest should use IfNotPresent for local(kind) image:\n%s", apply.stdin)
	}

	rollout := (*calls)[1]
	if !containsArg(rollout.args, "rollout") || !containsArg(rollout.args, "deployment/dib-b-1") {
		t.Errorf("rollout args = %v, want rollout status deployment/dib-b-1", rollout.args)
	}

	if res.TargetType != "K8S" {
		t.Errorf("TargetType = %s, want K8S", res.TargetType)
	}
	if res.ResultRef != "deployment/dib-b-1" {
		t.Errorf("ResultRef = %s, want deployment/dib-b-1", res.ResultRef)
	}
	if res.Namespace != "builds" {
		t.Errorf("Namespace = %s, want builds", res.Namespace)
	}
	if res.DeploymentID != "dib-b-1" {
		t.Errorf("DeploymentID = %s, want dib-b-1", res.DeploymentID)
	}
}

func TestKubectlDeploy_WithClusterAddsContext(t *testing.T) {
	d, calls := newRecordingDeployer(K8sDeployOptions{})
	_, err := d.Deploy(context.Background(), K8sDeployOptions{
		SourceImage: "img:1",
		Cluster:     "kind-dib",
		BuildID:     "b-2",
	})
	if err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	apply := (*calls)[0]
	if !containsArg(apply.args, "--context") || !containsArg(apply.args, "kind-dib") {
		t.Errorf("apply args = %v, want --context kind-dib", apply.args)
	}
}

func TestKubectlDeploy_RequiresSourceImage(t *testing.T) {
	d, _ := newRecordingDeployer(K8sDeployOptions{})
	_, err := d.Deploy(context.Background(), K8sDeployOptions{BuildID: "b-1"})
	if err == nil {
		t.Fatalf("expected error for empty source image")
	}
}

func TestKubectlDeploy_ApplyFailurePropagates(t *testing.T) {
	d := newKubectlDeployer(K8sDeployOptions{})
	d.runCmd = func(_ context.Context, _ string, args ...string) (string, error) {
		if containsArg(args, "apply") {
			return "", errors.New("connection refused")
		}
		return "", nil
	}
	_, err := d.Deploy(context.Background(), K8sDeployOptions{
		SourceImage: "img:1",
		BuildID:     "b-1",
	})
	if err == nil || !strings.Contains(err.Error(), "connection refused") {
		t.Errorf("expected apply failure to propagate, got %v", err)
	}
}

func TestKubectlCleanup_DeletesWithIgnoreNotFound(t *testing.T) {
	d, calls := newRecordingDeployer(K8sDeployOptions{})
	if err := d.Cleanup(context.Background(), K8sCleanupOptions{
		BuildID:   "b-1",
		Namespace: "builds",
	}); err != nil {
		t.Fatalf("Cleanup: %v", err)
	}
	if len(*calls) != 1 {
		t.Fatalf("expected 1 delete call, got %d", len(*calls))
	}
	del := (*calls)[0]
	if !containsArg(del.args, "delete") || !containsArg(del.args, "--ignore-not-found") || !containsArg(del.args, "dib-b-1") {
		t.Errorf("delete args = %v", del.args)
	}
}

func TestDeploymentName_SanitizesToDNS1123(t *testing.T) {
	cases := map[string]string{
		"B-1":                                  "dib-b-1",
		"abc_DEF.123":                          "dib-abc-def-123",
		"550e8400-e29b-41d4-a716-446655440000": "dib-550e8400-e29b-41d4-a716-446655440000",
	}
	for in, want := range cases {
		if got := deploymentName(in); got != want {
			t.Errorf("deploymentName(%q) = %q, want %q", in, got, want)
		}
	}
}

func containsArg(args []string, want string) bool {
	for _, a := range args {
		if a == want {
			return true
		}
	}
	return false
}
