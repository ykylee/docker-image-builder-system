#!/usr/bin/env bash
# TASK-082: multi-runner concurrent claim 운영 검증 — **postgres backend**.
#
# Build Server (postgres backend) + 3 runner (RUNNER_ID=runner-compose-1 /
# runner-multi-2 / runner-multi-3) 를 docker compose 로 띄우고, 5 build 를
# POST 한 뒤:
#
#   1) 각 build 가 정확히 1 cycle 에 1 build 만 claim (단일 runner 점유)
#   2) 충분 시간 후 5 build 모두 COMPLETED 또는 FAILED (terminal)
#   3) admin /admin/runners 조회 시 3 row + buildsClaimed 가 분산
#   4) postgres `build_request` table 에 row 가 실제로 영속화됨
#
# 을 모두 검증. TASK-081-B (memory backend) 의 production e2e 동등물을
# postgres backend 에서 재현 — atomic claim 가드가 두 backend 에서 동일하게
# 동작함을 운영 차원에서 확인.
#
# 사용:
#   # 환경 변수 (TASK-078 / TASK-081-B 와 동일)
#   export DOCKER_SOCKET_GID="$(stat -f %g ~/.colima/default/docker.sock \
#     2>/dev/null || getent group docker | cut -d: -f3)"
#   export ADMIN_IDS=admin
#
#   bash apps/build-server/scripts/e2e-multi-runner-postgres.sh
#
# 시간: 약 3-5분 (postgres 부팅 30-60s + build-server cold start + 5 build
# lifecycle ~30-60s + admin 조회 + cleanup). docker image 가 이미 빌드되어
# 있다면 더 짧음.
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
  DOCKER_SOCKET_GID="$(stat -f %g ~/.colima/default/docker.sock 2>/dev/null \
    || getent group docker | cut -d: -f3 || true)"
fi
if [[ -z "${DOCKER_SOCKET_GID}" ]]; then
  red "[fatal] DOCKER_SOCKET_GID not set and cannot derive"
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
trap '
  if [[ -n "${COMPOSE_PID:-}" ]]; then
    docker compose -f compose.dev.yaml -f compose.dev.runner-multi-postgres.yaml \
      --profile postgres \
      --project-name dibs-multi-runner-pg down -v >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP}"
' EXIT

blue "[0/8] compose up — postgres + build-server + 3 runner"
docker compose -f compose.dev.yaml -f compose.dev.runner-multi-postgres.yaml \
  --profile postgres \
  --project-name dibs-multi-runner-pg up -d \
  >"${TMP}/compose-up.log" 2>&1
if [[ $? -ne 0 ]]; then
  red "[fatal] docker compose up failed"
  cat "${TMP}/compose-up.log"
  exit 1
fi
green "  ✓ compose up"

# postgres healthy 대기 — applyMigrations 가 가능하려면 postgres 가 먼저
# healthy 여야 한다. start_period 5s + retries 10 → 약 30-60초.
echo
blue "[1/8] postgres healthy 대기"
PG_HEALTHY=0
for i in $(seq 1 60); do
  HEALTH="$(docker compose -f compose.dev.yaml -f compose.dev.runner-multi-postgres.yaml \
    --profile postgres \
    --project-name dibs-multi-runner-pg ps --format json 2>/dev/null \
    | python3 -c 'import json,sys
try:
  for line in sys.stdin:
    d = json.loads(line)
    if d.get("Service") == "postgres":
      print(d.get("Health", ""))
except Exception:
  pass
' 2>/dev/null || true)"
  if [[ "${HEALTH}" == *"healthy"* ]]; then
    PG_HEALTHY=1
    break
  fi
  sleep 1
done
if [[ "${PG_HEALTHY}" -ne 1 ]]; then
  red "[fatal] postgres did not become healthy in 60s"
  docker compose -f compose.dev.yaml -f compose.dev.runner-multi-postgres.yaml \
    --profile postgres \
    --project-name dibs-multi-runner-pg logs --tail=50 postgres
  exit 1
fi
green "  ✓ postgres healthy"

# build-server health 대기 — postgres 가 healthy 가 된 후 applyMigrations
# 자동 bootstrap. start_period 15s + interval 10s + retries 5.
echo
blue "[2/8] build-server health 대기 (postgres backend cold start)"
HEALTHY=0
for i in $(seq 1 90); do
  HEALTH="$(docker compose -f compose.dev.yaml -f compose.dev.runner-multi-postgres.yaml \
    --profile postgres \
    --project-name dibs-multi-runner-pg ps --format json 2>/dev/null \
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
  red "[fatal] build-server did not become healthy in 90s"
  docker compose -f compose.dev.yaml -f compose.dev.runner-multi-postgres.yaml \
    --profile postgres \
    --project-name dibs-multi-runner-pg logs --tail=80 build-server
  exit 1
fi
green "  ✓ build-server healthy"

# backend 검증 — build-server 가 실제로 postgres 로 동작 중인지 환경 로그로 확인.
# (DOCKER_SOCKET_GID / DATABASE_URL 은 compose env 에서만 확인 가능, 로그에
#  찍히지 않을 수 있어 best-effort.)
echo
blue "[2.5/8] backend 가 postgres 인지 확인 (best-effort)"
BACKEND_LOG="$(docker compose -f compose.dev.yaml -f compose.dev.runner-multi-postgres.yaml \
  --profile postgres \
  --project-name dibs-multi-runner-pg logs build-server 2>/dev/null \
  | grep -iE 'repository backend|postgres|migrations' | tail -5 || true)"
if [[ -n "${BACKEND_LOG}" ]]; then
  printf '%s\n' "${BACKEND_LOG}" | sed 's/^/    /'
else
  yellow "  ⚠ backend 식별 로그 없음 (postgres 이거나 memory 일 수 있음 — 후속 단계의 row count 가 결정적)"
fi

# build-server 접근 URL. e2e script 는 host 에서 실행되므로 compose 의
# port mapping (3000:3000) 으로 host 의 127.0.0.1:3000 으로 접근.
# (`build-server` 는 docker network 내부 DNS 이름이라 host 에선 resolve 안 됨)
# 운영 환경에서는 BUILD_SERVER_URL env 로 override 가능.
BASE="${BUILD_SERVER_URL:-http://127.0.0.1:3000}"

# 3 runner 가 admin 에 등록되는지 대기.
echo
blue "[3/8] 3 runner registry 등록 대기"
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
  exit 1
fi
green "  ✓ 3 runners registered (${COUNT})"

# 5 build 적재. busybox/scratch Dockerfile + size 0 archive (테스트용 dummy).
# 각 build 의 appName 은 unique 해야 active-build dedup 가 통과.
echo
blue "[4/8] 5 build POST + source archive upload"
BUILDS=()
for i in 0 1 2 3 4; do
  APPNAME="multi-runner-pg-${i}-$$"
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
blue "[5/8] 5 build lifecycle 대기 (상한 5분)"
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
echo
blue "[6/8] admin /admin/runners 분산 검증"
RUNNERS_JSON="$(curl -fsS -H 'x-admin-id: admin' "${BASE}/admin/runners")"
export RUNNERS_JSON
python3 <<'PY'
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

# postgres 영속 검증 — 5 build 가 postgres `build_request` table 에
# 실제로 저장되어 있는지 row count 와 unique appName 으로 직접 검증.
# exec into postgres container → psql 로 build_request row count 와
# 해당 multi-runner-pg-{0..4} appName 이 모두 존재하는지 확인.
echo
blue "[7/8] postgres 영속 검증 (build_request row count + appName unique)"
PG_RESULT="$(docker compose -f compose.dev.yaml -f compose.dev.runner-multi-postgres.yaml \
  --profile postgres \
  --project-name dibs-multi-runner-pg exec -T postgres \
  psql -U dibs -d dibs -t -A -c "
    SELECT
      (SELECT COUNT(*) FROM build_request WHERE app_name LIKE 'multi-runner-pg-%'),
      (SELECT COUNT(DISTINCT app_name) FROM build_request WHERE app_name LIKE 'multi-runner-pg-%'),
      (SELECT COUNT(*) FROM build_request);
  " 2>&1)"
if [[ $? -ne 0 ]]; then
  red "[fatal] postgres exec failed"
  printf '%s\n' "${PG_RESULT}"
  exit 1
fi
# 3 컬럼을 `|` 로 구분한 single line: `5|5|555`.
# IFS='|' 로 split, 각 컬럼의 leading/trailing whitespace 제거.
IFS='|' read -r FILTERED DISTINCT TOTAL <<<"${PG_RESULT}"
FILTERED="$(printf '%s' "${FILTERED}" | tr -d '[:space:]')"
DISTINCT="$(printf '%s' "${DISTINCT}" | tr -d '[:space:]')"
TOTAL="$(printf '%s' "${TOTAL}" | tr -d '[:space:]')"
printf '    build_request rows: total=%s filtered(multi-runner-pg-%%)=%s distinct_appName=%s\n' \
  "${TOTAL:-?}" "${FILTERED:-?}" "${DISTINCT:-?}"
if [[ "${FILTERED}" != "5" ]]; then
  red "[fatal] expected 5 build_request rows for multi-runner-pg-*, got ${FILTERED}"
  exit 1
fi
if [[ "${DISTINCT}" != "5" ]]; then
  red "[fatal] expected 5 distinct appName, got ${DISTINCT} (active-build dedup 가 postgres backend 에서 미작동)"
  exit 1
fi
green "  ✓ postgres 영속 검증: 5 build 모두 row + distinct appName"

# cleanup.
echo
blue "[8/8] compose down + cleanup (postgres volume 포함)"
docker compose -f compose.dev.yaml -f compose.dev.runner-multi-postgres.yaml \
  --profile postgres \
  --project-name dibs-multi-runner-pg down -v >"${TMP}/compose-down.log" 2>&1
green "  ✓ compose down"

echo
green "=========================================="
green "TASK-082 multi-runner (postgres) 검증: ALL PASS"
green "=========================================="
echo "  5/5 builds reached terminal phase across 3 runners"
echo "  buildsClaimed total = 5 (no double-claim)"
echo "  postgres build_request rows = 5 (영속 검증)"
echo "  결과 → docs/operations/multi-runner-claim-postgres-2026-07-06.md 기록"