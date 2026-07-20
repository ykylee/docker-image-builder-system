# build_source TOAST 전략 (TASK-104)

- 작성일: 2026-07-20
- TASK: TASK-104 — postgres migration `0004_build_source.sql` 의 `bytea` column TOAST 전략 정리 + 후속 결정 분리 절차
- 시리즈: TASK-066 follow-up batch 3 (source archive Postgres 운영 가이드) 의 결정 대기 항목. TASK-102 + TASK-103 의 운영 안정화 흐름 후속.

## 의도

본 프로젝트의 source archive 시스템 (`POST/GET/DELETE /builds/:buildId/source` + `build_source` bytea column + FK CASCADE) 은 TASK-066 (2026-07-05 ~ 2026-07-06) 에서 봉인. Fastify 의 `application/octet-stream` content type parser 의 `bodyLimit` 은 **256 MiB** (256 × 1024 × 1024 bytes) 로 운영. PostgreSQL 의 bytea column 은 내부적으로 TOAST (The Oversized-Attribute Storage Technique) 으로 최대 1 GB 까지 저장 가능 — 그래서 **256 MiB 가 TOAST 의 한계가 아니라 운영자가 합의한 SLO 의 한계** 임을 분명히 해야 함.

본 TASK 의 목표는 두 가지:

1. **현 주소 (status quo) 명시** — 현재 SLO 가 256 MiB 이고 이 한계가 어떻게 도달하는지 / PostgreSQL TOAST 가 무엇을 보장하는지 / 어떤 트리거에서 이 한계가 문제가 되는지 운영자가 한 자리에 파악.
2. **후속 결정 분리 절차 (decision separatability)** — 본 TASK 는 SLO 확장 자체를 봉인하지 않고, **언제 다시 봐야 하는지** 의 트리거를 명시 + 트리거 발동 시 검토할 후보 옵션 3종 정리. SLO 확장 자체는 신규 기능 트리거 시 별도 TASK 로.

회귀 영향 0 — docs only.

## 결정

**옵션 A (채택)** — 현 운영 가이드 + 후속 결정 분리 절차. SQL / schema 변경 없음. 신규 운영 가이드 본 문서 + PROJECT_PROFILE.md 의 follow-up 래스트에 한 줄 추가 + 다음에 읽을 문서에 reference 추가.

> 본 TASK 는 **지금 SLO 를 확장하지 않습니다**. 256 MiB 가 본질적으로 부족한 신규 기능 / 신규 SLO 트리거가 발생할 때 별도 TASK 로 다룰 수 있도록 "언제 봐야 하는지" 만 정리합니다.

## 현 주소 (status quo)

### 1) `application/octet-stream` 의 256 MiB body limit

- `apps/build-server/src/app/create-app.ts` line 88-91 — `bodyLimit: 256 * 1024 * 1024` (256 MiB).
- 의도: "realistic source archives fit; this matches the sourceArchive.sizeBytes upper bound that callers are expected to honour."
- effect: 256 MiB 를 넘는 source archive 는 Fastify 가 413 Payload Too Large 응답 — 운영자 / Skill 측 caller 가 retry / reject.

### 2) PostgreSQL bytea column + TOAST

- `apps/build-server/migrations/0004_build_source.sql` — `bytes BYTEA NOT NULL` column + FK CASCADE.
- `packages/db/src/schema/build-source.ts` — Drizzle schema 의 bytea column.
- PostgreSQL 의 TOAST 동작:
  - **Inline storage** — column 값이 ~2 KB 미만일 때 row 안에 직접 보관. TOAST overhead 0.
  - **TOAST storage** — column 값이 ~2 KB 초과이면 자동 chunked (chunk size ~2 KB) split 후 별도 TOAST table 에 저장. row 에는 TOAST pointer 만 남음.
  - **1 GB hard limit** — bytea column 의 절대 상한. TOAST 가 chunked split 으로 처리해서 운영자가 보는 효과는 단일 row 가 1 GB 까지 OK.
- bytea column 의 FK CASCADE + `INSERT ... ON CONFLICT DO UPDATE` (last-write-wins) 가 본 시스템의 source archive lifecycle. (TASK-066 봉인.)

### 3) 본 시스템의 현재 source archive 활용 패턴

- 운영 검증:
  - `e2e-source-archive.sh` (memory) — small archive 기준 검증.
  - `e2e-source-archive-postgres.sh` (postgres) — 256 MiB 이하 bytea round-trip 검증.
- Skill 측 caller 가 `sourceArchive.sizeBytes` 와 `objectKey` / `checksumSha256` 를 `POST /builds` 시점에 선언. caller 가 약속한 size 가 256 MiB 이상이면 413 거부.
- 운영 환경 (production) 의 SLO 가 사실상 **256 MiB** — 이 넘는 source archive 는 시스템에 들어오지 않음 (Skill / caller 의 사전 거부).

## 256 MiB 가 충분한 이유 (현 운영 환경)

1. **현실적 source archive 평균 size** — 일반적인 단일 앱 source archive (TypeScript / Python / Go 모노레포 외각) 가 1 ~ 50 MB 영역. Node.js + pnpm lockfile + Dockerfile 정도면 평균 5 MB.
2. **256 MiB 는 충분히 큰 여유** — 평균 대비 약 5-50x 여유. 운영자가 사실상 "GB 단위 source archive 를 Skill 단일 업로드로 받는" 시나리오는 흔하지 않음.
3. **multi-GB 가 필요한 시나리오는 별도 시스템** — docker context 가 GB 단위인 시나리오는 본 빌드 시스템이 아니라 image registry (ghcr.io / ECR / GCR) 가 적합. 본 시스템은 "사람이 zip 으로 올리는 source" 가 대상.

## 트리거 — 언제 다시 봐야 하는가

다음 중 **하나라도 발생하면** 본 TASK 의 후속 결정 후보를 다시 검토.

1. **신규 기능에서 source archive 의 size 요구가 256 MiB 초과** — 예: docker build context 의 source archive 직접 업로드 / monorepo 의 부분 archive / pnpm workspace 의 GB 단위 lockfile / git LFS object 일괄 upload. 이 경우 본 시스템의 SLO 가 caller 를 막음.
2. **운영 환경에서 200+ MiB source archive 가 regular pattern** — 1회성 spike 가 아니라 매주 5+ build 가 200 MiB 초과이면 운영자 UX 가 413 reject 으로 고통.
3. **신규 SLO 가 등장** — 예: "10 분 이내에 source archive 1 GB 업로드 가능" 같은 운영자 KPI 가 추가되는 경우.
4. **build runner 가 docker context 의 inline receive** 로 진화 — 이 경우 Fastify body limit 자체가 wrong abstraction 이므로 chunked upload 가 정공법.
5. **PostgreSQL TOAST 정책의 운영 변경** — 예: cloud-provider RDS 가 TOAST 의 storage cost / I/O 정책 변경 또는 PG 17+ 의 TOAST 변경.

## 후속 후보 (decision tree)

후속 결정이 발동됐을 때 검토할 옵션 3종. 본 TASK 는 어느 쪽도 채택하지 않음 — Trigger 발동 시 별도 TASK 에서 결정.

### 옵션 X — body limit 확장 (단순 SLO 완화)

- 256 MiB → 1 GB (또는 2 GB) 로 단순 확장.
- Pros: 변경 최소 (Fastify `bodyLimit` 1 곳 + `sourceArchive.sizeBytes` zod schema 상한).
- Cons: 단일 HTTP request 의 memory 사용 증가 (memory backend 의 경우 Node process memory + Postgres connection 부하). request timeout 도 연동 검토.
- 결정 회귀 가드: 큰 source 가 regular pattern 이면 운영자 UX 회복, sporadic 이면 over-engineering.

### 옵션 Y — chunked split + multi-row schema

- `migrations/0006_build_source_chunked.sql` 신규 — `build_source_chunk (build_id, idx, bytes, checksum_sha256, size_bytes, created_at)` 새 테이블. row 1 개당 chunk 1 row.
- upload API 가 `Content-Range` / `X-Chunk-Idx` 헤더로 chunk 별 accept. 마지막 chunk 가 assembled_size + checksum 일치 시 FK CASCADE + last-write-wins 유지.
- Runner 측 GET 도 multi-chunk fetch + reassemble + tar.gz extract 동일.
- Pros: 1 row = 1 GB 한계를 우회 + 부분 upload 재개 가능 + multi-GB 까지 확장.
- Cons: upload API 변경 + schema + curl / Skill 호출 패턴 변경 + GET 흐름 + chunk ordering validation + partial-upload recovery. 작업량 큼.
- 결정 회귀 가드: chunked upload 의 UX 가 운영자 / Skill caller 의 기대와 정합.

### 옵션 Z — 외부 object storage (S3 / MinIO)

- `build_source` 의 bytea 를 S3 / MinIO bucket 의 object reference (URL / ETag / size) 로 교체. upload 는 S3 multipart presigned URL 또는 MinIO direct.
- Runner 는 presigned GET 또는 MinIO direct + checksum 검증.
- Pros: PostgreSQL IO 부담 0 + multi-GB / multi-TB 까지 확장 + AWS S3 SDK / MinIO SDK 의 안정성 + native multipart / resumable.
- Cons: 외부 의존성 + IAM 정책 + presigned URL 운영 + zero-trust 네트워크 분리. 현 운영 환경은 single-host Postgres 중심.
- 결정 회귀 가드: 현 운영 환경의 단일 host + Postgres 인프라 정합.

## 후속 결정 분리 절차 (decision separatability)

본 TASK 는 위 옵션 어느 쪽도 채택하지 않음. SLO 확장 자체는 신규 기능 트리거 시 별도 TASK 로 다룰 수 있도록 다음 절차만 봉인:

1. **Trigger 발동 감지** — 운영자가 §5 트리거 중 1+ 항목을 만족하는 상황 발견.
2. **새 TASK 등록** — `ai-workflow/memory/active/backlog/<YYYY-MM-DD>.md` 에 TASK-XXX (TASK-104 후속 번호) 신규. 의도 / 영향 파일 / 옵션 X/Y/Z 비교 / 결정 후속 TASK 의 회귀 가드 명시.
3. **후속 TASK 의 회귀 가드** — 옵션 결정 후 기존 baseline (TS 5 clean / vitest 130 / build-server 143 / Go 7+ / vite build:react 99.01/30.62 + postgres migration 0001~0005 적용 정상 + e2e-source-archive-postgres ALL PASS) 가 변동 없는지 검증. 변동 시 본 TASK 의 baseline 양축 동기화 (TASK-102) 와 같은 docs only PR 권장.
4. **follow-up 갱신** — 본 운영 가이드 §6 (Trigger 발동 시 후속 결정으로 다시 방문) 의 follow-up 본문 + WORK_BACKLOG follow-up 래스트 갱신.
5. **본 TASK (TASK-104) 의 commit + workflow meta sync** — 단일 commit 으로 main 합류.

## follow-up

- **본 TASK 의 commit + workflow meta sync** — 위 §6 절차 5번 본문. 결정 대기 항목 (b) 봉인 후 follow-up 항목에서 본 TASK 와 본 운영 가이드의 trigger 항목만 유지.
- **신규 trigger 발동 시 별도 TASK** — 후속 결정 분리 절차 (§6) 본문.

## 관련 문서

- `apps/build-server/src/app/create-app.ts` line 80-91 (`bodyLimit: 256 * 1024 * 1024`)
- `apps/build-server/migrations/0004_build_source.sql` (bytea column + FK CASCADE)
- `packages/db/src/schema/build-source.ts` (Drizzle schema)
- `apps/build-server/scripts/e2e-source-archive-postgres.sh` (postgres backend 5 단계 회귀 가드)
- `apps/build-server/scripts/e2e-source-archive.sh` (memory backend e2e)
- `docs/operations/source-archive-postgres-2026-07-18.md` (TASK-066 follow-up batch 3 — Postgres default 개발 경로)
- `docs/operations/migration-cli-workflow-2026-07-20.md` (TASK-103 — 권고 스크립트 + 운영 가이드)
- `docs/operations/project-profile-baseline-postgres-sync-2026-07-20.md` (TASK-102 — baseline 양축 동기화)
- `docs/PROJECT_PROFILE.md` §3 / §3.5 / §3.6 / 다음에 읽을 문서 (본 TASK 의 본 변경 표면)
- PostgreSQL TOAST reference: https://www.postgresql.org/docs/current/storage-toast.html
