#!/usr/bin/env bash
# TASK-131 — 프로젝트 고유 문서의 대량 유실 / 템플릿 덮어쓰기 가드.
#
# 왜 있는가
# ---------
# `b2cbe5e` (`chore(workflow): bulk sync — workflow kit + active state rev144`)
# 가 `docs/PROJECT_PROFILE.md` 를 327줄에서 45줄짜리 kit 템플릿 스켈레톤으로
# 덮어썼다. 유실분에는 TASK-102~113 이 쌓아 올린 §3.1~§3.12 / §4 / §5 /
# 운영 가이드 reference 전체가 들어 있었다. 커밋 메시지에는
# "docs/PROJECT_PROFILE.md: 프로젝트 메타 동기화" 라고만 적혀 있어서
# 302줄 유실이 드러나지 않았고, TASK-121~123 세 TASK 동안 아무도 눈치채지
# 못한 채 작업이 이어졌다 (TASK-124 에서 복구).
#
# workflow kit 의 sync 도구는 `ai-workflow/scripts/` 아래 배포본이라
# 거기를 고쳐도 다음 kit 업데이트에 다시 덮어써진다. 그래서 가드는
# **저장소 자신**이 들고 있어야 한다.
#
# 무엇을 보는가
# -------------
# 이번 사고의 시그니처는 두 가지였고, 둘 다 기계적으로 검출 가능하다.
#   (1) 급격한 축소      — 327 → 45줄 = 86.2% 감소
#   (2) placeholder 회귀 — `TODO:` / `<...>` 마커가 2개 → 14개로 급증
#       (= 실제 내용이 kit 템플릿 빈칸으로 교체됨)
#
# 사용법
# ------
#   scripts/check-doc-integrity.sh                 # staged 변경 검사 (pre-commit)
#   scripts/check-doc-integrity.sh --range A..B    # 커밋 범위 검사 (CI / 사후 조사)
#   scripts/check-doc-integrity.sh --install-hook  # pre-commit hook 설치
#   ALLOW_DOC_SHRINK=1 git commit ...              # 의도적 축소일 때 우회
#
# 종료 코드: 0 통과 / 1 위반 감지 / 2 사용법 오류

set -euo pipefail

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_ERR=$'\033[31m'; C_WARN=$'\033[33m'; C_OK=$'\033[32m'; C_DIM=$'\033[2m'; C_RESET=$'\033[0m'
else
  C_ERR=''; C_WARN=''; C_OK=''; C_DIM=''; C_RESET=''
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# 보호 대상. 프로젝트가 직접 축적한 문서만 넣는다 — `ai-workflow/` 아래
# kit 배포본은 sync 로 통째로 갈리는 것이 정상이므로 대상이 아니다.
is_protected() {
  case "$1" in
    docs/PROJECT_PROFILE.md) return 0 ;;
    docs/RELEASE_NOTES-*.md) return 0 ;;
    docs/operations/*.md)    return 0 ;;
    CHANGELOG.md)            return 0 ;;
    CLAUDE.md|AGENTS.md|GROK.md|MiniMax.md) return 0 ;;
    *) return 1 ;;
  esac
}

# 줄 수가 이 비율을 넘게 줄면 차단. 86% 를 놓치지 않으면서, 문서 정리로
# 흔히 발생하는 20~40% 축소는 통과시키는 지점.
SHRINK_PCT_LIMIT="${DOC_SHRINK_PCT_LIMIT:-50}"
# 축소율이 커도 원본이 이보다 짧으면 무시 (짧은 문서는 비율이 과민하다).
MIN_LINES_TO_CHECK="${DOC_MIN_LINES:-40}"

count_placeholders() {
  # kit 템플릿의 빈칸 표식: `TODO:` 와 `- 항목: <설명>` 꼴.
  grep -cE 'TODO:|^[[:space:]]*-[[:space:]]*[^:]+:[[:space:]]*<[^>]*>$' 2>/dev/null || true
}

violations=0
checked=0

report() {
  local path="$1" before="$2" after="$3" ph_before="$4" ph_after="$5" reason="$6"
  violations=$((violations + 1))
  echo "${C_ERR}✖ ${path}${C_RESET}" >&2
  echo "  ${reason}" >&2
  echo "  ${C_DIM}줄 수 ${before} → ${after} / placeholder ${ph_before} → ${ph_after}${C_RESET}" >&2
}

# $1=경로 $2=이전 내용 파일 $3=이후 내용 파일
check_pair() {
  local path="$1" before_f="$2" after_f="$3"
  local before after ph_before ph_after
  before=$(wc -l < "$before_f" | tr -d ' ')
  after=$(wc -l < "$after_f" | tr -d ' ')
  ph_before=$(count_placeholders < "$before_f")
  ph_after=$(count_placeholders < "$after_f")
  checked=$((checked + 1))

  # (1) 급격한 축소
  if [ "$before" -ge "$MIN_LINES_TO_CHECK" ] && [ "$after" -lt "$before" ]; then
    local shrink=$(( (before - after) * 100 / before ))
    if [ "$shrink" -gt "$SHRINK_PCT_LIMIT" ]; then
      report "$path" "$before" "$after" "$ph_before" "$ph_after" \
        "내용이 ${shrink}% 줄었습니다 (임계 ${SHRINK_PCT_LIMIT}%). 의도한 삭제입니까?"
      return
    fi
  fi

  # (2) placeholder 회귀 — 실제 내용이 템플릿 빈칸으로 교체된 신호
  if [ "$ph_after" -gt "$ph_before" ]; then
    report "$path" "$before" "$after" "$ph_before" "$ph_after" \
      "placeholder(TODO: / <...>) 가 늘었습니다. 템플릿이 실제 내용을 덮어썼을 수 있습니다."
    return
  fi
}

check_staged() {
  local path tmp_before tmp_after
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    is_protected "$path" || continue
    # 신규 추가 파일은 비교 대상 없음 → skip
    git cat-file -e "HEAD:$path" 2>/dev/null || continue
    tmp_before=$(mktemp); tmp_after=$(mktemp)
    git show "HEAD:$path" > "$tmp_before" 2>/dev/null || : > "$tmp_before"
    git show ":$path"     > "$tmp_after"  2>/dev/null || : > "$tmp_after"
    check_pair "$path" "$tmp_before" "$tmp_after"
    rm -f "$tmp_before" "$tmp_after"
  done < <(git diff --cached --name-only --diff-filter=M)
}

check_range() {
  local range="$1" base head path tmp_before tmp_after
  base="${range%%..*}"; head="${range##*..}"
  [ -n "$base" ] && [ -n "$head" ] || { echo "error: --range 는 A..B 형식" >&2; exit 2; }
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    is_protected "$path" || continue
    git cat-file -e "$base:$path" 2>/dev/null || continue
    tmp_before=$(mktemp); tmp_after=$(mktemp)
    git show "$base:$path" > "$tmp_before" 2>/dev/null || : > "$tmp_before"
    git show "$head:$path" > "$tmp_after"  2>/dev/null || : > "$tmp_after"
    check_pair "$path" "$tmp_before" "$tmp_after"
    rm -f "$tmp_before" "$tmp_after"
  done < <(git diff --name-only --diff-filter=M "$base" "$head")
}

install_hook() {
  local hook=".git/hooks/pre-commit"
  if [ -e "$hook" ] && ! grep -q 'check-doc-integrity' "$hook" 2>/dev/null; then
    echo "${C_WARN}warn${C_RESET} 기존 $hook 이 있습니다. 다음 줄을 직접 추가하세요:" >&2
    echo "  bash scripts/check-doc-integrity.sh || exit 1" >&2
    exit 2
  fi
  cat > "$hook" <<'HOOK'
#!/usr/bin/env bash
# TASK-131 문서 유실 가드. 우회: ALLOW_DOC_SHRINK=1 git commit ...
bash scripts/check-doc-integrity.sh || exit 1
HOOK
  chmod +x "$hook"
  echo "${C_OK}ok${C_RESET}   pre-commit hook 설치 완료 ($hook)"
}

main() {
  case "${1:-}" in
    --install-hook) install_hook; exit 0 ;;
    --range) [ -n "${2:-}" ] || { echo "error: --range <A..B> 필요" >&2; exit 2; }
             check_range "$2" ;;
    --help|-h)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    "") check_staged ;;
    *) echo "error: unknown option: $1" >&2; exit 2 ;;
  esac

  if [ "$violations" -gt 0 ]; then
    echo >&2
    echo "${C_ERR}문서 무결성 검사 실패${C_RESET} — 위반 ${violations}건 / 검사 ${checked}건" >&2
    echo "의도한 변경이라면: ${C_DIM}ALLOW_DOC_SHRINK=1${C_RESET} 를 붙여 다시 실행하세요." >&2
    return 1
  fi
  if [ "$checked" -gt 0 ]; then
    echo "${C_OK}ok${C_RESET}   문서 무결성 검사 통과 (${checked}건)"
  fi
  return 0
}

# 우회 스위치. 의도적인 대규모 문서 정리는 막지 않는다.
if [ "${ALLOW_DOC_SHRINK:-0}" = "1" ]; then
  echo "${C_WARN}warn${C_RESET} ALLOW_DOC_SHRINK=1 — 문서 무결성 검사를 건너뜁니다."
  exit 0
fi

main "$@"
