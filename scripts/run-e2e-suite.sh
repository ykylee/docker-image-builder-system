#!/usr/bin/env bash
# scripts/run-e2e-suite.sh
#
# TASK-156: e2e 스크립트 13종을 CI / nightly 환경에서 그룹 단위로 실행하는
# wrapper. `scripts/run-b-layer-guards.sh` 와 같은 계열이지만, e2e 는
# **호스트에서 docker compose 를 직접 구동**하므로 compose.ci.yaml 의 guard
# container 안이 아니라 러너 호스트에서 돈다.
#
# 왜 필요한가:
#   v0.2.1 의 프로덕션 결함 2건(이미지 빌드 파손 / chunked build 가 claim
#   되지 않음)은 둘 다 "e2e 를 안 돌리면 잠복한다" 가 실증된 사례다.
#   e2e 를 nightly 에 고정해 같은 유형의 회귀를 자동 검출한다.
#
# 그룹:
#   local    로컬 프로세스 기반 5종 (build-server 를 dist 로 부팅)
#   compose  docker compose 기반 6종 (실이미지 build/run 포함)
#   runner   runner 바이너리 기반 2종 (**smoke** — §주의 참고)
#   all      위 전부 (default)
#
# 사용:
#   bash scripts/run-e2e-suite.sh                 # all
#   bash scripts/run-e2e-suite.sh --group compose
#   bash scripts/run-e2e-suite.sh --group local --keep-going
#
# 종료 코드:
#   0 — 선택 그룹 전부 PASS
#   1 — 1개 이상 FAIL
#   2 — 사용법 오류
#   3 — 전제 미충족 (docker 미가용 / 빌드 산출물 부재 / postgres 미가용)
#
# 주의 — runner 그룹의 신호 강도:
#   `apps/runner/scripts/e2e-{container-run,deploy-push}.sh` 는 이름 그대로
#   **smoke** 다. 내부적으로 "container not running" / "hostPort not
#   populated" 여도 경고만 찍고 PASS 로 끝난다. 즉 이 그룹의 PASS 는
#   "plumbing 이 살아있다" 수준의 신호이지 컨테이너 기동 보증이 아니다.
#   회귀 검출의 주력은 local / compose 그룹이다.

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

GROUP="all"
KEEP_GOING=1   # 기본 fail-open — 첫 실패에서 멈추지 않고 전부 돌린 뒤 요약
while [[ $# -gt 0 ]]; do
  case "$1" in
    --group) GROUP="${2:-}"; shift 2 ;;
    --stop-on-fail) KEEP_GOING=0; shift ;;
    --keep-going) KEEP_GOING=1; shift ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) err "unknown arg: $1"; exit 2 ;;
  esac
done
case "$GROUP" in local|compose|runner|all) ;; *) err "invalid --group: $GROUP"; exit 2 ;; esac

# ── 전제 env ─────────────────────────────────────────────────────────
# compose 계열은 host docker socket 을 runner container 에 물려야 한다.
if [[ -z "${DOCKER_SOCKET_GID:-}" ]]; then
  DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3 || true)"
fi
export DOCKER_SOCKET_GID
export ADMIN_IDS="${ADMIN_IDS:-admin}"
# 로컬에 native PostgreSQL 이 5432 를 점유한 개발 환경에서 compose postgres
# 가 bind 실패하지 않도록 (TASK-154). CI 는 보통 비어 있어 그대로 5432.
export DIBS_POSTGRES_HOST_PORT="${DIBS_POSTGRES_HOST_PORT:-5432}"
# 로컬 postgres 기반 e2e 의 접속 정보.
export PGPORT="${PGPORT:-5432}"
export PG_SUPERUSER="${PG_SUPERUSER:-postgres}"
PG_URL="${DATABASE_URL:-postgres://${PG_SUPERUSER}@127.0.0.1:${PGPORT}/docker_image_builder}"

# ── 전제 점검 ────────────────────────────────────────────────────────
info "전제 점검"
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  err "docker daemon 에 접근할 수 없습니다."; exit 3
fi
ok "docker daemon 가용"
if [[ -z "$DOCKER_SOCKET_GID" ]]; then
  err "DOCKER_SOCKET_GID 를 구할 수 없습니다 (getent group docker 실패)."; exit 3
fi
ok "DOCKER_SOCKET_GID=$DOCKER_SOCKET_GID"

need_build_artifacts=0
[[ "$GROUP" == "all" || "$GROUP" == "local" || "$GROUP" == "runner" ]] && need_build_artifacts=1
if [[ "$need_build_artifacts" == "1" ]]; then
  if [[ ! -f apps/build-server/dist/apps/build-server/src/index.js ]]; then
    err "build-server dist 가 없습니다. 먼저 tsc 빌드를 수행하세요."; exit 3
  fi
  ok "build-server dist 존재"
  if [[ ! -f apps/build-monitor/dist-react/index.html ]]; then
    warn "dist-react 없음 — e2e-single-port.sh 는 graceful skip 됩니다."
  else
    ok "dist-react 존재"
  fi
fi

# runner 그룹은 runner-bin 이 필요하다. 없으면 빌드까지 책임진다 —
# 바이너리가 없으면 스크립트가 조용히 통과해 **가짜 PASS** 가 되기 때문.
if [[ "$GROUP" == "all" || "$GROUP" == "runner" ]]; then
  if [[ ! -x apps/runner/bin/runner-bin ]]; then
    if command -v go >/dev/null 2>&1; then
      info "runner-bin 빌드 (없으면 runner e2e 가 가짜 PASS 가 된다)"
      ( cd apps/runner && go build -o bin/runner-bin ./cmd/runner ) || { err "runner-bin 빌드 실패"; exit 3; }
      ok "runner-bin 빌드 완료"
    else
      err "go 툴체인이 없어 runner-bin 을 빌드할 수 없습니다."; exit 3
    fi
  else
    ok "runner-bin 존재"
  fi
fi

# 로컬 postgres 기반 e2e 는 DB 가 있어야 한다.
if [[ "$GROUP" == "all" || "$GROUP" == "local" ]]; then
  if command -v psql >/dev/null 2>&1 && psql "$PG_URL" -c 'select 1' >/dev/null 2>&1; then
    ok "postgres 가용 ($PG_URL)"
  elif command -v psql >/dev/null 2>&1; then
    info "docker_image_builder DB 생성 시도"
    if psql "postgres://${PG_SUPERUSER}@127.0.0.1:${PGPORT}/postgres" \
         -c 'CREATE DATABASE docker_image_builder' >/dev/null 2>&1; then
      ok "DB 생성 완료"
    else
      err "postgres 에 접속하거나 DB 를 만들 수 없습니다 ($PG_URL)."; exit 3
    fi
  else
    err "psql 이 없습니다 (local 그룹의 postgres e2e 에 필요)."; exit 3
  fi
fi

# ── 실행 대상 ────────────────────────────────────────────────────────
LOCAL_E2E=(
  "apps/build-server/scripts/e2e-source-archive.sh"
  "apps/build-server/scripts/e2e-source-archive-postgres.sh"
  "apps/build-server/scripts/e2e-source-archive-chunked.sh"
  "apps/build-server/scripts/e2e-source-archive-chunked-postgres.sh"
  "apps/build-server/scripts/e2e-single-port.sh"
)
COMPOSE_E2E=(
  "apps/build-server/scripts/e2e-production-semantic.sh"
  "apps/build-server/scripts/e2e-production-semantic-postgres.sh"
  "apps/build-server/scripts/e2e-multi-runner.sh"
  "apps/build-server/scripts/e2e-multi-runner-postgres.sh"
  "apps/build-server/scripts/e2e-multi-runner-chunked-postgres.sh"
  "apps/build-server/scripts/e2e-insecure-registry.sh"
)
RUNNER_E2E=(
  "apps/runner/scripts/e2e-container-run.sh"
  "apps/runner/scripts/e2e-deploy-push.sh"
)

PASS=0; FAIL=0; FAILED_NAMES=()
LOG_DIR="${E2E_LOG_DIR:-$(mktemp -d)}"
mkdir -p "$LOG_DIR"

run_one() {
  local path="$1" name; name="$(basename "$path")"
  local t0=$SECONDS
  # 각 e2e 사이에 이전 런의 잔재 compose 스택을 정리 — 고정 project name 을
  # 쓰는 스크립트가 있어 잔재가 있으면 이름 충돌로 연쇄 실패한다 (TASK-155).
  docker rm -f $(docker ps -aq --filter "name=dibs-") >/dev/null 2>&1 || true
  DATABASE_URL="$PG_URL" bash "$path" > "${LOG_DIR}/${name}.log" 2>&1
  local rc=$?
  local dt=$((SECONDS - t0))
  if [[ $rc -eq 0 ]]; then
    PASS=$((PASS+1)); ok "$(printf '%-42s %3ds' "$name" "$dt")"
  else
    FAIL=$((FAIL+1)); FAILED_NAMES+=("$name")
    err "$(printf '%-42s %3ds  exit=%d' "$name" "$dt" "$rc")"
    tail -n 12 "${LOG_DIR}/${name}.log" | sed 's/^/       │ /' >&2
  fi
  return $rc
}

run_group() {
  local label="$1"; shift
  local -a scripts=("$@")
  echo; info "── $label (${#scripts[@]}종) ──"
  for s in "${scripts[@]}"; do
    run_one "$s" || { [[ "$KEEP_GOING" == "0" ]] && return 1; }
  done
  return 0
}

START=$SECONDS
[[ "$GROUP" == "all" || "$GROUP" == "local"   ]] && run_group "LOCAL"   "${LOCAL_E2E[@]}"
[[ "$GROUP" == "all" || "$GROUP" == "compose" ]] && run_group "COMPOSE" "${COMPOSE_E2E[@]}"
[[ "$GROUP" == "all" || "$GROUP" == "runner"  ]] && run_group "RUNNER (smoke)" "${RUNNER_E2E[@]}"

# 잔재 정리 — 실패로 중단된 스크립트가 compose 스택을 남길 수 있다.
docker rm -f $(docker ps -aq --filter "name=dibs-") >/dev/null 2>&1 || true

echo
info "── 요약 ──"
printf '  PASS=%d  FAIL=%d  (%ds, group=%s)\n' "$PASS" "$FAIL" "$((SECONDS-START))" "$GROUP"
printf '  로그: %s\n' "$LOG_DIR"
if [[ $FAIL -gt 0 ]]; then
  printf '  실패: %s\n' "${FAILED_NAMES[*]}"
  exit 1
fi
ok "선택 그룹 전부 PASS"
exit 0
