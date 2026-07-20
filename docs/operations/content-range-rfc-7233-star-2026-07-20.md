# Content-Range (RFC 7233 §4.2 `*`) Chunked Wire-format 운영 가이드 (TASK-109)

- 작성일: 2026-07-20
- TASK: TASK-109 — RFC 7233 §4.2 의 unknown-total 케이스 (`bytes <start>-<end>/*`) 의 dynamic boundary 검증 봉인. Content-Range.total 부재 시 numeric equality check 는 skip, 단 chunk 의 `[start, end]` 가 `BuildRequest.sourceArchive.sizeBytes` 이내인지 검증.
- 시리즈: TASK-108 (RFC 7233 의미 C bipartite 봉인) 의 `*` 케이스 후속.

## 의도

TASK-108 (2026-07-20, commit `4e5161e`) 이 봉인한 의미 C bipartite 의 RFC 7233 Content-Range 호환 wire-format 에서, `total` 필드가 `*` (RFC 7233 §4.2 의 unknown total) 일 때 numeric equality check 가 inapplicable — TASK-108 의 `parseContentRange` 가 `{ kind: "ok", parts: { start, end, total: 0 }, totalIsStar: true }` 반환하고 repository 의 `content_range_mismatch` 가 `total > 0` 만 검사.

이 상태에서 잠재적 operational risk:
- caller 가 `bytes 0-9999999/*` 같은 잘못된 Content-Range 를 보내고 `BuildRequest.sourceArchive.sizeBytes = 16 KiB` 라면, repository 는 `*` 케이스를 skip 해서 silent accept → chunk 가 16 KiB envelope 의 0~9999999 영역 점유 → `getSourceArchive` reassemble 시 start offset 0 의 chunk 가 16 KiB 영역에 들어맞지만 caller 가 다른 위치의 chunk 도 같은 idx 를 차지하려는 시점에 corrupt.

본 TASK 가 `*` 케이스에 대해서 dynamic boundary check (`end + 1 ≤ declaredTotalSizeBytes`) 를 봉인. 신규 회귀 가드 3 case + 운영 가이드 + PROJECT_PROFILE 갱신.

회귀 영향:
- 신규 회귀 가드: build-server vitest `158 → 161` (+3 `*` 케이스 cases).
- 기존 baseline 정합: 5 packages TS clean, build-monitor vitest 130/130, build-server legacy 143 + chunked 11 + 의미 C 4 + `*` 신규 3 = 161/161, Go 7+ 정합, vite build:react 동일, postgres migration `0001~0006` 모두 적용 정상.
- 운영 영향 0 — `*` 를 보내던 기존 callers 의 동작이 skip → boundary-check 으로만 정교화.

## 결정

**Lenient default (채택)** — `*` 케이스 callers 가 기존 동작과 동일하게 동작 (단 boundary check 추가). Strict alternative (caller 가 numeric total 을 반드시 보내야 함) 는 follow-up 후보로 문서화.

## Wire format (TASK-109 의 `*` 케이스)

### 신규 정의 — `bytes <start>-<end>/*`

```
POST /builds/:buildId/source/chunk HTTP/1.1
Content-Type: application/octet-stream
X-Source-Checksum-Sha256: <64-char hex>
Content-Range: bytes <start>-<end>/*
<chunk bytes>

→ 201 Created
X-Chunk-Is-Final: true|false
{ "buildId": "...", "idx": <int>, "checksumSha256": "...", "sizeBytes": <int> }
```

### 의미 A path 의 `*` 분기

| 검증 | 응답 |
|---|---|
| `parseContentRange` 가 `{ kind: "ok", totalIsStar: true, parts: { start, end, total: 0 } }` | 의미 A branch 진입 (TASK-108 동일) |
| `parts.end + 1 > declaredTotalSizeBytes` | 400 `size_mismatch` (TASK-109 신규) |
| `parts.end !== parts.start + actualSizeBytes - 1` | 400 `content_range_invalid` (TASK-108) |
| 그 외 | 201 (의미 A 성공) |

### `*` 케이스가 부재일 때 — 의미 A 의미 B fallback

TASK-108 의 의미 C bipartite 와 정합 — Content-Range 부재 시 의미 B monotonic sequence (TASK-106 default) fallback.

### `numeric total + declared cross-check` — TASK-108 정합 유지

TASK-108 봉인 시 numeric total mismatch → 400 `content_range_mismatch`. 본 TASK 가 추가 안 함, 본 회귀 가드 test 가 정합 유지 검증.

## Repository amend (memory + postgres)

### Memory

- `storeSourceChunk` 의 `contentRange` dispatch 에 3 종 분기:
  1. **숫자 total + declared mismatch** → `content_range_mismatch`
  2. **`*` total + boundary over** → `size_mismatch` (신규)
  3. 그 외 → 정상 진행
- `*` 케이스 의 boundary check: `contentRange.total === 0 && contentRange.end + 1 > declaredTotalSizeBytes` → `size_mismatch`.
- semantic C 의 numeric total 경로는 TASK-108 정합 — declared 와 정확히 일치해야만 ok.

### Postgres

- 동일한 3 종 분기 (memory 와 일대일 정합).

## Routes amend

build-routes.ts 변경 0 — 신규 분기 없음:
- 기존 분기: `not_found` / `content_range_invalid` / `content_range_mismatch` / `checksum_mismatch` / `size_mismatch` / `idx_out_of_range` / `ok` 가 모두 그대로 사용.
- TASK-109 의 `*` boundary check 결과 `size_mismatch` 가 기존 400 분기로 흡수.

## 신규 회귀 가드 (vitest +3)

`apps/build-server/tests/build-source-chunked.test.ts` 신규 3 case:
1. **`*` total + declared 안 넘는 chunk** — `bytes 0-16383/*`, totalSize=16 KiB, chunk=16 KiB. 201 + idx=0 + isFinalChunk=true.
2. **`*` total + chunk 의 end 가 declared 초과** — `bytes <declaredSize>-<declaredSize+10KiB-1>/*`, totalSize=16 KiB. 400 `size_mismatch` + declared=16 KiB + actual=26 KiB.
3. **Numeric total + declared cross-check (TASK-108 정합 유지)** — numeric total mismatch 검증 (regression 가드).

기존 TASK-108 회귀 가드 4 case 모두 0 변경 — 의미 B callers (Content-Range 부재) 의 wire-format 회귀 영향 없음.

## 사전 결함 + 보강 (2건)

1. **`*` 케이스 silent accept 위험** — caller 가 잘못된 offset 으로 chunk 를 보내면 corrupt 가능. 해결: dynamic boundary check 가 `end + 1 ≤ declaredTotalSizeBytes` 검증.
2. **strict alternative 의 잠재 정밀화** — `*` 자체를 reject 하고 caller 가 numeric total 을 의무화하면 더 강한 cross-check. 본 TASK 의 lenient default 가 RFC 7233 incremental adoption 의 진입 장벽을 낮춤. 후속 TASK 에서 strict mode 추가 가능 (env `STRICT_CONTENT_RANGE=true` 같은 운영 flag).

## 회귀 baseline (TASK-109 봉인 시점)

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| TS 5 packages `tsc --noEmit` | clean | clean |
| build-monitor vitest | 130/130 | 130/130 (frontend 0 변경) |
| build-server legacy | 143/143 | 143/143 (legacy 0 변경) |
| build-server chunked (TASK-106 의미 B) | 11/11 | 11/11 (의미 B 0 변경) |
| build-server RFC 7233 (TASK-108 의미 C) | 4/4 | 4/4 (의미 C 0 변경) |
| build-server `*` 케이스 (TASK-109) | 0 | **3/3** |
| build-server 합계 | 158/158 | **161/161** (TASK-088 baseline 대비 +48) |
| Go 7+ packages | PASS | PASS |
| vite build:react gzip js / css | 99.01KB / 30.62KB | 동일 |
| postgres migration | 0001~0006 | 동일 (변경 0) |
| 신규 운영 가이드 | (TASK-108 만) | **TASK-109 신규** |

## follow-up

- **strict mode 후속 TASK** — env `STRICT_CONTENT_RANGE=true` 가 set 면 `*` 케이스를 invalid_format 으로 거절 + numeric total 의무화. 운영 환경의 강한 cross-check 정책.
- **chunked multi-runner 회귀 가드** — TASK-106 의 의미 B + TASK-108 의미 C + TASK-109 `*` 케이스 의 동시 사용 시 multi-runner 회귀 가드 (e2e-multi-runner-postgres amend).
- **TASK-066 follow-up batch 4 e2e-production-semantic-postgres** — memory 전용 회귀 가드의 Postgres 동등 보강.
- **외부 object storage (옵션 Z)** — TASK-104 trigger 의 후속 결정.
- **신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK** — 별도 사용자 결정.

## 관련 문서

- `apps/build-server/src/repositories/memory-build-repository.ts` (의미 C branch 의 `*` total + boundary check 경로)
- `apps/build-server/src/repositories/postgres-build-repository.ts` (의미 C branch 의 `*` total + boundary check 경로, memory 와 일대일 정합)
- `apps/build-server/src/repositories/build-repository.ts` (`parseContentRange` — `*` total 케이스 처리)
- `apps/build-server/tests/build-source-chunked.test.ts` (신규 3 case — `*` 안 넘는 chunk / `*` boundary over / numeric regression)
- `apps/build-server/src/routes/build-routes.ts` (변경 0 — size_mismatch / content_range_mismatch 기존 분기 흡수)
- `docs/PROJECT_PROFILE.md` §3 source archive 라운드트립 부분 (TASK-109 갱신 항목) + 다음에 읽을 문서 reference
- `docs/operations/content-range-rfc-7233-2026-07-20.md` (TASK-108 — 본 TASK 의 선행 가이드)
- `docs/operations/source-archive-chunked-2026-07-20.md` (TASK-106 — 본 TASK 의 큰 결정)
- `docs/operations/build-source-toast-strategy-2026-07-20.md` (TASK-104 — 본 TASK 의 결정 trigger)
- `docs/operations/source-archive-postgres-2026-07-18.md` (TASK-066 follow-up batch 3)
