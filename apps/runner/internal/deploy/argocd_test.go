package deploy

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func newRecordingArgoCD(seed K8sDeployOptions) (*argoCDDeployer, *[]recordedCall) {
	d := newArgoCDDeployer(seed)
	calls := &[]recordedCall{}
	d.runCmd = func(_ context.Context, stdin string, args ...string) (string, error) {
		*calls = append(*calls, recordedCall{stdin: stdin, args: args})
		return "", nil
	}
	return d, calls
}

func TestNewK8sDeployer_ArgoCDMode_ReturnsArgoCD(t *testing.T) {
	d, err := NewK8sDeployer("argocd", K8sDeployOptions{ArgoCDRepoURL: "https://git.example/app", ArgoCDPath: "charts/app"})
	if err != nil {
		t.Fatalf("NewK8sDeployer(argocd): %v", err)
	}
	if _, ok := d.(*argoCDDeployer); !ok {
		t.Fatalf("expected *argoCDDeployer, got %T", d)
	}
}

func TestArgoCDDeploy_AppliesApplicationAndWaits(t *testing.T) {
	d, calls := newRecordingArgoCD(K8sDeployOptions{
		Namespace: "dib-hosted", ArgoCDNamespace: "argocd-system",
		ArgoCDProject: "platform", ArgoCDRepoURL: "https://git.example/app.git",
		ArgoCDPath: "charts/hosted-app", ArgoCDTargetRevision: "main",
	})
	res, err := d.Deploy(context.Background(), K8sDeployOptions{
		SourceImage: "localhost:5000/demo/app:build-1", BuildID: "build-1",
		Cluster: "kind-dib-argocd", Namespace: "dib-hosted", ContextPath: "demo-app",
		ContainerPort: 3000, StripPrefix: true, HostingScheme: "path", BaseHost: "apps.example.test",
	})
	if err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	if len(*calls) != 3 {
		t.Fatalf("expected apply + sync wait + health wait, got %d calls", len(*calls))
	}
	if !containsArg((*calls)[0].args, "apply") || (*calls)[0].stdin == "" {
		t.Fatalf("unexpected apply call: %+v", (*calls)[0])
	}
	if !strings.Contains(strings.Join((*calls)[1].args, " "), "Synced") || !strings.Contains(strings.Join((*calls)[2].args, " "), "Healthy") {
		t.Fatalf("unexpected wait calls: %+v", *calls)
	}
	if res.ResultRef != "argocd/argocd-system/dib-build-1" || res.DeploymentID != "dib-build-1" {
		t.Fatalf("unexpected result: %+v", res)
	}
	var application map[string]any
	if err := json.Unmarshal([]byte((*calls)[0].stdin), &application); err != nil {
		t.Fatalf("application JSON: %v", err)
	}
	if application["kind"] != "Application" {
		t.Fatalf("kind = %v", application["kind"])
	}
	if !strings.Contains((*calls)[0].stdin, "image.repository") || !strings.Contains((*calls)[0].stdin, "hosting.contextPath") {
		t.Fatalf("application missing Helm parameters: %s", (*calls)[0].stdin)
	}
}

func TestArgoCDDeploy_RequiresGitSource(t *testing.T) {
	d, _ := newRecordingArgoCD(K8sDeployOptions{})
	_, err := d.Deploy(context.Background(), K8sDeployOptions{SourceImage: "img:1", BuildID: "b-1"})
	if err == nil || !strings.Contains(err.Error(), "repo URL and path are required") {
		t.Fatalf("expected Git source error, got %v", err)
	}
}

func TestArgoCDCleanupDeletesApplication(t *testing.T) {
	d, calls := newRecordingArgoCD(K8sDeployOptions{ArgoCDNamespace: "argocd-system"})
	if err := d.Cleanup(context.Background(), K8sCleanupOptions{Cluster: "kind-dib-argocd", BuildID: "build-1"}); err != nil {
		t.Fatalf("Cleanup: %v", err)
	}
	if len(*calls) != 1 || !containsArg((*calls)[0].args, "delete") || !containsArg((*calls)[0].args, "application") || !containsArg((*calls)[0].args, "dib-build-1") {
		t.Fatalf("unexpected cleanup call: %+v", *calls)
	}
}
