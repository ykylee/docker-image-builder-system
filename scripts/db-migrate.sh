#!/usr/bin/env bash
# TASK-103 — postgres migration 운영 권고 스크립트 (single entrypoint).
#
# scripts/migrate.ts 위임 wrapper. 운영자가 자주 쓰는 migration 운영
# 시나리오 6종을 단일 명령으로 노출한다. 모든 명령은 기존 standalone
# CLI 의 위임이므로 회귀 영향 0 — 본 스크립트는 docs only 운영 가이드
# + 옵션 A 권고의 표면.
#
# Usage:
#   scripts/db-migrate.sh <gate> [args...]
#
# Gates:
#   --plan               적용 계획만 확인 (dry-run)
#   --status             적용 / 미적용 상태 출력
#   --apply-all          미적용 migration 전부 적용
#   --apply-up-to <ver>  특정 version 까지만 적용 (e.g. 0002)
#   --bootstrap          greenfield DDL 도 함께 적용
#   --dr-stop            DR / staging 중단 절차 안내 (실행 안 함)
#
# 환경변수:
#   DATABASE_URL          Postgres connection URL (필수, 미설정 시 --help error)
#   MIGRATIONS_DIR        default: apps/build-server/migrations
#   DB_MIGRATE_VERBOSE    1 이면 verbose 출력

set -euo pipefail

# Color helpers (운영자 가독성 ↑). CI / 비대화형 환경에서는 비활성화.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_OK='\033[32m'
  C_INFO='\033[36m'
  C_WARN='\033[33m'
  C_ERR='\033[31m'
  C_RESET='\033[0m'
else
  C_OK=''
  C_INFO=''
  C_WARN=''
  C_ERR=''
  C_RESET=''
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

BUILD_SERVER_DIR="$REPO_ROOT/apps/build-server"
MIGRATIONS_DIR_DEFAULT="apps/build-server/migrations"
VERBOSE="${DB_MIGRATE_VERBOSE:-0}"

# TASK-128: `tsx` 는 build-server 의 devDependency 다. pnpm 은 기본적으로
# 비-hoist 격리라 repo root 에서 `node --import tsx` 를 부르면
# ERR_MODULE_NOT_FOUND 로 죽는다 (npm 의 hoisting 환경에서는 우연히
# 동작했다). 그래서 CLI 는 반드시 build-server 디렉토리를 cwd 로 실행한다.
#
# cwd 가 바뀌므로 migrations 경로는 아래 `resolve_migrations_dir` 가
# REPO_ROOT 기준 절대경로로 정규화해서 넘긴다 — 상대경로를 그대로 넘기면
# build-server cwd 기준으로 해석돼 엉뚱한 곳을 가리킨다.
run_cli() {
  (cd "$BUILD_SERVER_DIR" && node --import tsx scripts/migrate.ts "$@")
}

# MIGRATIONS_DIR 이 상대경로면 REPO_ROOT 기준으로 절대화한다. 이미
# 절대경로면 (POSIX `/...` 또는 Windows `C:...`) 그대로 쓴다.
resolve_migrations_dir() {
  local dir="${MIGRATIONS_DIR:-$MIGRATIONS_DIR_DEFAULT}"
  case "$dir" in
    /* | [A-Za-z]:*) printf '%s' "$dir" ;;
    *) printf '%s' "$REPO_ROOT/$dir" ;;
  esac
}

# 의존성이 설치되지 않은 저장소에서 게이트를 부르면 node 의 raw
# ERR_MODULE_NOT_FOUND stack trace 가 뜬다. 운영자가 원인을 즉시 알 수
# 있도록 사전 점검한다.
require_cli_deps() {
  if ! command -v node >/dev/null 2>&1; then
    err "node 를 찾을 수 없습니다 (PATH 확인 필요)"
    exit 2
  fi
  if [ ! -e "$BUILD_SERVER_DIR/node_modules/tsx" ] &&
     [ ! -e "$REPO_ROOT/node_modules/tsx" ]; then
    err "tsx 가 설치되어 있지 않습니다 — 저장소 루트에서 'pnpm install' 후 재시도"
    exit 2
  fi
}

# DATABASE_URL 가 --database-url 보다 우선 (env fallback 일관).
require_database_url() {
  if [ -z "${DATABASE_URL:-}" ]; then
    echo -e "${C_ERR}error${C_RESET}: DATABASE_URL env (or --database-url arg) is required" >&2
    echo "hint: export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/docker_image_builder" >&2
    exit 2
  fi
}

info() { echo -e "${C_INFO}==>${C_RESET} $*"; }
ok()   { echo -e "${C_OK}ok${C_RESET}   $*"; }
warn() { echo -e "${C_WARN}warn${C_RESET} $*"; }
err()  { echo -e "${C_ERR}err${C_RESET}  $*" >&2; }

# 게이트 공통 사전 점검 — 연결 정보와 CLI 실행 가능 여부를 함께 본다.
preflight() {
  require_database_url
  require_cli_deps
}

print_help() {
  cat <<EOF
Usage: $(basename "$0") <gate> [args...]

Gates (자주 쓰는 migration 운영 시나리오 6종):
  --plan               dry-run 으로 적용 계획만 확인 (회귀 영향 0)
  --status             현재 applied / pending 만 출력
  --apply-all          pending migration 일괄 적용
  --apply-up-to <ver>  특정 version 까지만 적용 (e.g. 0002)
  --bootstrap          greenfield ensureDbSchema + 일괄 적용
  --dr-stop            DR / staging 중단 절차 안내 (실행 안 함, doc 참조)

Examples:
  scripts/db-migrate.sh --plan
  scripts/db-migrate.sh --status
  scripts/db-migrate.sh --apply-all
  scripts/db-migrate.sh --apply-up-to 0002
  scripts/db-migrate.sh --bootstrap
  scripts/db-migrate.sh --dr-stop

전용 환경변수:
  DATABASE_URL          Postgres connection URL (필수)
  MIGRATIONS_DIR        default: ${MIGRATIONS_DIR_DEFAULT}
  DB_MIGRATE_VERBOSE    1 이면 verbose 출력
EOF
}

gate_plan() {
  preflight
  info "dry-run 으로 적용 계획만 확인 (변경 없음)"
  run_cli \
    --database-url "$DATABASE_URL" \
    --migrations-dir "$(resolve_migrations_dir)" \
    --dry-run
}

gate_status() {
  preflight
  info "현재 applied / pending 상태"
  run_cli \
    --database-url "$DATABASE_URL" \
    --migrations-dir "$(resolve_migrations_dir)" \
    --list
}

gate_apply_all() {
  preflight
  local dry_run
  if [ "$VERBOSE" != "1" ]; then
    info "적용 전 dry-run 으로 한 번 확인합니다"
    gate_plan || {
      err "dry-run 단계에서 실패 — --plan 으로 원인 확인 후 재시도"
      exit 1
    }
    info "적용 진행"
    dry_run=""
  else
    warn "DB_MIGRATE_VERBOSE=1 — dry-run skip"
  fi
  run_cli \
    --database-url "$DATABASE_URL" \
    --migrations-dir "$(resolve_migrations_dir)"
  ok "적용 완료"
}

gate_apply_up_to() {
  preflight
  local target="${1:-}"
  if [ -z "$target" ]; then
    err "--apply-up-to <ver> 형식 (e.g. 0002) 필요"
    exit 2
  fi
  info "적용 전 dry-run (목표: ${target})"
  run_cli \
    --database-url "$DATABASE_URL" \
    --migrations-dir "$(resolve_migrations_dir)" \
    --to "$target" \
    --dry-run
  info "적용 진행 (목표: ${target})"
  run_cli \
    --database-url "$DATABASE_URL" \
    --migrations-dir "$(resolve_migrations_dir)" \
    --to "$target"
  ok "적용 완료 (목표: ${target})"
}

gate_bootstrap() {
  preflight
  info "greenfield bootstrap DDL + 일괄 적용 (혹시 모를 누락 migration 도 함께)"
  run_cli \
    --database-url "$DATABASE_URL" \
    --migrations-dir "$(resolve_migrations_dir)" \
    --bootstrap
  ok "bootstrap 완료"
}

gate_dr_stop() {
  # DR / staging 중단 절차 — 실행 안 함, 안내만. dry-run 도 안 함.
  cat <<'BANNER'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DR / staging 중단 절차 안내
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

본 스크립트는 실행하지 않습니다. 다음 단계로 진행하세요.

1. postgres container 가 떠 있다면 그대로 유지 (build-server 가 메인).
   runner container 만 중단:
     docker stop <runner-container-name>
2. 또는 postgres container 까지 중단 (kernel-level reset):
     docker compose -f compose.dev.yaml --profile postgres down
3. 시작 시 동일 compose up 으로 build-server 자동 부팅 — applyMigrations
   가 schema_migrations 위에서 idempotent 적용 (already-applied skip).
4. staging 데이터 보존이 필요하면 `pg_dump` 후 별도 환경에 restore:
     pg_dump "$DATABASE_URL" > staging-backup-$(date -u +%Y%m%dT%H%M%SZ).sql

자세한 내용은 운영 가이드 §5 ("DR / staging 중단 시 운영 절차") 참조.
BANNER
}

dispatch() {
  local gate="${1:-}"
  if [ -z "$gate" ] || [ "$gate" = "--help" ] || [ "$gate" = "-h" ]; then
    print_help
    if [ -z "$gate" ]; then
      exit 2
    fi
    exit 0
  fi
  shift || true
  case "$gate" in
    --plan)             gate_plan ;;
    --status)           gate_status ;;
    --apply-all)        gate_apply_all ;;
    --apply-up-to)      gate_apply_up_to "${1:-}" ;;
    --bootstrap)        gate_bootstrap ;;
    --dr-stop)          gate_dr_stop ;;
    *)
      err "unknown gate: $gate"
      print_help
      exit 2
      ;;
  esac
}

dispatch "$@"
