#!/usr/bin/env bash
# scripts/run-b-layer-guards.sh
#
# TASK-149: B층 가드 두 종류 + 문서 무결성 가드를 CI / nightly 환경에서
# 직렬 실행. compose.ci.yaml 의 `guard` service 안에서 도는 것을 전제.
#
# 동작 순서:
#   1) 환경 점검 (CI_BASE_URL, 가드 스크립트 존재, Chrome 설치)
#   2) B층 대비 가드 (check-theme-contrast.mjs)
#   3) B층 CSS 유출 가드 (check-css-leak.mjs)
#   4) 문서 무결성 가드 (--range main..HEAD)
#   5) 결과 요약 + 종료 코드
#
# 종료 코드:
#   0 — 전 가드 통과
#   1 — 가드 중 1개 이상 위반 검출
#   2 — 사용법 오류
#   3 — 전제 미충족 (앱 미기동 / Chrome 부재 / playwright-core 미설치)
#   4 — 가드 스크립트 자체의 예외
#
# 가드 스크립트가 이미 1/2/3 의 종료 코드를 정하고 있으니 이 wrapper 는
# 그것들을 받아서 마지막에 한 번만 요약한다.

set -uo pipefail

# ── 경로 / 환경 ───────────────────────────────────────────────────────
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
BUILD_MONITOR_DIR="$REPO_ROOT/apps/build-monitor"
THEME_CONTRAST="$BUILD_MONITOR_DIR/scripts/check-theme-contrast.mjs"
CSS_LEAK="$BUILD_MONITOR_DIR/scripts/check-css-leak.mjs"
DOC_INTEGRITY="$REPO_ROOT/scripts/check-doc-integrity.sh"

CI_BASE_URL="${CI_BASE_URL:-http://127.0.0.1:3000}"
RANGE_FROM="${RANGE_FROM:-main}"
RANGE_TO="${RANGE_TO:-HEAD}"

# ── 1) 환경 점검 ─────────────────────────────────────────────────────
fail_precondition=0
if ! command -v node >/dev/null 2>&1; then
  echo "✗ node 가 없습니다." >&2
  fail_precondition=1
fi
if ! command -v google-chrome >/dev/null 2>&1 && ! command -v google-chrome-stable >/dev/null 2>&1; then
  echo "✗ Chrome 이 설치돼 있지 않습니다. 가드는 channel:'chrome' 으로 실행됩니다." >&2
  fail_precondition=1
fi
for f in "$THEME_CONTRAST" "$CSS_LEAK" "$DOC_INTEGRITY"; do
  if [[ ! -f "$f" ]]; then
    echo "✗ 가드 스크립트 부재: $f" >&2
    fail_precondition=1
  fi
done
if [[ "$fail_precondition" -ne 0 ]]; then
  exit 3
fi

# build-server 가 떠 있는지 (CI_BASE_URL 에 /health 호출)
if ! command -v curl >/dev/null 2>&1; then
  echo "✗ curl 이 없습니다." >&2
  exit 3
fi
if ! curl -fsS --max-time 5 "$CI_BASE_URL/health" >/dev/null; then
  echo "✗ build-server 가 $CI_BASE_URL 에 응답하지 않습니다. compose up 상태를 확인하세요." >&2
  exit 3
fi

# ── 실행 ─────────────────────────────────────────────────────────────
results=() # "name|exit_code|elapsed_sec"

run_guard() {
  local name="$1"
  shift
  local start
  start=$(date +%s)
  local out
  out=$("$@" 2>&1)
  local code=$?
  local elapsed=$(( $(date +%s) - start ))
  results+=("$name|$code|$elapsed")
  echo "$out"
  echo "  → exit=$code elapsed=${elapsed}s"
  return 0 # wrapper 는 절대 fail-fast 하지 않는다 — 모든 가드를 끝까지 돈다
}

echo
echo "── TASK-149 B층 가드 실행 시작 (CI_BASE_URL=$CI_BASE_URL) ──"
echo

echo "── 1) B층 대비 가드 (check-theme-contrast) ──"
run_guard "check-theme-contrast" node "$THEME_CONTRAST" --url "$CI_BASE_URL"

echo
echo "── 2) B층 CSS 유출 가드 (check-css-leak) ──"
run_guard "check-css-leak" node "$CSS_LEAK" --url "$CI_BASE_URL"

echo
echo "── 3) 문서 무결성 가드 (--range $RANGE_FROM..$RANGE_TO) ──"
# --range 는 git history 가 필요하므로 guard container 에 .git 까지 mount 돼야
# 한다 (compose.ci.yaml 의 .:/workspace 볼륨에 포함됨).
run_guard "check-doc-integrity" bash "$DOC_INTEGRITY" --range "$RANGE_FROM..$RANGE_TO"

# ── 요약 ─────────────────────────────────────────────────────────────
echo
echo "── 요약 ──"
total_fail=0
for r in "${results[@]}"; do
  IFS='|' read -r name code elapsed <<< "$r"
  if [[ "$code" -eq 0 ]]; then
    marker="✓"
  else
    marker="✗"
    total_fail=$(( total_fail + 1 ))
  fi
  printf "  %s %-22s exit=%d  elapsed=%ds\n" "$marker" "$name" "$code" "$elapsed"
done

echo
if [[ "$total_fail" -eq 0 ]]; then
  echo "전 가드 통과."
  exit 0
fi
echo "$total_fail 개 가드 실패 — 위 출력을 확인하세요."
exit 1
