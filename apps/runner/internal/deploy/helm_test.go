package deploy

import (
	"context"
	"strings"
	"testing"
)

func newRecordingHelm(seed K8sDeployOptions) (*helmDeployer, *[]recordedCall) {
	d := newHelmDeployer(seed)
	calls := &[]recordedCall{}
	d.runCmd = func(_ context.Context, args ...string) (string, error) {
		*calls = append(*calls, recordedCall{args: args})
		return "", nil
	}
	return d, calls
}

func TestNewK8sDeployer_HelmMode_ReturnsHelm(t *testing.T) {
	d, err := NewK8sDeployer("helm", K8sDeployOptions{HelmChart: "./chart"})
	if err != nil {
		t.Fatalf("NewK8sDeployer(helm): %v", err)
	}
	if _, ok := d.(*helmDeployer); !ok {
		t.Fatalf("expected *helmDeployer, got %T", d)
	}
}

func TestHelmDeploy_UpgradeInstallAndValues(t *testing.T) {
	d, calls := newRecordingHelm(K8sDeployOptions{
		Namespace: "dib-hosted", HelmChart: "./chart", HelmRelease: "app-release",
		HelmValuesFile: "values.yaml", HelmSetValues: []string{"extra.enabled=true"},
	})
	res, err := d.Deploy(context.Background(), K8sDeployOptions{
		SourceImage: "localhost:5000/demo/app:build-1", BuildID: "build-1",
		Cluster:   "kind-dib-helm-e2e",
		Namespace: "dib-hosted", HelmChart: "./chart", HelmRelease: "app-release",
		ContextPath: "demo-app", ContainerPort: 3000, StripPrefix: true,
		HostingScheme: "subdomain", BaseHost: "apps.example.test",
		DatabaseSecretName: "dib-service-demo-abcdef123456-db",
	})
	if err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	if len(*calls) != 1 {
		t.Fatalf("expected one helm call, got %d", len(*calls))
	}
	args := (*calls)[0].args
	for _, want := range []string{"upgrade", "--install", "app-release", "./chart", "--namespace", "dib-hosted", "--wait", "--kube-context", "kind-dib-helm-e2e", "image.repository=localhost:5000/demo/app", "image.tag=build-1", "service.port=3000", "hosting.contextPath=demo-app", "hosting.basePath=/", "hosting.stripPrefix=true", "hosting.scheme=subdomain", "hosting.baseHost=apps.example.test", "build.id=build-1", "database.secretName=dib-service-demo-abcdef123456-db", "extra.enabled=true"} {
		if !containsArg(args, want) {
			t.Errorf("helm args = %v, missing %q", args, want)
		}
	}
	if res.ResultRef != "helm/app-release" || res.DeploymentID != "app-release" {
		t.Errorf("unexpected result: %+v", res)
	}
	if res.ContextPath != "demo-app" {
		t.Errorf("ContextPath = %q, want demo-app", res.ContextPath)
	}
}

func TestHelmDeploy_RequiresChart(t *testing.T) {
	d, _ := newRecordingHelm(K8sDeployOptions{})
	_, err := d.Deploy(context.Background(), K8sDeployOptions{SourceImage: "img:1", BuildID: "b-1"})
	if err == nil || !strings.Contains(err.Error(), "helm chart is required") {
		t.Fatalf("expected chart error, got %v", err)
	}
}

func TestHelmCleanupUninstallsRelease(t *testing.T) {
	d, calls := newRecordingHelm(K8sDeployOptions{Namespace: "dib-hosted"})
	if err := d.Cleanup(context.Background(), K8sCleanupOptions{Namespace: "dib-hosted", BuildID: "build-1", HelmRelease: "app-release"}); err != nil {
		t.Fatalf("Cleanup: %v", err)
	}
	if len(*calls) != 1 || !containsArg((*calls)[0].args, "uninstall") || !containsArg((*calls)[0].args, "app-release") || !containsArg((*calls)[0].args, "--ignore-not-found") {
		t.Errorf("unexpected cleanup args: %+v", *calls)
	}
}

func TestHelmCleanupFallsBackToBuildID(t *testing.T) {
	d, calls := newRecordingHelm(K8sDeployOptions{Namespace: "dib-hosted"})
	if err := d.Cleanup(context.Background(), K8sCleanupOptions{Namespace: "dib-hosted", BuildID: "build-1"}); err != nil {
		t.Fatalf("Cleanup: %v", err)
	}
	args := (*calls)[0].args
	if !containsArg(args, "build-1") {
		t.Fatalf("cleanup args = %v, want build-1 release", args)
	}
}

func TestSplitImageRef(t *testing.T) {
	cases := []struct{ raw, repo, tag string }{
		{"busybox", "busybox", "latest"},
		{"localhost:5000/demo/app:build-1", "localhost:5000/demo/app", "build-1"},
		{"registry.example/app", "registry.example/app", "latest"},
	}
	for _, tc := range cases {
		repo, tag := splitImageRef(tc.raw)
		if repo != tc.repo || tag != tc.tag {
			t.Errorf("splitImageRef(%q) = %q:%q, want %q:%q", tc.raw, repo, tag, tc.repo, tc.tag)
		}
	}
}
