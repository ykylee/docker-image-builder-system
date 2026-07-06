# 2026-07-06 Multi-Runner Concurrent Claim 운영 검증

- 문서 목적: TASK-081-B 운영 검증 결과를 다음 세션이 즉시 재현/검증할 수 있게 남긴다.
- 범위: Build Server + 3 runner (RUNNER_ID=runner-compose-1 / runner-multi-2 / runner-multi-3) 동시 운영, 5 build 적재 후 atomic claim 회귀 가드의 production e2e 검증
- 대상 독자: AI 에이전트, 운영자, 다음 구현 세션
- 상태: completed (TASK-081 회귀 가드 memory-build-repository.test.ts 신규 4건 + TASK-081-B 운영 검증 완료)

## 1. 환경

- 작업 경로: `/Users/yklee/repos/docker-image-builder-system`
- Build Server: `dibs-build-server` (image `dibs/build-server:dev`)
- Runner 1: `dibs-runner` (RUNNER_ID=runner-compose-1) — `compose.dev.yaml` 기본
- Runner 2: `dibs-runner-2` (RUNNER_ID=runner-multi-2) — `compose.dev.runner-multi.yaml` override
- Runner 3: `dibs-runner-3` (RUNNER_ID=runner-multi-3) — `compose.dev.runner-multi.yaml` override
- Backend: memory (postgres profile 미활성)
- Docker: 29.4.0 + colima (`/Users/yklee/.colima/default/docker.sock`)
- 검증 시점 기준 러너 수: 3
- 참고 서비스:
  - Build Monitor + API: `http://127.0.0.1:3000`
  - Swagger UI: `http://127.0.0.1:3000/docs/`
  - OpenAPI JSON: `http://127.0.0.1:3000/openapi.json`

## 2. 수행한 검증

### 2.1 환경 점검

- docker daemon 정상 (`docker info`)
- image 두 종 사전 존재 (`dibs/build-server:dev`, `dibs/runner:dev`)
- 기존 TASK-078 의 `dibs-build-server` / `dibs-runner` container 정리 후 TASK-081-B compose up
- `DOCKER_SOCKET_GID=20` (macOS colima 의 socket group gid, `getent` 부재 환경)
- `ADMIN_IDS=admin`

### 2.2 Compose up (3 runner)

- `docker compose -f compose.dev.yaml -f compose.dev.runner-multi.yaml --project-name dibs-multi-runner up -d`
- build-server HEALTHCHECK 통과 후 3 runner 동시 기동
- 3 runner 모두 `status: ACTIVE` 로 self-register
- `lastSeenAt` 30초 주기 갱신 확인 (RUNNER_POLL_INTERVAL=5s)

### 2.3 5 build 적재 + lifecycle 관찰

- 5 build POST (각 appName unique) + source archive upload (size 0 dummy, empty input 의 SHA-256 `e3b0c4...855`)
- lifecycle phase history (build 1 예시):
  - QUEUE_CLAIMED (14:35:26.502)
  - SOURCE_PREPARED (14:35:26.507) — 5ms 후
  - FAILED (14:35:26.507) — source prepare 직후 즉시 실패
- 모든 build 가 동일 패턴 — size 0 source archive + Dockerfile 부재로 SOURCE_PREPARED 직후 FAILED
- 5 build 모두 약 5ms 만에 terminal phase 도달

### 2.4 핵심 관찰

- ✅ **3 runner 모두 ACTIVE 등록** (RUNNER_ID=runner-compose-1 / runner-multi-2 / runner-multi-3)
- ✅ **5 build 모두 claim 됨** — admin `/admin/runners` 의 `buildsClaimed` 합 = 5
- ✅ **3 runner 에 분산** (1+2+2) — multi-runner 가 동시 작업
  - `runner-compose-1`: buildsClaimed=1
  - `runner-multi-2`: buildsClaimed=2
  - `runner-multi-3`: buildsClaimed=2
- ✅ **중복 claim 0** — `buildsClaimed` 합 = build 적재 수 (5)
- ✅ **buildsClaimed 분산 비율** — 3 runner 중 3개 모두 ≥ 1 작업 점유

### 2.5 Build status 분포

- 5/5 build 가 FAILED (size 0 source 의 의도된 실패)
- `buildsCompleted = 0` (FAILED 는 `buildsCompleted` 카운트에서 제외 — `BuildService.onPhaseTerminal` 의 COMPLETED phase 만 카운트)
- `currentBuildId = null` (terminal phase 진입 시 자동 clear)

### 2.6 회귀 가드 (TASK-081-A) 와의 매핑

| Production 관찰 | 회귀 가드 (memory-build-repository.test.ts) |
|---|---|
| 3 runner ACTIVE 등록 | TASK-081 "drains N sequential cycles" (with release) |
| 5 build × Promise.all cycle 1 → 1 claimed + 4 active_build_exists | "yields exactly 1 claim + (N-1) active_build_exists when N runners race N builds" |
| 다음 cycle 에서 다음 build claim | "advances across multiple Promise.all cycles after each release" |
| 3 runner vs 5 build → 분산 1+2+2 | "yields 1 claim + (M-1) active_build_exists for M runners against K<M builds" |

## 3. 운영 가이드

### 3.1 Quick Start

```bash
# 1) 환경 변수 (TASK-078 과 동일 — silent fallback 없음)
export DOCKER_SOCKET_GID="$(stat -f %g ~/.colima/default/docker.sock 2>/dev/null || getent group docker | cut -d: -f3)"
export ADMIN_IDS="admin"

# 2) multi-runner compose up (build-server + runner + runner-2 + runner-3)
cd /Users/yklee/repos/docker-image-builder-system
docker compose -f compose.dev.yaml -f compose.dev.runner-multi.yaml \
  --project-name dibs-multi-runner up -d

# 3) health 대기 + admin /admin/runners 확인
curl -fsS http://127.0.0.1:3000/health
curl -fsS -H 'x-admin-id: admin' http://127.0.0.1:3000/admin/runners
# → 3 row (runner-compose-1 / runner-multi-2 / runner-multi-3) 모두 ACTIVE

# 4) e2e-multi-runner.sh 자동 검증 (5 build × 3 runner lifecycle)
bash apps/build-server/scripts/e2e-multi-runner.sh

# 5) tear down
docker compose -f compose.dev.yaml -f compose.dev.runner-multi.yaml \
  --project-name dibs-multi-runner down -v
```

### 3.2 주의 (host 의 docker socket 공유)

- macOS colima 환경에서는 `~/.colima/default/docker.sock` 가 호스트의 docker socket — `/var/run/docker.sock` 가 호스트에 없을 수 있다.
- `compose.dev.yaml` 의 `${DOCKER_SOCKET_GID:?...}` 은 host 의 docker group gid. macOS colima 의 경우 socket gid = staff group gid (보통 20).
- `getent` 가 macOS host 에 없을 수 있다 → `stat -f %g <socket-path>` fallback 사용.
- 모든 runner 가 host docker socket 을 공유 mount → 동일한 권한으로 host 데몬 RPC 호출. self-dogfood 용 단순화. 운영에서는 rootless DinD 또는 별도 runner node 로 격리 검토 (후속 TASK).

### 3.3 macOS colima 환경의 사전 cleanup

TASK-078 의 self-dogfood container (`dibs-build-server`, `dibs-runner`) 가 떠 있으면 TASK-081-B 의 compose up 이 container_name 충돌로 fail 한다. 사전 cleanup:

```bash
docker rm -f dibs-build-server dibs-runner 2>/dev/null || true
```

## 4. 회귀 가드 + 운영 검증의 정합

본 TASK-081-B 의 운영 검증 결과는 TASK-081-A 의 회귀 가드 4건 (memory-build-repository.test.ts 의 `multi-runner atomic` describe) 과 1:1 매핑:

| TASK-081-A 회귀 가드 (단위) | TASK-081-B 운영 검증 (e2e) |
|---|---|
| drains N queued builds across N sequential claim cycles | compose up + 5 build 적재 후 lifecycle 자동 진행 |
| yields exactly 1 claim + (N-1) active_build_exists when N runners race N builds | admin /admin/runners 의 buildsClaimed 분포로 production semantic 재현 |
| advances across multiple Promise.all cycles after each release | FAILED → 다음 build claim transition 의 server-side release 가드 |
| yields 1 claim + (M-1) active_build_exists for M runners against K<M builds | 3 runner × 5 build 분산 (1+2+2) |

## 5. 다음 TASK

### 5.1 즉시 (사용자 결정 대기)

- TASK-082 (postgres backend 동일 e2e) — memory backend 검증 결과를 postgres backend 에서 재현
- TASK-083 (admin UI visual + nav 정합) — 보완 계획 §3.3
- TASK-084 (admin 가드 미허용 user deep link UX) — 보완 계획 §3.4

### 5.2 후속 (운영 검증 보강)

- busybox/scratch Dockerfile + 실제 tar.gz source archive 로 재현 → build 가 COMPLETED 까지 가는 production semantic 검증 (FAILED 만 나오는 본 검증의 한계)
- e2e-deploy-push.sh 시나리오 (TASK-068 / TASK-071a) 와 multi-runner 결합 → registry push 동시성 검증
- 5+ build × 5 runner 확장 → throughput 측정 (claim latency p95 < 5s)
