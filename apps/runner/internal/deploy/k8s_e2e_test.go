//go:build k8se2e

// TASK-165 (P2-M5): k8s adapter 실배포 e2e. `//go:build k8se2e` 태그가 있어
// 기본 `go test ./...` 에서는 제외되고, kind 클러스터가 있는 환경에서만
// `apps/runner/scripts/e2e-k8s-deploy.sh` 가 명시적으로 실행한다.
//
// 실제 kubectl 로 kind 클러스터에 배포하고 rollout 완료(=Deploy 가 에러 없이
// 반환)를 검증한 뒤, kubectl 로 available replica 를 재확인하고 정리한다.
//
// 필요한 env (스크립트가 주입):
//   DIB_K8S_E2E_IMAGE   — kind 에 load 된 이미지 (e.g. dib-e2e/app:test)
//   DIB_K8S_E2E_CONTEXT — kubeconfig context (e.g. kind-dib-e2e)
//   DIB_K8S_E2E_NS      — namespace (default dib-e2e)

package deploy

import (
	"context"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestK8sE2E_RealDeploy(t *testing.T) {
	image := os.Getenv("DIB_K8S_E2E_IMAGE")
	kctx := os.Getenv("DIB_K8S_E2E_CONTEXT")
	ns := os.Getenv("DIB_K8S_E2E_NS")
	if ns == "" {
		ns = "dib-e2e"
	}
	if image == "" || kctx == "" {
		t.Skip("DIB_K8S_E2E_IMAGE / DIB_K8S_E2E_CONTEXT 미설정 — kind e2e skip")
	}

	// P3-M5: buildID 를 env 로 고정할 수 있게 한다(후속 관리 e2e 가 deployment
	// 이름을 예측). 미지정 시 timestamp.
	buildID := os.Getenv("DIB_K8S_E2E_BUILD_ID")
	if buildID == "" {
		buildID = "e2e-" + time.Now().UTC().Format("150405")
	}
	deployer, err := NewK8sDeployer("k8s", K8sDeployOptions{})
	if err != nil {
		t.Fatalf("NewK8sDeployer: %v", err)
	}

	// P3-M5: context path 가 주어지면 Ingress 라우팅 e2e. scheme 은 path(기본,
	// stripPrefix=true) / subdomain(TASK-172, host rule + BaseHost). 없으면
	// P2-M5 배포 e2e(deployment 이름 fallback).
	scheme := os.Getenv("DIB_K8S_E2E_SCHEME")
	opts := K8sDeployOptions{
		SourceImage:   image,
		Cluster:       kctx,
		Namespace:     ns,
		BuildID:       buildID,
		ContextPath:   os.Getenv("DIB_K8S_E2E_CONTEXT_PATH"),
		StripPrefix:   os.Getenv("DIB_K8S_E2E_CONTEXT_PATH") != "" && scheme != "subdomain",
		HostingScheme: scheme,
		BaseHost:      os.Getenv("DIB_K8S_E2E_BASE_HOST"),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	// 배포 자원은 테스트 종료 시 정리. 단 후속 관리 e2e 가 이어받도록
	// DIB_K8S_E2E_KEEP_DEPLOY=1 이면 정리를 건너뛴다(호출자가 정리 책임).
	if os.Getenv("DIB_K8S_E2E_KEEP_DEPLOY") != "1" {
		t.Cleanup(func() {
			_ = deployer.Cleanup(context.Background(), K8sCleanupOptions{
				Cluster:   kctx,
				Namespace: ns,
				BuildID:   buildID,
			})
		})
	}

	res, err := deployer.Deploy(ctx, opts)
	if err != nil {
		t.Fatalf("real k8s Deploy failed: %v", err)
	}
	if res.TargetType != "K8S" {
		t.Errorf("TargetType = %q, want K8S", res.TargetType)
	}
	wantRef := "deployment/" + deploymentName(buildID)
	if res.ResultRef != wantRef {
		t.Errorf("ResultRef = %q, want %q", res.ResultRef, wantRef)
	}

	// Deploy 가 rollout status 를 이미 기다렸다. 여기서 available replica 를
	// kubectl 로 한 번 더 실측해 vacuous PASS 를 막는다.
	out, err := exec.CommandContext(ctx, "kubectl",
		"--context", kctx,
		"-n", ns,
		"get", "deployment", deploymentName(buildID),
		"-o", "jsonpath={.status.availableReplicas}",
	).CombinedOutput()
	if err != nil {
		t.Fatalf("kubectl get deployment: %v (%s)", err, string(out))
	}
	if strings.TrimSpace(string(out)) != "1" {
		t.Fatalf("availableReplicas = %q, want 1 (배포가 실제로 뜨지 않음)", strings.TrimSpace(string(out)))
	}
	t.Logf("k8s e2e OK: %s (availableReplicas=1)", res.ResultRef)

	// P3-M5 / TASK-172: page URL 이 주어지면 실 Ingress 라우팅 + 자산 로드를
	// 검증한다. path 스킴은 host/<cp>/, subdomain 스킴은 <cp>.<host>/ — 어느
	// 쪽이든 PAGE_URL 은 앱 루트를 가리키므로 PAGE_URL + "app.js" 가 자산이다.
	pageURL := os.Getenv("DIB_K8S_E2E_PAGE_URL")
	if pageURL == "" {
		return
	}
	base := strings.TrimRight(pageURL, "/") + "/"
	assetURL := base + "app.js"

	// ingress 전파 지연 흡수 — 최대 30회 재시도.
	body := httpGetWithRetry(t, base, 30)
	if !strings.Contains(body, "hosted") {
		t.Fatalf("page 가 예상 콘텐츠를 담지 않음:\n%s", body)
	}
	asset := httpGetWithRetry(t, assetURL, 10)
	if !strings.Contains(asset, "hosted OK") {
		t.Fatalf("asset(app.js) 로드 실패:\n%s", asset)
	}
	t.Logf("P3-M5 라우팅 OK (scheme=%s): %s (page + app.js 자산 로드)", scheme, base)
}

func httpGetWithRetry(t *testing.T, url string, attempts int) string {
	t.Helper()
	var lastErr error
	var lastCode int
	for i := 0; i < attempts; i++ {
		res, err := http.Get(url) //nolint:gosec // e2e, local ingress
		if err != nil {
			lastErr = err
			time.Sleep(2 * time.Second)
			continue
		}
		b, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode == 200 {
			return string(b)
		}
		lastCode = res.StatusCode
		time.Sleep(2 * time.Second)
	}
	t.Fatalf("GET %s 실패: lastErr=%v lastCode=%d", url, lastErr, lastCode)
	return ""
}
