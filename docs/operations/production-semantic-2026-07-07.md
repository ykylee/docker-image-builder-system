# Production-semantic 운영 가이드 (TASK-085 memory variant)

- 작성일: 2026-07-07
- TASK: TASK-085 — busybox/scratch Dockerfile + 실제 `tar.gz` source archive 의 build 가 COMPLETED 까지 가는 운영 시나리오 자동 재현 (memory backend).
- 시리즈: TASK-066 follow-up batch 3 (Postgres default 개발 경로) 의 sister 운영 가이드. 본 가이드는 memory backend 의 운영 검증. postgres backend 의 동등물은 `docs/operations/production-semantic-postgres-2026-07-20.md` (TASK-111).

## 의도

TASK-081-B / TASK-082 의 운영 검증은 `size 0` 의 dummy source 로 build 가 FAILED 로 종결되는 시나리오만 다뤘음. 본 TASK-085 는 실제 working source archive 로 운영 시나리오를 끝까지 보는 운영 검증 동등물 — busybox 기반의 static HTTP server Dockerfile + `index.html` 을 `tar.gz` 로 묶어 source archive 로 upload 하고 그 build 가:

1. REQUEST_ACCEPTED
2. QUEUE_CLAIMED
3. SOURCE_PREPARED
4. DOCKER_BUILD_STARTED (실제 `docker build`, busybox image pull)
5. DOCKER_BUILD_COMPLETED
6. PREVIEW_QUEUED
7. PREVIEW_READY (실제 `docker run` + HTTP GET / → 200 OK)
8. DEPLOYMENT_STARTED (skeleton mode: deploy-result.json emit)
9. DEPLOYMENT_COMPLETED
10. COMPLETED (stopContainerOnDone 가 defer 로 container cleanup)

까지 도달하고 preview URL 이 실제 200 OK 를 응답하는지, build log 의 10 phase 가 모두 emit 됐는지, container 가 cleanup 됐는지 를 모두 검증. 운영자가 운영 환경에서 `docs/operations/dogfood-e2e-2026-07-06.md` §2.2 의 수동 dogfood `bab5995f-…-95d53684263d` build (preview URL `http://127.0.0.1:32770/health`) 의 자동 재현 동등물로 사용 가능.

운영자가 운영 환경에 신규 build-monitor 를 띄우거나 신규 release staging 후 빠르게 운영 시나리오 종단을 자동 검증 가능.

## 결정

**자동 e2e 봉인 (채택)** — 신규 e2e 스크립트 + 신규 compose override + 운영 가이드. SQL / schema / migration 변경 없음.

## 신규 회귀 가드 (vitest 부재)

운영 환경 운영 시나리오 자동 재현. vitest 같은 unit-test 가 아닌 shell 기반 e2e 검증. 7 단계 회귀 가드:

- **[0/7]** warm-up (busybox:1.36 image pull)
- **[1/7]** compose up (build-server + runner cli mode)
- **[2/7]** build-server health 대기
- **[3/7]** runner registry 등록 대기 (최대 90s)
- **[4/7]** source archive 작성 (busybox Dockerfile + index.html)
- **[5/7]** build lifecycle 대기 (COMPLETED 목표, 상한 5분)
- **[6/7]** build log phase 검증 (10 phase + preview URL + healthcheck + container cleanup)
- **[7/7]** container cleanup 검증 (RUNNER_STOP_CONTAINER_ON_DONE=true 발화)

## Wire format (변경 없음)

TASK-066 봉인 (POST/GET/DELETE /builds/:id/source) + TASK-068 / TASK-071a 의 runner 배포 검증 그대로. 본 TASK 는 운영 환경 동작의 자동 재현.

## Schema (변경 없음)

신규 schema 없음.

신규 compose override `compose.dev.e2e-production.yaml` 의 의존성 graph:
- `build-server` ← (memory backend, 기본값)
- `runner` ← `build-server` (healthy 의존, cli mode + host network override)

## 운영 rollout playbook

### 1) 사전 준비

```bash
# host 의 docker group gid.
export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"
export ADMIN_IDS=admin

# busybox image 가 host daemon 에 pull. cold start 환경에서 latency 방지.
docker pull --quiet busybox:1.36
```

### 2) compose up — memory backend + cli mode runner

```bash
docker compose \
  -f compose.dev.yaml \
  -f compose.dev.e2e-production.yaml \
  --project-name dibs-prod-e2e \
  up -d --build
```

2 layer compose:
1. `compose.dev.yaml` — build-server + runner 기본 (memory backend)
2. `compose.dev.e2e-production.yaml` — runner 의 cli mode + host network override (TASK-085)

### 3) e2e 스크립트 실행

```bash
bash apps/build-server/scripts/e2e-production-semantic.sh
```

7 단계 자동 검증. 약 1-2분 (build-server cold start 30-50s + busybox pull (warmup) 10-30s + 단일 build lifecycle 30-60s + cleanup).

### 4) 운영 환경 commit 후 staging checklist

TASK-105 운영 배포 체크리스트의 §3 Verify 7 종 회귀 가드 중 하나로 본 e2e 를 운영자가 release staging 단계에서 실행:

```bash
# release staging 단계에서 production-semantic 검증
bash apps/build-server/scripts/e2e-production-semantic.sh
# → ALL PASS 시 §4 Post-deploy Monitoring 으로 진행.
```

### 5) compose 정리

```bash
docker compose \
  -f compose.dev.yaml \
  -f compose.dev.e2e-production.yaml \
  --project-name dibs-prod-e2e \
  down -v
```

## 사전 결함 + 보강 (3건)

1. **docker daemon 권한** — runner 가 host 의 docker socket 을 통해 busybox image 를 pull. internet / local registry 미가용 환경에서는 fail. e2e script 가 사전에 `docker pull busybox:1.36` 으로 warm-up 시도.
2. **build 가 5분 안에 COMPLETED 못할 때** — busybox pull latency 가 주 원인. 해결: 상한 5분. staging 환경에서 pull latency 가 반복되면 warm-up 권장.
3. **skeleton deploy mode 의 한계** — 본 e2e 는 외부 registry push 가 아닌 `deploy-result.json` emit 으로 검증. 외부 registry push (TASK-068 의 cli mode + insecure-registry) 의 운영 검증은 `e2e-insecure-registry.sh` 와 본 운영 가이드 둘 다 운영자가 release staging 에서 실행.

## 회귀 baseline (TASK-085 봉인 시점)

| 항목 | 값 |
|---|---|
| TS 5 packages `tsc --noEmit` | clean |
| build-monitor vitest | 130/130 |
| build-server node:test 합계 | 143/143 (TASK-085 봉인 시점) → TASK-106 +11 → TASK-108 +4 → TASK-109 +3 → TASK-110 +4 = 165/165 (TASK-112 시점) |
| Go 7+ packages | PASS |
| vite build:react gzip js / css | 99.01KB / 30.62KB |
| postgres migration | 0001~0005 적용 정상 (TASK-085 시점) → 0006 추가 (TASK-106) |

## follow-up

- **postgres backend 동등 보강** — `[TASK-111 강제])` postgres backend 운영 검증. 후속 결정 § 운영자 cross-reference (`docs/operations/production-semantic-postgres-2026-07-20.md`) 와 정합.
- **chunked multi-runner 회귀 가드** — TASK-106 / TASK-108 / TASK-109 / TASK-110 동시 사용 시 multi-runner 회귀 가드 후속.
- **외부 object storage (옵션 Z)** — TASK-104 trigger 후속 결정.
- **신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK** — 별도 사용자 결정.

## 관련 문서

- `apps/build-server/scripts/e2e-production-semantic.sh` (TASK-085 신규 e2e 스크립트 — memory variant)
- `compose.dev.e2e-production.yaml` (TASK-085 신규 compose override — runner cli mode + host network)
- `docs/operations/production-semantic-postgres-2026-07-20.md` (TASK-111 — 본 TASK 의 postgres backend sister 운영 가이드)
- `docs/operations/source-archive-postgres-2026-07-18.md` (TASK-066 follow-up batch 3 — Postgres default 개발 경로)
- `docs/operations/dogfood-e2e-2026-07-06.md` (§2.2 의 수동 dogfood build 의 자동 재현 동등물)
- `docs/operations/multi-runner-claim-2026-07-06.md` (TASK-081-B — multi-runner 운영 검증 가이드)
- `docs/operations/release-checklist-2026-07-20.md` (TASK-105 운영 배포 체크리스트 — 본 TASK 운영 가이드 cross-reference 권장)
- `docs/PROJECT_PROFILE.md` §3.5 (production-semantic 운영 검증 follow-up + 다음에 읽을 문서 reference)
- `docker pull busybox:1.36` warm-up 자동 시도 (e2e 스크립트 line 84-94)
