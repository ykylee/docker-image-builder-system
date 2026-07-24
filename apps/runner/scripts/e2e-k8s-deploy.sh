#!/usr/bin/env bash
# TASK-165 (P2-M5): k8s 실배포 + webhook 결과 전달 e2e.
#
# 두 M5 산출물을 실제 인프라로 검증한다:
#   Phase A — k8s: busybox httpd 이미지를 빌드→kind load→kubectlDeployer 로
#             실제 kind 클러스터에 배포하고 available replica=1 을 실측.
#   Phase B — webhook: build-server(memory)를 RESULT_WEBHOOK_URL 로 띄우고
#             HTTP 로 build 를 terminal 까지 몰아 stub 수신서가 canonical
#             BuildStatusResponse 를 실제로 받는지 실측.
#
# 전제: docker / kind / kubectl / go / python3. cluster 는 없으면 생성하고,
# 스크립트가 만든 경우에만 종료 시 삭제한다(기존 클러스터는 보존).
#
# 사용: bash apps/runner/scripts/e2e-k8s-deploy.sh
set -euo pipefail

CLUSTER="${DIB_K8S_E2E_CLUSTER:-dib-e2e}"
CONTEXT="kind-${CLUSTER}"
NS="${DIB_K8S_E2E_NS:-dib-e2e}"
IMAGE="dib-e2e/app:test"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUNNER_DIR="${REPO_ROOT}/apps/runner"
WORK="$(mktemp -d)"
CREATED_CLUSTER=0
BS_PID=""
STUB_PID=""

log() { printf '\n\033[1;36m[k8s-e2e]\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31m[k8s-e2e FAIL]\033[0m %s\n' "$*" >&2; exit 1; }

cleanup() {
  set +e
  [ -n "${BS_PID}" ] && kill "${BS_PID}" 2>/dev/null
  [ -n "${STUB_PID}" ] && kill "${STUB_PID}" 2>/dev/null
  kubectl --context "${CONTEXT}" delete namespace "${NS}" --ignore-not-found >/dev/null 2>&1
  if [ "${CREATED_CLUSTER}" = "1" ] && [ "${DIB_K8S_E2E_KEEP:-0}" != "1" ]; then
    log "kind 클러스터 삭제: ${CLUSTER}"
    kind delete cluster --name "${CLUSTER}" >/dev/null 2>&1
  fi
  rm -rf "${WORK}"
}
trap cleanup EXIT

# ---- 전제 점검 --------------------------------------------------------------
for bin in docker kind kubectl go python3; do
  command -v "$bin" >/dev/null 2>&1 || fail "필수 도구 없음: $bin"
done

# ---- 클러스터 준비 ----------------------------------------------------------
if ! kind get clusters 2>/dev/null | grep -qx "${CLUSTER}"; then
  log "kind 클러스터 생성: ${CLUSTER}"
  kind create cluster --name "${CLUSTER}" --wait 120s
  CREATED_CLUSTER=1
else
  log "기존 kind 클러스터 재사용: ${CLUSTER}"
fi
kubectl --context "${CONTEXT}" cluster-info >/dev/null || fail "클러스터 접속 불가: ${CONTEXT}"

# ============================================================================
# Phase A — k8s 실배포
# ============================================================================
log "Phase A: busybox httpd 이미지 빌드 → ${IMAGE}"
cat > "${WORK}/Dockerfile" <<'EOF'
FROM busybox
RUN mkdir -p /www && echo "dib-e2e ok" > /www/index.html
EXPOSE 8080
CMD ["httpd","-f","-p","8080","-h","/www"]
EOF
docker build -q -t "${IMAGE}" "${WORK}" >/dev/null

log "Phase A: kind 노드에 이미지 load"
kind load docker-image "${IMAGE}" --name "${CLUSTER}"

log "Phase A: kubectlDeployer 로 실배포 (go test -tags k8se2e)"
( cd "${RUNNER_DIR}" && \
  DIB_K8S_E2E_IMAGE="${IMAGE}" \
  DIB_K8S_E2E_CONTEXT="${CONTEXT}" \
  DIB_K8S_E2E_NS="${NS}" \
  go test -tags k8se2e -count=1 -run TestK8sE2E_RealDeploy ./internal/deploy/ -v ) \
  || fail "Phase A: k8s 실배포 실패"
log "Phase A PASS — 실제 kind 배포 available replica=1 실측"

# ============================================================================
# Phase B — webhook 결과 전달
# ============================================================================
log "Phase B: webhook stub 수신서 기동"
STUB_OUT="${WORK}/webhook.json"
WEBHOOK_PORT=18099
python3 - "$STUB_OUT" "$WEBHOOK_PORT" <<'PY' &
import sys, http.server, json
out, port = sys.argv[1], int(sys.argv[2])
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("content-length", 0))
        body = self.rfile.read(n)
        open(out, "wb").write(body)
        self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", port), H).serve_forever()
PY
STUB_PID=$!
sleep 1

log "Phase B: build-server(memory) 기동 (RESULT_WEBHOOK_URL 설정)"
BS_PORT=13010
( cd "${REPO_ROOT}" && \
  PORT="${BS_PORT}" \
  BUILD_REPOSITORY_BACKEND=memory \
  RESULT_WEBHOOK_URL="http://127.0.0.1:${WEBHOOK_PORT}/hook" \
  node apps/build-server/dist/apps/build-server/src/index.js > "${WORK}/bs.log" 2>&1 ) &
BS_PID=$!
for i in $(seq 1 20); do
  curl -sf "http://127.0.0.1:${BS_PORT}/health" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -sf "http://127.0.0.1:${BS_PORT}/health" >/dev/null || fail "Phase B: build-server 기동 실패 ($(cat "${WORK}/bs.log"))"

log "Phase B: build 생성 + terminal(COMPLETED) 보고"
CREATE=$(curl -sf -X POST "http://127.0.0.1:${BS_PORT}/builds" \
  -H 'content-type: application/json' \
  -d '{"appName":"webhook-e2e","requestedBy":"e2e","entrypointPath":"src/index.ts","sourceArchive":{"objectKey":"k","checksumSha256":"c","sizeBytes":1}}')
BUILD_ID=$(printf '%s' "$CREATE" | python3 -c 'import sys,json;print(json.load(sys.stdin)["build"]["buildId"])')
[ -n "$BUILD_ID" ] || fail "Phase B: build 생성 실패 ($CREATE)"
curl -sf -X POST "http://127.0.0.1:${BS_PORT}/builds/${BUILD_ID}/phase" \
  -H 'content-type: application/json' \
  -d '{"phase":"COMPLETED","runnerId":"e2e-runner"}' >/dev/null || fail "Phase B: phase 보고 실패"
sleep 1

log "Phase B: webhook 수신 + resultDelivery 검증"
[ -s "${STUB_OUT}" ] || fail "Phase B: webhook stub 이 아무것도 못 받음"
RECV_ID=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["build"]["buildId"])' "${STUB_OUT}")
[ "$RECV_ID" = "$BUILD_ID" ] || fail "Phase B: webhook payload buildId 불일치 ($RECV_ID != $BUILD_ID)"
STATUS=$(curl -sf "http://127.0.0.1:${BS_PORT}/builds/${BUILD_ID}")
MODE=$(printf '%s' "$STATUS" | python3 -c 'import json,sys;print(json.load(sys.stdin)["resultDelivery"]["mode"])')
RDSTATUS=$(printf '%s' "$STATUS" | python3 -c 'import json,sys;print(json.load(sys.stdin)["resultDelivery"]["status"])')
[ "$MODE" = "NOTIFICATION" ] || fail "Phase B: resultDelivery.mode = $MODE, want NOTIFICATION"
[ "$RDSTATUS" = "SUCCESS" ] || fail "Phase B: resultDelivery.status = $RDSTATUS, want SUCCESS"
log "Phase B PASS — webhook 수신(buildId 일치) + resultDelivery=NOTIFICATION/SUCCESS"

log "ALL PASS — P2-M5 k8s 실배포 + webhook 결과 전달 e2e"
