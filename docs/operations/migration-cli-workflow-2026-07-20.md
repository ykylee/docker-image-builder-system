# Migration CLI 운영 workflow (TASK-103)

- 작성일: 2026-07-20
- TASK: TASK-103 — `scripts/migrate.ts` standalone CLI 의 운영 workflow 정립 + 권고 명령 스크립트 `scripts/db-migrate.sh` 신규
- 시리즈: TASK-064 (smoke / migration / visual QA baseline) 의 standalone CLI 봉인 후속. TASK-102 (PROJECT_PROFILE §3 baseline 양축 동기화) 의 결정 대기 항목 해소.

## 의도

TASK-064 (PR #19) 가 봉인한 `apps/build-server/scripts/migrate.ts` standalone CLI 는 단일 entrypoint 노출이고 (`--dry-run` / `--to` / `--list` / `--bootstrap`), 운영 가이드 `docs/operations/smoke-and-migration.md` §3 에 standalone 사용법이 이미 명시됨. 그러나 운영자가 자주 부르는 5-6가지 시나리오 (적용 전 dry-run 계획 확인 → 적용 → 상태 확인 → DR / staging 중단) 가 매번 flag 조합 + DATABASE_URL + migrations-dir 인자를 외워서 입력해야 하는 부담이 있음.

본 TASK 가 다음 두 가지를 동시에 봉인:

1. **신규 권고 스크립트 `scripts/db-migrate.sh`** — 6 게이트 (`--plan` / `--status` / `--apply-all` / `--apply-up-to <ver>` / `--bootstrap` / `--dr-stop`) 의 단일 entrypoint. 모든 명령은 기존 standalone CLI 의 위임 — 본 스크립트 자체에는 SQL / schema 변경 로직 없음 (회귀 영향 0).
2. **운영 가이드 본 문서** — 자주 쓰는 5종 시나리오 (신규 migration 추가 staging verify / 운영 배포 전 dry-run / 운영 DB 일괄 적용 / 특정 version 까지만 단계 적용 / DR / staging 중단 + 복구) 의 권고 절차.

회귀 영향 0 — 권고 스크립트는 `migrate.ts` 위임 wrapper, 운영 가이드는 신규 docs only.

## 결정

**옵션 A (채택)** — 운영 가이드 + 권고 명령 스크립트. 스크립트는 standalone CLI 위임 (SQL 변경 없음) — 운영자가 자주 쓰는 migration 운영 시나리오 6종을 단일 entrypoint 로 노출. PROJECT_PROFILE.md §3 의 5개 명령 아래에 "migration 운영 권장" 참조 항목 추가 + 다음에 읽을 문서에 신규 운영 가이드 reference 추가.

## 변경 (3 file)

### 신규 1: `scripts/db-migrate.sh` (신규 권고 스크립트)

본 스크립트는 `scripts/migrate.ts` 위임 wrapper. **SQL 변경 / schema 변경 / DB 직접 query 모두 없음**. 운영자가 자주 부르는 6 게이트를 단일 entrypoint 로 노출:

| Gate | 의도 | 내부 동작 |
|---|---|---|
| `--plan` | dry-run 으로 적용 계획만 확인 | `--dry-run` 위임 |
| `--status` | 현재 applied / pending 만 출력 | `--list` 위임 |
| `--apply-all` | pending migration 일괄 적용 | dry-run 1회 자동 선행 후 적용 |
| `--apply-up-to <ver>` | 특정 version 까지만 적용 | dry-run 으로 목표 확인 후 적용 |
| `--bootstrap` | greenfield DDL + 일괄 적용 | `--bootstrap` 위임 |
| `--dr-stop` | DR / staging 중단 절차 안내 | 실행 안 함, 안내만 출력 |

`--apply-all` 게이트가 dry-run 을 자동으로 한 번 더 호출하는 것이 본 스크립트의 안전장치 — 운영자가 검증된 상태에서 한 방에 적용할 수 있게 함. `DB_MIGRATE_VERBOSE=1` 일 때 dry-run skip (CI / 자동화 환경 대응).

사전 결함 + 보강 (자세한 내역은 §5 참조):
- `DATABASE_URL` 미설정 시 hint 와 함께 exit 2 — 운영자가 env 설정을 빠뜨렸을 때 즉시 발견.
- `--apply-up-to` 의 `<ver>` 가 빈 문자열이면 즉시 exit 2 — 잘못된 호출을 tsx-side 에 넘기지 않음.
- `set -euo pipefail` + `dispatch` 함수 + `case` 문으로 typo / 알 수 없는 게이트 모두 즉시 exit 2.

### 수정 1: `docs/PROJECT_PROFILE.md` §3

기존 §3 의 5개 명령 (`install` / `run_local` / `run_local_postgres` / `quick_tests` / `isolated_tests` / `smoke_check`) 의 다음에 **migration 운영 권장** 참조 항목 신규 추가. 단일 entrypoint 인 `scripts/db-migrate.sh` 의 위치 / 사용법 / 권장 시나리오 reference + 운영 가이드 link.

### 수정 1: `docs/PROJECT_PROFILE.md` 다음에 읽을 문서

신규 운영 가이드 reference 추가.

### 신규 1: `docs/operations/migration-cli-workflow-2026-07-20.md` (본 가이드)

본 문서.

## 자주 쓰는 5종 시나리오

### 1) 신규 migration 추가 — staging verify 절차

```bash
# 1. 새 SQL 작성: apps/build-server/migrations/0006_<topic>.sql
#    - IF NOT EXISTS / IF EXISTS 로 idempotent
#    - 단일 transaction 보호
#    - packages/db schema 와 정합

# 2. dry-run 으로 적용 계획 확인
scripts/db-migrate.sh --plan

# 3. staging DB 에 적용
DATABASE_URL=postgres://staging-staging:***@***/staging \
  scripts/db-migrate.sh --apply-all

# 4. 상태 확인
scripts/db-migrate.sh --status

# 5. 회귀 가드 (TASK-082 의 e2e-multi-runner-postgres 기반)
bash apps/build-server/scripts/e2e-multi-runner-postgres.sh
```

### 2) 운영 배포 전 dry-run 검증

```bash
# 새 build-server 이미지 배포 전 운영 DB 의 적용 계획 dry-run
DATABASE_URL=postgres://prod-***:***@***/prod \
  scripts/db-migrate.sh --plan
# 출력 예:
#   applied: 0001, 0002, 0003, 0004, 0005
#   would apply: 0006
```

### 3) 운영 DB 일괄 적용

```bash
# build-server 배포 직후 운영 DB 에 pending migration 적용
DATABASE_URL=postgres://prod-***:***@***/prod \
  scripts/db-migrate.sh --apply-all
# 자동 dry-run 1회 선행 후 적용.
```

### 4) 특정 version 까지만 단계 적용

```bash
# 운영 환경 점진 적용 — 새 migration 이 의존하는 다른 migration 까지만 일단 적용
DATABASE_URL=postgres://prod-***:***@***/prod \
  scripts/db-migrate.sh --apply-up-to 0006
```

### 5) DR / staging 중단 + 복구

```bash
# 1) 안내 출력
scripts/db-migrate.sh --dr-stop

# 2) staging 중단
docker compose -f compose.dev.yaml --profile postgres stop runner
docker compose -f compose.dev.yaml --profile postgres stop build-server  # 선택

# 3) staging 시작 — applyMigrations 가 schema_migrations 위에서 idempotent 적용
docker compose -f compose.dev.yaml --profile postgres up -d

# 4) 시작 후 상태 확인
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/docker_image_builder \
  scripts/db-migrate.sh --status
```

자세한 DR 절차는 §5 + 본 가이드 §5 참조.

## 기존 standalone CLI 직접 호출과의 관계

본 권고 스크립트는 **편의 wrapper**. CLI 의 모든 flag (`--database-url` / `--migrations-dir` / `--dry-run` / `--to` / `--bootstrap` / `--list` / `-h`) 가 그대로 유효 — 스크립트 bypass 후 직접 호출도 가능.

권장 우선순위:

1. **운영 workflow 의 6종 시나리오** → `scripts/db-migrate.sh` 권고 스크립트 사용
2. **CI / staging 검증 자동화** → `apps/build-server/scripts/e2e-*-postgres.sh` 직접 호출
3. **세부 flag 조합** (e.g. `--to 0002 --bootstrap --dry-run`) → `apps/build-server/scripts/migrate.ts` 직접 호출

## 사전 결함 + 보강 2건

1. **`--apply-all` 의 dry-run 자동 선행 정책** — `DB_MIGRATE_VERBOSE=1` 일 때만 dry-run skip. CI / 자동화 환경에서 의도하지 않은 double 호출 회피. 운영자는 verbose=1 로 환경에 따라 결정. **운영 권고**: staging / local 은 verbose=0 (안전). CI / 자동화는 verbose=1 (성능).
2. **`--dr-stop` 의 안내만 출력 정책** — 본 게이트는 실제 stop / down 명령을 실행하지 않음. dry-run 도 안 함 — 명시적으로 가이드만 표시. 이유: 운영자가 DR 절차의 의미를 모르고 스크립트를 실행해 의도하지 않은 데이터 손실 / 컨테이너 중단을 일으키는 결함 방지. 운영 가이드 §5 의 절차 안내만 표시.

## follow-up

- **`scripts/migrate.ts` 자체 기능 확장** (rollback / checksum-verify / export / import) — 별도 결정 시 본 권고 스크립트에 신규 게이트 추가.
- **CI 단계 migration validation 자동화** — 운영자가 PR 마다 staging DB 임시 instance 를 띄워 dry-run 검증하는 stage 신규. TASK-066 follow-up 의 운영 안정화 축과 직교.
- **release workflow (CHANGELOG / 운영 배포 체크리스트)** — 운영 안정화 항목 (c) 와 결합 후보.

## 관련 문서

- `apps/build-server/scripts/migrate.ts` (TASK-064 standalone CLI 본체)
- `docs/operations/smoke-and-migration.md` §3 (standalone CLI 사용법)
- `packages/db/src/migrate.ts` (applyMigrations / listMigrations / parseMigrationVersion 코어)
- `apps/build-server/src/app/create-app.ts` `applyMigrations` 자동 부팅 (TASK-082 의 import.meta.url 함정 봉인 후 동일)
- `docs/PROJECT_PROFILE.md` §3 / §3.2 / 다음에 읽을 문서 (본 TASK 의 표면 변경)
- `docs/operations/source-archive-postgres-2026-07-18.md` (TASK-066 follow-up batch 3 — Postgres default 개발 경로)
