#!/usr/bin/env bash
# pre-push hook helper — workflow meta drift 검출 (session-end 가드 5종)
#
# 왜 있는가
# ---------
# 본 스크립트는 git `pre-push` hook에서 호출되어 session-end 가드(read-only
# 모드)를 실행한다. workflow meta(state.json rev / package.json version /
# latest_backlog_path)가 main과 갈라지는 drift를 push 직전에 검출한다.
#
# 가드 5종:
#   G1 state.json JSON 유효
#   G2 current_baseline semver == HEAD latest tag
#   G3 state.session.{handoff_rev,index_rev,latest_rev} == 각 .md 의 rev N
#   G4 state.backlog.latest_backlog_path == backlog/ 의 실제 최신
#   G5 5종 package.json 의 'version' field 동등
#
# 사용법 (수동 호출)
#   bash scripts/pre-push-session-end.sh                 # workspace cwd 기준
#   bash scripts/pre-push-session-end.sh /path/to/repo   # 명시 경로
#
# 사용법 (.git/hooks/pre-push 에서 호출)
#   #!/usr/bin/env bash
#   set -e
#   REPO_ROOT="$(git rev-parse --show-toplevel)"
#   exec "$REPO_ROOT/scripts/pre-push-session-end.sh" "$REPO_ROOT"
#
# 종료 코드:
#   0 — drift 없음 (push 허용)
#   1 — drift 검출 (push 차단). 사용자가 명시적으로 우회하려면:
#       SKIP_SESSION_END_GUARD=1 git push ...

set -euo pipefail

REPO_ROOT="${1:-$(pwd)}"

if [ ! -d "$REPO_ROOT" ]; then
  echo "pre-push-session-end.sh: repo root '$REPO_ROOT' 가 디렉터리가 아님" >&2
  exit 1
fi

cd "$REPO_ROOT"

if [ "${SKIP_SESSION_END_GUARD:-0}" = "1" ]; then
  echo "[session-end] SKIP_SESSION_END_GUARD=1 — 가드 우회 (drift 미검출)"
  exit 0
fi

# 가드 구현체 위치
GUARD_PY="$REPO_ROOT/ai-workflow/skills/session-end/scripts/run_session_end.py"

if [ ! -f "$GUARD_PY" ]; then
  echo "pre-push-session-end.sh: guard 구현체 미발견: $GUARD_PY" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "pre-push-session-end.sh: python3 미설치 — 가드 우회" >&2
  exit 0
fi

echo "[session-end] workflow meta drift 가드 실행 (read-only)"
if python3 "$GUARD_PY" \
    --workspace-root "$REPO_ROOT" \
    --state-path ai-workflow/memory/active/state.json \
    --today "$(date +%Y-%m-%d)"; then
  echo "[session-end] 가드 5종 통과 — push 허용"
  exit 0
else
  echo "" >&2
  echo "[session-end] 가드 drift 검출 — push 차단" >&2
  echo "  자동 보정하려면:" >&2
  echo "    python3 ai-workflow/skills/session-end/scripts/run_session_end.py \\" >&2
  echo "      --workspace-root \"$REPO_ROOT\" --state-path ai-workflow/memory/active/state.json \\" >&2
  echo "      --apply --approval-actor \"\${USER:-local}\"" >&2
  echo "  의도적 우회:" >&2
  echo "    SKIP_SESSION_END_GUARD=1 git push ..." >&2
  exit 1
fi
