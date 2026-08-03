#!/usr/bin/env bash
# Helm adapter e2e. Requires docker, kind, kubectl, helm and go.
set -euo pipefail

CLUSTER="${DIB_HELM_E2E_CLUSTER:-dib-helm-e2e}"
NS="${DIB_HELM_E2E_NS:-dib-helm-e2e}"
IMAGE="${DIB_HELM_E2E_IMAGE:-dib-helm-e2e/app:test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK="$(mktemp -d)"
CREATED=0

cleanup() {
  set +e
  kubectl --context "kind-${CLUSTER}" delete namespace "${NS}" --ignore-not-found >/dev/null 2>&1
  if [ "${CREATED}" = "1" ] && [ "${DIB_HELM_E2E_KEEP:-0}" != "1" ]; then
    kind delete cluster --name "${CLUSTER}" >/dev/null 2>&1
  fi
  rm -rf "${WORK}"
}
trap cleanup EXIT

for bin in docker kind kubectl helm go; do
  command -v "$bin" >/dev/null 2>&1 || { echo "missing prerequisite: $bin" >&2; exit 1; }
done

if ! kind get clusters | grep -qx "${CLUSTER}"; then
  kind create cluster --name "${CLUSTER}" --wait 120s
  CREATED=1
fi

cat > "${WORK}/Dockerfile" <<'EOF'
FROM busybox
RUN mkdir -p /www && echo "helm e2e ok" > /www/index.html
EXPOSE 8080
CMD ["httpd", "-f", "-p", "8080", "-h", "/www"]
EOF
docker build -q -t "${IMAGE}" "${WORK}" >/dev/null
kind load docker-image "${IMAGE}" --name "${CLUSTER}"

(cd "${ROOT}/apps/runner" && \
  DIB_HELM_E2E_CHART="${ROOT}/examples/helm-hosted-app" \
  DIB_HELM_E2E_IMAGE="${IMAGE}" \
  DIB_HELM_E2E_NS="${NS}" \
  DIB_HELM_E2E_CONTEXT="kind-${CLUSTER}" \
  DIB_HELM_E2E_RELEASE="dib-helm-e2e" \
  go test -tags helme2e -count=1 -run TestHelmE2E_RealDeploy ./internal/deploy/ -v)

echo "ALL PASS — Helm adapter e2e"
