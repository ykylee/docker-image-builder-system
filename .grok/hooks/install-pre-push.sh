#!/usr/bin/env bash
# .grok/hooks/install-pre-push.sh — git pre-push hook 설치 helper
#
# 왜 있는가
# ---------
# 표준 ai-workflow 키트에 session-end 가드 5종(2026-07-27 신설)이 pre-push
# hook과 통합되어야 workflow meta drift가 push 시점에 차단된다. 본 스크립트는
# `.git/hooks/pre-push`에 thin wrapper를 설치하고, 실제 가드 호출은
# `scripts/pre-push-session-end.sh`에 위임한다.
#
# 사용법
#   bash .grok/hooks/install-pre-push.sh           # 현재 repo 에 설치
#   ALLOW_FORCE=1 bash .grok/hooks/install-pre-push.sh   # 이미 hook 있어도 덮어쓰기
#   REMOVE=1 bash .grok/hooks/install-pre-push.sh        # pre-push hook 제거
#
# 종료 코드:
#   0 — 설치 성공 (또는 이미 설치된 상태 그대로)
#   1 — 설치 실패
#
# 운영 주의: `.git/hooks/pre-push`는 본 저장소에서 관리하지 않는다(개인별
# git 환경 의존). 본 스크립트는 *helper*이며, 운영자가 명시적으로 호출해야
# hook이 설치된다. 자동화(pre-commit 단계의 통합 등)는 후속 TASK.

set -euo pipeif

REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || echo "")}"

if [ -z "$REPO_ROOT" ] || [ ! -d "$REPO_ROOT/.git" ]; then
  echo "install-pre-push.sh: git 저장소 내부에서 실행해야 합니다." >&2
  exit 1
fi

HOOK_PATH="$REPO_ROOT/.git/hooks/pre-push"
HELPER="$REPO_ROOT/scripts/pre-push-session-end.sh"

if [ "${REMOVE:-0}" = "1" ]; then
  if [ -f "$HOOK_PATH" ]; then
    rm -f "$HOOK_PATH"
    echo "[install-pre-push] pre-push hook 제거됨: $HOOK_PATH"
  else
    echo "[install-pre-push] 제거할 pre-push hook 없음"
  fi
  exit 0
fi

if [ ! -f "$HELPER" ]; then
  echo "install-pre-push.sh: helper 스크립트 미발견: $HELPER" >&2
  exit 1
fi

if [ -f "$HOOK_PATH" ] && [ "${ALLOW_FORCE:-0}" != "1" ]; then
  echo "[install-pre-push] pre-push hook 이미 존재: $HOOK_PATH" >&2
  echo "  덮어쓰려면 ALLOW_FORCE=1 bash .grok/hooks/install-pre-push.sh" >&2
  exit 1
fi

cat > "$HOOK_PATH" <<'EOF'
#!/usr/bin/env bash
# .git/hooks/pre-push — session-end 가드 위임 wrapper
# 본 파일은 `bash .grok/hooks/install-pre-push.sh` 가 생성한다.
set -e
REPO_ROOT="$(git rev-parse --show-toplevel)"
exec "$REPO_ROOT/scripts/pre-push-session-end.sh" "$REPO_ROOT"
EOF

chmod +x "$HOOK_PATH"

echo "[install-pre-push] pre-push hook 설치됨: $HOOK_PATH"
echo "  가드 read-only 모드 — drift 검출 시 push 차단"
echo "  우회: SKIP_SESSION_END_GUARD=1 git push ..."
echo "  제거: REMOVE=1 bash .grok/hooks/install-pre-push.sh"
