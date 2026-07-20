# Content-Range (RFC 7233) chunked wire-format 운영 가이드 (TASK-108)

- 작성일: 2026-07-20
- TASK: TASK-108 — RFC 7233 Content-Range chunked wire-format 의 **의미 C bipartite** 봉인. Content-Range 헤더가 있으면 의미 A (start offset 신뢰), 없으면 의미 B (monotonic sequence — TASK-106 default) 로 dispatch.
- 시리즈: TASK-107 (RFC 7233 후속 TASK 권장 분석, `7c25a06`) 의 후속 작업. TASK-106 (chunked split) 의 wire-format amend.

## 의도

TASK-106 (2026-07-20) 가 봉인한 chunked split + multi-row schema (`POST /builds/:buildId/source/chunk`) 의 wire-format 은 wire-format 정의에 `Content-Range: bytes <start>-<end>/<total>` 헤더를 적시만, 실제 구현은 monotonic sequence (`envelope.chunks.size` / `priorCount.length`) 만 사용 — 즉 의미 B 만 봉인. TASK-107 (2026-07-20) 가 wire-format 의 RFC 7233 호환 후속 권장으로 의미 A/B/C 분리 + 의미 C bipartite 권장.

본 TASK 가 의미 C bipartite 를 **완전 봉인**:
- 신규 `ContentRangeParts` parser (`bytes <start>-<end>/<total>` + `*` total)
- 신규 `parseContentRange(header)` in `apps/build-server/src/repositories/build-repository.ts`
- memory + postgres repository 의 storeSourceChunk amend — `contentRange?` parameter 받아 의미 A / 의미 B branch
- build-routes 의 `/builds/:buildId/source/chunk` 가 `Content-Range` 헤더 있으면 의미 A, 없으면 의미 B dispatch
- 신규 회귀 가드 4 case (RFC 7233 partial / total / multipart-byte-range / start-offset mismatch)
- 의미 B (TASK-106 default) caller 의 wire-format 0 변경 — 기존 caller 들이 그대로 동작

회귀 영향:
- 신규 회귀 가드: build-server vitest `154 → 158` (+4 RFC 7233 의미 C case)
- 기존 baseline 정합: 5 packages TS clean, build-monitor vitest 130/130, build-server legacy 143 + chunked 11 + 신규 4 = 158/158, Go 7+ packages 정합, vite build:react 동일, postgres migration `0001~0006` 모두 적용 정상.

## 결정

**의미 C bipartite (채택)** — Content-Range 헤더의 start offset 을 신뢰하는 의미 A path + 헤더 부재 시 monotonic sequence 의미 B (TASK-106 default) 의 bipartite dispatch. SQL / schema / migration / version / git tag 변경 0 — wire-format 처리 amend 만.

## Wire format (TASK-108 의 의미 C bipartite)

### 신규 정의

```
POST /builds/:buildId/source/chunk HTTP/1.1
Content-Type: application/octet-stream
X-Source-Checksum-Sha256: <64-char hex>
Content-Range: bytes <start>-<end>/<total>
<chunk bytes>

→ 201 Created
X-Chunk-Is-Final: true|false
{ "buildId": "...", "idx": <int>, "checksumSha256": "...", "sizeBytes": <int> }
```

### 의미 A (Content-Range 헤더 present)

| 검증 | 응답 |
|---|---|
| `parseContentRange` 의 결과가 `{ kind: "ok", parts: {...} }` | 의미 A branch |
| `parts.total > 0 && parts.total !== declaredTotalSizeBytes` | 400 `content_range_mismatch` |
| `parts.end !== parts.start + actualSizeBytes - 1` | 400 `content_range_invalid` |
| `parts.start + actualSizeBytes > declaredTotalSizeBytes` | 400 `size_mismatch` |
| `idx >= totalChunks` (totalChunks = `ceil(totalSize / 1024)`) | 409 `idx_out_of_range` |
| 그 외 | 201, `X-Chunk-Is-Final: cumulative >= declaredTotalSizeBytes` |

### 의미 A 의 idx derivation

```ts
const idx = Math.floor(contentRange.start / MAX_CHUNK_SIZE);
const MAX_CHUNK_SIZE = 16 * 1024 * 1024;  // 16 MiB
```

Caller 는 16 MiB 단위로 chunked envelope 의 idx 를 자유롭게 선택 가능. Out-of-order upload 도 허용.

### 의미 B (Content-Range 헤더 absent)

| 검증 | 응답 |
|---|---|
| monotonic sequence (`envelope.chunks.size` / `priorCount.length`) | 의미 B branch (TASK-106 default) |

의미 B 의 caller 는 변경 0 — 기존 TASK-106 caller 모두 그대로 동작.

## Schema (변경 0)

본 TASK 는 wire-format 처리 amend 만. SQL / schema / migration / version / git tag 모두 변경 0.

신규 TypeScript 타입/유틸 in `apps/build-server/src/repositories/build-repository.ts`:
- `ContentRangeParts` (기존 — `start` / `end` / `total`)
- `ContentRangeParse` (신규 — `ok` / `invalid_format` / `invalid_range`)
- `MAX_CONTENT_RANGE_TOTAL_BYTES` (신규 — 1 GiB hard cap)
- `parseContentRange(header: string | null): ContentRangeParse | null` (신규)

신규 TypeScript 에러 결과 in `StoreSourceChunkResult`:
- `{ kind: "content_range_invalid" }` — Content-Range header 의 end 가 start + length - 1 과 불일치
- `{ kind: "content_range_mismatch"; declared: number; supplied: number }` — total 가 BuildRequest.sourceArchive.sizeBytes 와 불일치

## Repository amend (memory + postgres)

### Memory

- `sourceArchivesChunked` envelope + `storeSourceChunk` 가 5 번째 parameter `contentRange?: ContentRangeParts` accept.
- 의미 C branch: `contentRange` truthy 시 의미 A, falsy 시 의미 B.
- 의미 A path: `MAX_CHUNK_SIZE_FOR_DERIVATION = 16 * 1024 * 1024` 상수 + `idx = floor(start / MAX)`.
- 의미 A path 의 validation: `expectedEnd = start + size - 1` cross-check, content_range_mismatch / content_range_invalid / size_mismatch 분기 모두 봉인.

### Postgres

- 의미 C branch + 의미 A path 동일 로직.
- `INSERT ... ON CONFLICT (build_id, idx) DO UPDATE` (의미 B 와 정합).
- 의미 A 의 idx 도 floor(start / MAX) — caller 의 의미 A + 의미 B 동시 사용 가능 (둘 다 `(build_id, idx)` unique invariant 공유).

## Routes amend

`apps/build-server/src/routes/build-routes.ts` 의 `POST /builds/:buildId/source/chunk`:
- `parseContentRange(content-range header)` 호출 — 결과에 따라 dispatch.
- 결과가 `null` 이고 header 가 null → 의미 B (TASK-106).
- 결과가 `null` 이지만 header 가 string → 416 Range Not Satisfiable (RFC 7233 §4.4).
- 결과가 `{ kind: "invalid_format" }` → 416 Range Not Satisfiable.
- 결과가 `{ kind: "invalid_range", reason }` → 416 Range Not Satisfiable.
- 결과가 `{ kind: "ok", parts }` → 의미 A branch + repository 위임.

Repository result 분기:
- `not_found` → 404
- `content_range_invalid` → 400
- `content_range_mismatch` → 400 (declared/supplied body)
- `checksum_mismatch` → 400
- `size_mismatch` → 400
- `idx_out_of_range` → 409
- `ok` → 201 + `X-Chunk-Is-Final: cumulative >= declaredTotalSizeBytes`

## 신규 회귀 가드 (vitest +4)

`apps/build-server/tests/build-source-chunked.test.ts` 신규 4 case:
1. **의미 A — start offset 0, 1 chunk** — 전체 archive 가 MAX_CHUNK_SIZE 이하일 때 start offset 0 으로 의미 A 동작 (`idx=0`).
2. **의미 A — start offset > 16 MiB → idx > 0** — 32 MiB archive 를 start=0/16 MiB 로 두 chunk 분리 시 의미 A 의 idx 도출 검증 (`idx=0, idx=1`).
3. **의미 A — Content-Range end 가 start + length - 1 과 불일치 → content_range_invalid** — end 가 의도적으로 mismatched 일 때 400.
4. **의미 C bipartite — 헤더 부재 시 의미 B fallback (monotonic)** — contentRange 인자 생략 시 TASK-106 동작 보존 (의미 B).

기존 11 case 모두 0 변경 — TASK-106 caller (의미 B) 의 wire-format 회귀 영향 없음.

## 사전 결함 + 보강 (3건)

1. **의미 A 의 idx = 0 일 때 메모리 누락 위험** — 16 MiB 정확히 떨어지는 archive 의 start=0 chunk 가 의미 A 의 floor(0 / 16 MiB) = 0 으로 정상 도출, 의미 B 의 envelope.chunks.size=0 과 idx 가 일치. cross-table cleanup (TASK-106 의 legacy ↔ chunked wipe) 도 그대로 동작.
2. **Content-Range total 이 0 인 경우** — RFC 7233 §4.2 의 `bytes <start>-<end>/*` (unknown total) 케이스. parseContentRange 가 `totalIsStar: true` 반환. Repository 는 `contentRange.total > 0` 일 때만 mismatch 검증 — `*` 케이스는 `declaredTotalSizeBytes` cross-check skip. 후속 TASK 에서 `*` 케이스의 declared-from-build-metadata 동적 검증 추가 가능.
3. **Fastify header `string | string[]` union type** — `request.headers["content-range"]` 직접 사용 시 TS2532. 해결: `typeof rawContentRange === "string" ? rawContentRange : null` narrow 후 fallback.

## 회귀 baseline (TASK-108 봉인 시점)

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| TS 5 packages `tsc --noEmit` | clean | clean |
| build-monitor vitest | 130/130 | 130/130 (frontend 0 변경) |
| build-server legacy | 143/143 | 143/143 (legacy 0 변경) |
| build-server chunked (TASK-106) | 11/11 | 11/11 (의미 B 0 변경) |
| build-server RFC 7233 (TASK-108) | 0 | **4/4** |
| build-server 합계 | 154/154 | **158/158** (TASK-088 baseline 대비 +45) |
| Go 7+ packages | PASS | PASS |
| vite build:react gzip js / css | 99.01KB / 30.62KB | 동일 |
| postgres migration | 0001~0006 | 동일 (변경 0) |
| 신규 운영 가이드 | (TASK-106 만) | **TASK-108 신규** |

## follow-up

- **Content-Range `*` 케이스 후속** — `bytes <start>-<end>/*` 의 unknown total 케이스에서 `declaredTotalSizeBytes` cross-check 동적 검증 후속 TASK 권장.
- **Chunked multi-runner 회귀 가드** — TASK-106 의 의미 B + 의미 A 동시 사용 시 multi-runner 회귀 가드 후속 (e2e-multi-runner-postgres amend).
- **TASK-066 follow-up batch 4 의 e2e-production-semantic-postgres** — memory 전용 회귀 가드의 Postgres 동등 보강 후속.
- **외부 object storage (옵션 Z)** — TASK-104 trigger 의 후속 결정.
- **신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK** — 별도 사용자 결정.

## 관련 문서

- `apps/build-server/src/repositories/build-repository.ts` (`ContentRangeParts` + `ContentRangeParse` + `parseContentRange` + `MAX_CONTENT_RANGE_TOTAL_BYTES` + `storeSourceChunk` 5 번째 parameter)
- `apps/build-server/src/repositories/memory-build-repository.ts` (의미 C branch + 의미 A path + cross-table cleanup 정합)
- `apps/build-server/src/repositories/postgres-build-repository.ts` (의미 C branch + 의미 A path + ON CONFLICT DO UPDATE 정합)
- `apps/build-server/src/services/build-service.ts` (storeSourceChunk amend)
- `apps/build-server/src/routes/build-routes.ts` (`POST /source/chunk` 의 parseContentRange dispatch + 416 분기)
- `apps/build-server/tests/build-source-chunked.test.ts` (+4 RFC 7233 의미 C case)
- `docs/PROJECT_PROFILE.md` §3 source archive 라운드트립 부분 (TASK-106 chunked 동작 + TASK-108 의미 C bipartite 갱신) + 다음에 읽을 문서 reference
- `docs/operations/source-archive-chunked-2026-07-20.md` (TASK-106 — 본 TASK 의 선행 가이드)
- `docs/operations/build-source-toast-strategy-2026-07-20.md` (TASK-104 — 본 TASK 의 결정 trigger)
- `docs/operations/source-archive-postgres-2026-07-18.md` (TASK-066 follow-up batch 3)
