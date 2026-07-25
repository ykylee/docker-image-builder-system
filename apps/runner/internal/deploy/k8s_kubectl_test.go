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

func TestKubectlDeploy_RendersIngressAndBasePath(t *testing.T) {
	d, calls := newRecordingDeployer(K8sDeployOptions{Namespace: "dib-hosted"})
	res, err := d.Deploy(context.Background(), K8sDeployOptions{
		SourceImage:   "img:1",
		Namespace:     "dib-hosted",
		BuildID:       "b-9",
		ContextPath:   "todo-app",
		ContainerPort: 3000,
		StripPrefix:   true,
	})
	if err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	m := (*calls)[0].stdin
	// Ingress + rewrite-target + context-path 규칙 (stripPrefix=true)
	if !strings.Contains(m, "kind: Ingress") {
		t.Errorf("manifest missing Ingress:\n%s", m)
	}
	if !strings.Contains(m, "ingressClassName: nginx") {
		t.Errorf("manifest missing ingressClassName nginx")
	}
	if !strings.Contains(m, "rewrite-target: /$2") {
		t.Errorf("manifest missing rewrite-target")
	}
	if !strings.Contains(m, "path: /todo-app(/|$)(.*)") {
		t.Errorf("manifest missing context-path rule:\n%s", m)
	}
	// APP_BASE_PATH env 주입 + containerPort 반영
	if !strings.Contains(m, `name: APP_BASE_PATH`) || !strings.Contains(m, `value: "/todo-app/"`) {
		t.Errorf("manifest missing APP_BASE_PATH env:\n%s", m)
	}
	if !strings.Contains(m, "containerPort: 3000") {
		t.Errorf("manifest missing containerPort 3000 (runtimePort)")
	}
	if res.ContextPath != "todo-app" {
		t.Errorf("result ContextPath = %q, want todo-app", res.ContextPath)
	}
}

func TestKubectlDeploy_StripPrefixFalsePassThrough(t *testing.T) {
	d, calls := newRecordingDeployer(K8sDeployOptions{Namespace: "dib-hosted"})
	if _, err := d.Deploy(context.Background(), K8sDeployOptions{
		SourceImage: "img:1",
		Namespace:   "dib-hosted",
		BuildID:     "b-10",
		ContextPath: "next-app",
		StripPrefix: false,
	}); err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	m := (*calls)[0].stdin
	// pass-through: rewrite-target 없음, path 는 prefix 그대로
	if strings.Contains(m, "rewrite-target") {
		t.Errorf("stripPrefix=false 인데 rewrite-target 존재:\n%s", m)
	}
	if !strings.Contains(m, "path: /next-app") || strings.Contains(m, "/next-app(/|$)") {
		t.Errorf("stripPrefix=false path 는 /next-app(Prefix) 여야 함:\n%s", m)
	}
	if !strings.Contains(m, "pathType: Prefix") {
		t.Errorf("stripPrefix=false 는 pathType Prefix 여야 함")
	}
	// APP_BASE_PATH 는 어느 경우든 주입
	if !strings.Contains(m, `value: "/next-app/"`) {
		t.Errorf("APP_BASE_PATH 누락(stripPrefix 무관 주입):\n%s", m)
	}
}

func TestKubectlDeploy_SubdomainScheme(t *testing.T) {
	d, calls := newRecordingDeployer(K8sDeployOptions{Namespace: "dib-hosted"})
	if _, err := d.Deploy(context.Background(), K8sDeployOptions{
		SourceImage:   "img:1",
		Namespace:     "dib-hosted",
		BuildID:       "b-11",
		ContextPath:   "todo-app",
		HostingScheme: "subdomain",
		BaseHost:      "apps.example.com",
	}); err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	m := (*calls)[0].stdin
	// subdomain: host rule 로 라우팅
	if !strings.Contains(m, "host: todo-app.apps.example.com") {
		t.Errorf("manifest missing subdomain host rule:\n%s", m)
	}
	// prefix strip/rewrite 없음, path 는 루트
	if strings.Contains(m, "rewrite-target") {
		t.Errorf("subdomain 인데 rewrite-target 존재:\n%s", m)
	}
	if !strings.Contains(m, "path: /\n") {
		t.Errorf("subdomain path 는 / 여야 함:\n%s", m)
	}
	// APP_BASE_PATH 는 루트(/)
	if !strings.Contains(m, `value: "/"`) {
		t.Errorf("subdomain APP_BASE_PATH 는 / 여야 함:\n%s", m)
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
	// TASK-175 (E2): Ingress 도 같은 deploymentName 으로 동시에 정리되어야
	// 한다. 동명 재빌드 시 stale Ingress 가 라우팅을 잡아채는 잠복 결함 해소.
	// kind 묶음이 `deployment,service,ingress` 한 원소로 들어가므로 containsArg
	// 가 정확 일치를 요구하는 형태로는 잡히지 않는다 — argsAnySubstr 로 확인.
	if !argsAnySubstr(del.args, "ingress") {
		t.Errorf("Cleanup args missing ingress kind (TASK-175 E2): %v", del.args)
	}
	if !argsAnySubstr(del.args, "deployment,service,ingress") {
		t.Errorf("Cleanup args should include all 3 kinds in one command: %v", del.args)
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

// argsAnySubstr 는 args 의 어느 원소가 substr 을 포함하는지 본다.
// kubectl 은 kind 묶음(`deployment,service,ingress`) 을 한 원소로 받기 때문에
// 정확 일치 매처로 잡히지 않는 케이스가 있다.
func argsAnySubstr(args []string, substr string) bool {
	for _, a := range args {
		if strings.Contains(a, substr) {
			return true
		}
	}
	return false
}
