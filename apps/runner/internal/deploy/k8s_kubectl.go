package deploy

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// kubectlDeployer 는 K8sDeployer 의 1호 production 구현이다 (TASK-165 /
// P2-M5). client-go 의 무거운 의존성 대신 기존 deploy.Client 의 docker CLI
// shell-out 패턴(exec.CommandContext + 테스트 주입 seam)과 일관되게
// `kubectl` 을 shell-out 한다 — 본질이 "manifest apply + rollout 대기" 라서
// kubectl 이 자연스럽다.
//
// Deploy 는 SourceImage 로부터 Namespace/Deployment/Service 3-doc manifest 를
// 렌더해 `kubectl apply -f -` (stdin) 로 적용하고, `kubectl rollout status` 로
// 배포 완료를 기다린 뒤 K8sResult 를 돌려준다. 로컬 이미지를 그대로 쓰도록
// imagePullPolicy=IfNotPresent (kind 는 `kind load docker-image` 로 노드에
// 이미지를 적재하므로 pull 이 필요 없다).
type kubectlDeployer struct {
	kubectlBin    string
	defaultNS     string
	containerPort int
	timeout       time.Duration
	now           func() time.Time
	// runCmd 는 kubectl 호출 seam. stdin 이 비어있지 않으면 명령의 표준입력
	// 으로 흘린다(apply -f -). 테스트가 kubectl 없이 검증하도록 교체한다.
	runCmd func(ctx context.Context, stdin string, args ...string) (string, error)
}

func newKubectlDeployer(seed K8sDeployOptions) *kubectlDeployer {
	bin := os.Getenv("RUNNER_KUBECTL_BIN")
	if bin == "" {
		bin = "kubectl"
	}
	ns := seed.Namespace
	if ns == "" {
		ns = "dib-builds"
	}
	port := 8080
	if v := os.Getenv("RUNNER_K8S_CONTAINER_PORT"); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil && n > 0 {
			port = n
		}
	}
	timeout := 120 * time.Second
	if v := os.Getenv("RUNNER_K8S_ROLLOUT_TIMEOUT_SECONDS"); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil && n > 0 {
			timeout = time.Duration(n) * time.Second
		}
	}
	d := &kubectlDeployer{
		kubectlBin:    bin,
		defaultNS:     ns,
		containerPort: port,
		timeout:       timeout,
		now:           time.Now,
	}
	d.runCmd = d.defaultRunCmd
	return d
}

func (d *kubectlDeployer) namespaceOf(opts K8sDeployOptions) string {
	if opts.Namespace != "" {
		return opts.Namespace
	}
	return d.defaultNS
}

// contextArgs 는 opts.Cluster (kubeconfig context) 가 있으면 `--context <c>`
// 를 앞세운다. 없으면 현재 컨텍스트를 그대로 쓴다.
func contextArgs(cluster string) []string {
	if strings.TrimSpace(cluster) == "" {
		return nil
	}
	return []string{"--context", cluster}
}

func (d *kubectlDeployer) Deploy(ctx context.Context, opts K8sDeployOptions) (*K8sResult, error) {
	if opts.SourceImage == "" {
		return nil, fmt.Errorf("deploy: source image is required")
	}
	if opts.BuildID == "" {
		return nil, fmt.Errorf("deploy: buildID is required")
	}

	namespace := d.namespaceOf(opts)
	name := deploymentName(opts.BuildID)
	port := opts.ContainerPort
	if port <= 0 {
		port = d.containerPort
	}
	// context path 미지정 시 deployment 이름을 fallback 으로 쓴다.
	contextPath := opts.ContextPath
	if contextPath == "" {
		contextPath = name
	}
	manifest := renderK8sManifest(name, namespace, opts.SourceImage, port, contextPath, opts.StripPrefix, opts.HostingScheme, opts.BaseHost)

	timeoutCtx, cancel := context.WithTimeout(ctx, d.timeout)
	defer cancel()

	applyArgs := append(contextArgs(opts.Cluster), "apply", "-f", "-")
	if _, err := d.runCmd(timeoutCtx, manifest, applyArgs...); err != nil {
		return nil, fmt.Errorf("deploy: kubectl apply failed: %w", err)
	}

	rolloutArgs := append(
		contextArgs(opts.Cluster),
		"rollout", "status",
		fmt.Sprintf("deployment/%s", name),
		"-n", namespace,
		fmt.Sprintf("--timeout=%ds", int(d.timeout.Seconds())),
	)
	if _, err := d.runCmd(timeoutCtx, "", rolloutArgs...); err != nil {
		return nil, fmt.Errorf("deploy: kubectl rollout status failed: %w", err)
	}

	return &K8sResult{
		Cluster:      opts.Cluster,
		Namespace:    namespace,
		TargetType:   "K8S",
		Manifest:     opts.Manifest,
		ResultRef:    fmt.Sprintf("deployment/%s", name),
		AppliedAt:    d.now().UTC(),
		DeploymentID: name,
		ContextPath:  contextPath,
	}, nil
}

// Apply 는 opts.Manifest (파일 경로) 를 그대로 kubectl apply 한다.
func (d *kubectlDeployer) Apply(ctx context.Context, opts K8sApplyOptions) (*K8sResult, error) {
	if opts.Manifest == "" {
		return nil, fmt.Errorf("deploy: manifest is required for apply")
	}
	namespace := opts.Namespace
	if namespace == "" {
		namespace = d.defaultNS
	}
	timeoutCtx, cancel := context.WithTimeout(ctx, d.timeout)
	defer cancel()

	args := append(contextArgs(opts.Cluster), "apply", "-n", namespace, "-f", opts.Manifest)
	if _, err := d.runCmd(timeoutCtx, "", args...); err != nil {
		return nil, fmt.Errorf("deploy: kubectl apply -f %s failed: %w", opts.Manifest, err)
	}
	return &K8sResult{
		Cluster:    opts.Cluster,
		Namespace:  namespace,
		TargetType: "K8S",
		Manifest:   opts.Manifest,
		ResultRef:  fmt.Sprintf("apply://%s/%s", namespace, opts.Manifest),
		AppliedAt:  d.now().UTC(),
	}, nil
}

// Cleanup 은 buildID 로 만든 Deployment/Service 를 삭제한다. 없는 자원
// 삭제는 무시(--ignore-not-found).
func (d *kubectlDeployer) Cleanup(ctx context.Context, opts K8sCleanupOptions) error {
	if opts.BuildID == "" {
		return nil
	}
	namespace := opts.Namespace
	if namespace == "" {
		namespace = d.defaultNS
	}
	name := deploymentName(opts.BuildID)
	timeoutCtx, cancel := context.WithTimeout(ctx, d.timeout)
	defer cancel()

	args := append(
		contextArgs(opts.Cluster),
		"delete", "deployment,service", name,
		"-n", namespace, "--ignore-not-found",
	)
	if _, err := d.runCmd(timeoutCtx, "", args...); err != nil {
		return fmt.Errorf("deploy: kubectl delete failed: %w", err)
	}
	return nil
}

// defaultRunCmd 는 exec.CommandContext 로 kubectl 을 호출한다. stdin 이
// 비어있지 않으면 표준입력으로 흘린다(apply -f -). stdout/stderr 는 부모
// process 로 흘려 운영자가 실시간 진행을 보게 하고, stderr 는 동시에 캡쳐해
// non-zero exit 시 caller 의 errorMessage 로 노출한다(deploy.Client 패턴).
func (d *kubectlDeployer) defaultRunCmd(ctx context.Context, stdin string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, d.kubectlBin, args...)
	if stdin != "" {
		cmd.Stdin = strings.NewReader(stdin)
	}
	var stderr bytes.Buffer
	cmd.Stdout = os.Stdout
	cmd.Stderr = io.MultiWriter(os.Stderr, &stderr)
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%w (stderr=%s)", err, strings.TrimSpace(stderr.String()))
	}
	return "", nil
}

// dns1123Invalid 는 DNS-1123 label 에서 허용되지 않는 문자.
var dns1123Invalid = regexp.MustCompile(`[^a-z0-9-]`)

// deploymentName 은 buildID 를 k8s 자원 이름(DNS-1123 label)으로 변환한다.
// `dib-` prefix + 소문자화 + 비허용 문자 '-' 치환 + 63자 제한 + 양끝 '-' 제거.
func deploymentName(buildID string) string {
	s := "dib-" + strings.ToLower(buildID)
	s = dns1123Invalid.ReplaceAllString(s, "-")
	if len(s) > 63 {
		s = s[:63]
	}
	s = strings.Trim(s, "-")
	if s == "" {
		s = "dib-build"
	}
	return s
}

// renderK8sManifest 는 Namespace + Deployment + Service + Ingress 4-doc YAML
// 을 만든다(TASK-167 / P3-M2). imagePullPolicy=IfNotPresent 로 로컬(kind 적재)
// 이미지를 그대로 쓴다.
//
// 호스팅 라우팅(설계 §6):
//   - stripPrefix=true(기본): Ingress 가 `/<cp>(/|$)(.*)` 를 Service 로 보내고
//     rewrite-target `/$2` 로 prefix 를 벗겨 앱 서버는 루트 기준 요청을 받는다.
//     앱은 `APP_BASE_PATH=/<cp>/` 를 읽어 emit URL 에만 prefix 를 붙인다.
//   - stripPrefix=false: rewrite 없이 `/<cp>` (Prefix) 를 그대로 넘겨 앱 서버가
//     `/<cp>/...` 를 직접 서빙(base-path-aware 서버, 예: Next basePath).
//
// 어느 경우든 APP_BASE_PATH env 는 주입한다. ingressClassName=nginx 전제.
func renderK8sManifest(name, namespace, image string, port int, contextPath string, stripPrefix bool, hostingScheme, baseHost string) string {
	// TASK-172 (v0.5.0): subdomain 스킴이면 Ingress host rule 로 라우팅하고
	// 앱은 자기 subdomain 루트에서 서빙된다(prefix strip / rewrite 불필요,
	// APP_BASE_PATH=/). path 스킴이면 기존 path-prefix(+stripPrefix rewrite).
	ingressAnnotations := ""
	ingressPath := fmt.Sprintf("/%s", contextPath)
	pathType := "Prefix"
	ruleHost := ""
	appBasePath := fmt.Sprintf("/%s/", contextPath)
	if hostingScheme == "subdomain" {
		ruleHost = fmt.Sprintf("host: %s.%s\n      ", contextPath, baseHost)
		ingressPath = "/"
		appBasePath = "/"
	} else if stripPrefix {
		ingressAnnotations = "  annotations:\n" +
			"    nginx.ingress.kubernetes.io/rewrite-target: /$2\n" +
			"    nginx.ingress.kubernetes.io/use-regex: \"true\"\n"
		ingressPath = fmt.Sprintf("/%s(/|$)(.*)", contextPath)
		pathType = "ImplementationSpecific"
	}
	return fmt.Sprintf(`apiVersion: v1
kind: Namespace
metadata:
  name: %[2]s
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: %[1]s
  namespace: %[2]s
  labels:
    app.kubernetes.io/name: %[1]s
    app.kubernetes.io/managed-by: docker-image-builder-system
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: %[1]s
  template:
    metadata:
      labels:
        app.kubernetes.io/name: %[1]s
    spec:
      containers:
        - name: app
          image: %[3]s
          imagePullPolicy: IfNotPresent
          env:
            - name: APP_BASE_PATH
              value: "%[5]s"
          ports:
            - containerPort: %[4]d
---
apiVersion: v1
kind: Service
metadata:
  name: %[1]s
  namespace: %[2]s
  labels:
    app.kubernetes.io/name: %[1]s
spec:
  selector:
    app.kubernetes.io/name: %[1]s
  ports:
    - port: %[4]d
      targetPort: %[4]d
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: %[1]s
  namespace: %[2]s
  labels:
    app.kubernetes.io/name: %[1]s
%[6]sspec:
  ingressClassName: nginx
  rules:
    - %[9]shttp:
        paths:
          - path: %[7]s
            pathType: %[8]s
            backend:
              service:
                name: %[1]s
                port:
                  number: %[4]d
`, name, namespace, image, port, appBasePath, ingressAnnotations, ingressPath, pathType, ruleHost)
}
