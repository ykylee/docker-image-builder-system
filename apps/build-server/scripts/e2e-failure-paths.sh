#!/usr/bin/env bash
# TASK-173 (v0.6.0): 실패 경로 e2e.
#
# 기존 e2e 13종은 전부 happy path(COMPLETED). 본 e2e 는 **의도적으로 실패하는**
# build 를 몰아 넣어, 실패가 canonical 하게 보고되는지 검증한다:
#   - build status → FAILED
#   - build.phase  → FAILED
#   - lastError.code → 단계별 canonical errorCode (P2-M3 채널)
#
# 검증 시나리오 2종(단일 compose 스택 재사용, cli mode 실 docker build):
#   A) docker build 실패     (Dockerfile 의 `RUN exit 1`)  → DOCKER_BUILD_FAILED
#   B) 컨테이너 테스트 실패   (서버 미기동 — port 미개방)   → CONTAINER_TEST_FAILED
#
# 전제: docker + docker compose + python3, ADMIN_IDS=admin, DOCKER_SOCKET_GID.
# 사용: DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)" ADMIN_IDS=admin \
#         bash apps/build-server/scripts/e2e-failure-paths.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

command -v docker >/dev/null 2>&1 || { red "[fatal] docker not found"; exit 1; }
docker info >/dev/null 2>&1 || { red "[fatal] docker daemon 미가용"; exit 1; }
if [[ -z "${DOCKER_SOCKET_GID:-}" ]]; then
  DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3 || true)"
fi
[[ -n "${DOCKER_SOCKET_GID}" ]] || { red "[fatal] DOCKER_SOCKET_GID 미설정"; exit 1; }
[[ -n "${ADMIN_IDS:-}" ]] || { red "[fatal] ADMIN_IDS 미설정 (export ADMIN_IDS=admin)"; exit 1; }
export DOCKER_SOCKET_GID ADMIN_IDS

TMP="$(mktemp -d)"
BASE="http://127.0.0.1:3000"
COMPOSE_FILES=(-f compose.dev.yaml -f compose.dev.e2e-production.yaml)
COMPOSE_PROJECT="dibs-fail-e2e-$$"
trap '
  docker compose "${COMPOSE_FILES[@]}" --project-name "${COMPOSE_PROJECT}" down -v >/dev/null 2>&1 || true
  rm -rf "${TMP}"
' EXIT

docker pull --quiet busybox:1.36 >/dev/null 2>&1 || yellow "  ⚠ busybox pull 실패 — 진행"

echo "[1/4] compose up — build-server + runner (cli mode)"
docker compose "${COMPOSE_FILES[@]}" --project-name "${COMPOSE_PROJECT}" up -d --build \
  >"${TMP}/up.log" 2>&1 || { red "[fatal] compose up 실패"; cat "${TMP}/up.log"; exit 1; }
green "  ✓ compose up (${COMPOSE_PROJECT})"

echo "[2/4] build-server health + runner 등록 대기"
for i in $(seq 1 60); do
  curl -fsS "${BASE}/health" >/dev/null 2>&1 && break; sleep 1
done
curl -fsS "${BASE}/health" >/dev/null 2>&1 || { red "[fatal] build-server unhealthy"; exit 1; }
REGISTERED=0
for i in $(seq 1 90); do
  COUNT="$(curl -fsS -H 'x-admin-id: admin' "${BASE}/admin/runners" 2>/dev/null \
    | python3 -c 'import json,sys
try: print(len(json.load(sys.stdin).get("runners",[])))
except Exception: print(0)' 2>/dev/null || echo 0)"
  [[ "${COUNT}" -ge 1 ]] && { REGISTERED=1; break; }
  sleep 1
done
[[ "${REGISTERED}" -eq 1 ]] || { red "[fatal] runner 미등록"; exit 1; }
green "  ✓ build-server healthy + runner 등록"

# run_failing_build <label> <dockerfile-path> <expected-errorcode>
run_failing_build() {
  local label="$1" dockerfile="$2" expect="$3"
  local dir arc appname enq build_id sha bytes upload
  dir="$(mktemp -d)"
  cp "${dockerfile}" "${dir}/Dockerfile"
  arc="${TMP}/${label}.tar.gz"
  tar -C "${dir}" -czf "${arc}" --owner=0 --group=0 Dockerfile
  bytes="$(wc -c < "${arc}" | tr -d ' ')"
  sha="$(sha256sum "${arc}" | awk '{print $1}')"
  appname="fail-${label}-$$"

  enq="$(curl -fsS -X POST "${BASE}/builds" -H 'content-type: application/json' -d "{
    \"appName\": \"${appname}\", \"requestedBy\": \"yklee\",
    \"sourceArchive\": {\"objectKey\": \"src/${appname}.tar.gz\", \"checksumSha256\": \"${sha}\", \"sizeBytes\": ${bytes}},
    \"entrypointPath\": \"src/index.ts\", \"dockerfilePath\": \"Dockerfile\"
  }" 2>&1)"
  build_id="$(printf '%s' "${enq}" | python3 -c 'import json,sys
try: print(json.load(sys.stdin)["build"]["buildId"])
except Exception: pass' 2>/dev/null || true)"
  [[ -n "${build_id}" ]] || { red "  ✗ ${label}: POST /builds 실패: ${enq}"; return 1; }
  curl -fsS -X POST "${BASE}/builds/${build_id}/source" \
    -H 'content-type: application/octet-stream' --data-binary "@${arc}" >/dev/null 2>&1 \
    || { red "  ✗ ${label}: source upload 실패"; return 1; }

  # terminal 대기 (FAILED 목표, 상한 4분).
  local deadline status
  deadline=$(( $(date +%s) + 240 ))
  status="unknown"
  while [[ $(date +%s) -lt ${deadline} ]]; do
    status="$(curl -fsS "${BASE}/builds/${build_id}" 2>/dev/null \
      | python3 -c 'import json,sys
try: print(json.load(sys.stdin)["build"]["status"])
except Exception: print("unknown")' 2>/dev/null || echo unknown)"
    [[ "${status}" == "FAILED" || "${status}" == "COMPLETED" ]] && break
    sleep 5
  done

  # 검증: status=FAILED / phase=FAILED / lastError.code=expect.
  local body phase code
  body="$(curl -fsS "${BASE}/builds/${build_id}" 2>/dev/null || true)"
  phase="$(printf '%s' "${body}" | python3 -c 'import json,sys
try: print(json.load(sys.stdin)["build"]["phase"])
except Exception: print("?")' 2>/dev/null || echo '?')"
  code="$(printf '%s' "${body}" | python3 -c 'import json,sys
try:
  le=json.load(sys.stdin).get("lastError")
  print(le.get("code") if le else "null")
except Exception: print("?")' 2>/dev/null || echo '?')"

  if [[ "${status}" != "FAILED" ]]; then
    red "  ✗ ${label}: status=${status}, want FAILED"; return 1
  fi
  if [[ "${phase}" != "FAILED" ]]; then
    red "  ✗ ${label}: phase=${phase}, want FAILED"; return 1
  fi
  if [[ "${code}" != "${expect}" ]]; then
    red "  ✗ ${label}: lastError.code=${code}, want ${expect}"; return 1
  fi
  green "  ✓ ${label}: FAILED / phase=FAILED / lastError.code=${code}"
  return 0
}

# A) docker build 실패.
cat > "${TMP}/Dockerfile.buildfail" <<'EOF'
FROM busybox:1.36
RUN exit 1
EOF
# B) 컨테이너 테스트 실패 — 이미지는 뜨지만 8080 미개방(서버 미기동).
cat > "${TMP}/Dockerfile.testfail" <<'EOF'
FROM busybox:1.36
EXPOSE 8080
CMD ["sleep", "3600"]
EOF

echo "[3/4] A) docker build 실패 → DOCKER_BUILD_FAILED"
run_failing_build "buildfail" "${TMP}/Dockerfile.buildfail" "DOCKER_BUILD_FAILED" || exit 1

echo "[4/4] B) 컨테이너 테스트 실패 → CONTAINER_TEST_FAILED"
run_failing_build "testfail" "${TMP}/Dockerfile.testfail" "CONTAINER_TEST_FAILED" || exit 1

echo
green "ALL PASS — 실패 경로 e2e (DOCKER_BUILD_FAILED + CONTAINER_TEST_FAILED 보고 검증)"
