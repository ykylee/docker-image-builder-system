# 2026-07-06 Multi-Runner Concurrent Claim 운영 검증 — Postgres Backend

- 문서 목적: TASK-082 운영 검증 결과를 다음 세션이 즉시 재현/검증할 수 있게 남긴다.
- 범위: Build Server (postgres backend) + 3 runner 동시 운영, 5 build 적재 후 atomic claim 회귀 가드 + postgres 영속 검증의 production e2e
- 대상 독자: AI 에이전트, 운영자, 다음 구현 세션
- 상태: completed (TASK-082 — TASK-081-B 의 memory backend 검증을 postgres backend 로 재현)

## 1. 환경

- 작업 경로: `/Users/yklee/repos/docker-image-builder-system`
- Build Server: `dibs-build-server` (image `dibs/build-server:dev`)
- Postgres: `dibs-postgres` (image `postgres:16-alpine`, `dibs/dibs/dibs`)
- Runner 1: `dibs-runner` (RUNNER_ID=runner-compose-1) — `compose.dev.yaml` 기본
- Runner 2: `dibs-runner-2` (RUNNER_ID=runner-multi-2) — `compose.dev.runner-multi-postgres.yaml` override
- Runner 3: `dibs-runner-3` (RUNNER_ID=runner-multi-3) — `compose.dev.runner-multi-postgres.yaml` override
- Backend: **postgres** (`BUILD_REPOSITORY_BACKEND=postgres`, `DATABASE_URL=postgres://dibs:dibs@postgres:5432/dibs`, `DB_AUTO_BOOTSTRAP=true`)
- Docker: 29 + colima (`/Users/yklee/.colima/default/docker.sock`)
- 검증 시점 기준 러너 수: 3
- 참고 서비스:
  - Build Monitor + API: `http://127.0.0.1:3000`
  - Swagger UI: `http://127.0.0.1:3000/docs/`
  - OpenAPI JSON: `http://127.0.0.1:3000/openapi.json`

## 2. TASK-081-B 와의 차이

| 축 | TASK-081-B (memory backend) | TASK-082 (postgres backend) |
|---|---|---|
| override compose | `compose.dev.runner-multi.yaml` | `compose.dev.runner-multi-postgres.yaml` |
| build-server backend | `BUILD_REPOSITORY_BACKEND=memory` (default) | `BUILD_REPOSITORY_BACKEND=postgres` + `DATABASE_URL` + `DB_AUTO_BOOTSTRAP=true` |
| postgres service | profile 미활성 (의미 없음) | `--profile postgres` 로 activate, build-server `depends_on: postgres healthy` |
| build-server 부팅 | 즉시 (1~2초) | postgres healthy 후 applyMigrations 자동 (cold start 30~60초) |
| migration | bootstrap DDL 만 | 0001~0005 SQL 자동 적용 (idempotent, schema_migrations 추적) |
| 영속 검증 | postgres 없음 — 미수행 | postgres `build_request` row count + distinct appName 검증 필수 |
| e2e script | `e2e-multi-runner.sh` (5/6 stage) | `e2e-multi-runner-postgres.sh` (8/8 stage, postgres healthy/영속 단계 추가) |

## 3. 수행한 검증

### 3.1 사전 결함 봉인 (postgres backend 부팅 결함)

TASK-082 의 운영 검증 시작 시점에 다음 사전 결함이 발견되어 봉인:

**(a) `MIGRATIONS_DIR` 가 import.meta.url 의 상대 path 였는데 dist tree 의 depth 차이로 `dist/apps/build-server/migrations/` 를 가리킴** — `apps/build-server/migrations/` 가 아닌 `dist/apps/build-server/migrations/` (실제 폴더 부재). postgres backend 부팅 시 `applyMigrations` 가 `ENOENT: scandir '/app/apps/build-server/dist/apps/build-server/migrations/'` 로 실패. memory backend 는 `applyMigrations` 호출 안 해서 잠복.

수정: `apps/build-server/src/app/create-app.ts` 의 `MIGRATIONS_DIR` 를 runtime `process.cwd()` 기준 상대 path 로 변경 — docker (WORKDIR=/app) 와 local (cwd=REPO_ROOT) 모두 `apps/build-server/migrations/` 가 cwd 아래 존재. TASK-075 와 동일한 `import.meta.url` depth 함정 봉인 패턴.

**(b) `e2e-multi-runner.sh` 의 `BASE="http://build-server:3000"` 가 host 에서 resolve 안 됨** — `build-server` 는 compose 내부 DNS 이름이라 host 의 /etc/hosts 와 DNS resolver 가 모름. TASK-081-B 의 `e2e-multi-runner.sh` 가 이 결함을 가지고 있었으나 운영 검증의 manual 확인 단계가 e2e script 출력과 별개로 진행되어 봉인이 늦어졌다. 본 TASK-082 의 `e2e-multi-runner-postgres.sh` 는 compose 의 port mapping (3000:3000) 을 통해 host 의 `127.0.0.1:3000` 으로 직접 접근하도록 `BASE` 변경 + env `BUILD_SERVER_URL` override 지원. TASK-081-B 의 `e2e-multi-runner.sh` 같은 fix 는 후속 TASK 에서 (별도 PR 로 본 TASK-082 와 분리 적용 권장).

### 3.2 환경 점검

- docker daemon 정상 (`docker info`)
- image 두 종 사전 존재 (`dibs/build-server:dev`, `dibs/runner:dev`)
- 기존 TASK-078/081 의 `dibs-build-server` / `dibs-runner` container 정리 후 TASK-082 compose up
- `DOCKER_SOCKET_GID=20` (macOS colima 의 socket group gid, `getent` 부재 환경)
- `ADMIN_IDS=admin`

### 3.3 Compose up (postgres profile + 3 runner)

- `docker compose -f compose.dev.yaml -f compose.dev.runner-multi-postgres.yaml --profile postgres --project-name dibs-multi-runner-pg up -d`
- postgres HEALTHCHECK 통과 → build-server HEALTHCHECK 통과 (start_period 15s) → 3 runner 동시 기동
- 3 runner 모두 `status: ACTIVE` 로 self-register — postgres `runner` table 에 row 3개
- `lastSeenAt` 5초 주기 갱신 확인 (RUNNER_POLL_INTERVAL=5s)
- build-server log 에 migrations 자동 적용 확인: `{"applied":["0001","0002","0003","0004","0005"],"msg":"applied pending migrations on bootstrap"}`

### 3.4 5 build 적재 + lifecycle 관찰

- 5 build POST (각 appName unique, `multi-runner-pg-{0..4}-{PID}`) + source archive upload (size 0 dummy, empty input 의 SHA-256 `e3b0c4...855`)
- lifecycle phase history (postgres `phase_history` JSONB 컬럼):
  - QUEUE_CLAIMED
  - SOURCE_PREPARED (5ms 후)
  - FAILED (source prepare 직후 즉시 — size 0 source + Dockerfile 부재)
- 모든 build 가 동일 패턴, 약 5ms 만에 terminal phase 도달

### 3.5 핵심 관찰

- ✅ **3 runner 모두 ACTIVE 등록** (RUNNER_ID=runner-compose-1 / runner-multi-2 / runner-multi-3)
- ✅ **5 build 모두 claim 됨** — admin `/admin/runners` 의 `buildsClaimed` 합 = 5
- ✅ **3 row 중 2 row 이상 분산** (이번 검증: 3 / 0 / 2) — multi-runner 가 동시 작업
  - `runner-compose-1`: buildsClaimed=3
  - `runner-multi-2`: buildsClaimed=0
  - `runner-multi-3`: buildsClaimed=2
- ✅ **중복 claim 0** — `buildsClaimed` 합 = build 적재 수 (5)
- ✅ **postgres 영속 검증** — `build_request` table 에 filtered 5 row + distinct appName 5 (active-build dedup 정상)

**분포는 race condition 의 비결정성으로 매 실행마다 달라진다** — TASK-081-B memory backend 검증은 (1 / 2 / 2), TASK-082 postgres backend 검증은 (3 / 0 / 2) 모두 합 = 5, 중복 0, 2+ actively claimed. 핵심 보장은 "총합 5 + 분산 2+ + 중복 0" 이지 특정 runner 가 N건 받는다는 분포 형상은 아니다.

### 3.6 Build status 분포

- 5/5 build 가 FAILED (size 0 source 의 의도된 실패)
- `buildsCompleted = 0` (FAILED 는 `buildsCompleted` 카운트에서 제외 — `BuildService.onPhaseTerminal` 의 COMPLETED phase 만 카운트)
- `currentBuildId = null` (terminal phase 진입 시 자동 clear)

### 3.7 e2e-multi-runner-postgres.sh 자동 검증 결과

```
[0/8] compose up — postgres + build-server + 3 runner          ✓
[1/8] postgres healthy 대기                                    ✓
[2/8] build-server health 대기 (postgres backend cold start)    ✓
[2.5/8] backend 가 postgres 인지 확인 (best-effort)            ✓
       applied pending migrations on bootstrap
[3/8] 3 runner registry 등록 대기                              ✓ (3)
[4/8] 5 build POST + source archive upload                     ✓ (5 builds)
[5/8] 5 build lifecycle 대기 (상한 5분)                        ✓ (5/5 terminal)
[6/8] admin /admin/runners 분산 검증                           ✓ (2/3 actively claimed)
[7/8] postgres 영속 검증 (build_request row count + appName)   ✓ (5 / 5)
[8/8] compose down + cleanup (postgres volume 포함)            ✓

TASK-082 multi-runner (postgres) 검증: ALL PASS
```

### 3.8 회귀 가드 (TASK-081-A) 와의 매핑

| Production 관찰 (postgres) | 회귀 가드 (memory-build-repository.test.ts) |
|---|---|
| 3 runner ACTIVE 등록 (postgres `runner` table) | TASK-081 "drains N sequential cycles" (with release) |
| 5 build × Promise.all cycle 1 → 1 claimed + 4 active_build_exists | "yields exactly 1 claim + (N-1) active_build_exists when N runners race N builds" |
| 다음 cycle 에서 다음 build claim | "advances across multiple Promise.all cycles after each release" |
| 3 runner vs 5 build → 분산 (3 / 0 / 2) — 총합 5 | "yields 1 claim + (M-1) active_build_exists for M runners against K<M builds" |

회귀 가드는 memory repo 단위 테스트이지만, Build Service 가 memory/postgres repository abstraction 위에서 동일하게 동작하므로 production 환경의 postgres backend 에서도 동일 보장이 됨을 운영 검증으로 확인.

## 4. 운영 가이드

### 4.1 Quick Start

```bash
# 1) 환경 변수 (TASK-078 / TASK-081-B 와 동일)
export DOCKER_SOCKET_GID="$(stat -f %g ~/.colima/default/docker.sock 2>/dev/null || getent group docker | cut -d: -f3)"
export ADMIN_IDS=admin

# 2) postgres profile + 3 runner compose up
cd /Users/yklee/repos/docker-image-builder-system
docker compose -f compose.dev.yaml -f compose.dev.runner-multi-postgres.yaml \
  --profile postgres \
  --project-name dibs-multi-runner-pg up -d

# 3) health 대기 + admin /admin/runners 확인
curl -fsS http://127.0.0.1:3000/health
curl -fsS -H 'x-admin-id: admin' http://127.0.0.1:3000/admin/runners
# → 3 row (runner-compose-1 / runner-multi-2 / runner-multi-3) 모두 ACTIVE

# 4) e2e-multi-runner-postgres.sh 자동 검증 (5 build × 3 runner lifecycle + postgres 영속 검증)
bash apps/build-server/scripts/e2e-multi-runner-postgres.sh

# 5) tear down (postgres volume 도 drop)
docker compose -f compose.dev.yaml -f compose.dev.runner-multi-postgres.yaml \
  --profile postgres \
  --project-name dibs-multi-runner-pg down -v
```

### 4.2 주의 (host 의 docker socket 공유)

- macOS colima 환경에서는 `~/.colima/default/docker.sock` 가 호스트의 docker socket — `/var/run/docker.sock` 가 호스트에 없을 수 있다.
- `compose.dev.runner-multi-postgres.yaml` 의 `${DOCKER_SOCKET_GID:?...}` 은 host 의 docker group gid. macOS colima 의 경우 socket gid = staff group gid (보통 20).
- `getent` 가 macOS host 에 없을 수 있다 → `stat -f %g <socket-path>` fallback 사용.
- 모든 runner 가 host docker socket 을 공유 mount → 동일한 권한으로 host 데몬 RPC 호출. self-dogfood 용 단순화. 운영에서는 rootless DinD 또는 별도 runner node 로 격리 검토 (후속 TASK).

### 4.3 주의 (postgres 영속 검증의 read-back)

- e2e 의 `[7/8]` 단계는 postgres `build_request` table 의 row count 와 distinct appName 을 exec psql 로 직접 read. 검증 후 compose down 시 `-v` 가 postgres volume 도 drop 하므로 다음 실행 시 fresh start.
- 운영 환경에서는 영속 데이터 보존이 필요하므로 `down -v` 대신 `down` 만 사용 (volume 보존). production 데이터는 volume 보존 후 별도 backup 전략 필요.

### 4.4 macOS colima 환경의 사전 cleanup

TASK-078 / TASK-081-B / 다른 self-dogfood container 가 떠 있으면 TASK-082 의 compose up 이 container_name 충돌로 fail 한다. 사전 cleanup:

```bash
docker rm -f dibs-build-server dibs-runner dibs-runner-2 dibs-runner-3 dibs-postgres 2>/dev/null || true
```

## 5. 사전 결함 봉인 이력

### 5.1 `MIGRATIONS_DIR` 가 dist tree 의 잘못된 위치를 가리킴

`apps/build-server/src/app/create-app.ts` 의 `MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url).pathname` 가 dist tree 의 depth 차이로 `dist/apps/build-server/migrations/` (실제 부재) 를 가리킴. memory backend 는 `applyMigrations` 호출 안 해서 잠복. TASK-082 의 postgres 운영 검증에서 `ENOENT` 로 surface.

수정: `join(process.cwd(), "apps/build-server/migrations")` — runtime cwd 기준. docker (WORKDIR=/app) 와 local (cwd=REPO_ROOT) 모두 cwd 아래 `apps/build-server/migrations/` 존재. TASK-075 단일 포트 reverse proxy 의 `BUILD_MONITOR_DIST_PATH` 와 동일 패턴 — `import.meta.url` depth 함정 봉인.

### 5.2 e2e script 의 `BASE="http://build-server:3000"` 가 host 에서 resolve 안 됨

TASK-081-B 의 `e2e-multi-runner.sh` 가 host 에서 `http://build-server:3000` 으로 직접 호출하는 코드를 가지고 있었으나, host 의 /etc/hosts 와 DNS resolver 가 compose 내부 network 의 container name 을 모름. 따라서 admin /admin/runners 조회 시 항상 empty 응답.

TASK-082 의 `e2e-multi-runner-postgres.sh` 는 compose 의 port mapping (`3000:3000`) 을 통해 host 의 `127.0.0.1:3000` 으로 직접 접근. `BASE="http://127.0.0.1:3000"` 으로 변경. 또한 heredoc + stdin 함정도 회피 — `RUNNERS_JSON` 환경변수로 전달 (`sys.stdin.read()` 는 heredoc body 가 차지).

## 6. 회귀 가드 + 운영 검증의 정합

본 TASK-082 의 운영 검증 결과는 TASK-081-A 의 회귀 가드 4건 (memory-build-repository.test.ts 의 `multi-runner atomic` describe) + TASK-082 의 postgres 영속 검증 (1건) 의 5 항목과 1:1 매핑:

| TASK-081-A 회귀 가드 (단위) | TASK-082 운영 검증 (postgres e2e) |
|---|---|
| drains N queued builds across N sequential claim cycles | compose up + 5 build 적재 후 lifecycle 자동 진행 |
| yields exactly 1 claim + (N-1) active_build_exists when N runners race N builds | admin /admin/runners 의 buildsClaimed 분포 (3+0+2) 로 production semantic 재현 |
| advances across multiple Promise.all cycles after each release | FAILED → 다음 build claim transition 의 server-side release 가드 |
| yields 1 claim + (M-1) active_build_exists for M runners against K<M builds | 3 runner × 5 build 분산 (총합 5) |
| (없음 — memory repo 단위) | TASK-082 의 postgres 영속 검증 — `build_request` row count + distinct appName |

## 7. 다음 TASK

### 7.1 즉시 (사용자 결정 대기)

- **TASK-083** admin UI visual + nav 정합 — 보완 계획 §3.3 (TASK-081-B 운영 가이드 §3.3 동일 후보)
- **TASK-084** admin 가드 미허용 user 의 deep link UX — 보완 계획 §3.4
- **TASK-085** 운영 검증 보강 — busybox/scratch Dockerfile + 실제 tar.gz source 로 build 가 COMPLETED 까지 가는 production semantic 검증 (FAILED 만 나오는 TASK-081-B/082 의 한계)

### 7.2 후속 (multi-runner 운영 검증의 확장)

- 5+ build × 5+ runner 확장 → throughput 측정 (claim latency p95 < 5s)
- e2e-deploy-push.sh 시나리오 (TASK-068 / TASK-071a) 와 multi-runner 결합 → registry push 동시성 검증 (3 runner 가 동시에 registry push)
- TASK-080 source upload race mitigation 옵션 B (postgres `build_source` INNER JOIN) 의 multi-runner 환경 검증 — 5 build 동시 적재 시 source upload race 가 발생하지 않는지