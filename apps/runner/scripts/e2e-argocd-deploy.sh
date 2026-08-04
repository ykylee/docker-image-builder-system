#!/usr/bin/env bash
# ArgoCD adapter e2e. Requires docker, kind, kubectl, git and go.
set -euo pipefail

CLUSTER="${DIB_ARGOCD_E2E_CLUSTER:-dib-argocd-e2e}"
CONTEXT="kind-${CLUSTER}"
TARGET_NS="${DIB_ARGOCD_E2E_TARGET_NAMESPACE:-dib-argocd-e2e}"
ARGO_NS="${DIB_ARGOCD_E2E_ARGO_NAMESPACE:-argocd}"
IMAGE="${DIB_ARGOCD_E2E_IMAGE:-dib-argocd-e2e/app:test}"
BUILD_ID="${DIB_ARGOCD_E2E_BUILD_ID:-argocd-e2e}"
ARGOCD_MANIFEST="${DIB_ARGOCD_MANIFEST_URL:-https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml}"
GIT_PORT="${DIB_ARGOCD_E2E_GIT_PORT:-9418}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK="$(mktemp -d)"
CREATED=0
NAMESPACE_OWNED=0
GIT_PID=0

APP_NAME="$(printf 'dib-%s' "${BUILD_ID}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g; s/^-*//; s/-*$//' | cut -c1-63)"
if [ -z "${APP_NAME}" ]; then
  APP_NAME="dib-build"
fi

# Docker Desktop에서는 host.docker.internal을 사용하고, Linux runner에서는
# kind Docker network의 gateway가 host의 git daemon에 도달하는 주소다.
if [ -n "${DIB_ARGOCD_E2E_GIT_HOST:-}" ]; then
  GIT_HOST="${DIB_ARGOCD_E2E_GIT_HOST}"
else
  GIT_HOST="host.docker.internal"
  if [ "$(uname -s)" = "Linux" ]; then
    GIT_HOST="$(docker network inspect kind -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || true)"
    GIT_HOST="${GIT_HOST:-host.docker.internal}"
  fi
fi

cleanup() {
  set +e
  if [ "${DIB_ARGOCD_E2E_KEEP_DEPLOY:-0}" != "1" ]; then
    kubectl --context "${CONTEXT}" delete application "${APP_NAME}" -n "${ARGO_NS}" --ignore-not-found >/dev/null 2>&1
    kubectl --context "${CONTEXT}" wait --for=delete "application/${APP_NAME}" -n "${ARGO_NS}" --timeout=120s >/dev/null 2>&1 || true
    if [ "${NAMESPACE_OWNED}" = "1" ]; then
      kubectl --context "${CONTEXT}" delete namespace "${TARGET_NS}" --ignore-not-found >/dev/null 2>&1
    fi
  fi
  if [ "${GIT_PID}" != "0" ]; then
    kill "${GIT_PID}" >/dev/null 2>&1
  fi
  if [ "${CREATED}" = "1" ] && [ "${DIB_ARGOCD_E2E_KEEP:-0}" != "1" ]; then
    kind delete cluster --name "${CLUSTER}" >/dev/null 2>&1
  fi
  rm -rf "${WORK}"
}
trap cleanup EXIT

for bin in docker kind kubectl git go; do
  command -v "${bin}" >/dev/null 2>&1 || { echo "missing prerequisite: ${bin}" >&2; exit 1; }
done

if ! kind get clusters | grep -qx "${CLUSTER}"; then
  kind create cluster --name "${CLUSTER}" --wait 180s
  CREATED=1
fi
kubectl config use-context "${CONTEXT}" >/dev/null

# 테스트 namespace가 이미 존재하면 공유 workload를 삭제하지 않고 중단한다.
# 이전 테스트가 소유한 namespace만 명시적 owner label을 확인한 뒤 재생성한다.
if kubectl --context "${CONTEXT}" get namespace "${TARGET_NS}" >/dev/null 2>&1; then
  OWNER="$(kubectl --context "${CONTEXT}" get namespace "${TARGET_NS}" -o 'jsonpath={.metadata.labels.dib\.e2e/owner}' 2>/dev/null || true)"
  if [ "${OWNER}" != "argocd-deploy-e2e" ]; then
    echo "refusing to delete existing non-test namespace: ${TARGET_NS}" >&2
    exit 1
  fi
  kubectl --context "${CONTEXT}" delete application "${APP_NAME}" -n "${ARGO_NS}" --ignore-not-found >/dev/null 2>&1 || true
  kubectl --context "${CONTEXT}" wait --for=delete "application/${APP_NAME}" -n "${ARGO_NS}" --timeout=120s >/dev/null 2>&1 || true
  kubectl --context "${CONTEXT}" delete namespace "${TARGET_NS}" >/dev/null 2>&1
  kubectl --context "${CONTEXT}" wait --for=delete "namespace/${TARGET_NS}" --timeout=120s >/dev/null 2>&1
fi
kubectl --context "${CONTEXT}" create namespace "${TARGET_NS}" >/dev/null
kubectl --context "${CONTEXT}" label namespace "${TARGET_NS}" dib.e2e/owner=argocd-deploy-e2e --overwrite >/dev/null
NAMESPACE_OWNED=1

cat > "${WORK}/Dockerfile" <<'EOF'
FROM busybox
RUN mkdir -p /www && echo "argocd e2e ok" > /www/index.html
EXPOSE 8080
CMD ["httpd", "-f", "-p", "8080", "-h", "/www"]
EOF
docker build -q -t "${IMAGE}" "${WORK}" >/dev/null
kind load docker-image "${IMAGE}" --name "${CLUSTER}"

# 외부 GitHub credential에 의존하지 않도록 chart만 담은 local Git source를
# ArgoCD repo-server가 접근 가능한 host gateway 주소로 제공한다.
mkdir -p "${WORK}/source"
cp -R "${ROOT}/examples/helm-hosted-app" "${WORK}/source/helm-hosted-app"
# kind에는 외부 LoadBalancer 주소가 없어 ArgoCD의 Ingress health가 영구적으로
# Progressing이 될 수 있다. Ingress HTTP 라우팅은 hosting e2e에서 검증하고,
# 이 시나리오는 ArgoCD sync/health + Deployment/Service lifecycle에 집중한다.
sed -i.bak 's/enabled: true/enabled: false/' "${WORK}/source/helm-hosted-app/values.yaml"
rm -f "${WORK}/source/helm-hosted-app/values.yaml.bak"
git -C "${WORK}/source" init -q -b main
git -C "${WORK}/source" config user.email e2e@example.test
git -C "${WORK}/source" config user.name "ArgoCD e2e"
git -C "${WORK}/source" add helm-hosted-app
git -C "${WORK}/source" commit -qm "e2e chart"
git clone -q --bare "${WORK}/source" "${WORK}/dib-e2e.git"
git daemon --export-all --base-path="${WORK}" --reuseaddr --listen=0.0.0.0 --port="${GIT_PORT}" "${WORK}" >/dev/null 2>&1 &
GIT_PID=$!

echo "Installing ArgoCD into ${CONTEXT}"
kubectl --context "${CONTEXT}" create namespace "${ARGO_NS}" --dry-run=client -o yaml | kubectl --context "${CONTEXT}" apply -f - >/dev/null
# ArgoCD 최신 CRD의 client-side last-applied annotation이 Kubernetes의
# 256KiB annotation 제한을 넘을 수 있어 server-side apply를 사용한다.
kubectl --context "${CONTEXT}" apply --server-side -n "${ARGO_NS}" -f "${ARGOCD_MANIFEST}" >/dev/null
kubectl --context "${CONTEXT}" -n "${ARGO_NS}" rollout status deployment/argocd-repo-server --timeout=300s
kubectl --context "${CONTEXT}" -n "${ARGO_NS}" rollout status deployment/argocd-server --timeout=300s
kubectl --context "${CONTEXT}" -n "${ARGO_NS}" rollout status statefulset/argocd-application-controller --timeout=300s

( cd "${ROOT}/apps/runner" && \
  DIB_ARGOCD_E2E_IMAGE="${IMAGE}" \
  DIB_ARGOCD_E2E_CONTEXT="${CONTEXT}" \
  DIB_ARGOCD_E2E_TARGET_NAMESPACE="${TARGET_NS}" \
  DIB_ARGOCD_E2E_ARGO_NAMESPACE="${ARGO_NS}" \
  DIB_ARGOCD_E2E_BUILD_ID="${BUILD_ID}" \
  DIB_ARGOCD_E2E_REPO_URL="git://${GIT_HOST}:${GIT_PORT}/dib-e2e.git" \
  DIB_ARGOCD_E2E_PATH="helm-hosted-app" \
  go test -tags argocde2e -count=1 -run TestArgoCDE2E_RealDeploy ./internal/deploy/ -v )

echo "ALL PASS — ArgoCD Application ${APP_NAME} sync/health + managed resource cleanup e2e"
