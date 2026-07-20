# Production-semantic Postgres 운영 가이드 (TASK-111)

- 작성일: 2026-07-20
- TASK: TASK-111 — TASK-085 의 production-semantic 운영 검증의 postgres backend 동등 보강. busybox Dockerfile + 실제 tar.gz source archive 의 build 가 COMPLETED 까지 가는 운영 시나리오를 postgres backend 로 동일하게 검증.
- 시리즈: TASK-066 follow-up batch 4 의 후속 결정 후보. §3.5 의 production-semantic 운영 검증 라인이 memory-only baseline 을 postgres 동등으로 보강.

## 의도

TASK-085 (2026-07-07, `e2e-production-semantic.sh`) 가 봉인한 production-semantic 운영 검증 (busybox/scratch Dockerfile + 실제 tar.gz source archive 의 build 가 COMPLETED 까지 가는 운영 시나리오 자동 재현) 은 memory backend 만 가정. TASK-066 follow-up batch 3 가 Postgres 를 default 개발 경로로 정립한 뒤, production-semantic 의 postgres backend 동등 보강이 운영 권장 사항 4 종 중 1 종으로 식별됨 (`PROJECT_PROFILE.md` §3.5 의 후속 결정 후보).

본 TASK 가 신규 compose override + 신규 e2e 스크립트 + 운영 가이드 봉인. 회귀 영향: TASK-085 (memory backend) 의 동작 변경 0, 신규 postgres 동등 회귀 가드 신규.

## 결정

**Postgres backend 동등 보강 (채택)** — TASK-085 의 모든 7 단계 lifecycle 을 그대로 보존하면서 backend 만 memory → postgres 로 swap. 신규 compose override (`compose.dev.e2e-production-postgres.yaml`) + 신규 e2e 스크립트 (`e2e-production-semantic-postgres.sh`). SQL / schema / migration 변경 0 — boot-time env + compose override 만.

## 신규 회귀 가드 (8 단계)

TASK-085 의 7 단계에 **`postgres backend wait healthy` + `psql direct verify (applyMigrations)` + `bytea round-trip 재검증`** 의 postgres-specific 3 step 추가:

### 신규 단계 추가
- **[0/8]** warm-up — postgres:16-alpine + busybox:1.36 image pull
- **[3/8]** psql direct verify — `schema_migrations` 에 0001~0005 + 가 5+ row 적용 검증 + `build_request` table 검증
- **[8/8]** terminal-phase bytea 재검증 — build 가 COMPLETED 끝나도 bytea 가 그대로 byte-precise 한지 verify

### TASK-085 의 정합 단계
- **[1/8]** compose up — `--profile postgres` + `e2e-production` override + `e2e-production-postgres` override 의 3 layer compose
- **[2/8]** build-server cold start — postgres backend + `DB_AUTO_BOOTSTRAP=true` 가 `applyMigrations` 자동 발화
- **[4/8]** source archive 작성 — busybox Dockerfile + index.html
- **[5/8]** source archive upload → postgres bytea (`psql encode(sha256(bytes),'hex')` cross-check)
- **[6/8]** build lifecycle 대기 — COMPLETED 목표, 상한 5분
- **[7/8]** 10 phase + preview URL + deploy mode (skeleton) 검증

## Wire format (변경 0)

신규 회귀 가드는 TASK-085 의 wire-format 그대로 — postgres backend 의 동작은 memory backend 와 의미 정합:
- `POST /builds` + `POST /builds/:id/source` — 동일
- 10 phase lifecycle — 동일 (`REQUEST_ACCEPTED` ~ `COMPLETED`)
- deploy mode — `skeleton` (deploy-result.json emit, registry push 안 함)
- container cleanup — `RUNNER_STOP_CONTAINER_ON_DONE=true` 가 발화

유일한 차이: store of `build_source.bytes` 가 in-memory Map → postgres `bytea` column. 본 TASK 의 핵심 검증 = `encode(sha256(bytes),'hex')` 가 declared 값과 byte-precise 일치.

## Schema (변경 0)

postgres backend 의 `build_source` table 이미 TASK-066 에서 봉인 (`migrations/0004_build_source.sql`). 본 TASK 는 추가 schema 변경 없음.

신규 compose override `compose.dev.e2e-production-postgres.yaml` 의 의존성 graph:
- `build-server` ← `postgres:16-alpine` (profile "postgres", healthy 의존)
- `runner` ← `build-server` (healthy 의존 — TASK-085 의 host network + cli mode 그대로)

## 운영 rollout playbook

### 1) 사전 준비

```bash
# postgres container 가띄 base image + busybox 가 host daemon 에 pull.
docker pull --quiet postgres:16-alpine
docker pull --quiet busybox:1.36

# host 의 docker group gid.
export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"
export ADMIN_IDS=admin
```

### 2) compose up — postgres profile + e2e override

```bash
docker compose \
  -f compose.dev.yaml \
  -f compose.dev.e2e-production.yaml \
  -f compose.dev.e2e-production-postgres.yaml \
  --profile postgres \
  --project-name dibs-prod-pg-e2e \
  up -d --build
```

3 layer compose:
1. `compose.dev.yaml` — build-server + runner 기본 (postgres service profile "postgres")
2. `compose.dev.e2e-production.yaml` — runner 의 cli mode + host network override (TASK-085)
3. `compose.dev.e2e-production-postgres.yaml` — build-server 의 `BUILD_REPOSITORY_BACKEND=postgres` + `DATABASE_URL=postgres://dibs:dibs@postgres:5432/dibs` + `DB_AUTO_BOOTSTRAP=true` (본 TASK)

### 3) e2e 스크립트 실행

```bash
bash apps/build-server/scripts/e2e-production-semantic-postgres.sh
```

8 단계 자동 검증. 약 2-3분 (postgres cold start 5-15s 추가 vs TASK-085 의 memory variant).

### 4) 운영 환경 commit 후 staging checklist

TASK-105 운영 배포 체크리스트의 §3 Verify 7 종 회귀 가드에 추가:
```bash
# release staging 단계에서 production-semantic 의 postgres backend 동등 검증
bash apps/build-server/scripts/e2e-production-semantic-postgres.sh
# → ALL PASS 시 §4 Post-deploy Monitoring 으로 진행.
```

### 5) compose 정리

```bash
docker compose \
  -f compose.dev.yaml \
  -f compose.dev.e2e-production.yaml \
  -f compose.dev.e2e-production-postgres.yaml \
  --profile postgres \
  --project-name dibs-prod-pg-e2e \
  down -v
```

## 사전 결함 + 보강 (3건)

1. **3 layer compose 의 검증 부담** — 운영자가 3 개 compose 파일을 명시적으로 지정해야 함. 해결: 운영 가이드 §2 의 예시 명령으로 모든 layer + profile 을 나열. 의도적 — 각 layer 가 독립적으로 staged 환경에서 사용 가능하도록 분리 보존 (TASK-085 의 단일 layer 와 TASK-082 의 postgres layer 가 정합).
2. **postgres volume 자동 drop (`-v`)** — staging 환경 검증 시 의도된 cleanup 이지만 운영자가 실수로 운영 환경에서 실행하면 위험. 해결: 운영 가이드의 `--project-name` prefix 를 운영자가 staging 인지 검증한 뒤 사용.
3. **build 가 5분 안에 COMPLETED 못할 때** — busybox pull latency + postgres cold start latency 의 합. 해결: 상한 5분 (TASK-085 의 memory variant 와 동일). 운영자가 staging 환경에서 pull latency 가 반복되면 `docker pull busybox:1.36` 사전 warm-up.

## 회귀 baseline (TASK-111 봉인 시점)

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| TS 5 packages `tsc --noEmit` | clean | clean |
| build-monitor vitest | 130/130 | 130/130 (frontend 0 변경) |
| build-server node:test 합계 | 165/165 | 165/165 (변경 0) |
| Go 7+ packages | PASS | PASS |
| vite build:react gzip js / css | 99.01KB / 30.62KB | 동일 |
| postgres migration | 0001~0006 적용 정상 | 동일 (변경 0) |
| 신규 e2e 스크립트 | (TASK-085 만) | **TASK-111 신규** |
| 신규 compose override | (TASK-085 e2e 만) | **TASK-111 postgres 추가** |
| 신규 운영 가이드 | (TASK-085 운영 가이드 14종) | **TASK-111 신규 15 종** |

## follow-up

- **TASK-085 production-semantic 운영 가이드 + 신규 e2e 의 cross-reference** — TASK-085 운영 가이드에 postgres variant link 추가 (후속 TASK 권장 — 운영자가 한 자릿에서 운영 가이드 인덱스 식별 가능하도록).
- **chunked multi-runner 회귀 가드** — TASK-106 / TASK-108 / TASK-109 / TASK-110 동시 사용 시 multi-runner 회귀 가드 후속.
- **옵션 Z 외부 object storage** — TASK-104 trigger 후속 결정.
- **신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK** — 별도 사용자 결정.

## 관련 문서

- `compose.dev.e2e-production-postgres.yaml` (신규 — postgres backend override)
- `apps/build-server/scripts/e2e-production-semantic-postgres.sh` (신규 e2e 스크립트)
- `compose.dev.e2e-production.yaml` (TASK-085 — memory variant)
- `apps/build-server/scripts/e2e-production-semantic.sh` (TASK-085 — memory variant)
- `apps/build-server/migrations/0004_build_source.sql` (TASK-066 — build_source schema)
- `docs/operations/source-archive-postgres-2026-07-18.md` (TASK-066 follow-up batch 3)
- `docs/operations/production-semantic-2026-07-07.md` (TASK-085 — 본 운영 가이드의 memory variant)
- `docs/operations/release-checklist-2026-07-20.md` (TASK-105 운영 배포 체크리스트 — 본 운영 가이드 cross-reference 권장)
- `docs/PROJECT_PROFILE.md` §3.5 (production-semantic 운영 검증 follow-up 항목 + 다음에 읽을 문서 reference)
