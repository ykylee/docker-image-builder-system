//go:build helme2e

package deploy

import (
	"context"
	"os"
	"os/exec"
	"testing"
	"time"
)

func TestHelmE2E_RealDeploy(t *testing.T) {
	chart := os.Getenv("DIB_HELM_E2E_CHART")
	if chart == "" {
		t.Fatal("DIB_HELM_E2E_CHART is required")
	}
	image := os.Getenv("DIB_HELM_E2E_IMAGE")
	if image == "" {
		t.Fatal("DIB_HELM_E2E_IMAGE is required")
	}
	ns := envOr("DIB_HELM_E2E_NS", "dib-helm-e2e")
	release := envOr("DIB_HELM_E2E_RELEASE", "dib-helm-e2e")
	cluster := envOr("DIB_HELM_E2E_CONTEXT", "kind-dib-helm-e2e")
	deployer := newHelmDeployer(K8sDeployOptions{Namespace: ns, HelmChart: chart, HelmRelease: release})
	result, err := deployer.Deploy(context.Background(), K8sDeployOptions{
		SourceImage: image, BuildID: release, Namespace: ns, HelmChart: chart,
		HelmRelease: release, Cluster: cluster, ContextPath: "helm-e2e", ContainerPort: 8080,
	})
	if err != nil {
		t.Fatalf("Helm Deploy: %v", err)
	}
	if result.ResultRef != "helm/"+release {
		t.Fatalf("ResultRef = %q", result.ResultRef)
	}
	defer deployer.Cleanup(context.Background(), K8sCleanupOptions{Namespace: ns, BuildID: release})

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := runHelmE2ECommand(ctx, "kubectl", "--context", cluster, "get", "deployment", "-n", ns); err != nil {
		t.Fatalf("kubectl deployment verification: %v", err)
	}
}

func runHelmE2ECommand(ctx context.Context, bin string, args ...string) error {
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	return cmd.Run()
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
