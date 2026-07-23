#!/usr/bin/env bash
# apps/skill_mcp/scripts/verify-live-server.sh
#
# TASK-163 (P2-M4): skill_mcp 를 **실행 중인 Build Server 대상**으로 검증한다.
#
# 왜 필요한가:
#   skill_mcp 는 TASK-069 이후 손대지 않은 채 단위 테스트 222건만 green 이었다.
#   그 테스트는 전부 **손으로 만든 payload** 를 넣는다 — 서버가 실제로 무엇을
#   내보내는지와 무관하다. Phase 2 컨셉 §7 이 이걸 리스크로 명시했고
#   ("skill_mcp 가 단위 테스트만 통과 — 실서버 미검증"), P2-M4 의 완료 기준이다.
#
#   실제로 P2-M1~M3 에서 서버 응답이 크게 바뀌었다(previewStatus 제거 /
#   testDeployment 제거 / previewUrl→runtimeUrl / lastError 최초 기록).
#   단위 테스트만으로는 그 드리프트를 잡을 수 없다.
#
# 무엇을 검증하나:
#   [1] happy path  — 빌드를 canonical 순서로 끝까지 몰고, 실응답으로
#                     latest-build-status / container-test-readiness-checker 를 돌려
#                     READY + runtimeUrl subtitle 이 나오는지
#   [2] failure path — 빌드를 컨테이너 테스트 실패로 몰고, 실응답으로
#                     failure-summary-shaper 를 돌려 stage=TEST + 서버가 기록한
#                     canonical errorCode 가 그대로 살아 나오는지
#                     (TASK-162 이전에는 lastError 가 항상 null 이라 불가능했다)
#
# 사용:
#   bash apps/skill_mcp/scripts/verify-live-server.sh
#   BUILD_SERVER_URL=http://127.0.0.1:3000 bash ... # 이미 떠 있는 서버에 붙기
#
# 종료 코드: 0 전부 PASS / 1 단언 실패 / 3 전제 미충족

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../.." && pwd)"
cd "$REPO_ROOT"

C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_BLU=$'\033[34m'; C_RST=$'\033[0m'
if [[ ! -t 1 || -n "${NO_COLOR:-}" ]]; then C_RED=""; C_GRN=""; C_BLU=""; C_RST=""; fi
info() { printf '%s==>%s %s\n' "$C_BLU" "$C_RST" "$*"; }
ok()   { printf '%s  ok%s %s\n' "$C_GRN" "$C_RST" "$*"; }
fail() { printf '%s fail%s %s\n' "$C_RED" "$C_RST" "$*" >&2; FAILED=1; }

FAILED=0
SERVER_PID=""
TMP="$(mktemp -d)"
cleanup() {
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null && wait "$SERVER_PID" 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT

DIST="apps/build-server/dist/apps/build-server/src/index.js"
BASE="${BUILD_SERVER_URL:-}"

if [[ -z "$BASE" ]]; then
  if [[ ! -f "$DIST" ]]; then
    fail "build-server dist 가 없습니다. 먼저 tsc 빌드를 수행하세요."; exit 3
  fi
  info "build-server 기동 (memory backend)"
  BUILD_REPOSITORY_BACKEND=memory ADMIN_IDS=admin node "$DIST" > "$TMP/server.log" 2>&1 &
  SERVER_PID=$!
  BASE="http://127.0.0.1:3000"
  for _ in $(seq 1 60); do
    curl -sf "$BASE/health" >/dev/null 2>&1 && break
    sleep 0.25
  done
fi

if ! curl -sf "$BASE/health" >/dev/null 2>&1; then
  fail "Build Server 에 접속할 수 없습니다 ($BASE)."; exit 3
fi
ok "Build Server 가용 ($BASE)"

# ── 헬퍼 ─────────────────────────────────────────────────────────────
# 빌드 하나를 만들고 DOCKER_BUILD_COMPLETED 까지 몰아 buildId 를 출력한다.
seed_build() {
  local app="$1"
  local src="hello-source-$app"
  local sha size bid
  sha="$(printf '%s' "$src" | sha256sum | cut -d' ' -f1)"
  size="$(printf '%s' "$src" | wc -c)"

  bid="$(curl -sf -X POST "$BASE/builds" -H 'Content-Type: application/json' \
    -d "{\"appName\":\"$app\",\"requestedBy\":\"skill-mcp-verify\",\"entrypointPath\":\"/\",\"sourceArchive\":{\"objectKey\":\"k\",\"checksumSha256\":\"$sha\",\"sizeBytes\":$size}}" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["build"]["buildId"])')" || return 1

  printf '%s' "$src" | curl -sf -X POST "$BASE/builds/$bid/source" \
    -H 'Content-Type: application/octet-stream' --data-binary @- >/dev/null || return 1
  curl -sf -X POST "$BASE/builds/claim" -H 'Content-Type: application/json' \
    -d '{"runnerId":"r-verify"}' >/dev/null || return 1
  for phase in SOURCE_PREPARED DOCKER_BUILD_STARTED DOCKER_BUILD_COMPLETED; do
    curl -sf -X POST "$BASE/builds/$bid/phase" -H 'Content-Type: application/json' \
      -d "{\"phase\":\"$phase\",\"runnerId\":\"r-verify\"}" >/dev/null || return 1
  done
  printf '%s' "$bid"
}

STAMP="$$"

# ── [1] happy path ───────────────────────────────────────────────────
info "[1/2] happy path — 실응답으로 readiness 카드 합성"
APP_OK="skillmcp-ok-$STAMP"
BID_OK="$(seed_build "$APP_OK")" || { fail "happy path seed 실패"; exit 1; }

curl -sf -X POST "$BASE/builds/$BID_OK/container-test/start" -H 'Content-Type: application/json' \
  -d '{"internalPort":8080,"runnerId":"r-verify"}' >/dev/null || fail "container-test/start 실패"
curl -sf -X POST "$BASE/builds/$BID_OK/container-test/result" -H 'Content-Type: application/json' \
  -d '{"status":"SUCCESS","runtimeUrl":"http://127.0.0.1:38124/","host":"127.0.0.1","hostPort":38124,"containerRef":"container-verify","healthCheckPassed":true,"portOpen":true,"stabilityWindowPassed":true,"runnerId":"r-verify"}' \
  >/dev/null || fail "container-test/result 실패"

# 서버의 **실제 응답**을 그대로 스킬 입력으로 쓴다.
curl -sf "$BASE/builds/$BID_OK" > "$TMP/status-ok.json" || fail "GET /builds/:id 실패"

python3 - "$TMP/status-ok.json" <<'PY' || FAILED=1
import json, sys
sys.path.insert(0, ".")
from apps.skill_mcp.skills.container_test_readiness_checker import core as readiness

payload = json.load(open(sys.argv[1], encoding="utf-8"))
r = readiness.check_readiness(payload)

problems = []
if not r.ok:
    problems.append(f"readiness not ok: {r.errors}")
if r.readiness_state != "READY":
    problems.append(f"readiness_state={r.readiness_state!r} (expected READY)")
if r.card.next_action != "OPEN_DEPLOYMENT":
    problems.append(f"next_action={r.card.next_action!r} (expected OPEN_DEPLOYMENT)")
# TASK-163: subtitle 은 canonical build.runtimeUrl 에서 와야 한다. 서버가 실제로
# 그 필드를 채우는지까지 함께 검증된다.
if r.card.subtitle != "http://127.0.0.1:38124/":
    problems.append(f"subtitle={r.card.subtitle!r} (expected the runtimeUrl the server recorded)")
if r.warnings:
    problems.append(f"unexpected warnings: {r.warnings}")

if problems:
    print("  readiness 검증 실패:")
    for p in problems:
        print(f"    - {p}")
    sys.exit(1)
print(f"    readiness_state=READY next_action=OPEN_DEPLOYMENT subtitle={r.card.subtitle}")
PY
[[ $FAILED -eq 0 ]] && ok "readiness 카드가 실응답에서 READY + runtimeUrl 을 합성"

python3 - "$BASE" "$BID_OK" <<'PY' || FAILED=1
import sys
sys.path.insert(0, ".")
from apps.skill_mcp.mcp_servers.latest_build_status import core as latest

base, build_id = sys.argv[1], sys.argv[2]
r = latest.fetch_latest({"buildId": build_id, "buildServerUrl": base})

problems = []
if not r.ok:
    problems.append(f"fetch_latest not ok: {r.errors}")
build = r.build or {}
if build.get("buildId") != build_id:
    problems.append(f"build.buildId={build.get('buildId')!r} (expected {build_id!r})")
# 서버가 canonical 필드를 실제로 채우는지 — 스킬이 소비하는 표면이다.
if not build.get("runtimeUrl"):
    problems.append("server payload has no runtimeUrl on a passed container test")
# 계약 밖 enum 이 섞이면 explain() 이 UNKNOWN_ENUM 경고를 낸다 — 실서버 응답이
# canonical 인지 보는 가장 직접적인 신호다.
unknown = [w for w in r.warnings if w.get("code") == "UNKNOWN_ENUM"]
if unknown:
    problems.append(f"server payload carries non-canonical enums: {unknown}")

if problems:
    print("  latest-build-status 검증 실패:")
    for p in problems:
        print(f"    - {p}")
    sys.exit(1)
print(f"    live fetch ok — status={build.get('status')!r} runtimeUrl={build.get('runtimeUrl')!r} warnings={len(r.warnings)}")
PY
[[ $FAILED -eq 0 ]] && ok "latest-build-status live 호출이 canonical 응답을 무경고로 해석"

# ── [2] failure path ─────────────────────────────────────────────────
info "[2/2] failure path — 서버가 기록한 실패 이유가 요약까지 살아 나오는지"
APP_NG="skillmcp-ng-$STAMP"
BID_NG="$(seed_build "$APP_NG")" || { fail "failure path seed 실패"; exit 1; }

curl -sf -X POST "$BASE/builds/$BID_NG/container-test/start" -H 'Content-Type: application/json' \
  -d '{"internalPort":8080,"runnerId":"r-verify"}' >/dev/null || fail "container-test/start 실패"
# TASK-162 로 열린 실패 채널 — runner 가 보내는 것과 같은 모양.
curl -sf -X POST "$BASE/builds/$BID_NG/container-test/result" -H 'Content-Type: application/json' \
  -d '{"status":"FAILED","errorCode":"CONTAINER_TEST_FAILED","errorMessage":"container healthcheck timed out","runnerId":"r-verify"}' \
  >/dev/null || fail "container-test/result(FAILED) 실패"

curl -sf "$BASE/builds/$BID_NG" > "$TMP/status-ng.json" || fail "GET /builds/:id 실패"

python3 - "$TMP/status-ng.json" <<'PY' || FAILED=1
import json, sys
sys.path.insert(0, ".")
from apps.skill_mcp.skills.failure_summary_shaper import core as shaper
from apps.skill_mcp.skills.build_status_explainer import core as explainer

payload = json.load(open(sys.argv[1], encoding="utf-8"))
problems = []

# 서버가 실패 이유를 실제로 기록했는가 (TASK-162 이전에는 항상 null 이었다).
last_error = payload.get("lastError")
if not isinstance(last_error, dict):
    problems.append(f"server did not record lastError: {last_error!r}")
elif last_error.get("code") != "CONTAINER_TEST_FAILED":
    problems.append(f"lastError.code={last_error.get('code')!r} (expected CONTAINER_TEST_FAILED)")

if payload.get("test", {}).get("status") != "FAILED":
    problems.append(f"test.status={payload.get('test', {}).get('status')!r} (expected FAILED)")

s = shaper.shape(payload)
if not s.ok:
    problems.append(f"shaper not ok: {s.errors}")
if s.stage != "TEST":
    problems.append(f"stage={s.stage!r} (expected TEST — inferred from the failed test block)")
if s.error_code != "CONTAINER_TEST_FAILED":
    problems.append(f"shaper error_code={s.error_code!r} (expected the code the server recorded)")
if any(w.get("code") == "UNKNOWN_ENUM" for w in s.warnings):
    problems.append(f"shaper saw non-canonical enums: {s.warnings}")

e = explainer.explain(payload)
if not e.ok:
    problems.append(f"explainer not ok: {e.errors}")
if any(w.get("code") == "UNKNOWN_ENUM" for w in e.warnings):
    problems.append(f"explainer saw non-canonical enums: {e.warnings}")

if problems:
    print("  failure path 검증 실패:")
    for p in problems:
        print(f"    - {p}")
    sys.exit(1)
print(f"    stage=TEST error_code={s.error_code} summary={s.summary[:40]}...")
PY
[[ $FAILED -eq 0 ]] && ok "실패 요약이 서버가 기록한 canonical errorCode 를 그대로 전달"

echo
if [[ $FAILED -ne 0 ]]; then
  printf '%s실서버 검증 실패%s\n' "$C_RED" "$C_RST" >&2
  [[ -f "$TMP/server.log" ]] && tail -n 20 "$TMP/server.log" >&2
  exit 1
fi
printf '%sskill_mcp 실서버 검증: ALL PASS%s\n' "$C_GRN" "$C_RST"
exit 0
