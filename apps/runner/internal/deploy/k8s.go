package deploy

import (
	"context"
	"fmt"
	"time"
)

// K8sDeployer 는 TASK-162 (P2-M3) + 사용자 결정 3종 (2026-07-23) 에서
// 도입된 k8s adapter 의 1호 구현 골격. 본 단계는 인터페이스 정의 +
// skeleton (noop + dry-run) 만 포함하고, 실제 k8s client-go 연동은
// 후속 commit 의 k8s adapter implementation 에서 추가된다.
//
// 설계 근거:
//
//  1. 본 adapter 는 기존 `deploy.Client` 와 분리된 인터페이스다. 기존
//     `Client` 는 DOCKER_REGISTRY 한 종류에 cli/skeleton mode 만
//     지원하고 그 본질이 "docker tag + push" 다. k8s 는 그 본질이
//     "manifest apply" 라서 같은 Client 에 끼워넣기보다 별도
//     인터페이스가 자연스럽다.
//
//  2. 인터페이스는 작은 surface (Deploy / Apply / Cleanup 만) 로
//     정의해서 1호 구현체 + 후속 구현체 (Helm / ArgoCD / 직접
//     kubectl) 가 같은 계약을 따르게 한다.
//
//  3. skeleton 단계에선 실제 k8s API 호출이 없다 — interface 만 있고
//     모든 구현체는 ResultRef 만 emit 한다. P2-M5 의 k8s client-go
//     구현체는 본 인터페이스를 충족하면서 실제 manifest apply /
//     deployment 상태 확인을 수행한다.
//
// TASK-059 (external deployment adapter v1, planned) 의 1호 구현체가
// 본 인터페이스의 첫 production 구현체가 된다.

type K8sDeployer interface {
	// Deploy 는 본 build 가 외부 k8s cluster 에 배포되었음을 기록한다.
	// 실제 구현체는 image registry push + manifest apply 가 결합된
	// orchestration 일 수 있다. 본 skeleton 단계에선 noop + resultRef
	// emit 만.
	Deploy(ctx context.Context, opts K8sDeployOptions) (*K8sResult, error)

	// Apply 는 manifest (Deployment / Service / Ingress 등) 를
	// cluster 에 적용한다. skeleton 단계에선 stub — P2-M5 의 실제
	// 구현은 dynamic client 또는 YAML 파일 기반 kubectl 호출.
	Apply(ctx context.Context, opts K8sApplyOptions) (*K8sResult, error)

	// Cleanup 은 배포 자원을 정리한다 (선택적). production 구현체는
	// Deployment 삭제 + PVC 정리 등. skeleton 단계에선 noop.
	Cleanup(ctx context.Context, opts K8sCleanupOptions) error
}

// K8sDeployOptions 는 Deploy 의 입력. SourceImage 는 deploy.Client 와
// 같은 "local docker image tag" 의미. Cluster / Namespace / Manifest
// 경로는 manifest 기반 deploy 의 본질적 입력.
type K8sDeployOptions struct {
	SourceImage string // e.g. docker-image-builder-system/<buildMode>:<buildID>
	Cluster     string // e.g. "docker-desktop" / "kind-p2-m5" / kubeconfig context
	Namespace   string // e.g. "builds" or per-build namespace
	Manifest    string // path to manifest YAML, or "" for skeleton
	BuildID     string // audit / cleanup 추적용
	// TASK-167 (P3-M2): 호스팅 입력. ContextPath 는 Ingress path prefix,
	// ContainerPort 는 앱이 listen 하는 포트(0 이면 deployer 기본 8080).
	ContextPath   string
	ContainerPort int
	// TASK-169 (P3-M4): Ingress 가 prefix 를 strip 하는지(rewrite-target).
	StripPrefix bool
	// TASK-172 (v0.5.0): 호스팅 URL 스킴("path"|"subdomain", 기본 path).
	// subdomain 이면 Ingress host rule = `<cp>.<BaseHost>`.
	HostingScheme string
	BaseHost      string
	Resources     *ResourceProfile
	// APIServiceName/APIServicePort optionally expose a cluster-local control
	// plane under <context>/api. Hosted bundles must use this route instead of
	// learning a host IP or host port.
	APIServiceName string
	APIServicePort int
	// DatabaseSecretName is an optional service-local Secret. The reference is
	// optional so apps without database provisioning keep working; when the
	// platform provisions it, DATABASE_URL is injected without exposing a host.
	DatabaseSecretName       string
	DatabaseMigrationCommand string
	// Helm adapter 입력. Chart 는 chart directory/archive 경로이며, chart 는
	// 표준 values contract(image.repository/image.tag/service.port/hosting.*)
	// 을 소비해야 한다.
	HelmChart      string
	HelmRelease    string
	HelmValuesFile string
	HelmSetValues  []string
	// ArgoCD adapter 입력. Application CR은 이 Git source를 sync하고
	// 표준 image/hosting values를 Helm parameter로 전달한다.
	ArgoCDNamespace       string
	ArgoCDProject         string
	ArgoCDRepoURL         string
	ArgoCDPath            string
	ArgoCDTargetRevision  string
	ArgoCDDestinationHost string
}

type ResourceProfile struct {
	Tier          string
	CPURequest    string
	MemoryRequest string
	CPULimit      string
	MemoryLimit   string
	Replicas      int
}

// K8sApplyOptions 는 Apply 의 입력 (manifest 만 별도 호출하는 경우).
type K8sApplyOptions struct {
	Cluster   string
	Namespace string
	Manifest  string
	BuildID   string
	// HelmRelease 는 Helm Apply 경로에서 사용할 release 이름이다. 비어
	// 있으면 BuildID, 그마저 비어 있으면 adapter 기본값을 사용한다.
	HelmRelease string
}

// K8sCleanupOptions 는 Cleanup 의 입력.
type K8sCleanupOptions struct {
	Cluster   string
	Namespace string
	BuildID   string
	// HelmRelease 는 Deploy 때 사용한 release 이름을 명시한다. Helm
	// adapter는 BuildID와 release 이름이 다를 수 있으므로 cleanup 시
	// 같은 식별자를 전달해야 한다.
	HelmRelease string
}

// K8sResult 는 Deploy / Apply 의 결과. 기존 deploy.Result 와 분리
// (k8s 는 Deployment / Service / Ingress 의 다중 resource 라서 단일
// resultRef 보다 풍부한 표현이 필요할 수 있음). 후속 commit 에서
// 확장.
type K8sResult struct {
	Cluster      string
	Namespace    string
	TargetType   string // 항상 "K8S" (Phase 2 컨셉 §3 의 canonical enum)
	Manifest     string
	ResultRef    string // e.g. deployment/<name> 의 kubectl get 형태
	AppliedAt    time.Time
	DeploymentID string // 선택 — k8s 가 Deployment 를 만든 경우
	// TASK-167 (P3-M2): 호스팅 좌표. build-server 가 HostedService upsert 시
	// 사용(URL 은 서버가 HOSTING_BASE_HOST + ContextPath 로 조립).
	ContextPath string
}

// NewK8sDeployer 는 K8sDeployer 구현체 factory. mode 가 "k8s" 면 실제
// 구현체, "noop" / "skeleton" 이면 noopSkeleton 을 반환. 그 외
// mode 는 error.
//
// 후속 commit 에서 mode = "k8s" 일 때 realK8sDeployer (client-go
// 기반) 가 반환되도록 분기 추가.
func NewK8sDeployer(mode string, opts K8sDeployOptions) (K8sDeployer, error) {
	switch mode {
	case "noop", "skeleton":
		return &noopSkeleton{}, nil
	case "k8s":
		// TASK-165 (P2-M5): 실제 kubectl 기반 구현체. manifest apply +
		// rollout status 대기. cluster 연결성/kubectl 가용은 런타임에
		// kubectl 이 판정한다(실패 시 Deploy 가 에러 반환 → 배포 FAILED).
		return newKubectlDeployer(opts), nil
	case "helm":
		return newHelmDeployer(opts), nil
	case "argocd":
		return newArgoCDDeployer(opts), nil
	default:
		return nil, fmt.Errorf("deploy: unsupported k8s mode %q", mode)
	}
}

// noopSkeleton 은 실제 cluster 호출 없이 ResultRef 만 emit 한다.
// dry-run / test / 단계적 rollout 의 1단계. P2-M5 의 실제 구현체가
// 추가되면 mode = "k8s" + cluster + manifest 가 있는 경우에만 real
// implementation 으로 위임한다.
type noopSkeleton struct {
	opts K8sDeployOptions
}

func (n *noopSkeleton) Deploy(ctx context.Context, opts K8sDeployOptions) (*K8sResult, error) {
	if opts.SourceImage == "" {
		return nil, fmt.Errorf("deploy: source image is required")
	}
	return &K8sResult{
		Cluster:    opts.Cluster,
		Namespace:  opts.Namespace,
		TargetType: "K8S",
		Manifest:   opts.Manifest,
		ResultRef:  fmt.Sprintf("noop://%s/%s/%s", opts.Cluster, opts.Namespace, opts.BuildID),
		AppliedAt:  time.Now().UTC(),
	}, nil
}

func (n *noopSkeleton) Apply(ctx context.Context, opts K8sApplyOptions) (*K8sResult, error) {
	if opts.Manifest == "" {
		return nil, fmt.Errorf("deploy: manifest is required for apply")
	}
	return &K8sResult{
		Cluster:    opts.Cluster,
		Namespace:  opts.Namespace,
		TargetType: "K8S",
		Manifest:   opts.Manifest,
		ResultRef:  fmt.Sprintf("noop://%s/%s/%s", opts.Cluster, opts.Namespace, opts.BuildID),
		AppliedAt:  time.Now().UTC(),
	}, nil
}

func (n *noopSkeleton) Cleanup(ctx context.Context, opts K8sCleanupOptions) error {
	// skeleton 단계에선 정리 대상 없음. 후속 commit 에서 Deployment
	// / Service / PVC 정리.
	return nil
}
