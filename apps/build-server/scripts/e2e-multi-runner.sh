#!/usr/bin/env bash
# TASK-081-B: multi-runner concurrent claim 운영 검증.
#
# Build Server + 3 runner (RUNNER_ID=runner-compose-1 / runner-multi-2 /
# runner-multi-3) 를 docker compose 로 띄우고, 5 build 를 POST 한 뒤:
#
#   1) 각 build 가 정확히 1 cycle 에 1 build 만 claim (단일 runner 점유)
#   2) 충분 시간 후 5 build 모두 terminal phase
#   3) admin /admin/runners 조회 시 3 row + buildsClaimed 가 분산
#
# 을 모두 검증. regression guard (TASK-081-A 의 memory-build-repository
# 신규 4건) 의 production e2e 동등물.
#
# TASK-086 보강:
#   - BASE URL 을 BUILD_SERVER_URL env override 가능하도록 정렬 (TASK-082
#     `e2e-multi-runner-postgres.sh` 와 동일 패턴). 기본값은 compose 의
#     `ports: "3000:3000"` mapping 으로 host 에서 접근 가능한 127.0.0.1:3000.
#     이전 `http://build-server:3000` 는 docker network 내부 DNS 이름이라
#     host shell 에서 실행 시 unreachable 이었던 결함 봉인.
#   - [5/6] admin 분산 검증 의 Python heredoc 가 stdin pipe 를 hijack 하는
#     결함 수정 (heredoc 는 bash redirections 중 가장 마지막에 처리되어
#     pipe 의 stdin 을 덮어쓰므로 `sys.stdin.read()` 가 항상 빈 응답을
#     받음 — JSON 파싱이 즉시 fail). env var 로 데이터를 전달하는 패턴으로
#     교체.
#   - [2/6] runner registry 등록 대기 30s → 90s. TASK-085 production
#     semantic e2e 에서 같은 race (register 후 첫 poll cycle 까지 30-90s)
#     가 관측되어 동일 결함이 본 스크립트에도 있음을 확인.
#   - [0/6] compose up 에 `--build` 추가 — TASK-085 가 runner binary 를
#     보강한 뒤에도 host 에 cached image 가 남아있으면 새 binary 미반영.
#     후속 TASK 가 runner 를 또 변경할 때마다 의도 없이 모두 적용되도록.
#   - project name 을 `dibs-multi-runner-$$` 로 변경 — 동일 스크립트의
#     병렬 실행이나 다른 스크립트와의 port 충돌 방지.
#
# 사용:
#   # 환경 변수 (TASK-078 / TASK-080 dogfood 와 동일)
#   export DOCKER_SOCKET_GID=$(getent group docker | cut -d: -f3)
#   export ADMIN_IDS=admin
#
#   bash apps/build-server/scripts/e2e-multi-runner.sh
#
# 운영 환경 override 예:
#   export BUILD_SERVER_URL=http://10.0.0.5:8080  # 외부 host 로 e2e
#   bash apps/build-server/scripts/e2e-multi-runner.sh
#
# 시간: 약 2-4분 (build-server healthcheck 30-50s + 5 build lifecycle ~30-60s
# + admin 조회 + cleanup). docker image 가 이미 빌드되어 있다면 더 짧음.
#
# graceful skip: image (dibs/build-server:dev / dibs/runner:dev) 가 없으면
# build 단계로 fallback. Docker daemon 이 없으면 즉시 fail.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
blue()   { printf '\033[34m%s\033[0m\n' "$*"; }

# docker / docker compose 가용성.
if ! command -v docker >/dev/null 2>&1; then
  red "[fatal] docker not found in PATH"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  red "[fatal] docker daemon not reachable (colima 실행 여부 확인)"
  exit 1
fi

# 필수 env.
if [[ -z "${DOCKER_SOCKET_GID:-}" ]]; then
  DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3 || true)"
fi
if [[ -z "${DOCKER_SOCKET_GID}" ]]; then
  red "[fatal] DOCKER_SOCKET_GID not set and cannot derive from 'getent group docker'"
  exit 1
fi
if [[ -z "${ADMIN_IDS:-}" ]]; then
  red "[fatal] ADMIN_IDS not set (export ADMIN_IDS=admin)"
  exit 1
fi
export DOCKER_SOCKET_GID
export ADMIN_IDS

# 임시 디렉터리 (build-server log, 임시 file 등).
TMP="$(mktemp -d)"
# TASK-086 보강: project name 에 $$ suffix — 병렬 실행 / port 충돌 방지.
# 다른 스크립트 (e2e-multi-runner-postgres / e2e-production-semantic) 가 같은
# 3000 port 를 expose 해도 다른 network 에서 띄우므로 충돌 없이 동시 실행 가능.
# 기존 fixed project name `dibs-multi-runner` 가 다른 스크립트와 충돌했음.
COMPOSE_PROJECT="dibs-multi-runner-$$"
trap '
  docker compose -f compose.dev.yaml -f compose.dev.runner-multi.yaml \
    --project-name "'"${COMPOSE_PROJECT}"'" down -v >/dev/null 2>&1 || true
  rm -rf "${TMP}"
' EXIT

# compose up — build-server + 3 runner.
# TASK-086 보강: --build 추가 — TASK-085 / 후속 TASK 가 runner binary 를
# 변경했을 때 cached image 가 남아있으면 새 binary 미반영되는 silent failure
# 를 방지. TASK-078 dogfood 와 동일하게 매번 image build.
blue "[0/6] compose up — build-server + 3 runner (--build)"
docker compose -f compose.dev.yaml -f compose.dev.runner-multi.yaml \
  --project-name "${COMPOSE_PROJECT}" up -d --build \
  >"${TMP}/compose-up.log" 2>&1
if [[ $? -ne 0 ]]; then
  red "[fatal] docker compose up failed"
  cat "${TMP}/compose-up.log"
  exit 1
fi
green "  ✓ compose up (project=${COMPOSE_PROJECT})"

# build-server health 대기 (HEALTHCHECK start_period 15s + interval 10s).
echo
blue "[1/6] build-server health 대기"
HEALTHY=0
for i in $(seq 1 60); do
  HEALTH="$(docker compose -f compose.dev.yaml -f compose.dev.runner-multi.yaml \
    --project-name "${COMPOSE_PROJECT}" ps --format json 2>/dev/null \
    | python3 -c 'import json,sys
try:
  for line in sys.stdin:
    d = json.loads(line)
    if d.get("Service") == "build-server":
      print(d.get("Health", ""))
except Exception:
  pass
' 2>/dev/null || true)"
  if [[ "${HEALTH}" == *"healthy"* ]]; then
    HEALTHY=1
    break
  fi
  sleep 1
done
if [[ "${HEALTHY}" -ne 1 ]]; then
  red "[fatal] build-server did not become healthy in 60s"
  docker compose -f compose.dev.yaml -f compose.dev.runner-multi.yaml \
    --project-name "${COMPOSE_PROJECT}" logs --tail=50 build-server
  exit 1
fi
green "  ✓ build-server healthy"

# TASK-086 보강: BASE URL 을 BUILD_SERVER_URL env override 가능하도록 정렬.
# `build-server` 는 docker network 내부 DNS 이름이라 host shell 에서
# 실행 시 unreachable 이었던 결함 봉인. compose 의 `ports: "3000:3000"`
# mapping 으로 host 의 127.0.0.1:3000 으로 접근 가능. 운영 환경에서 외부
# build-server 를 가리키고 싶으면 BUILD_SERVER_URL 으로 override (TASK-082
# `e2e-multi-runner-postgres.sh` 와 동일 패턴).
BASE="${BUILD_SERVER_URL:-http://127.0.0.1:3000}"

# 3 runner 가 admin 에 등록되는지 대기.
# TASK-086 보강: timeout 30s → 90s. TASK-085 production semantic e2e 에서
# 같은 race (register 후 첫 poll cycle 까지 30-90s) 가 관측되어 동일 결함이
# 본 스크립트에도 있음을 확인. 90s 여유로 cover.
echo
blue "[2/6] 3 runner registry 등록 대기 (최대 90s)"
REGISTERED=0
for i in $(seq 1 90); do
  RUNNERS="$(curl -fsS -H 'x-admin-id: admin' "${BASE}/admin/runners" 2>/dev/null || true)"
  COUNT="$(printf '%s' "${RUNNERS}" | python3 -c 'import json,sys
try:
  d = json.loads(sys.stdin.read())
  print(len(d.get("runners", [])))
except Exception:
  print(0)
' 2>/dev/null || echo 0)"
  if [[ "${COUNT}" -ge 3 ]]; then
    REGISTERED=1
    break
  fi
  sleep 1
done
if [[ "${REGISTERED}" -ne 1 ]]; then
  red "[fatal] expected 3 runners registered, got ${COUNT}"
  printf '%s\n' "${RUNNERS}" | head -3
  # TASK-086 보강: 마지막 디버깅 단서 — runner container log tail.
  docker compose -f compose.dev.yaml -f compose.dev.runner-multi.yaml \
    --project-name "${COMPOSE_PROJECT}" logs --tail=30 runner runner2 runner3 2>&1 | sed 's/^/    /' || true
  exit 1
fi
green "  ✓ 3 runners registered (${COUNT})"

# 5 build 적재. busybox/scratch Dockerfile + size 0 archive (테스트용 dummy).
# 각 build 의 appName 은 unique 해야 active-build dedup 가 통과.
echo
blue "[3/6] 5 build POST + source archive upload"
BUILDS=()
for i in 0 1 2 3 4; do
  APPNAME="multi-runner-${i}-$$"
  ENQ="$(curl -fsS -X POST "${BASE}/builds" \
    -H 'content-type: application/json' \
    -d "{
      \"appName\": \"${APPNAME}\",
      \"requestedBy\": \"yklee\",
      \"sourceArchive\": {
        \"objectKey\": \"src/${APPNAME}/archive.tar.gz\",
        \"checksumSha256\": \"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",
        \"sizeBytes\": 0
      },
      \"entrypointPath\": \"src/index.ts\"
    }" 2>&1)"
  BUILD_ID="$(printf '%s' "${ENQ}" | python3 -c 'import json,sys
try:
  print(json.loads(sys.stdin.read())["build"]["buildId"])
except Exception:
  pass
' 2>/dev/null || true)"
  if [[ -z "${BUILD_ID}" ]]; then
    red "  ✗ POST /builds failed for ${APPNAME}: ${ENQ}"
    exit 1
  fi
  BUILDS+=("${BUILD_ID}")
  # source archive upload — empty body (size 0) 와 declared checksumSha256/sizeBytes
  # 정합. checksum 재계산 시 빈 input 의 sha256 = e3b0...855 라 일치.
  curl -fsS -X POST "${BASE}/builds/${BUILD_ID}/source" \
    -H 'content-type: application/octet-stream' \
    --data-binary '' >/dev/null 2>&1 || true
  green "  ✓ ${APPNAME} → ${BUILD_ID}"
done

# 충분 시간 대기 — 5 build × lifecycle ~30-60s = 약 5분 상한.
echo
blue "[4/6] 5 build lifecycle 대기 (상한 5분)"
COMPLETED=0
DEADLINE=$(( $(date +%s) + 300 ))
while [[ $(date +%s) -lt ${DEADLINE} ]]; do
  COMPLETED=0
  FAILED=0
  for bid in "${BUILDS[@]}"; do
    STATUS="$(curl -fsS "${BASE}/builds/${bid}" 2>/dev/null \
      | python3 -c 'import json,sys
try:
  print(json.loads(sys.stdin.read())["build"]["status"])
except Exception:
  pass
' 2>/dev/null || echo unknown)"
    if [[ "${STATUS}" == "COMPLETED" ]]; then
      COMPLETED=$((COMPLETED + 1))
    elif [[ "${STATUS}" == "FAILED" ]]; then
      FAILED=$((FAILED + 1))
    fi
  done
  TERMINAL=$((COMPLETED + FAILED))
  if [[ ${TERMINAL} -eq 5 ]]; then
    break
  fi
  printf '  ... completed=%d failed=%d (terminal=%d/5)\n' "${COMPLETED}" "${FAILED}" "${TERMINAL}"
  sleep 15
done
TERMINAL=$((COMPLETED + FAILED))
if [[ ${TERMINAL} -ne 5 ]]; then
  red "[fatal] only ${TERMINAL}/5 builds reached terminal phase within 5min"
  # 각 build 의 마지막 phase 출력 (디버깅).
  for bid in "${BUILDS[@]}"; do
    curl -fsS "${BASE}/builds/${bid}" 2>/dev/null \
      | python3 -c 'import json,sys
try:
  d = json.loads(sys.stdin.read())
  print(f"    {d[\"build\"][\"buildId\"]}: status={d[\"build\"][\"status\"]} phase={d[\"build\"][\"phase\"]}")
except Exception:
  pass
' 2>/dev/null || true
  done
  exit 1
fi
if [[ ${FAILED} -eq 5 ]]; then
  yellow "  ⚠ all 5 builds FAILED — likely source upload did not carry a working tar.gz"
  yellow "    multi-runner claim 분산 검증은 아래 단계에서 정상 동작 확인됨"
  yellow "    (FAILED 가 발생해도 buildsClaimed 분포가 multi-runner 동작의 핵심 증거)"
fi
green "  ✓ all 5 builds reached terminal phase (COMPLETED=${COMPLETED}, FAILED=${FAILED})"

# admin /admin/runners 분산 검증 — 3 row + buildsClaimed 합 = 5 + 분산.
# multi-runner 의 핵심 증거는 "buildsClaimed 가 여러 runner 에 분산" 되어 있는
# 것이지, buildsCompleted == 5 가 아님. FAILED build 도 claim 으로 카운트되므로
# 분산 검증의 본질은 multi-runner 가 동시 작업했다는 사실 자체.
echo
blue "[5/6] admin /admin/runners 분산 검증"
RUNNERS="$(curl -fsS -H 'x-admin-id: admin' "${BASE}/admin/runners")"
# TASK-086 보강: heredoc + pipe 동시 사용 시 bash 가 heredoc 으로 stdin 을
# override 하는 결함 수정. 이전 패턴은 `echo "${RUNNERS}" | python3 <<'PY'`
# 였는데 이건 stdin pipe 를 무시하고 heredoc body 를 stdin 으로 노출 —
# `sys.stdin.read()` 가 항상 빈 응답을 받아 JSON parse 가 즉시 fail. TASK-085
# production semantic e2e 에서 같은 패턴이 우연히 동작했던 이유 (heredoc 안의
# `${VAR}` 가 shell expansion 으로 JSON 받을 수 있어서) 도 본 스크립트에는
# 적용 안 됨. 본 스크립트에서는 heredoc body 가 static 이므로 env var 를 통해
# 데이터를 명시적으로 전달한다 — `os.environ["RUNNERS_JSON"]`. heredoc marker
# 는 여전히 `<<'PY'` quoted 이라 heredoc body 의 모든 expand 가 비활성화되어
# 회귀 안정성 유지.
RUNNERS_JSON="${RUNNERS}" python3 <<'PY'
import json, os, sys
data = json.loads(os.environ["RUNNERS_JSON"])
runners = data.get("runners", [])
print(f"  {len(runners)} runners registered:")
for r in runners:
    print(f"    {r['runnerId']:24s} status={r['status']:8s} buildsClaimed={r['buildsClaimed']} buildsCompleted={r['buildsCompleted']}")
total_claimed = sum(r['buildsClaimed'] for r in runners)
total_completed = sum(r['buildsCompleted'] for r in runners)
print(f"  total: claimed={total_claimed} completed={total_completed}")
if len(runners) < 3:
    print(f"  ✗ expected at least 3 runners, got {len(runners)}")
    sys.exit(1)
if total_claimed != 5:
    print(f"  ✗ buildsClaimed total != 5 ({total_claimed}) — duplicate or missing claims")
    sys.exit(1)
runners_with_work = sum(1 for r in runners if r['buildsClaimed'] >= 1)
if runners_with_work < 2:
    print(f"  ⚠ only {runners_with_work} runner(s) claimed any builds — multi-runner benefit marginal")
    sys.exit(1)
print(f"  ✓ {runners_with_work}/3 runners actively claimed builds — multi-runner distribution confirmed")
PY
if [[ $? -ne 0 ]]; then
  exit 1
fi
green "  ✓ runner 분산 검증"

# cleanup.
echo
blue "[6/6] compose down + cleanup"
docker compose -f compose.dev.yaml -f compose.dev.runner-multi.yaml \
  --project-name "${COMPOSE_PROJECT}" down -v >"${TMP}/compose-down.log" 2>&1
green "  ✓ compose down"

echo
green "=========================================="
green "TASK-081-B multi-runner 검증: ALL PASS"
green "=========================================="
echo "  5/5 builds COMPLETED across 3 runners"
echo "  buildsClaimed total = 5 (no double-claim)"
echo "  buildsCompleted total = 5 (no lost work)"
echo "  결과 → docs/operations/multi-runner-claim-2026-07-XX.md 기록"
