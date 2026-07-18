# Source Archive Postgres 운영 가이드 (TASK-066 + TASK-101 follow-up batch 3)

- 작성일: 2026-07-18
- TASK: TASK-066 follow-up — source archive 의 Postgres backend 운영 가이드 + default 개발 경로 승격 검토
- 시리즈: frontend rewrite 7-PR + M4.5 8-PR 시리즈 + 디자인 토큰 단일화 + PROJECT_PROFILE React baseline (batch 1/2) 후속

## 의도

TASK-066 (Runner source archive fetch + real docker build) 의 source archive 시스템 (`POST/GET/DELETE /builds/:buildId/source` + `build_source` bytea column + FK CASCADE) 이 2026-07-05 ~ 2026-07-06 에 main 합류. TASK-101 follow-up (PROJECT_PROFILE.md React baseline) 까지 18 TASK 연속 봉인 완료. 본 TASK 에서는 source archive 의 Postgres backend 운영 baseline 정립 + default 개발 경로 승격 검토 + 운영 가이드 신규.

## 결정

**Postgres default 개발 경로 승격 검토 (옵션 A)** — source archive 의 `e2e-source-archive-postgres.sh` 가 memory backend 의 `e2e-source-archive.sh` 와 동등한 5 단계 회귀 가드 (POST /builds → POST /source → bytea direct verify → GET /source → DELETE /source) 를 모두 봉인. TASK-081-B (multi-runner postgres 운영 검증) + TASK-082 (postgres multi-runner 운영 검증) + TASK-066 (source archive) 까지 Postgres backend 가 memory backend 와 동등한 운영 baseline 으로 사용 가능함을 정립. **Postgres 를 default 개발 경로로 권장** (memory backend 는 단순 환경 / CI / 디버깅용 보조 경로).

## 변경 (1 file 신규)

### 신규 1

- `docs/operations/source-archive-postgres-2026-07-18.md` (본 가이드) — Postgres backend 의 source archive 운영 검증 + 회귀 가드 정립 + default 개발 경로 권장

## 핵심 운영 검증 (TASK-066 의 5 단계 회귀 가드)

### `e2e-source-archive-postgres.sh` 의 5 단계

1. **POST /builds** — `appName` + `requestedBy` + `sourceArchive.{objectKey, checksumSha256, sizeBytes}` + `entrypointPath` + `dockerfilePath` 의 canonical payload → `buildId` 응답.
2. **POST /builds/:buildId/source** — raw archive bytes (`application/octet-stream`) upload → 201 + `X-Source-Checksum-Sha256` header. server 가 `bytes` + `checksum_sha256` + `size_bytes` 검증 후 bytea column 저장.
3. **bytea column direct verify (Postgres only)** — `psql` 로 `SELECT encode(sha256(bytes), 'hex') FROM build_source WHERE build_id = '<BUILD_ID>'` 결과가 metadata 의 `checksumSha256` 와 일치 + `size_bytes` 가 metadata 의 `sizeBytes` 와 일치 검증. **memory backend 에서는 불가능한 Postgres 만의 회귀 가드**.
4. **GET /builds/:buildId/source** — wire-format round-trip. download 한 bytes 의 sha256 + size 가 upload 시점과 일치 검증.
5. **DELETE /builds/:buildId/source** — `build_source` row 만 제거 (FK CASCADE 의 `ON DELETE CASCADE` 가 자동 처리). `build_request` row + metadata 는 보존 (재업로드 last-write-wins 패턴). count(*) 검증.

### 사전 결함 + 보강 (TASK-066 봉인 시점)

1. **bytea round-trip 의 무결성** — `encode(sha256(bytes), 'hex')` 가 metadata 의 `checksumSha256` 와 일치 + `size_bytes` 가 metadata 의 `sizeBytes` 와 일치. memory backend 에서는 in-memory 객체 비교로 동일 검증 가능하나, Postgres 에서는 `psql` 로 직접 column read 후 비교해야 함.
2. **FK CASCADE 의 정확한 동작** — `DELETE /builds/:buildId/source` 가 `build_source` 만 제거하고 `build_request` 는 보존. memory backend 의 `Map.has + Map.delete` 와 의미상 동등. Postgres 의 FK `ON DELETE CASCADE` 가 `build_request.id → build_source.build_id` 의 정합성 보장.
3. **256 MiB body limit** — `application/octet-stream` 의 body size limit (TASK-066 의 build-server Fastify config). bytea column 자체는 TOAST (Postgres 의 large object) 로 1 GB 까지 저장 가능.
4. **migrations/0004_build_source.sql 의 idempotent** — `CREATE TABLE IF NOT EXISTS` + `DO $$ ... ALTER TABLE ... ADD CONSTRAINT ... $$` 패턴. `ensureDbSchema` (bootstrap.ts) 와 migration 둘 다 idempotent — greenfield DB + 기존 DB 모두 정합.

## 회귀 baseline (TASK-066 봉인 시점, 본 TASK 는 docs only — 영향 없음)

- TS 4 packages `tsc --noEmit` clean
- build-server node:test **131/131 동일** (TASK-066 시점 — backend 0 변경, frontend 0 변경)
- build-monitor vitest **135/135 동일** (TASK-066 시점 — frontend 0 변경)
- Go 7 packages 모두 PASS
- svelte-check 0/0
- `e2e-source-archive.sh` (memory) **ALL PASS** (~30 초)
- `e2e-source-archive-postgres.sh` (postgres) **ALL PASS** (~30 초, bytea round-trip 5 단계 + psql direct verify)
- postgres migration 0004 (build_source table + FK CASCADE) 적용 정상

### TASK-101 baseline 동기화 (회귀 영향 0)

- TS 5 packages `tsc --noEmit` clean
- build-monitor vitest **130/130 PASS** (TASK-101 Svelte 135 case 일괄 삭제)
- vite build:react 정상 — gzip js **99.01KB** / css **30.62KB**
- build-server node:test **143/143 PASS** (TASK-101 Svelte scaffold 일괄 정리 영향 0)
- Go 7+ packages 모두 PASS
- svelte-check script 제거 (TASK-101)

## 운영 명령 (Postgres backend default 개발 경로)

### 1) Postgres 부팅 (colima / docker 기반)

```bash
# colima 부팅 (docker)
colima start --cpu 4 --memory 8

# Postgres container 부팅
docker run -d --name dib-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -p 15432:5432 \
  postgres:16-alpine

# DATABASE_URL 설정
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/docker_image_builder
```

### 2) Build Server 부팅 (Postgres backend)

```bash
# TypeScript 컴파일
./node_modules/.bin/tsc -p packages/{shared-contract,shared-config,db}/tsconfig.json && \
  ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json

# Build Server 부팅 (Postgres backend)
BUILD_REPOSITORY_BACKEND=postgres \
DB_AUTO_BOOTSTRAP=true \
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/docker_image_builder \
node apps/build-server/dist/apps/build-server/src/index.js
```

### 3) Source archive e2e 회귀 검증 (Postgres)

```bash
# Postgres local server 필요 (127.0.0.1:5432, superuser = postgres)
bash apps/build-server/scripts/e2e-source-archive-postgres.sh
# ALL PASS (5 단계 + psql direct verify)
```

### 4) Source archive 운영 시나리오

```bash
# 1) build enqueue (POST /builds with sourceArchive metadata)
BUILD=$(curl -fsS -X POST -H 'content-type: application/json' \
  -d '{"appName":"my-app","requestedBy":"alice",
       "sourceArchive":{"objectKey":"s3://my-bucket/source.tar.gz",
                        "checksumSha256":"<sha256>","sizeBytes":<size>},
       "entrypointPath":"src/index.ts","dockerfilePath":"Dockerfile"}' \
  http://127.0.0.1:3000/builds)
BUILD_ID=$(echo "$BUILD" | python3 -c 'import sys,json; print(json.load(sys.stdin)["build"]["buildId"])')

# 2) source archive upload (POST /builds/:buildId/source)
curl -fsS -X POST \
  -H 'content-type: application/octet-stream' \
  --data-binary @source.tar.gz \
  http://127.0.0.1:3000/builds/${BUILD_ID}/source

# 3) bytea direct verify (Postgres only)
PGPASSWORD=postgres psql -h 127.0.0.1 -p 15432 -U postgres -d docker_image_builder \
  -c "SELECT encode(sha256(bytes),'hex') FROM build_source WHERE build_id='${BUILD_ID}';"

# 4) Runner download (GET /builds/:buildId/source)
curl -fsS -o downloaded.tar.gz http://127.0.0.1:3000/builds/${BUILD_ID}/source

# 5) cleanup (DELETE /builds/:buildId/source)
curl -fsS -X DELETE http://127.0.0.1:3000/builds/${BUILD_ID}/source
# → build_source row 만 제거, build_request row + metadata 보존 (재업로드 last-write-wins)
```

## Default 개발 경로 권장

Postgres backend 를 default 개발 경로로 권장하는 이유:

1. **production 정합** — 운영 환경 (production deployment) 은 Postgres 만 사용 (memory backend 는 dev/CI 보조). default 를 Postgres 로 두면 dev ↔ production 환경 drift 최소화.
2. **bytea round-trip 회귀** — source archive 의 핵심 회귀 가드 (TASK-066 §3) 가 Postgres 에서만 가능. `e2e-source-archive-postgres.sh` 의 5 단계 + psql direct verify 가 memory backend 의 `e2e-source-archive.sh` 보다 강한 회귀 보장.
3. **FK CASCADE + migration** — Postgres 의 `build_source` FK CASCADE + `migrations/0004_build_source.sql` 의 idempotent 패턴이 운영 안정성 보장에 핵심. memory backend 의 `Map.has + Map.delete` 와 의미상 동등하지만 실 환경 검증 불가.
4. **multi-runner 운영 검증** — TASK-081-B (memory) + TASK-082 (postgres) 가 모두 ALL PASS 로 회귀 baseline 정합. Postgres 가 동일 baseline 으로 운영 가능.

memory backend 권장 사용처: 단일 runner / 단일 build / 빠른 smoke / CI (Postgres container 없이 가능) / 디버깅 (in-memory state 직접 확인).

## follow-up

- **PROJECT_PROFILE.md §3.2 Admin 엔드포인트 의 `run_local` / `run_local_postgres` 명령 + memory vs Postgres baseline 회귀 baseline 갱신** — 본 TASK (batch 3 운영 가이드) 의 scope 외. 후속 TASK 권장.
- **`scripts/migrate.ts` 의 standalone CLI** — TASK-064 에서 봉인. `psql -f migrations/0001..0005` 도 가능. 운영 환경의 migration workflow 는 별도 TASK 권장.
- **postgres migration 0004 build_source 의 TOAST 전략** — `bytea` column 의 1 GB TOAST limit. 본 TASK 의 scope 외 (TASK-066 의 `application/octet-stream` 256 MiB body limit 으로 충분).

## 관련 문서

- `apps/build-server/scripts/e2e-source-archive.sh` (memory backend e2e)
- `apps/build-server/scripts/e2e-source-archive-postgres.sh` (postgres backend e2e — 본 TASK 의 핵심 검증)
- `apps/build-server/migrations/0004_build_source.sql` (build_source table + FK CASCADE)
- `packages/db/src/schema/build-source.ts` (Drizzle schema)
- `docs/operations/multi-runner-claim-postgres-2026-07-06.md` (TASK-082 선행 가이드)
- `docs/operations/production-semantic-2026-07-07.md` (TASK-085 선행 가이드)
- `docs/operations/svelte-scaffold-cleanup-2026-07-18.md` (TASK-101 — 본 TASK 의 React baseline 동기화 기반)
- `docs/operations/project-profile-react-baseline-2026-07-18.md` (PR #57 batch 1)
- `docs/operations/project-profile-react-baseline-full-sync-2026-07-18.md` (PR #58 batch 2)"
