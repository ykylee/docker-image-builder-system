#!/usr/bin/env bash
# TASK-067 happy-path e2e smoke for Runner container run + healthcheck.
#
# 이 스크립트는 Runner 가 Build Server 로부터 source archive 를 fetch +
# extract 한 뒤, 그 image 로 실제 docker container 를 띄우고
# healthcheck 가 안정될 때까지 polling 한 다음 ReportPreviewReady 에
# real container 정보를 전달하는 흐름을 검증한다. 단,
#
#   1) Build Server 측 `/builds/:buildId/source` endpoint 가 살아있어야
#      한다 (TASK-066, PR #20). 이 스크립트는 Runner 가 fetch 할 수
#      있도록 Build Server memory backend 를 띄운다.
#   2) Colima / Docker Desktop 등 실제 docker 데몬이 떠있어야 한다.
#      `docker info` 가 실패하면 스크립트는 "skip (no docker)" 로
#      graceful exit 한다.
#   3) RUNNER_DOCKER_RUN_MODE=cli 로 켜야 진짜 container 가 띄워진다.
#      default skeleton 모드는 mock ContainerStatus 만 emit 하므로
#      smoke 가 항상 PASS 하지만 진짜 container lifecycle 은 검증 안
#      된다.
#
# 검증 단계:
#   [1] Build Server memory backend 부팅 + `/health` 200
#   [2] tiny tar.gz source archive (FROM scratch + Dockerfile) 생성
#   [3] POST /builds + POST /builds/:id/source + claim
#   [4] Runner 기동 (RUNNER_DOCKER_RUN_MODE=cli) → container 띄움
#   [5] container 가 `docker ps` 에 살아있는지 + host port 가 listening
#   [6] Build Server 측 `GET /builds/:id` 가 canonical `test` 블록 +
#       hostPort / runtimeUrl 을 노출
#   [7] cleanup: Runner stop → docker rm -f <container>
#
# 환경:
#   - HOST_PORT override 가능 (default = OS ephemeral)
#   - RUNNER_STOP_CONTAINER_ON_DONE=true 로 e2e 가 cleanup 보장

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

PORT="${PORT:-}"
if [[ -z "${PORT}" ]]; then
  PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')"
fi
BASE="http://127.0.0.1:${PORT}"
# TASK-157: 진단 가능성 — E2E_KEEP_LOGS=1 이면 로그 디렉터리를 지우지 않고,
# E2E_LOG_DIR 로 위치를 고정할 수 있다. 기본 동작(임시 디렉터리 + 정리)은 불변.
if [[ -n "${E2E_LOG_DIR:-}" ]]; then
  TMP="${E2E_LOG_DIR}"; mkdir -p "$TMP"; E2E_KEEP_LOGS=1
else
  TMP="$(mktemp -d)"
fi
SOURCE_TAR="${TMP}/source.tar.gz"
RUNNER_LOG="${TMP}/runner.log"
SERVER_LOG="${TMP}/server.log"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  if [[ -n "${RUNNER_PID:-}" ]] && kill -0 "${RUNNER_PID}" 2>/dev/null; then
    kill "${RUNNER_PID}" 2>/dev/null || true
    wait "${RUNNER_PID}" 2>/dev/null || true
  fi
  # Always try to remove any lingering test containers — idempotent.
  if [[ -n "${CONTAINER_NAME:-}" ]]; then
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  fi
  if [[ "${E2E_KEEP_LOGS:-0}" == "1" ]]; then
    echo "  (로그 보존: ${TMP})"
  else
    rm -rf "${TMP}"
  fi
}
trap cleanup EXIT

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

# 0) Docker 데몬 확인. 없으면 skip (CI 에서 docker 미설치 환경 대비).
echo "[0/7] docker daemon check"
if ! docker info >/dev/null 2>&1; then
  yellow "docker daemon unavailable — skipping live container e2e."
  echo "  hint: docker info 또는 colima start 후 다시 실행."
  exit 0
fi

# 1) Build Server 기동
echo "[1/7] build-server boot (memory backend, port=${PORT})"
BUILD_REPOSITORY_BACKEND=memory PORT="${PORT}" \
  node apps/build-server/dist/apps/build-server/src/index.js \
  > "${SERVER_LOG}" 2>&1 &
SERVER_PID=$!

# health 대기
for _ in $(seq 1 50); do
  if curl -fsS "${BASE}/health" >/dev/null 2>&1; then
    green "  ✓ /health 200"
    break
  fi
  sleep 0.1
done
if ! curl -fsS "${BASE}/health" >/dev/null 2>&1; then
  red "  ✗ build-server did not become ready"
  tail -50 "${SERVER_LOG}"
  exit 1
fi

# 2) tiny source archive 생성 (FROM scratch + 단일 /healthz endpoint
# 응답하는 HTTP server 가 container 안에서 listening 하도록 작은 Go
# binary 가 이상적이지만, 외부 의존을 줄이기 위해 busybox httpd 와
# nginx 같은 시스템 image 가 없는 환경에서도 동작하도록 scratch +
# 헬리스 healthcheck 만 emit 하는 극단적으로 단순한 Dockerfile 사용).
# 단, scratch image 는 healthcheck 가 없으면 probe 가 실패하므로
# busybox 가 있는지 확인하고 가능하면 busybox 로 진행한다.
echo "[2/7] source archive (tar.gz) preparation"
# TASK-157: 픽스처를 **실제로 통과 가능한 것**으로 교체.
#
# 기존 픽스처는 `FROM busybox:1.36` + `EXPOSE` + `HEALTHCHECK` 뿐이라
# **서버를 띄우는 CMD 가 없었다**. busybox 기본 CMD 는 `sh` 이고 TTY 없이
# 즉시 종료되므로 컨테이너가 바로 죽고 8080 에 아무것도 없다 → healthcheck
# 가 반드시 timeout → phase=FAILED. 즉 이 e2e 는 **원리상 통과할 수 없는
# 픽스처**를 쓰면서 경고만 찍고 PASS 해왔다.
#
# 검증된 픽스처(`apps/build-server/scripts/e2e-production-semantic.sh`)를
# 그대로 채택한다. busybox httpd 는 기본이 Basic Auth 라 `GET /` 가 302 로
# 빠져 healthcheck 가 실패하므로 `/etc/httpd.conf` 에 permissive rule(`A:*`)
# 을 넣는 것이 핵심이다.
if ! docker image inspect busybox:1.36 >/dev/null 2>&1; then
  red "  ✗ busybox:1.36 이 없습니다. 이 e2e 는 busybox 기반 정적 서버로 컨테이너 기동을 검증합니다."
  echo "    hint: docker pull busybox:1.36"
  exit 1
fi

cat > "${TMP}/Dockerfile" <<'DOCKERFILE_EOF'
FROM busybox:1.36
RUN mkdir -p /www \
 && printf 'ok\n' > /www/index.html \
 && printf 'A:*\n' > /etc/httpd.conf
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/ || exit 1
CMD ["httpd", "-f", "-v", "-p", "8080", "-h", "/www", "-c", "/etc/httpd.conf"]
DOCKERFILE_EOF

# BuildContext (RUNNER_DOCKERFILE_PATH) 안의 파일들은 build context 로
# 함께 묶인다. 단순화를 위해 Dockerfile 만 둔다.
mkdir -p "${TMP}/ctx"
cp "${TMP}/Dockerfile" "${TMP}/ctx/Dockerfile"

tar -C "${TMP}/ctx" -czf "${SOURCE_TAR}" Dockerfile
SHA="$(shasum -a 256 "${SOURCE_TAR}" | awk '{print $1}')"
SIZE="$(wc -c < "${SOURCE_TAR}" | tr -d ' ')"
echo "  source archive: ${SOURCE_TAR} (sha256=${SHA}, size=${SIZE})"

# 3) Build Request + source archive upload + claim
echo "[3/7] POST /builds + source upload"
APP_NAME="task-067-e2e-$(date +%s)"
BUILD_RESP="$(curl -fsS -X POST "${BASE}/builds" \
  -H 'Content-Type: application/json' \
  -d "{\"appName\":\"${APP_NAME}\",\"requestedBy\":\"e2e-runner\",\"sourceArchive\":{\"objectKey\":\"hello-archive\",\"checksumSha256\":\"${SHA}\",\"sizeBytes\":${SIZE}},\"entrypointPath\":\"/\",\"dockerfilePath\":\"Dockerfile\",\"metadata\":{}}")"
BUILD_ID="$(echo "${BUILD_RESP}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["build"]["buildId"])')"
echo "  build_id=${BUILD_ID}"

curl -fsS -X POST "${BASE}/builds/${BUILD_ID}/source" \
  -H 'Content-Type: application/octet-stream' \
  -H "X-Checksum-Sha256: ${SHA}" \
  --data-binary "@${SOURCE_TAR}" \
  -o "${TMP}/post-resp.json" -w "  upload HTTP %{http_code}\n"

# 4) Runner 기동 (RUNNER_DOCKER_RUN_MODE=cli + RUNNER_STOP_CONTAINER_ON_DONE=true)
echo "[4/7] runner boot (cli mode, real docker run)"
CONTAINER_NAME="container-${BUILD_ID}"
# TASK-157: runner 는 CLI 플래그를 파싱하지 않는다 (cmd/runner/main.go 에 flag
# 처리가 없다). 설정은 전부 env 로 받는다 — internal/config 의
# HOST_SERVER_BASE_URL(기본 http://127.0.0.1:3000) / RUNNER_ID(기본 runner-default).
# 기존 `--host` / `--id` 인자는 **조용히 무시**되어 runner 가 기본 host 로 붙었고,
# claim 이 계속 실패해 컨테이너가 뜨지 않았다. 그런데도 e2e 는 경고만 찍고 PASS 했다.
RUNNER_WORKSPACE_ROOT="${TMP}/workspace" \
RUNNER_DOCKER_RUN_MODE=cli \
RUNNER_STOP_CONTAINER_ON_DONE=true \
RUNNER_HEALTHCHECK_TIMEOUT_SECONDS=30 \
RUNNER_DOCKER_BUILD_MODE=cli \
RUNNER_DOCKERFILE_PATH=Dockerfile \
PORT_FOR_INTERNAL=8080 \
HOST_SERVER_BASE_URL="${BASE}" \
RUNNER_ID="e2e-runner-${BUILD_ID}" \
  "${REPO_ROOT}/apps/runner/bin/runner-bin" \
  > "${RUNNER_LOG}" 2>&1 &
RUNNER_PID=$!

# TASK-157: 판정 기준을 `docker ps` → **Build Server 가 기록한 상태**로 옮긴다.
#
# 이유 두 가지:
#   1) RUNNER_STOP_CONTAINER_ON_DONE=true 라 **성공해도 컨테이너가 곧 지워진다**.
#      `docker ps` 로 보는 것은 성공/실패와 무관한 경주가 된다.
#   2) 기존 30s 는 image build(busybox pull 포함) + run + healthcheck 에 부족해
#      runner 가 healthcheck 도중 kill 되고 `context canceled` 로 끝났다.
#      그런데도 스크립트는 경고만 찍고 PASS 했다.
#
# 이제 최대 ${WAIT_BUDGET}s 동안 build 의 phase 진행을 폴링하고, 컨테이너
# 테스트 단계(CONTAINER_TEST_PASSED) 또는 terminal(COMPLETED/FAILED) 도달을 기다린다.
WAIT_BUDGET="${E2E_WAIT_BUDGET_SECONDS:-150}"
yellow "  waiting up to ${WAIT_BUDGET}s for build → run → healthcheck (Build Server 상태 기준)..."
REACHED_PHASE=""
CONTAINER_SEEN=0
for _ in $(seq 1 $((WAIT_BUDGET * 2))); do
  # 컨테이너가 한 번이라도 떴다는 사실은 별도로 기록 (지워져도 남는다).
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
    CONTAINER_SEEN=1
  fi
  REACHED_PHASE="$(curl -fsS "${BASE}/builds/${BUILD_ID}" 2>/dev/null \
    | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin); b=d.get("build",d)
    print(b.get("phase","") or "")
except Exception:
    print("")' 2>/dev/null || echo "")"
  case "${REACHED_PHASE}" in
    CONTAINER_TEST_PASSED|DEPLOYMENT_STARTED|DEPLOYMENT_COMPLETED|COMPLETED|FAILED) break ;;
  esac
  sleep 0.5
done
echo "  reached phase: ${REACHED_PHASE:-<none>}  (container seen: ${CONTAINER_SEEN})"

# 5) 컨테이너가 실제로 떴는지 — TASK-157 로 **hard assertion** 으로 전환.
#    `docker ps` 는 RUNNER_STOP_CONTAINER_ON_DONE=true 때문에 성공해도 곧
#    비므로 보조 지표로만 쓰고, 판정은 위 폴링이 관측한 CONTAINER_SEEN 과
#    Build Server 가 기록한 canonical test 결과로 한다.
echo "[5/7] 컨테이너 기동 확인 (hard)"
if [[ "${CONTAINER_SEEN}" != "1" ]]; then
  red "  ✗ 컨테이너가 한 번도 기동되지 않았습니다 (container=${CONTAINER_NAME})"
  echo "    reached phase: ${REACHED_PHASE:-<none>}"
  echo "    runner log tail:"; tail -n 20 "${RUNNER_LOG}" | sed 's/^/      /'
  exit 1
fi
green "  ✓ 컨테이너 기동 관측됨 (${CONTAINER_NAME})"

# 6) Build Server 가 기록한 **canonical** 결과 검증 — TASK-157 hard assertion.
#    기존 구현은 응답의 top-level `testDeployment` 를 읽었으나 그 필드는
#    `buildStatusResponse` 에 없다(legacy preview-era 모양). canonical 은
#    `test`(ContainerTestResult: status / containerRunning / healthCheckPassed
#    / portOpen / stabilityWindowPassed) 다.
echo "[6/7] canonical test 결과 검증 (hard)"
STATUS_RESP="$(curl -fsS "${BASE}/builds/${BUILD_ID}")"
echo "${STATUS_RESP}" > "${TMP}/status.json"
TEST_SUMMARY="$(python3 - "${TMP}/status.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
b = d.get("build", d)
t = d.get("test") or b.get("test") or {}
phase = (b.get("phase") or d.get("currentPhase") or "")
print("|".join([
    str(phase),
    str(t.get("status", "")),
    str(t.get("containerRunning", "")),
    str(t.get("healthCheckPassed", "")),
]))
PY
)"
PHASE="${TEST_SUMMARY%%|*}"; REST="${TEST_SUMMARY#*|}"
T_STATUS="${REST%%|*}"; REST="${REST#*|}"
T_RUNNING="${REST%%|*}"; T_HEALTH="${REST#*|}"
echo "  phase=${PHASE}  test.status=${T_STATUS}  containerRunning=${T_RUNNING}  healthCheckPassed=${T_HEALTH}"

case "${PHASE}" in
  COMPLETED|DEPLOYMENT_STARTED|DEPLOYMENT_COMPLETED|CONTAINER_TEST_PASSED) ;;
  *)
    red "  ✗ build 가 컨테이너 테스트 단계에 도달하지 못했습니다 (phase=${PHASE:-<none>})"
    echo "    status.json: ${TMP}/status.json"
    echo "    runner log tail:"; tail -n 20 "${RUNNER_LOG}" | sed 's/^/      /'
    exit 1 ;;
esac
green "  ✓ build 가 컨테이너 테스트 단계 통과 (phase=${PHASE})"

# 7) Cleanup: runner stop + docker rm -f
echo "[7/7] cleanup (runner stop + docker rm -f)"
if kill -0 "${RUNNER_PID}" 2>/dev/null; then
  kill "${RUNNER_PID}" 2>/dev/null || true
  wait "${RUNNER_PID}" 2>/dev/null || true
fi
docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
green "  ✓ cleanup complete"

echo
green "e2e container-run: PASS (컨테이너 기동 + 컨테이너 테스트 단계 도달을 hard assert)"
echo "  runner log: ${RUNNER_LOG}"
echo "  server log: ${SERVER_LOG}"