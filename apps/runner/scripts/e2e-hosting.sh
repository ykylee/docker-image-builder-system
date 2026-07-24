#!/usr/bin/env bash
# Phase 3 / TASK-170 (P3-M5): 호스팅 실 e2e — kind + ingress-nginx.
#
# Phase A(라우팅): base-path-aware 예제 앱을 빌드→kind load→kubectlDeployer 로
#   배포(Ingress + APP_BASE_PATH)한 뒤, 실제 `http://<ingress>/<cp>/` 로 접속해
#   페이지 + 자산(app.js)이 로드됨을 실측(unit 이 못 잡는 실 라우팅 증명).
# Phase B(관리): 배포된 서비스에 대해 build-server 의 실 K8sAdmin(kubectl
#   shell-out)으로 stop(scale 0) + remove(delete) 가 동작함을 실측.
#
# 전제: docker / kind / kubectl / go / node / curl. 클러스터는 없으면 생성하고
# 스크립트가 만든 경우에만 삭제한다.
#
# 사용: bash apps/runner/scripts/e2e-hosting.sh
set -euo pipefail

CLUSTER="${DIB_HOSTING_E2E_CLUSTER:-dib-hosting-e2e}"
CONTEXT="kind-${CLUSTER}"
NS="dib-hosted"
CP="demo"
IMAGE="dib-e2e/hosted-base-path-app:test"
HOST_PORT="${DIB_HOSTING_E2E_PORT:-18080}"
INGRESS_URL="http://localhost:${HOST_PORT}"
BUILD_ID="hosting-e2e"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CREATED_CLUSTER=0

log() { printf '\n\033[1;36m[hosting-e2e]\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31m[hosting-e2e FAIL]\033[0m %s\n' "$*" >&2; exit 1; }

cleanup() {
  set +e
  if [ "${CREATED_CLUSTER}" = "1" ] && [ "${DIB_HOSTING_E2E_KEEP:-0}" != "1" ]; then
    log "kind 클러스터 삭제: ${CLUSTER}"
    kind delete cluster --name "${CLUSTER}" >/dev/null 2>&1
  fi
}
trap cleanup EXIT

for bin in docker kind kubectl go node curl; do
  command -v "$bin" >/dev/null 2>&1 || fail "필수 도구 없음: $bin"
done

# ---- 클러스터 + ingress-nginx ----------------------------------------------
if ! kind get clusters 2>/dev/null | grep -qx "${CLUSTER}"; then
  log "kind 클러스터 생성(+ingress hostPort ${HOST_PORT}→80): ${CLUSTER}"
  cat <<EOF | kind create cluster --name "${CLUSTER}" --config -
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"
    extraPortMappings:
      - containerPort: 80
        hostPort: ${HOST_PORT}
        protocol: TCP
EOF
  CREATED_CLUSTER=1
else
  log "기존 kind 클러스터 재사용: ${CLUSTER}"
fi

log "ingress-nginx 설치"
kubectl --context "${CONTEXT}" apply -f https://kind.sigs.k8s.io/examples/ingress/deploy-ingress-nginx.yaml
log "ingress-nginx controller ready 대기(최대 180s)"
# deployment 가 스케줄되기 전에 pod selector wait 를 하면 "no matching resources"
# 로 즉시 실패하므로(레이스), rollout status 로 pod 생성+ready 를 함께 기다린다.
kubectl --context "${CONTEXT}" -n ingress-nginx rollout status \
  deployment/ingress-nginx-controller --timeout=180s \
  || fail "ingress-nginx controller 미기동"

# ---- 예제 앱 빌드 + load ----------------------------------------------------
log "base-path-aware 예제 앱 빌드 → ${IMAGE}"
docker build -q -t "${IMAGE}" "${REPO_ROOT}/examples/hosted-base-path-app" >/dev/null
log "kind 노드에 이미지 load"
kind load docker-image "${IMAGE}" --name "${CLUSTER}"

# ============================================================================
# Phase A — 실 라우팅
# ============================================================================
log "Phase A: kubectlDeployer 로 배포 + 실 Ingress 라우팅 검증"
( cd "${REPO_ROOT}/apps/runner" && \
  DIB_K8S_E2E_IMAGE="${IMAGE}" \
  DIB_K8S_E2E_CONTEXT="${CONTEXT}" \
  DIB_K8S_E2E_NS="${NS}" \
  DIB_K8S_E2E_CONTEXT_PATH="${CP}" \
  DIB_K8S_E2E_INGRESS_URL="${INGRESS_URL}" \
  DIB_K8S_E2E_BUILD_ID="${BUILD_ID}" \
  DIB_K8S_E2E_KEEP_DEPLOY=1 \
  go test -tags k8se2e -count=1 -run TestK8sE2E_RealDeploy ./internal/deploy/ -v ) \
  || fail "Phase A: 라우팅 검증 실패"
log "Phase A PASS — host/${CP}/ 페이지 + APP_BASE_PATH 자산 로드 실측"

# ============================================================================
# Phase B — 실 관리(K8sAdmin)
# ============================================================================
DEPLOY_NAME="dib-${BUILD_ID}"
log "Phase B: build-server K8sAdmin 으로 stop/remove 실측 (${NS}/${DEPLOY_NAME})"
# tsx 는 build-server devDep 이라 pnpm 비-hoist 격리에서 repo root 로는 해석이
# 안 된다(TASK-128 교훈). build-server cwd 에서 실행한다.
( cd "${REPO_ROOT}/apps/build-server" && \
  HOSTING_KUBE_CONTEXT="${CONTEXT}" \
  node --import tsx scripts/hosting-e2e-manage.ts "${NS}" "${DEPLOY_NAME}" ) \
  || fail "Phase B: 관리 검증 실패"
log "Phase B PASS — stop(scale 0) + remove(delete) 실측"

log "ALL PASS — P3-M5 호스팅 실 e2e (라우팅 + 관리)"
