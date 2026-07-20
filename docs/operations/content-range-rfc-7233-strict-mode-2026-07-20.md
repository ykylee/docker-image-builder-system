# Content-Range (RFC 7233) Strict Mode 운영 가이드 (TASK-110)

- 작성일: 2026-07-20
- TASK: TASK-110 — `STRICT_CONTENT_RANGE` env flag 의 운영적 봉인. Flag 가 `"true"` 일 때 RFC 7233 §4.2 `bytes <start>-<end>/*` (unknown total) 케이스를 거절하고 caller 가 numeric total 을 의무화.
- 시리즈: TASK-109 (RFC 7233 §4.2 `*` 케이스 동적 boundary check) 의 strict alternative 봉인.

## 의도

TASK-109 (2026-07-20, commit `0663785`) 가 봉인한 `*` 케이스의 lenient default — `Content-Range: bytes <start>-<end>/*` 의 chunk 가 `end + 1 ≤ declaredTotalSizeBytes` 만 검증하고 그대로 accept. 운영자가 numeric total 을 의무화하고 싶을 때 env flag 한 개로 dispatch 가능하도록 strict mode 봉인:

- **`STRICT_CONTENT_RANGE=true`** → `*` total 케이스 callers 가 `content_range_invalid` (400)로 거절, callers 가 numeric total 을 보내야 함.
- **default (unset / `"false"` / `"0"` / `"no"` / 기타)** → TASK-109 의 lenient default 그대로 (calls 가 boundary check 만 통과하면 accept).

회귀 영향:
- 신규 회귀 가드: build-server vitest `161 → 165` (+4 strict mode cases).
- 기존 baseline 정합: 5 packages TS clean, build-monitor vitest 130/130, build-server legacy 143 + chunked 11 + 의미 C 4 + `*` 3 + strict 4 = 165/165, Go 7+ 정합, vite build:react 동일, postgres migration `0001~0006` 모두 적용 정상.
- 운영 영향: 기본 동작 0 변경 (env unset 인 모든 caller 가 TASK-109 동작 보존). strict 모드 활성 시에만 변경.

## 결정

**Operating-policy toggle (채택)** — env flag 한 개 (`STRICT_CONTENT_RANGE`) 로 봉인. 운영자가 deployment 시점에 정책 결정. SQL / schema / migration 변경 0 — boot-time flag read + BuildService 위임 + repository 분기 amend 만.

## 운영 rollout playbook

### 1) strict 모드 OFF (default, 권장 부팅 시작점)

```bash
# env unset 또는 "false" / "0" / "no"
unset STRICT_CONTENT_RANGE
# 또는
export STRICT_CONTENT_RANGE=false
node apps/build-server/dist/apps/build-server/src/index.js
```

TASK-109 의 lenient default 그대로:
- `bytes 0-16383/16384` → 201 (numeric, declared 일치)
- `bytes 0-16383/*` → 201 + boundary check (`end + 1 ≤ declaredTotalSizeBytes`)
- `bytes 0-16383/32768` → 400 `content_range_mismatch` (numeric, declared 다름)

### 2) strict 모드 ON (운영자가 정책 결정 시)

```bash
# "true" / "1" / "yes" (case-insensitive)
export STRICT_CONTENT_RANGE=true
node apps/build-server/dist/apps/build-server/src/index.js
```

strict 모드의 동작:
- `bytes 0-16383/16384` → 201 (numeric, 정상)
- `bytes 0-16383/*` → 400 `content_range_invalid` (caller 가 numeric total 의무화)
- `bytes 0-16383/32768` → 400 `content_range_mismatch` (numeric, declared 다름)

### 3) 운영 환경 토글

- 운영자가 신규 build-monitor 또는 신규 client 가 RFC 7233 numeric total 의무화에 정렬됐다고 판단되면 flip.
- 토글은 restart 1 회 (env loader 가 process 시작 시 1 회만 실행) — runtime toggle 안 됨.
- 운영 환경의 strict 가 켜진 뒤 신규 caller 의 `*` 케이스는 모두 400 `content_range_invalid` — client 의 onboarding guide 에 numeric total 의무화 정렬 필요.

## Wire format (TASK-110 의 strict mode)

### 신규 정의 — strict 모드 ON 시

```
POST /builds/:buildId/source/chunk HTTP/1.1
Content-Type: application/octet-stream
X-Source-Checksum-Sha256: <64-char hex>
Content-Range: bytes <start>-<end>/*   ← 운영자에 의해 거절됨 (400)
<chunk bytes>

→ 400 Bad Request
{ "message": "Content-Range end does not match start + bytes.length - 1." }
```

  - 운영자가 `STRICT_CONTENT_RANGE=true` 인 환경에서 callers 가 `*` total 을 보내면 위와 같이 400 `content_range_invalid` 로 거절.
  - strict 모드 OFF (default) 의 동작은 TASK-109 와 동일.

## Schema (변경 0)

본 TASK 는 wire-format 처리 amend 만. SQL / schema / migration / version 모두 변경 0.

신규 TypeScript 헬퍼 in `apps/build-server/src/app/create-app.ts`:

```ts
function parseStrictContentRangeFlag(env: NodeJS.ProcessEnv): boolean {
  const raw = env.STRICT_CONTENT_RANGE;
  if (typeof raw !== "string") return false;
  const normalised = raw.trim().toLowerCase();
  return normalised === "true" || normalised === "1" || normalised === "yes";
}
```

신규 TypeScript parameter in `apps/build-server/src/repositories/build-repository.ts`:

```ts
/**
 * TASK-110: STRICT_CONTENT_RANGE env flag mirror. When `true`
 * the repository rejects callers that supply `Content-Range`
 * with `*` total (RFC 7233 §4.2 unknown total) and forces them
 * to supply a numeric total. ...
 */
strictContentRange?: boolean
```

## Build service amend

`apps/build-server/src/services/build-service.ts`:
- `BuildService` 의 constructor 의 두 번째 인자: `{ strictContentRange: boolean }` (default `{ strictContentRange: false }`).
- `storeSourceChunk` 의 repository 위임 시 `strictContentRange: this.runtime.strictContentRange` 추가.

## Repository amend (memory + postgres)

`apps/build-server/src/repositories/memory-build-repository.ts` + `postgres-build-repository.ts`:
- `storeSourceChunk` 의 6 번째 parameter: `strictContentRange: boolean = false`.
- 분기:
  ```ts
  if (contentRange) {
    if (strictContentRange && contentRange.total === 0) {
      return { kind: "content_range_invalid" };
    }
    if (contentRange.total > 0 && contentRange.total !== declaredTotalSizeBytes) {
      return { kind: "content_range_mismatch", declared, supplied };
    }
    if (contentRange.total === 0 && contentRange.end + 1 > declaredTotalSizeBytes) {
      return { kind: "size_mismatch", expected, actual };
    }
  }
  ```

## Routes amend

`apps/build-server/src/routes/build-routes.ts`:
- amend 0 — strict 모드는 build-time env flag 이고 BuildService 가 runtime instance 에 저장. routes 는 BuildService 의 `storeSourceChunk` 을 단순 위임하므로 env flag 는 자동 전파.

## 신규 회귀 가드 (vitest +4)

`apps/build-server/tests/build-source-chunked.test.ts` 신규 4 case:
1. **strict 모드 ON + numeric total + declared 일치** → ok
2. **strict 모드 ON + `*` total** → content_range_invalid
3. **strict 모드 OFF + `*` total** → ok (TASK-109 lenient default 정합 유지)
4. **strict 모드 ON + numeric total + declared mismatch** → content_range_mismatch (TASK-108 정합 유지)

기존 TASK-108 회귀 가드 4 case + TASK-109 회귀 가드 3 case 모두 0 변경 — TASK-108 caller 들 + TASK-109 caller 들의 wire-format 회귀 영향 없음.

## 사전 결함 + 보강 (2건)

1. **운영 restart 없이 dynamic toggle 불가** — env loader 가 boot-time 1 회 실행이라 운영 중에 flag 를 toggle 하려면 build-server restart 필요. 해결 의도적 결정 — 운영 정책 결정에 restart 가 자연스러운 경계. 후속 TASK 에서 admin runtime API 같은 dynamic toggle 추가 가능.
2. **strict 모드 ON 시 기존 callers 의 breakdown 위험** — client 가 `*` total 만 보내는 코드가 운영 환경의 strict 모드 flip 후 모두 400 으로 fail. 해결: 운영 가이드 §3 (rollout playbook) 의 부팅 시작점으로 strict OFF 권장 — 운영자가 client 정렬을 검증한 뒤 flip. client 의 canonical 운영 가이드 동시 갱신 권장.

## 회귀 baseline (TASK-110 봉인 시점)

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| TS 5 packages `tsc --noEmit` | clean | clean |
| build-monitor vitest | 130/130 | 130/130 (frontend 0 변경) |
| build-server legacy | 143/143 | 143/143 (legacy 0 변경) |
| build-server chunked (TASK-106 의미 B) | 11/11 | 11/11 (의미 B 0 변경) |
| build-server 의미 C (TASK-108) | 4/4 | 4/4 (의미 C 0 변경) |
| build-server `*` 케이스 (TASK-109) | 3/3 | 3/3 (`*` 0 변경) |
| build-server strict 모드 (TASK-110) | 0 | **4/4** |
| build-server 합계 | 161/161 | **165/165** (TASK-088 baseline 대비 +52) |
| Go 7+ packages | PASS | PASS |
| vite build:react gzip js / css | 99.01KB / 30.62KB | 동일 |
| postgres migration | 0001~0006 | 동일 (변경 0) |
| 신규 운영 가이드 | (TASK-109 만) | **TASK-110 신규** |

## follow-up

- **strict 모드 ON 시점 에 client 정렬 검증 가이드** — 운영자가 strict 모드 flip 전에 client 들이 numeric total 의무화에 정렬됐는지 검증하는 staging checklist 후속 TASK (release checklist 운영 가이드 §3 와 정합).
- **chunked multi-runner 회귀 가드** — TASK-106 / TASK-108 / TASK-109 / TASK-110 동시 사용 시 multi-runner 회귀 가드 후속.
- **TASK-066 follow-up batch 4 e2e-production-semantic-postgres** — memory 전용 회귀 가드의 Postgres 동등 보강.
- **외부 object storage (옵션 Z)** — TASK-104 trigger 후속 결정.
- **신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK** — 별도 사용자 결정.

## 관련 문서

- `apps/build-server/src/app/create-app.ts` (`parseStrictContentRangeFlag` helper + BuildService 인스턴스화 시 `{ strictContentRange }` 위임)
- `apps/build-server/src/services/build-service.ts` (`storeSourceChunk` 의 `this.runtime.strictContentRange` 위임)
- `apps/build-server/src/repositories/build-repository.ts` (`storeSourceChunk` 의 `strictContentRange?: boolean` parameter)
- `apps/build-server/src/repositories/memory-build-repository.ts` (strict 모드 활성 시 `*` total 거절 + numeric mismatch 정합)
- `apps/build-server/src/repositories/postgres-build-repository.ts` (memory 와 일대일 정합)
- `apps/build-server/tests/build-source-chunked.test.ts` (신규 +4 strict 모드 cases)
- `docs/PROJECT_PROFILE.md` §3 source archive 라운드트립 (TASK-110 항목) + 다음에 읽을 문서 reference
- `docs/operations/content-range-rfc-7233-star-2026-07-20.md` (TASK-109 — 본 TASK 의 선행 가이드)
- `docs/operations/content-range-rfc-7233-2026-07-20.md` (TASK-108 — 본 TASK 의 큰 결정)
- `docs/operations/release-checklist-2026-07-20.md` (TASK-105 운영 배포 체크리스트 — strict 모드 ON 시 client 정렬 검증 staging step 으로 정합 가능)
