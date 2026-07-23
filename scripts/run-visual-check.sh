#!/usr/bin/env bash
# scripts/run-visual-check.sh
#
# TASK-156: build-monitor 시각 QA 를 CI / nightly 에서 자동 실행하는 wrapper.
#
# 배경 — 왜 "baseline diff" 가 기본이 아닌가:
#   TASK-152 의 baseline PNG 는 binary 라 `.gitignore` 로 git 에서 제외돼
#   있고, 외부 LFS/저장소 동기화 정책은 아직 미결이다. 그래서 CI 는
#   **커밋된 baseline 이 없다**. 대신 baseline 없이도 유효한 구조 검증을
#   기본으로 돌리고, baseline 을 복원할 수 있을 때만 diff 를 추가로 켠다.
#
# 기본 검증 (baseline 불요):
#   1) 라우트 셋 완전성 — capture.py 의 ROUTES 전부가 실제로 캡처됐는가
#   2) 산출물 무결성   — 0 byte PNG 가 없는가
#   3) 테마 분리       — 각 라우트의 dark 와 light 가 실제로 다른가
#      (테마 토큰이 깨지면 두 파일이 동일해진다 — TASK-152 의 핵심 신호)
#   4) 오버레이 포함   — RegisterRunnerModal 캡처가 baseline 과 다른가
#
# 선택 검증:
#   --baseline <dir>  주어지면 diff.py 로 픽셀 비교까지 수행
#
# 사용:
#   bash scripts/run-visual-check.sh
#   bash scripts/run-visual-check.sh --out .visual/ci --baseline apps/build-monitor/tests/visual/baseline
#
# 종료 코드:
#   0 — 전 검증 통과
#   1 — 검증 위반
#   2 — 사용법 오류
#   3 — 전제 미충족 (python playwright / Chrome / 빌드 산출물 부재)

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
cd "$REPO_ROOT"

C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'; C_BLU=$'\033[34m'; C_RST=$'\033[0m'
if [[ ! -t 1 || -n "${NO_COLOR:-}" ]]; then C_RED=""; C_GRN=""; C_YEL=""; C_BLU=""; C_RST=""; fi
info() { printf '%s==>%s %s\n' "$C_BLU" "$C_RST" "$*"; }
ok()   { printf '%s  ok%s %s\n' "$C_GRN" "$C_RST" "$*"; }
warn() { printf '%swarn%s %s\n' "$C_YEL" "$C_RST" "$*"; }
err()  { printf '%s err%s %s\n' "$C_RED" "$C_RST" "$*" >&2; }

OUT_DIR=""
BASELINE_DIR=""
THRESHOLD="${VISUAL_THRESHOLD:-0.001}"
VITE_PORT="${VITE_PORT:-5174}"
SERVER_PORT="${SERVER_PORT:-3000}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT_DIR="${2:-}"; shift 2 ;;
    --baseline) BASELINE_DIR="${2:-}"; shift 2 ;;
    --threshold) THRESHOLD="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,35p' "$0"; exit 0 ;;
    *) err "unknown arg: $1"; exit 2 ;;
  esac
done
[[ -n "$OUT_DIR" ]] || OUT_DIR=".visual/ci-$(date -u +%Y%m%dT%H%M%SZ)"

# ── 전제 점검 ────────────────────────────────────────────────────────
info "전제 점검"
python3 -c "import playwright.sync_api" 2>/dev/null || {
  err "python playwright 미설치 (pip install playwright)"; exit 3; }
ok "python playwright 가용"
command -v google-chrome >/dev/null 2>&1 || command -v google-chrome-stable >/dev/null 2>&1 || {
  err "google-chrome 미설치 (capture.py 는 channel=chrome 사용)"; exit 3; }
ok "google-chrome 가용"
[[ -f apps/build-server/dist/apps/build-server/src/index.js ]] || {
  err "build-server dist 부재 — 먼저 tsc 빌드 필요"; exit 3; }
ok "build-server dist 존재"
[[ -x apps/build-monitor/node_modules/.bin/vite ]] || {
  err "vite 부재 — pnpm install 필요"; exit 3; }
ok "vite 존재"

# ── 앱 기동 ──────────────────────────────────────────────────────────
TMP="$(mktemp -d)"
SERVER_PID=""; VITE_PID=""
cleanup() {
  [[ -n "$VITE_PID"   ]] && kill "$VITE_PID"   >/dev/null 2>&1 || true
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

info "build-server 기동 (memory backend, :$SERVER_PORT)"
PORT="$SERVER_PORT" BUILD_REPOSITORY_BACKEND=memory \
  node apps/build-server/dist/apps/build-server/src/index.js > "$TMP/server.log" 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:${SERVER_PORT}/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:${SERVER_PORT}/health" >/dev/null 2>&1 || {
  err "build-server 가 healthy 되지 않음"; tail -20 "$TMP/server.log" >&2; exit 3; }
ok "build-server healthy"

info "vite dev 기동 (:$VITE_PORT)"
( cd apps/build-monitor && ./node_modules/.bin/vite --port "$VITE_PORT" --strictPort ) \
  > "$TMP/vite.log" 2>&1 &
VITE_PID=$!
for i in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:${VITE_PORT}/login" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:${VITE_PORT}/login" >/dev/null 2>&1 || {
  err "vite dev 가 뜨지 않음"; tail -20 "$TMP/vite.log" >&2; exit 3; }
ok "vite dev ready"

# ── 캡처 ─────────────────────────────────────────────────────────────
info "캡처 → $OUT_DIR"
python3 apps/build-monitor/tests/visual/capture.py \
  --base "http://127.0.0.1:${VITE_PORT}" --out "$OUT_DIR" || {
  err "capture.py 실패"; exit 1; }

# ── 구조 검증 (baseline 불요) ────────────────────────────────────────
info "구조 검증"
python3 - "$OUT_DIR" <<'PY'
import hashlib, pathlib, re, sys

out = pathlib.Path(sys.argv[1])
# capture.py 의 ROUTES 를 단일 출처로 읽어 라우트 셋 drift 를 막는다.
src = pathlib.Path("apps/build-monitor/tests/visual/capture.py").read_text(encoding="utf-8")
block = re.search(r"ROUTES\s*=\s*\[(.*?)\]", src, re.S).group(1)
routes = re.findall(r'\(\s*"([^"]+)"\s*,', block)
modes = ["dark", "light"]

problems = []
expected = []
for r in routes:
    for m in modes:
        expected.append(out / r / f"{m}.png")
# TASK-148 1호 오버레이 — admin-runners 는 모달 캡처도 포함.
for m in modes:
    expected.append(out / "admin-runners" / f"{m}-modal.png")

missing = [p for p in expected if not p.exists()]
if missing:
    problems.append(f"누락 {len(missing)}건: " + ", ".join(str(p.relative_to(out)) for p in missing[:5]))

empty = [p for p in expected if p.exists() and p.stat().st_size == 0]
if empty:
    problems.append(f"0 byte {len(empty)}건: " + ", ".join(str(p.relative_to(out)) for p in empty[:5]))

def md5(p): return hashlib.md5(p.read_bytes()).hexdigest()

same_theme = []
for r in routes:
    d, l = out / r / "dark.png", out / r / "light.png"
    if d.exists() and l.exists() and md5(d) == md5(l):
        same_theme.append(r)
if same_theme:
    problems.append("dark==light (테마 토큰 붕괴 의심): " + ", ".join(same_theme))

# 모달이 base 캡처와 동일하면 오버레이가 안 열린 것.
same_modal = []
for m in modes:
    b, o = out / "admin-runners" / f"{m}.png", out / "admin-runners" / f"{m}-modal.png"
    if b.exists() and o.exists() and md5(b) == md5(o):
        same_modal.append(m)
if same_modal:
    problems.append("modal==base (오버레이 미개방): " + ", ".join(same_modal))

print(f"  라우트 {len(routes)} × 모드 {len(modes)} + 모달 {len(modes)} = 기대 {len(expected)} PNG")
print(f"  실제 캡처 {len(list(out.rglob('*.png')))} PNG")
if problems:
    for p in problems:
        print("  ✗ " + p)
    sys.exit(1)
print("  ✓ 라우트 셋 완전 / 0 byte 없음 / dark≠light / modal≠base")
PY
STRUCT_RC=$?
if [[ $STRUCT_RC -ne 0 ]]; then
  err "구조 검증 실패"
  exit 1
fi
ok "구조 검증 통과"

# ── 선택: baseline 픽셀 diff ─────────────────────────────────────────
if [[ -n "$BASELINE_DIR" ]]; then
  if [[ -d "$BASELINE_DIR" ]] && compgen -G "$BASELINE_DIR/*/*.png" >/dev/null; then
    info "baseline diff (threshold=$THRESHOLD)"
    python3 apps/build-monitor/tests/visual/diff.py \
      --baseline "$BASELINE_DIR" --run "$OUT_DIR" --threshold "$THRESHOLD" || {
      err "baseline diff 위반"; exit 1; }
    ok "baseline diff 통과"
  else
    warn "baseline 디렉터리에 PNG 가 없어 diff 를 건너뜁니다 ($BASELINE_DIR)"
    warn "  → baseline PNG 의 외부 LFS/저장소 동기화 정책이 정해지면 활성화."
  fi
else
  info "baseline diff 생략 (--baseline 미지정)"
fi

echo
ok "visual check 통과 — 산출물: $OUT_DIR"
exit 0
