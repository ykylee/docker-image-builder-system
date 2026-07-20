# Multi-runner Chunked Postgres 운영 가이드 (TASK-113)

- 작성일: 2026-07-20
- TASK: TASK-113 — TASK-082 의 multi-runner 운영 검증 (postgres backend) 의 chunked split (TASK-106 의미 B + TASK-108 의미 C + TASK-109 `*` + TASK-110 strict 모드) 동시 사용 운영 검증. 3 runner × 5 build 의 chunked upload (의미 B baseline 2 round + 의미 C numeric 2 round) + strict 모드의 `*` total 거부 검증 + postgres `build_source_chunk` bytea 무결성 + buildsClaimed 분포 검증.
- 시리즈: TASK-082 (multi-runner 운영 검증) + TASK-106/108/109/110 (chunked wire-format) 의 cross-backend 회귀 가드.

## 의도

TASK-082 (2026-07-06, `e2e-multi-runner-postgres.sh`) 가 봉인한 postgres backend 의 multi-runner 운영 검증 — 3 runner × 5 build, atomic claim, 영속 검증 — 이 **size 0 source archive** 의 single-shot upload 만 가정. 단일 HTTP POST 의 동작만 검증하지, chunked upload (TASK-106) + 의미 C (TASK-108) + `*` (TASK-109) + strict 모드 (TASK-110) 의 4 종 wire-format 동시 사용은 운영 차원에서 미검증.

본 TASK 가 cross-backend 회귀 가드 봉인 — 운영 환경 release staging 에서 chunked path 의 멀티-러너 동시 운영 적합성을 최종 확인. SQL / schema / migration 변경 0.

## 결정

**Cross-backend 회귀 가드 봉인 (채택)** — TASK-082 의 multi-runner 패턴 위에 TASK-106 / TASK-108 / TASK-110 의 chunked wire-format 을 도입. 운영자가 release staging 에서 운영 검증.

## 회귀 가드 7 단계

### [0/7] compose up — postgres + build-server + 3 runner + STRICT_CONTENT_RANGE=true

3 layer compose:
1. `compose.dev.yaml` — build-server + runner 기본
2. `compose.dev.runner-multi-postgres.yaml` — postgres profile + runner2/runner3 추가 (TASK-082)
3. `compose.dev.multi-runner-chunked-postgres.yaml` — `STRICT_CONTENT_RANGE: "true"` env flag (TASK-110 신규)

`--profile postgres` 로 postgres service 활성화.

### [1/7] postgres + build-server healthy 대기

postgres healthy + build-server healthy 동시 대기 — build-server 가 postgres backend 의 cold start + applyMigrations 자동 bootstrap. 약 30-90초.

### [2/7] 3 runner registry 등록 대기 + STRICT_CONTENT_RANGE 활성 사전 검증

3 runner 가 admin 에 등록 (runner-compose-1, runner-multi-2, runner-multi-3). 그 후 `STRICT_CONTENT_RANGE` 가 active 인지 사전 검증 (`POST /source/chunk` 의 `Content-Range: bytes 0-15/*` 가 4xx 응답이면 strict 모드 활성).

### [3/7] 5 build POST + chunked upload (multi wire-format)

4 round 의 build 가 chunked upload 의 4 종 wire-format 사용:
- **round 0**: 의미 B baseline (header 없음) + 단일 chunk (32 bytes)
- **round 1**: 의미 C numeric total (`Content-Range: bytes 0-127/128`) + 단일 chunk
- **round 2**: 의미 B baseline + 다중 chunk (4 × 32 bytes, monotonic sequence)
- **round 3**: 의미 C numeric total + 다중 chunk (`Content-Range: bytes <start>-<end>/128`, start offset 명시)

각 round 의 chunk 의 SHA-256 은 caller 가 recompute + `X-Source-Checksum-Sha256` header 와 일치.

### [4/7] strict 모드의 `*` total 거절 검증

1 build 를 별도 추가 — `Content-Range: bytes 0-127/*` 의 `*` total 케이스 upload. STRICT_CONTENT_RANGE=true 환경에서 strict 모드가 `content_range_invalid` (400) 으로 거절하는지 검증. TASK-110 의 strict 모드 분기 — 운영자가 strict 모드 활성 시 `*` 가 의도대로 거부됨을 운영 차원에서 확인.

### [5/7] 5 build lifecycle 대기 + postgres bytea 검증

상한 5분. 4 build (round 0..3) 가 terminal (COMPLETED 또는 FAILED) 도달. 그 후 psql direct verify 로 각 build 의 `build_source_chunk` 의 row count 가 ≥ 1 인지 검증 — chunked envelope 의 bytea column 이 정상 저장됐는지 확인 (의미 C 의 chunked split 가 multi-runner 동시 운영에서도 byte-precise).

### [6/7] multi-runner buildsClaimed 분포 검증

`/admin/runners` 응답의 `buildsClaimed` 총합 ≥ 3 — 3 runner 가 claim 단계에 동시 참여. TASK-082 의 운영 동등물.

### [7/7] compose down -v

postgres volume drop.

## Wire format (변경 없음)

TASK-106 + TASK-108 + TASK-109 + TASK-110 봉인 그대로. 본 TASK 의 신규 변경 0 — 운영 가이드 + e2e 스크립트 + compose override 신규만.

## Schema (변경 없음)

postgres backend 의 `build_source` (TASK-066, migration 0004) + `build_source_chunk` (TASK-106, migration 0006) schema 그대로. 본 TASK 의 신규 변경 0.

신규 compose override `compose.dev.multi-runner-chunked-postgres.yaml` 의 핵심:
```yaml
services:
  build-server:
    environment:
      STRICT_CONTENT_RANGE: "true"
```

## 운영 rollout playbook

### 1) 사전 준비

```bash
export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"
export ADMIN_IDS=admin
```

### 2) compose up — postgres profile + multi-runner + STRICT_CONTENT_RANGE

```bash
docker compose \
  -f compose.dev.yaml \
  -f compose.dev.runner-multi-postgres.yaml \
  -f compose.dev.multi-runner-chunked-postgres.yaml \
  --profile postgres \
  --project-name dibs-mr-chunked-pg \
  up -d
```

3 layer compose:
1. `compose.dev.yaml` — base (postgres profile 있으면 postgres service 활성)
2. `compose.dev.runner-multi-postgres.yaml` — runner2/runner3 추가
3. `compose.dev.multi-runner-chunked-postgres.yaml` — `STRICT_CONTENT_RANGE=true`

### 3) e2e 스크립트 실행

```bash
bash apps/build-server/scripts/e2e-multi-runner-chunked-postgres.sh
```

7 단계 자동 검증. 약 5-7분.

### 4) 운영 환경 release staging 후 staging checklist

```bash
# release staging 단계에서 chunked + multi-runner 운영 검증
bash apps/build-server/scripts/e2e-multi-runner-chunked-postgres.sh
# → ALL PASS 시 운영 환경 release 진행.
```

### 5) compose 정리

```bash
docker compose \
  -f compose.dev.yaml \
  -f compose.dev.runner-multi-postgres.yaml \
  -f compose.dev.multi-runner-chunked-postgres.yaml \
  --profile postgres \
  --project-name dibs-mr-chunked-pg \
  down -v
```

## 사전 결함 + 보강 (3건)

1. **STRICT_CONTENT_RANGE 가 unset 일 때 strict 케이스가 false-negative** — 사전 검증 [2.5/7] 단계에서 `POST /source/chunk` 의 `Content-Range: bytes 0-15/*` 가 4xx 가 아닌 2xx 응답이면 strict 가 비활성으로 간주, 운영자에게 warning 후 계속 진행. 운영자가 운영 환경 env 를 명시적으로 다시 검증할 수 있도록 로그 정합.
2. **5 build 의 chunked 검증 시간이 길어질 위험** — postgres + 3 runner + 5 build 의 128 byte source archive 5 round × 4 wire-format 검증 + lifecycle 대기. 해결: 각 round 의 chunked upload 가 deterministic (32 bytes 동일) — lifecycle 가 5분 안에 종결.
3. **3 runner 가 동시에 chunked upload 시도 시 race 가능** — TASK-080 의 single runner 점유 + TASK-081-B 의 atomic claim 가드가 multi-runner 환경에서도 동작. 본 TASK 의 검증은 그 가드의 cross-backend 회귀에 한정. 운영 환경의 race 자체는 TASK-081-B + TASK-082 에서 검증됨.

## 회귀 baseline (TASK-113 봉인 시점)

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| TS 5 packages `tsc --noEmit` | clean | clean |
| build-monitor vitest | 130/130 | 130/130 (frontend 0 변경) |
| build-server node:test 합계 | 165/165 | 165/165 (변경 0) |
| Go 7+ packages | PASS | PASS |
| vite build:react gzip js / css | 99.01KB / 30.62KB | 동일 |
| postgres migration | 0001~0006 | 동일 (변경 0) |
| 신규 e2e 스크립트 | (TASK-082 memory/postgres 만) | **TASK-113 chunked multi-runner 신규** |
| 신규 compose override | (TASK-082 multi-runner 만) | **TASK-113 chunked multi-runner-chunked-postgres 신규** |
| 신규 운영 가이드 | (TASK-082 운영 가이드 없음) | **TASK-113 운영 가이드 신규** |

## follow-up

- **옵션 Z 외부 object storage** — TASK-104 trigger 후속 결정.
- **신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK** — 별도 사용자 결정.

## 관련 문서

- `compose.dev.multi-runner-chunked-postgres.yaml` (신규 — postgres profile + 3 runner + STRICT_CONTENT_RANGE=true)
- `apps/build-server/scripts/e2e-multi-runner-chunked-postgres.sh` (신규 e2e 스크립트 — 7 단계 검증)
- `compose.dev.runner-multi-postgres.yaml` (TASK-082 — postgres profile + multi-runner override)
- `apps/build-server/scripts/e2e-multi-runner-postgres.sh` (TASK-082 — postgres backend multi-runner 운영 검증)
- `apps/build-server/scripts/e2e-multi-runner.sh` (TASK-081-B — memory backend multi-runner 운영 검증)
- `docs/operations/multi-runner-claim-postgres-2026-07-06.md` (TASK-082 — postgres backend multi-runner 운영 가이드)
- `docs/operations/release-checklist-2026-07-20.md` (TASK-105 — 운영 배포 체크리스트 — 본 운영 가이드 cross-reference 권장)
- `docs/operations/migration-cli-workflow-2026-07-20.md` (TASK-103 — 권고 스크립트 — 운영 환경 migration verification 권장)
- `docs/operations/content-range-rfc-7233-strict-mode-2026-07-20.md` (TASK-110 — STRICT_CONTENT_RANGE env flag 운영 가이드)
- `docs/operations/source-archive-chunked-2026-07-20.md` (TASK-106 — chunked split 운영 가이드)
- `docs/PROJECT_PROFILE.md` §3.6 (chunked multi-runner 회귀 가드 따른 항목 + 다음에 읽을 문서 reference)
