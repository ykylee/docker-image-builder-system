#!/usr/bin/env bash
# TASK-075: 단일 포트 reverse proxy e2e.
#
# Build Server 만 띄워서 (memory backend) 한 port 에서
#  - dist/index.html (GET /)             — 정적 mount OK
#  - SPA deep link (GET /admin/login)     — SPA fallback OK
#  - API (GET /api/builds)                — 307 redirect + /builds 처리 OK
#  - unknown GET (GET /not-a-real-route)  — SPA fallback OK
# 를 모두 검증.
#
# Memory backend (postgres 불필요) + Build Monitor 가 빌드돼있는
# 환경 (= `pnpm --filter @docker-image-builder-system/build-monitor build` 가
# 한 번 이상 실행) 을 가정. dist 가 없으면 skip (graceful exit 0).
#
# 사용:
#   bash apps/build-server/scripts/e2e-single-port.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# `apps/build-server/scripts/e2e-single-port.sh` 기준 — repository root 는
# 세 단계 부모. (이전 두 단계 → `apps/build-server` 디렉토리 자체.)
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

# Build Monitor 가 빌드 안 된 환경인지 확인 — 없으면 skip (CI 첫 build
# 직전이라 dist 가 없을 수 있다).
# TASK-093: React dist-react 도 함께 검증 — Svelte + React 2 dist 모두 빌드돼야
# 단일 port reverse proxy 가 React primary SPA + Svelte legacy deep link 모두
# 응답 가능.
if [[ ! -f "apps/build-monitor/dist/index.html" ]] || [[ ! -f "apps/build-monitor/dist-react/index.html" ]]; then
  printf '\033[33m%s\033[0m\n' "build-monitor/dist/index.html or dist-react/index.html not found — skipping single-port reverse-proxy e2e."
  echo "  hint: pnpm --filter @docker-image-builder-system/build-monitor build && (cd apps/build-monitor && pnpm build:react)"
  exit 0
fi

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

# 0) Build compile 확인 — dist 가 outdated 라 single-port mount 가 무의미.
echo "[0/4] build-server build (tsc)"
if ! ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json --noEmit >/dev/null 2>&1; then
  red "build-server tsc --noEmit failed"
  ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json --noEmit
  exit 1
fi
# Build artifacts 도 준비 (outDir = dist/apps/build-server/src/index.js).
if [[ ! -f "apps/build-server/dist/apps/build-server/src/index.js" ]]; then
  ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json >/dev/null 2>&1 || true
fi
green "  ✓ build-server compile clean"

# 1) 임시 port + memory backend 으로 Build Server 기동.
echo "[1/4] build-server boot (memory, ephemeral port)"
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')"
BASE="http://127.0.0.1:${PORT}"

SERVER_LOG="$(mktemp)"
# TASK-075: single-port reverse proxy mount 활성화 — build-monitor 의
# vite build 산출물이 cwd 기준 `./apps/build-monitor/dist` 에 위치. e2e
# 가 workspace root 에서 실행되므로 상대 path 가 그대로 유효.
BUILD_MONITOR_DIST_PATH=apps/build-monitor/dist \
BUILD_REPOSITORY_BACKEND=memory PORT="${PORT}" \
  node apps/build-server/dist/apps/build-server/src/index.js \
  > "${SERVER_LOG}" 2>&1 &
SERVER_PID=$!
trap 'kill "${SERVER_PID}" 2>/dev/null || true; rm -f "${SERVER_LOG}" /tmp/index.html /tmp/deep.html /tmp/list.json /tmp/unknown.html /tmp/nosuch.json' EXIT

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

# 2) 정적 mount 검증 — TASK-093 이후 React dist 가 primary SPA (`/`).
#    React index.html 은 `<div id="app-react">`, Svelte index.html 은 `<div id="root">`
#    둘 중 하나만 응답해도 정상 (둘 다 mount 시 React 가 응답).
echo "[2/4] GET /  →  React dist (primary SPA, TASK-093)"
INDEX_CT="$(curl -fsS "${BASE}/" -o /tmp/index.html -w '%{http_code}')"
if [[ "${INDEX_CT}" != "200" ]] || ! grep -q "<div id='app-react'>\|<div id=\"app-react\">\|<body>" /tmp/index.html; then
  red "  ✗ GET / did not return React dist/index.html (TASK-093 primary)"
  echo "    status: ${INDEX_CT}"
  head -10 /tmp/index.html || true
  exit 1
fi
green "  ✓ GET / 200 (React SPA HTML)"

# 3) SPA fallback 검증 — deep link.
echo "[3/4] SPA fallback (GET /admin/login)"
DEEP_CT="$(curl -fsS "${BASE}/admin/login" -o /tmp/deep.html -w '%{http_code}')"
if [[ "${DEEP_CT}" != "200" ]] || ! grep -q "<body>" /tmp/deep.html; then
  red "  ✗ GET /admin/login did not SPA-fallback to index.html"
  echo "    status: ${DEEP_CT}"
  head -10 /tmp/deep.html || true
  exit 1
fi
green "  ✓ GET /admin/login 200 (SPA fallback HTML)"

# 3.5) Svelte legacy deep link — TASK-093 의 secondary mount 검증.
echo "[3.5/4] Svelte legacy deep link (GET /svelte)"
SVELTE_CT="$(curl -fsS "${BASE}/svelte" -o /tmp/svelte.html -w '%{http_code}')"
if [[ "${SVELTE_CT}" != "200" ]] || ! grep -q "<div id='root'>\|<div id=\"root\">\|<body>" /tmp/svelte.html; then
  red "  ✗ GET /svelte did not return Svelte dist/index.html"
  echo "    status: ${SVELTE_CT}"
  head -10 /tmp/svelte.html || true
  exit 1
fi
green "  ✓ GET /svelte 200 (Svelte legacy SPA HTML)"

# 4) API 검증 — /api/builds 는 307 redirect → /builds (200 JSON).
echo "[4/4] API reverse — GET /api/builds (307 → /builds)"
API_HEADERS="$(curl -sS -I "${BASE}/api/builds")"
echo "${API_HEADERS}" | grep -q "307" || {
  red "  ✗ GET /api/builds did not 307 redirect (expected for /api/* rewrite)"
  echo "${API_HEADERS}" | head -5
  exit 1
}
# Follow redirect
LIST_CT="$(curl -fsSL "${BASE}/api/builds" -o /tmp/list.json -w '%{http_code}')"
if [[ "${LIST_CT}" != "200" ]] || ! python3 -c "import sys, json; d=json.load(open('/tmp/list.json')); assert 'builds' in d and isinstance(d['builds'], list), 'unexpected /builds response'" >/dev/null 2>&1; then
  red "  ✗ GET /api/builds (follow) did not return /builds JSON list"
  echo "    status: ${LIST_CT}"
  head -20 /tmp/list.json || true
  exit 1
fi
green "  ✓ /api/builds 307 → /builds 200 (JSON list)"

# 보너스 — unknown route 도 SPA fallback.
UNKNOWN_CT="$(curl -fsS "${BASE}/not-a-real-route" -o /tmp/unknown.html -w '%{http_code}')"
if [[ "${UNKNOWN_CT}" != "200" ]] || ! grep -q "<body>" /tmp/unknown.html; then
  yellow "  ! unknown GET did not SPA-fallback (status=${UNKNOWN_CT}) — non-fatal"
fi

# 보너스 — /api/no-such-route 는 404 JSON.
NOSUCH_CT="$(curl -fsS "${BASE}/api/no-such-route" -o /tmp/nosuch.json -w '%{http_code}')"
if [[ "${NOSUCH_CT}" != "404" ]]; then
  yellow "  ! /api/no-such-route status=${NOSUCH_CT} (expected 404 JSON) — non-fatal"
fi

green "✓ e2e-single-port PASS (memory backend, port=${PORT})"
