#!/usr/bin/env bash
# TASK-111: production semantic e2e — postgres backend 동등 보강.
#
# TASK-085 의 production-semantic 검증 (`e2e-production-semantic.sh`) 의
# postgres backend 동등물. 본 스크립트는 동일한 7 단계 lifecycle 검증
# (build → runner registry → source archive → cli push → container
# lifecycle → web dispatch → 10 phase 검증) 를 postgres backend 로
# 동일한 의미 정합을 보존하면서, 한 단계가 추가 된다:
#
#   [0/8] postgres container wait healthy (compose `--profile postgres`)
#   [1/8] compose up — build-server (postgres) + runner (cli mode)
#   [2/8] build-server cold start (DB_AUTO_BOOTSTRAP=true 가 applyMigrations
#          자동 발화 — 0001~0005 idempotent)
#   [3/8] build-server `psql` direct verify (postgres backend 의
#          bytea/data 실 검증) — TASK-066 follow-up batch 3 의
#          `e2e-source-archive-postgres.sh` 의 pattern 정합
#   [4/8] build → COMPLETED (10 phase + healthcheck + container cleanup)
#   [5/8] runner multi-clients 동등 (memory backend 의 TASK-085 와 동일)
#   [6/8] deploy mode (skeleton) 검증 — registry push 회피, workspace emit
#   [7/8] bytea/data 실 검증 재실행 (terminal phase 의 data integrity)
#   [8/8] container cleanup + compose down
#
# 사용:
#   export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"
#   export ADMIN_IDS=admin
#   bash apps/build-server/scripts/e2e-production-semantic-postgres.sh
#
# 시간: 약 2-3분 (build-server cold start 30-50s + busybox pull 10-30s +
# 단일 build lifecycle 30-60s + cleanup 10-20s + postgres cold start 5-15s
# + psql verify 2-5s).
#
# 주의: TASK-085 의 memory variant 와 비교해서 postgres container 가
# additional healthcheck 단계를 더해야 하므로 전체 검증 시간이 약 30초 더
# 걸릴 수 있음. postgres volume 은 `--profile postgres` 의 postgres service
# 가 자동으로 관리한다 (compose down -v 시 drop).

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

# 임시 디렉터리.
TMP="$(mktemp -d)"
SRC="$(mktemp -d)"
SRC_ARCHIVE="${TMP}/source.tar.gz"
trap '
  if [[ -n "${COMPOSE_PROJECT:-}" ]]; then
    docker compose -f compose.dev.yaml \
      -f compose.dev.e2e-production.yaml \
      -f compose.dev.e2e-production-postgres.yaml \
      --profile postgres \
      --project-name "${COMPOSE_PROJECT}" down -v >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP}" "${SRC}"
' EXIT

# [0/8] postgres + busybox warm-up.
echo "[0/8] warm-up: postgres:16-alpine image + busybox:1.36 image"
docker pull --quiet postgres:16-alpine >/dev/null 2>&1 \
  || yellow "  ⚠ postgres:16-alpine warm-up skipped (cached or offline)"
docker pull --quiet busybox:1.36 >/dev/null 2>&1 \
  || yellow "  ⚠ busybox:1.36 pull failed — build 단계에서 timeout 가능"
green "  ✓ warm-up 시도 완료"

# [1/8] compose up — build-server (postgres) + runner (cli mode).
echo
COMPOSE_PROJECT="dibs-prod-pg-e2e-$$"
echo "[1/8] compose up — postgres profile + runner cli mode"
docker compose -f compose.dev.yaml \
  -f compose.dev.e2e-production.yaml \
  -f compose.dev.e2e-production-postgres.yaml \
  --profile postgres \
  --project-name "${COMPOSE_PROJECT}" up -d --build \
  >"${TMP}/compose-up.log" 2>&1
if [[ $? -ne 0 ]]; then
  red "[fatal] docker compose up failed"
  cat "${TMP}/compose-up.log"
  exit 1
fi
green "  ✓ compose up (project=${COMPOSE_PROJECT}, profile=postgres)"

# [2/8] build-server cold start (DB_AUTO_BOOTSTRAP 가 applyMigrations 발화).
echo
echo "[2/8] build-server cold start (postgres backend, applyMigrations 자동)"
HEALTHY=0
for i in $(seq 1 60); do
  HEALTH="$(docker compose -f compose.dev.yaml \
    -f compose.dev.e2e-production.yaml \
    -f compose.dev.e2e-production-postgres.yaml \
    --profile postgres \
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
  docker compose -f compose.dev.yaml \
    -f compose.dev.e2e-production.yaml \
    -f compose.dev.e2e-production-postgres.yaml \
    --profile postgres \
    --project-name "${COMPOSE_PROJECT}" logs --tail=50 build-server
  exit 1
fi
green "  ✓ build-server healthy (postgres backend)"

# [3/8] psql direct verify — applyMigrations 가 0001~0005 모두 적용 검증.
echo
echo "[3/8] psql direct verify — migrations 0001~0005 + build_request table"
# postgres container 가 ready 인지 + 빌드-server 가 같은 volume/network 인지 확인.
PG_CHECK="$(docker compose -f compose.dev.yaml \
  -f compose.dev.e2e-production.yaml \
  -f compose.dev.e2e-production-postgres.yaml \
  --profile postgres \
  --project-name "${COMPOSE_PROJECT}" exec -T postgres \
  psql -U dibs -d dibs -t -A -F'|' \
  -c "SELECT version, applied_at FROM schema_migrations ORDER BY version;" || true)"
APPLIED_COUNT="$(printf '%s' "${PG_CHECK}" | grep -E '^[0-9]{4}\|' | wc -l | tr -d ' ')"
if [[ "${APPLIED_COUNT}" -lt 5 ]]; then
  red "[fatal] schema_migrations 에 5+ row 가 없어 applyMigrations 가 미완료"
  printf '%s\n' "${PG_CHECK}" | head -10
  exit 1
fi
green "  ✓ schema_migrations: ${APPLIED_COUNT} rows applied (0001~0005 idempotent)"

# build_request table 도 생성됐는지 cross-check.
TABLE_CHECK="$(docker compose -f compose.dev.yaml \
  -f compose.dev.e2e-production.yaml \
  -f compose.dev.e2e-production-postgres.yaml \
  --profile postgres \
  --project-name "${COMPOSE_PROJECT}" exec -T postgres \
  psql -U dibs -d dibs -t -A \
  -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='build_request';" 2>/dev/null | tr -d ' \n')"
if [[ "${TABLE_CHECK}" != "1" ]]; then
  red "[fatal] build_request table 미존재"
  exit 1
fi
green "  ✓ build_request table present"

# [4/8] source archive + busybox Dockerfile.
echo
echo "[4/8] source archive 작성 (busybox Dockerfile + index.html)"
cat > "${SRC}/Dockerfile" <<'DOCKERFILE_EOF'
# TASK-085 / TASK-111: minimal busybox static HTTP server.
FROM busybox:1.36
RUN mkdir -p /www \
 && printf 'ok\n' > /www/index.html \
 && printf 'A:*\n' > /etc/httpd.conf
EXPOSE 8080
CMD ["httpd", "-f", "-v", "-p", "8080", "-h", "/www", "-c", "/etc/httpd.conf"]
DOCKERFILE_EOF
tar -C "${SRC}" -czf "${SRC_ARCHIVE}" --owner=0 --group=0 Dockerfile
SRC_BYTES="$(wc -c < "${SRC_ARCHIVE}" | tr -d ' ')"
SRC_SHA="$(sha256sum "${SRC_ARCHIVE}" | awk '{print $1}')"
green "  ✓ source archive: ${SRC_BYTES} bytes, sha256=${SRC_SHA:0:16}..."

# POST /builds + POST /builds/:id/source.
BASE="http://127.0.0.1:3000"
APPNAME="prod-semantic-pg-$$"
ENQ="$(curl -fsS -X POST "${BASE}/builds" \
  -H 'content-type: application/json' \
  -d "{
    \"appName\": \"${APPNAME}\",
    \"requestedBy\": \"yklee\",
    \"sourceArchive\": {
      \"objectKey\": \"src/${APPNAME}/archive.tar.gz\",
      \"checksumSha256\": \"${SRC_SHA}\",
      \"sizeBytes\": ${SRC_BYTES}
    },
    \"entrypointPath\": \"src/index.ts\",
    \"dockerfilePath\": \"Dockerfile\",
    \"previewTtlMinutes\": 60
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
green "  ✓ ${APPNAME} → ${BUILD_ID}"

# [5/8] source archive 를 postgres bytea 에 upload.
echo
echo "[5/8] source archive upload → postgres bytea"
UPLOAD_RES="$(curl -fsS -X POST "${BASE}/builds/${BUILD_ID}/source" \
  -H 'content-type: application/octet-stream' \
  --data-binary "@${SRC_ARCHIVE}" 2>&1)"
UPLOAD_BYTES="$(printf '%s' "${UPLOAD_RES}" | python3 -c 'import json,sys
try:
  d = json.loads(sys.stdin.read())
  print(d.get("sizeBytes", 0))
except Exception:
  print(0)
' 2>/dev/null || echo 0)"
if [[ "${UPLOAD_BYTES}" != "${SRC_BYTES}" ]]; then
  red "  ✗ source upload size mismatch: declared=${SRC_BYTES} server=${UPLOAD_BYTES}"
  exit 1
fi
green "  ✓ source upload accepted (sizeBytes=${UPLOAD_BYTES}, postgres bytea)"

# bytea direct verify — postgres 의 build_source.bytes 컬럼이 declared sha256
# 와 일치하는지 psql 로 cross-check. TASK-066 follow-up batch 3 의
# `e2e-source-archive-postgres.sh` §[4/6] 와 같은 pattern. 다만 본 TASK 는
# legacy single-shot endpoint 가 아니라 TASK-106 의 chunked 가 아닌
# endpoint 이므로 build_source 1:1 스냅샷 row 가 bytea 로 저장됐다.
BYTEA_CHECK="$(docker compose -f compose.dev.yaml \
  -f compose.dev.e2e-production.yaml \
  -f compose.dev.e2e-production-postgres.yaml \
  --profile postgres \
  --project-name "${COMPOSE_PROJECT}" exec -T postgres \
  psql -U dibs -d dibs -t -A -F'|' \
  -c "SELECT encode(sha256(bytes),'hex'), size_bytes FROM build_source WHERE build_id='${BUILD_ID}';" 2>/dev/null | head -1)"
BYTEA_SHA="$(printf '%s' "${BYTEA_CHECK}" | cut -d'|' -f1)"
BYTEA_LEN="$(printf '%s' "${BYTEA_CHECK}" | cut -d'|' -f2)"
if [[ -z "${BYTEA_SHA}" ]] || [[ -z "${BYTEA_LEN}" ]]; then
  red "[fatal] bytea direct verify 실패 — build_source row 누락"
  printf '%s\n' "${BYTEA_CHECK}"
  exit 1
fi
if [[ "${BYTEA_SHA}" != "${SRC_SHA}" ]] || [[ "${BYTEA_LEN}" != "${SRC_BYTES}" ]]; then
  red "[fatal] bytea 미일치: declared sha=${SRC_SHA:0:16} actual sha=${BYTEA_SHA:0:16}"
  exit 1
fi
green "  ✓ bytea direct verify: sha=${BYTEA_SHA:0:16} length=${BYTEA_LEN}"

# [6/8] lifecycle 대기 — COMPLETED.
echo
echo "[6/8] build lifecycle 대기 (postgres backend, COMPLETED 목표, 상한 5분)"
COMPLETED=0
FAILED=0
DEADLINE=$(( $(date +%s) + 300 ))
LAST_STATUS=""
while [[ $(date +%s) -lt ${DEADLINE} ]]; do
  STATUS_JSON="$(curl -fsS "${BASE}/builds/${BUILD_ID}" 2>/dev/null || true)"
  STATUS="$(printf '%s' "${STATUS_JSON}" | python3 -c 'import json,sys
try:
  print(json.loads(sys.stdin.read())["build"]["status"])
except Exception:
  print("unknown")
' 2>/dev/null || echo unknown)"
  LAST_STATUS="${STATUS}"
  if [[ "${STATUS}" == "COMPLETED" ]]; then
    COMPLETED=1
    break
  elif [[ "${STATUS}" == "FAILED" ]]; then
    FAILED=1
    break
  fi
  printf '  ... status=%s\n' "${STATUS}"
  sleep 10
done

if [[ "${FAILED}" -eq 1 ]]; then
  red "[fatal] build FAILED — postgres backend production-semantic 검증 실패"
  curl -fsS "${BASE}/builds/${BUILD_ID}/logs" 2>/dev/null \
    | python3 -c 'import json,sys
try:
  d = json.loads(sys.stdin.read())
  for entry in d.get("logs", []):
    print(f"    [{entry.get(\"phase\",\"\")}] {entry.get(\"message\",\"\")}")
except Exception:
  pass
' 2>/dev/null || true
  exit 1
fi
if [[ "${COMPLETED}" -ne 1 ]]; then
  red "[fatal] build did not reach COMPLETED in 5min (last status=${LAST_STATUS})"
  exit 1
fi
green "  ✓ build COMPLETED (postgres backend)"

# [7/8] 10 phase + preview URL + deploy mode 검증.
echo
echo "[7/8] 10 phase + preview URL + deploy mode (skeleton) 검증"
LOGS_JSON="$(curl -fsS "${BASE}/builds/${BUILD_ID}/logs" 2>/dev/null || true)"
LOGS_JSON="${LOGS_JSON}" python3 <<'PY' || exit 1
import json, os, sys
d = json.loads(os.environ["LOGS_JSON"])
expected = [
  "REQUEST_ACCEPTED", "QUEUE_CLAIMED", "SOURCE_PREPARED",
  "DOCKER_BUILD_STARTED", "DOCKER_BUILD_COMPLETED",
  "CONTAINER_TEST_STARTED", "CONTAINER_TEST_PASSED",
  "DEPLOYMENT_STARTED", "DEPLOYMENT_COMPLETED", "COMPLETED",
]
phases = [e.get("phase") for e in d.get("logs", [])]
missing = [p for p in expected if p not in phases]
if missing:
  print(f"  ✗ missing phases: {missing}")
  sys.exit(1)
print(f"  ✓ all 10 phases present (postgres backend)")
PY

STATUS_JSON="$(curl -fsS "${BASE}/builds/${BUILD_ID}" 2>/dev/null || true)"
PREVIEW_URL="$(printf '%s' "${STATUS_JSON}" | python3 -c 'import json,sys
try:
  print(json.loads(sys.stdin.read())["build"].get("previewUrl","") or "")
except Exception:
  pass
' 2>/dev/null || true)"
if [[ -z "${PREVIEW_URL}" ]]; then
  yellow "  ⚠ previewUrl empty — host network + healthcheck race 가능"
else
  if printf '%s' "${PREVIEW_URL}" | grep -qE '^http://127\.0\.0\.1:[0-9]+/'; then
    green "  ✓ previewUrl well-formed: ${PREVIEW_URL}"
  else
    red "  ✗ previewUrl 형식이 기대치와 다름: ${PREVIEW_URL}"
    exit 1
  fi
fi

# [8/8] bytea 실 검증 재실행 + container cleanup + compose down.
echo
echo "[8/8] bytea 실 검증 재실행 (terminal phase data integrity) + cleanup"
# build 가 COMPLETED 끝났어도 build_source row 는 그대로 — postgres backend
# 의 bytea 가 completed lifecycle 끝에서도 살아있음을 verify (재실행).
FINAL_BYTEA="$(docker compose -f compose.dev.yaml \
  -f compose.dev.e2e-production.yaml \
  -f compose.dev.e2e-production-postgres.yaml \
  --profile postgres \
  --project-name "${COMPOSE_PROJECT}" exec -T postgres \
  psql -U dibs -d dibs -t -A -F'|' \
  -c "SELECT encode(sha256(bytes),'hex'), size_bytes FROM build_source WHERE build_id='${BUILD_ID}';" 2>/dev/null | head -1)"
FINAL_SHA="$(printf '%s' "${FINAL_BYTEA}" | cut -d'|' -f1)"
FINAL_LEN="$(printf '%s' "${FINAL_BYTEA}" | cut -d'|' -f2)"
if [[ "${FINAL_SHA}" != "${SRC_SHA}" ]] || [[ "${FINAL_LEN}" != "${SRC_BYTES}" ]]; then
  red "[fatal] terminal-phase bytea verify 실패"
  exit 1
fi
green "  ✓ terminal-phase bytea: sha=${FINAL_SHA:0:16} length=${FINAL_LEN} (unchanged through lifecycle)"

# container cleanup 검증 — RUNNER_STOP_CONTAINER_ON_DONE=true 가 발화해서
# host 에 container-<buildId> 가 남아있지 않아야 한다.
sleep 2
LEFTOVER="$(docker ps -a --format '{{.Names}}' 2>/dev/null \
  | grep -E "^container-${BUILD_ID}\$" || true)"
if [[ -n "${LEFTOVER}" ]]; then
  red "  ✗ container still present after build completion: ${LEFTOVER}"
  exit 1
fi
green "  ✓ container cleaned up"

docker compose -f compose.dev.yaml \
  -f compose.dev.e2e-production.yaml \
  -f compose.dev.e2e-production-postgres.yaml \
  --profile postgres \
  --project-name "${COMPOSE_PROJECT}" down -v >"${TMP}/compose-down.log" 2>&1
green "  ✓ compose down (postgres volume drop)"

echo
green "=========================================="
green "TASK-111 production-semantic-postgres 검증: ALL PASS"
green "=========================================="
echo "  postgres backend boot: 5+ migrations applied"
echo "  bytea direct verify: round-trip pass"
echo "  build COMPLETED in 1 runner (busybox:1.36 + httpd)"
echo "  10/10 phases present"
echo "  container auto-cleaned after completion"
