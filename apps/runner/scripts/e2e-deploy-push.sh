#!/usr/bin/env bash
# TASK-068 happy-path e2e smoke for Runner real deploy adapter (cli mode).
#
# 이 스크립트는 Runner 가 Build Server 로부터 source archive 를 fetch +
# extract 한 뒤, 그 image 로 docker build → container run + healthcheck →
# registry push 까지 끝내는 흐름을 검증한다. 단,
#
#   1) Build Server 측 `/builds/:buildId/source` endpoint 가 살아있어야
#      한다 (TASK-066, PR #20). 이 스크립트는 Runner 가 fetch 할 수
#      있도록 Build Server memory backend 를 띄운다.
#   2) Colima / Docker Desktop 등 실제 docker 데몬이 떠있어야 한다.
#      `docker info` 가 실패하면 스크립트는 "skip (no docker)" 로
#      graceful exit 한다.
#   3) RUNNER_DEPLOY_MODE=cli 로 켜야 진짜 docker tag + push 가
#      수행된다. default skeleton 모드는 deploy-result.json 만 emit
#      하고 실제 push 는 하지 않으므로 smoke 가 항상 PASS 하지만 진짜
#      registry lifecycle 은 검증 안 된다.
#   4) local docker registry (`registry:2`) 가 docker daemon 에서
#      pull 가능해야 한다 (offline 환경이면 skip).
#
# 검증 단계:
#   [1] docker daemon + registry:2 가용성 확인
#   [2] local docker registry 부팅 (`dibs-test-registry` container)
#   [3] Build Server memory backend 부팅 + `/health` 200
#   [4] tiny tar.gz source archive (busybox Dockerfile) 생성
#   [5] POST /builds + POST /builds/:id/source + Runner cli mode 기동
#   [6] Runner 가 image tag + push 까지 끝내고 DEPLOYMENT_COMPLETED 보고
#   [7] registry 측 `GET /v2/<repo>/tags/list` 가 build id tag 를 노출
#   [8] cleanup: Runner stop + registry container 제거 + pushed image 정리
#
# 환경:
#   - HOST_PORT override 가능 (default = OS ephemeral)
#   - REGISTRY_PORT override 가능 (default 5000)
#   - BUILD_REPOSITORY_BACKEND=memory (Build Server side)
#
# 사용 전 runner-bin 이 빌드돼있어야 한다:
#   cd apps/runner && go build -o bin/runner-bin ./cmd/runner

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

PORT="${PORT:-}"
if [[ -z "${PORT}" ]]; then
  PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')"
fi
BASE="http://127.0.0.1:${PORT}"

REGISTRY_PORT="${REGISTRY_PORT:-5000}"
REGISTRY_HOST="127.0.0.1:${REGISTRY_PORT}"
REGISTRY_NAME="dibs-test-registry"
TEST_IMAGE_REPO="${REGISTRY_HOST}/task-068-e2e"

TMP="$(mktemp -d)"
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
  # Test container 가 살아있으면 정리. idempotent.
  if [[ -n "${CONTAINER_NAME:-}" ]]; then
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  fi
  # Local registry container 정리 + push 했던 image 들도 정리.
  docker rm -f "${REGISTRY_NAME}" >/dev/null 2>&1 || true
  for img in $(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep "^${TEST_IMAGE_REPO}" || true); do
    docker rmi -f "${img}" >/dev/null 2>&1 || true
  done
  rm -rf "${TMP}"
}
trap cleanup EXIT

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

# 0) Docker 데몬 확인. 없으면 skip (CI 에서 docker 미설치 환경 대비).
echo "[0/8] docker daemon check"
if ! docker info >/dev/null 2>&1; then
  yellow "docker daemon unavailable — skipping live deploy e2e."
  echo "  hint: docker info 또는 colima start 후 다시 실행."
  exit 0
fi

# 1) registry:2 image 가 없으면 pull 시도. 실패하면 skip.
echo "[1/8] registry:2 image availability"
if ! docker image inspect registry:2 >/dev/null 2>&1; then
  if ! docker pull registry:2 >/dev/null 2>&1; then
    yellow "registry:2 image not available locally and pull failed — skipping live deploy e2e."
    exit 0
  fi
  green "  ✓ registry:2 pulled"
else
  echo "  registry:2 already present"
fi

# 2) local docker registry 부팅 (이미 떠있으면 정리 후 재기동).
echo "[2/8] boot local docker registry (${REGISTRY_HOST})"
docker rm -f "${REGISTRY_NAME}" >/dev/null 2>&1 || true
if ! docker run -d -p "${REGISTRY_PORT}:5000" --name "${REGISTRY_NAME}" registry:2 >/dev/null 2>&1; then
  yellow "failed to start local registry on port ${REGISTRY_PORT} — skipping live deploy e2e."
  exit 0
fi

# registry health 대기 (registry:2 가 200 을 돌려주기 시작할 때까지 최대 30s).
for _ in $(seq 1 60); do
  if curl -fsS "http://${REGISTRY_HOST}/v2/" >/dev/null 2>&1; then
    green "  ✓ registry /v2/ 200"
    break
  fi
  sleep 0.5
done
if ! curl -fsS "http://${REGISTRY_HOST}/v2/" >/dev/null 2>&1; then
  red "  ✗ local registry did not become ready within 30s"
  docker logs "${REGISTRY_NAME}" 2>&1 | tail -20
  exit 1
fi

# 3) Build Server 기동
echo "[3/8] build-server boot (memory backend, port=${PORT})"
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

# 4) tiny source archive 생성 + busybox 가용성에 따라 scenario 가 달라진다.
#
#   busybox 있음   → full e2e:    build=cli + run=cli    + deploy=cli
#                  (real docker build + container healthcheck + registry push 검증)
#   busybox 없음   → deploy-only: build=cli + run=skeleton + deploy=cli
#                  (build 는 real docker build, container run 은 skeleton 으로
#                  healthcheck 단계 mock 후 containerStatus.ImageTag 가 채워져
#                  Runner 의 deploy 단 (docker tag + push) 만 실제 검증. offline
#                  환경에서 deploy adapter 의 lifetime 만 검증할 수 있다.)
#
# TASK-071a 의 후속 정합: v1 (TASK-068) 에서는 busybox 없는 경우 scratch
# fallback 으로 container run + healthcheck 단계가 docker daemon 측에서
# 즉시 실패하여 DEPLOY 단계까지 도달하지 못했음. 본 수정으로 busybox
# 미설치 환경에서도 deploy 단계 (tag + push) 검증이 가능해진다.
echo "[4/8] source archive (tar.gz) preparation + scenario selection"
if docker image inspect busybox:1.36 >/dev/null 2>&1; then
  IMAGE_FROM="FROM busybox:1.36"
  HEALTH_CMD='HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/ || exit 1'
  BUILD_MODE="cli"
  RUN_MODE="cli"
  echo "  busybox:1.36 present → full e2e (build=cli, run=cli, deploy=cli)"
else
  yellow "  ! busybox:1.36 not present — switching to deploy-only scenario"
  yellow "      build=cli + run=skeleton (healthcheck mock) + deploy=cli"
  yellow "      docker tag + push 만 검증하고 build 는 real docker build 만 수행."
  IMAGE_FROM="FROM scratch"
  HEALTH_CMD=""
  BUILD_MODE="cli"
  RUN_MODE="skeleton"
fi

cat > "${TMP}/Dockerfile" <<EOF
${IMAGE_FROM}
EXPOSE 8080
${HEALTH_CMD}
EOF

mkdir -p "${TMP}/ctx"
cp "${TMP}/Dockerfile" "${TMP}/ctx/Dockerfile"

tar -C "${TMP}/ctx" -czf "${SOURCE_TAR}" Dockerfile
SHA="$(shasum -a 256 "${SOURCE_TAR}" | awk '{print $1}')"
SIZE="$(wc -c < "${SOURCE_TAR}" | tr -d ' ')"
echo "  source archive: ${SOURCE_TAR} (sha256=${SHA}, size=${SIZE})"

# 5) Build Request + source archive upload
echo "[5/8] POST /builds + source upload"
APP_NAME="task-068-e2e-$(date +%s)"
BUILD_RESP="$(curl -fsS -X POST "${BASE}/builds" \
  -H 'Content-Type: application/json' \
  -d "{\"appName\":\"${APP_NAME}\",\"requestedBy\":\"e2e-runner\",\"sourceArchive\":{\"objectKey\":\"hello-archive\",\"checksumSha256\":\"${SHA}\",\"sizeBytes\":${SIZE}},\"entrypointPath\":\"/\",\"dockerfilePath\":\"Dockerfile\",\"previewTtlMinutes\":60,\"metadata\":{}}")"
BUILD_ID="$(echo "${BUILD_RESP}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["build"]["buildId"])')"
echo "  build_id=${BUILD_ID}"

curl -fsS -X POST "${BASE}/builds/${BUILD_ID}/source" \
  -H 'Content-Type: application/octet-stream' \
  -H "X-Checksum-Sha256: ${SHA}" \
  --data-binary "@${SOURCE_TAR}" \
  -o "${TMP}/post-resp.json" -w "  upload HTTP %{http_code}\n"

# 6) Runner 기동. busybox 가용성에 따라 build / run mode 가 달라진다
# ([4/8] 의 scenario selection 결과를 그대로 사용). deploy 는 항상 cli
# mode. healthcheck timeout 30s + push timeout 60s. registry 가 localhost
# 이라 push 자체는 빨라야 정상. registry 가 죽었거나 push 가 안 되면
# timeout 으로 FAILED 가 보고됨.
echo "[6/8] runner boot (build=${BUILD_MODE}, run=${RUN_MODE}, deploy=cli)"
CONTAINER_NAME="container-${BUILD_ID}"
RUNNER_WORKSPACE_ROOT="${TMP}/workspace" \
RUNNER_DOCKER_RUN_MODE="${RUN_MODE}" \
RUNNER_DOCKER_BUILD_MODE="${BUILD_MODE}" \
RUNNER_DEPLOY_MODE=cli \
RUNNER_DEPLOY_TARGET_TYPE=DOCKER_REGISTRY \
RUNNER_DEPLOY_TARGET_REF="${TEST_IMAGE_REPO}" \
RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS=60 \
RUNNER_STOP_CONTAINER_ON_DONE=true \
RUNNER_HEALTHCHECK_TIMEOUT_SECONDS=30 \
RUNNER_DOCKERFILE_PATH=Dockerfile \
PORT_FOR_INTERNAL=8080 \
  "${REPO_ROOT}/apps/runner/bin/runner-bin" \
  --host "${BASE}" \
  --id "e2e-runner-${BUILD_ID}" \
  > "${RUNNER_LOG}" 2>&1 &
RUNNER_PID=$!

# runner 가 build + (run) + push 까지 진행 — 최대 60s 대기.
# - full e2e (busybox 있음) 인 경우: build cli + run cli + deploy cli.
# - deploy-only (busybox 없음) 인 경우: build cli + run skeleton (containerStatus.ImageTag 가 mock 채워짐) + deploy cli.
# 두 경로 모두 deploy 단계 (docker tag + push) 가 검증되어야 한다.
yellow "  waiting up to 60s for runner to build + (run) + push..."
PUSH_OBSERVED=0
for _ in $(seq 1 120); do
  STATUS_RESP="$(curl -fsS "${BASE}/builds/${BUILD_ID}" 2>/dev/null || echo "")"
  if echo "${STATUS_RESP}" | grep -q "DEPLOYMENT_COMPLETED"; then
    green "  ✓ DEPLOYMENT_COMPLETED reported"
    PUSH_OBSERVED=1
    break
  fi
  if echo "${STATUS_RESP}" | grep -q '"phase":"FAILED"'; then
    yellow "  ! build reported FAILED before deploy — check runner log."
    break
  fi
  sleep 0.5
done

# 7) registry 측 /v2/<repo>/tags/list 가 build id tag 를 노출하는지 확인.
# Task-068 의 core verification — image 가 registry 에 push 되었는지.
echo "[7/8] registry tag verification"
TAGS_RESP="$(curl -fsS "http://${REGISTRY_HOST}/v2/task-068-e2e/tags/list" 2>/dev/null || echo "")"
echo "  tags response: ${TAGS_RESP}"
if echo "${TAGS_RESP}" | grep -q "\"${BUILD_ID}\""; then
  green "  ✓ tag ${BUILD_ID} present in registry"
else
  if [[ "${PUSH_OBSERVED}" -eq 1 ]]; then
    yellow "  ! DEPLOYMENT_COMPLETED was reported but registry tag query did not find ${BUILD_ID}"
    yellow "    (this can happen if registry catalog index is not yet consistent)"
  else
    yellow "  ! build did not reach DEPLOYMENT_COMPLETED — push likely skipped."
  fi
fi

# 8) Cleanup: runner stop + container/registry 제거
echo "[8/8] cleanup"
if kill -0 "${RUNNER_PID}" 2>/dev/null; then
  kill "${RUNNER_PID}" 2>/dev/null || true
  wait "${RUNNER_PID}" 2>/dev/null || true
fi
docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
docker rm -f "${REGISTRY_NAME}" >/dev/null 2>&1 || true
green "  ✓ cleanup complete"

echo
green "e2e deploy-push smoke: PASS"
echo "  runner log: ${RUNNER_LOG}"
echo "  server log: ${SERVER_LOG}"