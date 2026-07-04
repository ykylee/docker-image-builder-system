#!/usr/bin/env bash
# TASK-064 운영 baseline — build-server e2e smoke.
#
# memory / postgres 두 backend 모두 동일한 build-server 응답을 보장하는지
# 확인하는 운영자용 스크립트. 다음 항목을 차례로 점검한다:
#   1) 사전 compile (4 packages tsc)
#   2) build-server 부팅 (memory / postgres)
#   3) POST /builds + GET /builds/:id + GET /builds/:id/logs + GET /builds list
#   4) duplicate 409 검증 (같은 appName + active build)
#   5) admin allow-list endpoint
#   6) shutdown
#
# 환경:
#   - SMOKE_BACKEND=memory (default) | postgres
#   - postgres 일 때는 DATABASE_URL + DB_AUTO_BOOTSTRAP=true + 빌드 서버가
#     schema_migrations 까지 자동 적용하도록 둔다 (TASK-064).
#
# exit code: 0 (성공) / 1 (실패)

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BACKEND="${SMOKE_BACKEND:-memory}"
HEALTH_URL="http://127.0.0.1:3000/health"
SERVER_LOG="$(mktemp -t build-server-smoke.XXXXXX.log)"
SERVER_PID=""

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# 1) tsc compile
echo "[1/5] tsc compile (4 packages)"
for pkg in packages/shared-contract packages/shared-config packages/db apps/build-server; do
  if ! rtk ./node_modules/.bin/tsc -p "$pkg/tsconfig.json" --noEmit >"$SERVER_LOG" 2>&1; then
    red "tsc failed: $pkg"
    tail -50 "$SERVER_LOG"
    exit 1
  fi
done
green "  compile OK"

# 2) build-server boot
echo "[2/5] boot build-server ($BACKEND)"
mkdir -p dist
# tsbuild emit (단순 smoke 라 dist 에 산출물 박는 한 번만 emit)
if ! ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json >"$SERVER_LOG" 2>&1; then
  red "tsc emit failed for apps/build-server"
  tail -50 "$SERVER_LOG"
  exit 1
fi

case "$BACKEND" in
  memory)
    BUILD_REPOSITORY_BACKEND=memory \
      node "apps/build-server/dist/apps/build-server/src/index.js" \
      >"$SERVER_LOG" 2>&1 &
    SERVER_PID=$!
    ;;
  postgres)
    if [[ -z "${DATABASE_URL:-}" ]]; then
      red "DATABASE_URL is required for postgres backend"
      exit 1
    fi
    BUILD_REPOSITORY_BACKEND=postgres \
    DB_AUTO_BOOTSTRAP=true \
    DATABASE_URL="$DATABASE_URL" \
      node "apps/build-server/dist/apps/build-server/src/index.js" \
      >"$SERVER_LOG" 2>&1 &
    SERVER_PID=$!
    ;;
  *)
    red "unknown SMOKE_BACKEND: $BACKEND"
    exit 1
    ;;
esac

# health 폴링
for i in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    green "  build-server up (after ${i}s)"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    red "  build-server died during boot"
    tail -50 "$SERVER_LOG"
    exit 1
  fi
  sleep 1
done

if ! curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
  red "  build-server did not become healthy"
  tail -50 "$SERVER_LOG"
  exit 1
fi

# 3) POST /builds + GET /builds/:id + GET /builds/:id/logs + GET /builds list
echo "[3/5] POST /builds (1건) + GET 검증"
USER_ID="smoke-$(date +%s)"
APP_NAME="smoke-app-$(date +%s)"
POST_BODY=$(cat <<JSON
{
  "requestedBy": "$USER_ID",
  "appName": "$APP_NAME",
  "sourceArchive": {
    "objectKey": "ref://github.com/example/repo",
    "checksumSha256": "$(printf '%064d' 0)",
    "sizeBytes": 12345
  },
  "entrypointPath": "src/index.ts",
  "dockerfilePath": "Dockerfile",
  "previewTtlMinutes": 30
}
JSON
)
BUILD_RESP=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d "$POST_BODY" \
  http://127.0.0.1:3000/builds)
BUILD_ID=$(echo "$BUILD_RESP" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);process.stdout.write(j.build?.buildId||"")})')
if [[ -z "$BUILD_ID" ]]; then
  red "  POST /builds 응답에 buildId 없음: $BUILD_RESP"
  exit 1
fi
green "  buildId=$BUILD_ID"

# GET /builds/:id
curl -fsS "http://127.0.0.1:3000/builds/$BUILD_ID" >/dev/null || {
  red "  GET /builds/:id 실패"; exit 1; }
# GET /builds/:id/logs
curl -fsS "http://127.0.0.1:3000/builds/$BUILD_ID/logs" >/dev/null || {
  red "  GET /builds/:id/logs 실패"; exit 1; }
# GET /builds list
LIST_RESP=$(curl -fsS "http://127.0.0.1:3000/builds?limit=10&requestedBy=$USER_ID")
LIST_COUNT=$(echo "$LIST_RESP" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);process.stdout.write(String((j.builds||[]).length))})')
if [[ "$LIST_COUNT" -lt 1 ]]; then
  red "  GET /builds list 응답에 build 없음: $LIST_RESP"
  exit 1
fi
green "  GET 검증 OK (list=$LIST_COUNT)"

# 4) duplicate 409
echo "[4/5] duplicate POST /builds → 409"
DUP_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
  -d "$POST_BODY" \
  http://127.0.0.1:3000/builds)
if [[ "$DUP_HTTP" != "409" ]]; then
  red "  duplicate 응답이 409 가 아님: $DUP_HTTP (active-build dedup 회귀 가능성)"
  tail -50 "$SERVER_LOG"
  exit 1
fi
green "  duplicate 정책 OK (409)"

# 5) admin endpoint allow-list
echo "[5/5] admin allow-list endpoint"
ADMIN_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "X-Admin-Id: admin" \
  http://127.0.0.1:3000/admin/builds)
if [[ "$ADMIN_HTTP" != "200" ]]; then
  red "  /admin/builds 응답 $ADMIN_HTTP (admin id 가 allow-list 에 없거나 endpoint 회귀)"
  tail -50 "$SERVER_LOG"
  exit 1
fi
green "  admin endpoint OK ($ADMIN_HTTP)"

green "smoke OK ($BACKEND)"
exit 0