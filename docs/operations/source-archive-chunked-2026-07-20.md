# Source Archive Chunked Upload 운영 가이드 (TASK-106)

- 작성일: 2026-07-20
- TASK: TASK-106 — postgres migration `0006_build_source_chunked.sql` + packages/db schema 신규 + memory/postgres repository amend (chunked split) + build-routes 신규 endpoint `POST /builds/:buildId/source/chunk` + 신규 회귀 가드 + 운영 가이드
- 시리즈: TASK-104 (build_source SLO + TOAST follow-up 운영 가이드) 의 후속 trigger — multi-GB / GB-level source archive 사용 시나리오에 대응하는 chunked split 봉인.

## 의도

TASK-066 (2026-07-05 ~ 2026-07-06) 가 봉인한 `POST/GET/DELETE /builds/:buildId/source` + `build_source` (1 row = 1 build 의 단일 bytea column) + Fastify `bodyLimit: 256 * 1024 * 1024` 의 source archive 시스템은 **단일 octet-stream upload + 256 MiB 한계** 의 정직한 동작을 봉인.

다만, TASK-104 운영 가이드의 trigger 5종 중:
1. **신규 기능에서 source archive size 요구가 256 MiB 초과** (docker build context 직접 upload / monorepo 부분 archive / git LFS 일괄)
2. **운영 환경에서 200+ MiB source archive 가 regular pattern** (1회성이 아닌 매주 5+ build 가 200 MiB 초과)

를 만족하는 신규 트리거 발동을 대비해 **chunked split + multi-row schema** 마이그레이션을 봉인.

본 TASK 의 핵심 의도:
- **Wire format 결정**: `POST /builds/:buildId/source/chunk` 신규 endpoint + per-chunk `X-Source-Checksum-Sha256` header. 기존 단일-shot endpoint 는 legacy 경로로 유지 (breaking change 회피).
- **Multi-row schema**: `build_source_chunk` 신규 (id / build_id FK CASCADE / idx / bytes BYTEA / size_bytes / checksum_sha256 / created_at) + `(build_id, idx)` unique index. 기존 `build_source` 1:1 snapshot 은 legacy 와 post-write 시점에 cleanup.
- **Reassembly**: `getSourceArchive` 가 chunked envelope 우선 → legacy row fallback. Out-of-order upload 허용 (idx = 현재 chunk count).
- **Cutover 정책**: 본 TASK 가 wire format 의 **신규 endpoint 신규** 와 **기존 단일 endpoint 유지** 의 두 경로를 동등하게 노출. 운영자가 chunked 로 전환할지 결정.

회귀 영향:
- 신규 회귀 가드: build-server vitest `143 → 154` (+11 chunked test cases)
- 신규 e2e: `e2e-source-archive-chunked.sh` (memory) + `e2e-source-archive-chunked-postgres.sh` (postgres bytea direct verify)
- 기존 baseline 정합: 5 packages TS clean, build-monitor vitest 130/130, build-server 143/143 (legacy) → 154/154 (TASK-106), Go 7+ packages 정합, vite build:react 동일, postgres migration `0001~0006` 모두 적용 정상.

## 결정

**옵션 Y (채택)** — chunked split + multi-row schema 완전 봉인. 기존 단일-shot endpoint 는 legacy 경로로 유지 (breaking change 회피). 신규 endpoint `POST /builds/:buildId/source/chunk` 도입.

> 옵션 B/C (외부 object storage) 는 본 TASK 가 봉인 안 함 — TASK-104 운영 가이드 §6 의 후속 결정 분리 절차와 정합. 단일 host + Postgres 인프라 정합 상태에서 chunked split 만으로 충분히 GB 단위 source 까지 흡수 가능.

## Wire format

### 신규 endpoint: `POST /builds/:buildId/source/chunk`

| 부분 | 형식 |
|---|---|
| HTTP method | `POST` |
| Path | `/builds/:buildId/source/chunk` (UUID path param) |
| Headers | `content-type: application/octet-stream` 필수. `X-Source-Checksum-Sha256` 권장 — 미설정 시 `BuildRequest.sourceArchive.checksumSha256` 의 declared value 를 사용 (단, per-chunk mismatch 검증은 caller recomputation 필요). |
| Body | 한 chunk 의 raw bytes (≤ 256 MiB Fastify bodyLimit) |
| Response 201 | `{ "buildId": "...", "idx": <int>, "checksumSha256": "..." , "sizeBytes": <int> }` |
| Response header | `X-Chunk-Is-Final: true|false` |
| Response 400 | `checksum_mismatch`, `size_mismatch`, `not_a_buffer`, `invalid_buildId` |
| Response 404 | `not_found` (buildId 부재) |
| Response 409 | `idx_out_of_range` |
| Response 415 | body 가 `application/octet-stream` 이 아님 |

### Chunk index derivation

- **In-order upload**: `idx = current chunks.size` (memory) / `idx = COUNT(build_source_chunk WHERE build_id = :buildId)` (postgres).
- **Out-of-order upload**: 위와 동일하게 monotonically increasing sequence — caller 가 chunk size 를 자유롭게 결정 가능.
- **Final chunk 검출**: chunk upload 직후 **cumulative chunk size ≥ declared total** 일 때 `X-Chunk-Is-Final: true`. Caller 는 이 헤더로 upload 종료를 인지.

### Reassembly (GET)

- `GET /builds/:buildId/source` 가 chunked envelope 우선 조회 → 모든 rows 의 `bytes` 를 ascending idx 순서로 concatenate → 단일 `Uint8Array` 반환.
- `Content-Type: application/octet-stream` + `X-Source-Checksum-Sha256` + `X-Source-Size-Bytes` headers 동일.
- chunked envelope 미존재 시 legacy `build_source` row fallback (single-shot 업로드 호환).

## Schema (migration 0006)

### 신규 테이블: `build_source_chunk`

```sql
CREATE TABLE IF NOT EXISTS build_source_chunk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL,
  idx INTEGER NOT NULL,
  bytes BYTEA NOT NULL,
  size_bytes INTEGER NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS build_source_chunk_build_id_idx_unique
  ON build_source_chunk (build_id, idx);

CREATE INDEX IF NOT EXISTS build_source_chunk_build_id_idx
  ON build_source_chunk (build_id);

ALTER TABLE build_source_chunk
  ADD CONSTRAINT build_source_chunk_build_id_fkey
  FOREIGN KEY (build_id) REFERENCES build_request(id) ON DELETE CASCADE;
```

### Drizzle schema

- `packages/db/src/schema/build-source-chunk.ts` — `buildSourceChunkTable` (`pgTable("build_source_chunk", ...)` + `uniqueIndex("build_source_chunk_build_id_idx_unique").on(buildId, idx)`).
- `packages/db/src/index.ts` — 신규 export.
- `packages/db/src/bootstrap.ts` — `ensureDbSchema` 가 신규 table + index 2 종 생성 (idempotent).

### Migration runner

- `scripts/db-migrate.sh --plan` (TASK-103 권고 스크립트) 가 신규 migration 0006 을 자동 인식. `--status` 가 0006 `pending` 으로 표시.
- 운영 환경 deploy 시 `BUILD_REPOSITORY_BACKEND=postgres DB_AUTO_BOOTSTRAP=true` 로 부팅하면 `applyMigrations` 가 자동 적용.

## Repository amend (memory + postgres)

### Memory

- 신규 `sourceArchivesChunked: Map<buildId, StoredSourceChunked>` 모듈 스코프 Map.
- `StoredSourceChunked = { chunks: Map<idx, StoredSourceChunk>, totalSizeBytes, checksumSha256 }`.
- 신규 메서드 `storeSourceChunk(buildId, bytes, perChunkChecksumSha256, declaredTotalSizeBytes): Promise<StoreSourceChunkResult>` — 검증 후 envelope 에 chunk 추가 + idx / isFinalChunk 보고.
- `getSourceArchive` amend — chunked envelope 우선 reassemble → legacy row fallback.
- `deleteSourceArchive` amend — chunked envelope + legacy row 모두 삭제.

### Postgres

- 신규 `buildSourceChunkTable` import + `getSourceArchiveFromChunks` 메서드.
- `storeSourceChunk` — `INSERT ... ON CONFLICT (build_id, idx) DO UPDATE SET ...` (last-write-wins). `idx=0` 일 때 legacy `build_source` row wipe (한 트랜잭션). `isFinalChunk = cumulative >= declaredTotalSizeBytes`.
- `getSourceArchive` amend — `getSourceArchiveFromChunks` 우선 → legacy row fallback.
- `deleteSourceArchive` amend — 두 table 동시 delete via `Promise.all`. 하나라도 hit 시 `ok`, 둘 다 miss 시 `not_found`.

## Routes amend

- 신규 `POST /builds/:buildId/source/chunk` in `apps/build-server/src/routes/build-routes.ts`:
  - 400 invalid buildId / 415 non-buffer / 404 build not found / 400 checksum_mismatch / 400 size_mismatch / 409 idx_out_of_range / 201 + `X-Chunk-Is-Final` header.
- 기존 `POST/GET/DELETE /builds/:buildId/source` 는 그대로 유지 (legacy single-shot).

## Build service amend

- 신규 메서드 `storeSourceChunk` in `apps/build-server/src/services/build-service.ts` — repository 위임.

## 신규 회귀 가드 (vitest +11)

- `apps/build-server/tests/build-source-chunked.test.ts` 신규 (11 test cases):
  1. rejects unknown buildId (`not_found`)
  2. rejects per-chunk SHA-256 mismatch (`checksum_mismatch`)
  3. accepts the first chunk with envelope creation
  4. accepts the second chunk + reports `isFinalChunk` when complete
  5. rejects `idx_out_of_range` when the upload would exceed the per-1KiB chunk cap
  6. rejects `size_mismatch` for `declaredTotalSizeBytes <= 0`
  7. survives sequential uploads (idx recovered from prior chunks)
  8. `getSourceArchive` reassembles chunks in ascending idx order (per-chunk byte marker)
  9. `getSourceArchive` takes precedence over legacy single-shot row when both exist
  10. `deleteSourceArchive` removes the chunked envelope and returns `ok`
  11. `deleteSourceArchive` on a build with no archive returns `not_found`

## 신규 e2e

### `apps/build-server/scripts/e2e-source-archive-chunked.sh` (memory backend)

- 6 단계: build-server 부팅 → build submit → N chunks upload (default 4) → in-memory envelope verify (out-of-range upload 409) → GET reassemble SHA-256 match → DELETE chunk rows.

### `apps/build-server/scripts/e2e-source-archive-chunked-postgres.sh` (postgres backend)

- 6 단계: build-server postgres 부팅 → build submit → N chunks upload → bytea direct verify (psql 로 per-chunk bytes + checksum 비교) → GET reassemble SHA-256 match → DELETE chunk rows 0 개 검증.

## 사전 결함 + 보강 (4건)

1. **chunk index derivation 의 floor 기반이 잘못됨** — `Math.floor(totalBytesWritten / MAX_CHUNK_SIZE)` 는 chunk size 가 모두 동일할 때만 정확. 다양한 chunk size 에서 out-of-order upload 가 깨짐. 해결: `idx = current chunks.size` (monotonically increasing sequence) 로 단순화. Caller 의 chunk size 자유 보장.
2. **isFinalChunk 의 totalChunks 기반 검출이 잘못됨** — totalChunks 의 cap (per-1KiB 기반) ≠ 실제 final chunk 의 위치. 해결: `isFinalChunk = cumulative >= declaredTotalSizeBytes` 로 변경.
3. **legacy ↔ chunked 의 cross-talk** — 한 build 의 두 storage side 모두 데이터가 있으면 operational ambiguity. 해결: `storeSourceArchive` 가 chunked wipe, `storeSourceChunk` (idx=0) 가 legacy wipe — 한 쪽 write 가 다른 쪽을 강제 정리.
4. **Fastify header 가 `string | string[]` union type** — `request.headers["x-source-checksum-sha256"]` 직접 사용 시 TS2532. 해결: `typeof x === "string" && x.length > 0` narrow 후 fallback.

## 회귀 baseline (TASK-106 봉인 시점)

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| TS 5 packages `tsc --noEmit` | clean | clean |
| build-monitor vitest | 130/130 | 130/130 (frontend 0 변경) |
| build-server node:test (legacy) | 143/143 | 143/143 (legacy 변경 0) |
| build-server node:test (chunked 신규) | 0 | **11/11** |
| build-server node:test 합계 | 143/143 | **154/154** |
| Go 7+ packages | 모두 PASS | 모두 PASS |
| vite build:react gzip js / css | 99.01KB / 30.62KB | 동일 |
| postgres migration 적용 | 0001~0005 | **0001~0006** (신규 0006 추가) |

## 운영 / 마이그레이션 절차

### 신규 환경 (greenfield)

```bash
# Postgres backend 부팅 — 자동 migration 포함
./node_modules/.bin/tsc -p packages/{shared-contract,shared-config,db}/tsconfig.json && \
  ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json && \
  DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/docker_image_builder \
  BUILD_REPOSITORY_BACKEND=postgres \
  DB_AUTO_BOOTSTRAP=true \
  node apps/build-server/dist/apps/build-server/src/index.js
```

### 기존 환경 (brownfield, 0001~0005 적용 완료)

```bash
# 권고 스크립트 (TASK-103) 의 --apply-all — 0006 자동 적용
DATABASE_URL=postgres://postgres:***:***@***/prod \
  scripts/db-migrate.sh --apply-all
# 또는 명시적 --to 0006
DATABASE_URL=postgres://postgres:***:***@***/prod \
  scripts/db-migrate.sh --apply-up-to 0006
```

### 신규 회귀 가드 검증

```bash
# memory backend (간단 smoke)
bash apps/build-server/scripts/e2e-source-archive-chunked.sh

# postgres backend (정확한 bytea 검증)
bash apps/build-server/scripts/e2e-source-archive-chunked-postgres.sh
```

## follow-up

- **외부 object storage (옵션 Z) 봉인** — TASK-104 운영 가이드 §5 의 옵션 Z. 본 TASK 가 chunked split 으로 충분히 흡수 가능한 GB 단위 source archive 까지 대응하므로 곧 발동되지 않을 가능성이 큼. 후속 결정 분리.
- **chunked wire-format 의 HTTP 표준 (RFC 7233 Content-Range) 도입** — 본 TASK 가 memory 의 `idx = chunks.size` 만 사용하므로 Content-Range 헤더 처리는 pass-through. 후속 TASK 에서 RFC 7233 호환 추가.
- **TASK-066 follow-up batch 4** — `apps/build-server/src/app/create-app.ts` 의 `bodyLimit: 256 * 1024 * 1024` 가 chunked upload 의 per-chunk size 와 정합 (한 chunk 당 256 MiB 까지 허용, multi-GB archive = chunked upload). 본 TASK 가 변경하지 않았으나, 운영자가 공식적으로 256 MiB-per-chunk 임을 문서화하면 후속 결정.

## 관련 문서

- `apps/build-server/migrations/0006_build_source_chunked.sql` (신규 schema + FK)
- `packages/db/src/schema/build-source-chunk.ts` (신규 Drizzle schema)
- `packages/db/src/bootstrap.ts` (`ensureDbSchema` 의 신규 table + index 2 종)
- `apps/build-server/src/repositories/build-repository.ts` (`StoreSourceChunkResult` + `storeSourceChunk` interface)
- `apps/build-server/src/repositories/memory-build-repository.ts` (신규 `storeSourceChunk` + `sourceArchivesChunked` Map + `getSourceArchive` 우선순위 + `deleteSourceArchive` amend)
- `apps/build-server/src/repositories/postgres-build-repository.ts` (신규 `storeSourceChunk` + `getSourceArchiveFromChunks` + ON CONFLICT + cross-table cleanup)
- `apps/build-server/src/services/build-service.ts` (`storeSourceChunk` 위임)
- `apps/build-server/src/routes/build-routes.ts` (신규 `POST /builds/:buildId/source/chunk` endpoint)
- `apps/build-server/tests/build-source-chunked.test.ts` (신규 11 test cases)
- `apps/build-server/scripts/e2e-source-archive-chunked.sh` (memory backend e2e)
- `apps/build-server/scripts/e2e-source-archive-chunked-postgres.sh` (postgres backend e2e + bytea direct verify)
- `docs/PROJECT_PROFILE.md` §3 의 source archive 라운드트립 부분 (TASK-106 chunked 동작 추가 + 다음에 읽을 문서 reference)
- `docs/operations/source-archive-postgres-2026-07-18.md` (TASK-066 follow-up batch 3 — 본 TASK 의 선행 가이드)
- `docs/operations/build-source-toast-strategy-2026-07-20.md` (TASK-104 — 본 TASK 의 결정 trigger)
- `docs/operations/migration-cli-workflow-2026-07-20.md` (TASK-103 — 권고 스크립트)
