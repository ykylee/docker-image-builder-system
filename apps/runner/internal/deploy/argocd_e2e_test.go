//go:build argocde2e

// ArgoCD adapter 실 클러스터 e2e. ArgoCD가 설치된 kind 클러스터에서
// Application 생성 → Synced/Healthy 대기 → managed resources 확인 →
// foreground cleanup까지 검증한다.
package deploy

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestArgoCDE2E_RealDeploy(t *testing.T) {
	image := os.Getenv("DIB_ARGOCD_E2E_IMAGE")
	kctx := os.Getenv("DIB_ARGOCD_E2E_CONTEXT")
	if image == "" || kctx == "" {
		t.Skip("DIB_ARGOCD_E2E_IMAGE / DIB_ARGOCD_E2E_CONTEXT 미설정 — ArgoCD e2e skip")
	}

	argoNS := getenvOr("DIB_ARGOCD_E2E_ARGO_NAMESPACE", "argocd")
	targetNS := getenvOr("DIB_ARGOCD_E2E_TARGET_NAMESPACE", "dib-argocd-e2e")
	buildID := getenvOr("DIB_ARGOCD_E2E_BUILD_ID", "argocd-e2e")
	repoURL := getenvOr("DIB_ARGOCD_E2E_REPO_URL", "https://github.com/ykylee/docker-image-builder-system.git")
	chartPath := getenvOr("DIB_ARGOCD_E2E_PATH", "examples/helm-hosted-app")
	revision := getenvOr("DIB_ARGOCD_E2E_REVISION", "main")
	appName := deploymentName(buildID)

	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Minute)
	defer cancel()

	if out, err := kubectl(ctx, kctx, "create", "namespace", targetNS, "--dry-run=client", "-o", "yaml"); err != nil {
		t.Fatalf("render target namespace: %v (%s)", err, out)
	} else if _, err := kubectlWithStdin(ctx, out, kctx, "apply", "-f", "-"); err != nil {
		t.Fatalf("create target namespace: %v", err)
	}

	deployer, err := NewK8sDeployer("argocd", K8sDeployOptions{
		Namespace: targetNS, ArgoCDNamespace: argoNS, ArgoCDProject: "default",
		ArgoCDRepoURL: repoURL, ArgoCDPath: chartPath, ArgoCDTargetRevision: revision,
	})
	if err != nil {
		t.Fatalf("NewK8sDeployer(argocd): %v", err)
	}
	if os.Getenv("DIB_ARGOCD_E2E_KEEP_DEPLOY") != "1" {
		t.Cleanup(func() {
			cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cleanupCancel()
			if err := deployer.Cleanup(cleanupCtx, K8sCleanupOptions{Cluster: kctx, Namespace: targetNS, BuildID: buildID}); err != nil {
				t.Errorf("ArgoCD cleanup: %v", err)
				return
			}
			if out, err := kubectl(cleanupCtx, kctx, "wait", "--for=delete", "application/"+appName, "-n", argoNS, "--timeout=120s"); err != nil {
				t.Errorf("wait Application cleanup: %v (%s)", err, out)
				return
			}
			assertAbsent(t, cleanupCtx, kctx, targetNS, "deployment", appName+"-dib-hosted-app")
			assertAbsent(t, cleanupCtx, kctx, targetNS, "service", appName+"-dib-hosted-app")
			t.Log("ArgoCD cleanup OK: Application and managed Deployment/Service removed")
		})
	}

	res, err := deployer.Deploy(ctx, K8sDeployOptions{
		SourceImage: image, Cluster: kctx, Namespace: targetNS, BuildID: buildID,
		ArgoCDNamespace: argoNS, ArgoCDProject: "default", ArgoCDRepoURL: repoURL,
		ArgoCDPath: chartPath, ArgoCDTargetRevision: revision,
		ContextPath: "argocd-demo", ContainerPort: 8080, StripPrefix: true,
		HostingScheme: "path", BaseHost: "",
	})
	if err != nil {
		t.Fatalf("real ArgoCD Deploy failed: %v", err)
	}
	if res.ResultRef != "argocd/"+argoNS+"/"+appName {
		t.Fatalf("ResultRef = %q, want argocd/%s/%s", res.ResultRef, argoNS, appName)
	}

	assertExists(t, ctx, kctx, targetNS, "deployment", appName+"-dib-hosted-app")
	assertExists(t, ctx, kctx, targetNS, "service", appName+"-dib-hosted-app")
	t.Logf("ArgoCD e2e deploy OK: Application %s/%s is Synced and Healthy; managed resources exist", argoNS, appName)

	if out, err := kubectl(ctx, kctx, "get", "application", appName, "-n", argoNS, "-o", "json"); err != nil {
		t.Fatalf("get ArgoCD Application: %v (%s)", err, out)
	} else {
		var app struct {
			Status struct {
				Sync struct {
					Status string `json:"status"`
				} `json:"sync"`
				Health struct {
					Status string `json:"status"`
				} `json:"health"`
			} `json:"status"`
		}
		if err := json.Unmarshal([]byte(out), &app); err != nil {
			t.Fatalf("decode Application: %v", err)
		}
		if app.Status.Sync.Status != "Synced" || app.Status.Health.Status != "Healthy" {
			t.Fatalf("Application status = sync=%q health=%q", app.Status.Sync.Status, app.Status.Health.Status)
		}
	}
}

func assertExists(t *testing.T, ctx context.Context, kctx, ns, kind, name string) {
	t.Helper()
	if out, err := kubectl(ctx, kctx, "get", kind, name, "-n", ns, "-o", "name"); err != nil {
		t.Fatalf("get %s/%s: %v (%s)", kind, name, err, out)
	}
}

func assertAbsent(t *testing.T, ctx context.Context, kctx, ns, kind, name string) {
	t.Helper()
	out, err := kubectl(ctx, kctx, "get", kind, name, "-n", ns, "--ignore-not-found", "-o", "name")
	if err != nil {
		t.Fatalf("verify absent %s/%s: %v (%s)", kind, name, err, out)
	}
	if out != "" {
		t.Errorf("%s/%s still exists after cleanup: %s", kind, name, out)
	}
}

func kubectl(ctx context.Context, kctx string, args ...string) (string, error) {
	cmdArgs := append([]string{"--context", kctx}, args...)
	out, err := exec.CommandContext(ctx, "kubectl", cmdArgs...).CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

func kubectlWithStdin(ctx context.Context, stdin string, kctx string, args ...string) (string, error) {
	cmdArgs := append([]string{"--context", kctx}, args...)
	cmd := exec.CommandContext(ctx, "kubectl", cmdArgs...)
	cmd.Stdin = strings.NewReader(stdin)
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

func getenvOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
