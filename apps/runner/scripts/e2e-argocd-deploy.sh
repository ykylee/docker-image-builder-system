#!/usr/bin/env bash
# ArgoCD adapter e2e. Requires docker, kind, kubectl, git and go.
set -euo pipefail

CLUSTER="${DIB_ARGOCD_E2E_CLUSTER:-dib-argocd-e2e}"
CONTEXT="kind-${CLUSTER}"
TARGET_NS="${DIB_ARGOCD_E2E_TARGET_NAMESPACE:-dib-argocd-e2e}"
ARGO_NS="${DIB_ARGOCD_E2E_ARGO_NAMESPACE:-argocd}"
IMAGE="${DIB_ARGOCD_E2E_IMAGE:-dib-argocd-e2e/app:test}"
ARGOCD_MANIFEST="${DIB_ARGOCD_MANIFEST_URL:-https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml}"
GIT_PORT="${DIB_ARGOCD_E2E_GIT_PORT:-9418}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK="$(mktemp -d)"
CREATED=0
GIT_PID=0

cleanup() {
  set +e
  if [ "${DIB_ARGOCD_E2E_KEEP_DEPLOY:-0}" != "1" ]; then
    kubectl --context "${CONTEXT}" delete application --all -n "${ARGO_NS}" --ignore-not-found >/dev/null 2>&1
    kubectl --context "${CONTEXT}" wait --for=delete "application/dib-argocd-e2e" -n "${ARGO_NS}" --timeout=120s >/dev/null 2>&1 || true
    kubectl --context "${CONTEXT}" delete namespace "${TARGET_NS}" --ignore-not-found >/dev/null 2>&1
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

# 이전 실패/중단 실행의 Application finalizer와 namespace가 남아 있을 수
# 있으므로, 새 시나리오를 시작하기 전에 테스트 대상만 순서대로 비운다.
kubectl --context "${CONTEXT}" delete application --all -n "${ARGO_NS}" --ignore-not-found >/dev/null 2>&1 || true
kubectl --context "${CONTEXT}" delete namespace "${TARGET_NS}" --ignore-not-found >/dev/null 2>&1 || true
kubectl --context "${CONTEXT}" wait --for=delete "namespace/${TARGET_NS}" --timeout=120s >/dev/null 2>&1 || true

cat > "${WORK}/Dockerfile" <<'EOF'
FROM busybox
RUN mkdir -p /www && echo "argocd e2e ok" > /www/index.html
EXPOSE 8080
CMD ["httpd", "-f", "-p", "8080", "-h", "/www"]
EOF
docker build -q -t "${IMAGE}" "${WORK}" >/dev/null
kind load docker-image "${IMAGE}" --name "${CLUSTER}"

# 외부 GitHub credential에 의존하지 않도록 chart만 담은 local Git source를
# ArgoCD repo-server가 접근 가능한 Docker Desktop host 주소로 제공한다.
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
  DIB_ARGOCD_E2E_REPO_URL="git://host.docker.internal:${GIT_PORT}/dib-e2e.git" \
  DIB_ARGOCD_E2E_PATH="helm-hosted-app" \
  go test -tags argocde2e -count=1 -run TestArgoCDE2E_RealDeploy ./internal/deploy/ -v )

echo "ALL PASS — ArgoCD Application sync/health + managed resource cleanup e2e"
