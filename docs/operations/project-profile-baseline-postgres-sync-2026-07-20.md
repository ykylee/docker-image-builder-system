# PROJECT_PROFILE §3 baseline 양축 동기화 (TASK-102)

- 작성일: 2026-07-20
- TASK: TASK-102 — PROJECT_PROFILE.md §3 의 run_local / run_local_postgres 명령 + §3.5 / §3.6 / §3.10 / §3.11 / §3.12 회귀 baseline 양축 동기화
- 시리즈: TASK-066 follow-up batch 3 (source archive Postgres 운영 가이드 + default 개발 경로 권장) 의 후속 정합 sync

## 의도

2026-07-18 의 본 세션 종합 정리 (main HEAD `cf6b3bd`) 가 frontend rewrite 7-PR 시리즈 + M4.5 8-PR 시리즈 + 디자인 토큰 단일화 + PROJECT_PROFILE React baseline batch 1 + batch 2 + TASK-066 follow-up batch 3 까지 19 TASK 연속 봉인 후 세션 종료. TASK-066 follow-up batch 3 (PR #59) 가 §3.2 의 "Postgres default 개발 경로" 권장과 `run_local_postgres` 의 단일 명령 박스를 공식 운영 baseline 으로 정립했지만, 본 PROJECT_PROFILE.md 본문은 다음 두 영역에서 memory backend 단일 baseline 으로 남아있어 정합이 어긋남:

1. §3 명령 박스의 run_local / run_local_postgres 명령이 memory / postgres 어느 backend 가 default 인지 명시하지 않고 나열.
2. §3.5 / §3.6 / §3.10 / §3.11 / §3.12 의 회귀 baseline 줄이 모두 memory backend 단일 baseline 으로 표기. Postgres backend 동등 baseline 이미 봉인 (TASK-082 + TASK-066 + TASK-085 의 e2e 회귀 가드) 되었지만 PROJECT_PROFILE 본문에는 명시되지 않음.

본 TASK 가 두 가지 정합을 한 PR 안에서 docs only 로 봉인. 회귀 영향 0 — 모든 TS / Go / vitest / build-server / e2e baseline 변경 없음.

## 변경 (2 file)

### 수정 1

`docs/PROJECT_PROFILE.md` (admin pages / admin 가드 / React 빌드 mount 와 직교하는 docs only 변경).

#### §3 명령 박스 — run_local / run_local_postgres 의 default 정합

- §3 의 명령 박스는 5개 명령 (`install` / `run_local` / `run_local_postgres` / `quick_tests` / `isolated_tests` / `smoke_check`) 이었음. 본 TASK 는 다음 두 명령을 §3.2 의 "Postgres default 개발 경로" 권장과 정합하도록 정렬:
  - `run_local` (memory backend) — "단일 runner / 단일 build / 빠른 smoke / CI / 디버깅용 보조 경로" 명시.
  - `run_local_postgres` (Postgres backend) — "**Postgres backend 가 default 개발 경로**" 굵은 텍스트 + 운영 환경(production deployment)이 Postgres 만 사용함을 명시 + bytea round-trip 회귀 / FK CASCADE + migration / multi-runner 운영 검증이 Postgres 환경에서만 가능함을 정합.
  - Postgres backend 명령의 풀 shell block (compile 4 packages + DATABASE_URL + BUILD_REPOSITORY_BACKEND=postgres + DB_AUTO_BOOTSTRAP=true) 노출.

#### §3 회귀 baseline 양축 동기화 — 4개 섹션

- **§3.5 (TASK-085 production-semantic)** — 기존 memory backend baseline 보존 + 한 줄 추가: "**Postgres backend 회귀 (TASK-102 baseline 양축 동기화)**: `apps/build-server/scripts/e2e-source-archive-postgres.sh` 5 단계 모두 PASS, postgres migration 0001~0005 모두 적용 정상, TASK-082 `e2e-multi-runner-postgres.sh` ALL PASS, `e2e-production-semantic.sh` 는 memory backend 전용 회귀 가드 (Postgres 동등은 후속 TASK 권장)".
- **§3.6 (TASK-086 e2e-multi-runner.sh BASE + heredoc 결함 봉인)** — 기존 memory baseline 보존 + 한 줄 추가: "TASK-082 `e2e-multi-runner-postgres.sh` ALL PASS (8 단계 + 3 runner 적재 + 영속 검증, postgres 15432 port 기준) — §3.5 / §3.6 의 memory backend e2e 와 동등 baseline".
- **§3.10 (TASK-076 insecure-registry only)** — 한 줄 추가: insecure-registry 운영 모델은 memory / postgres 두 backend 와 직교하므로 별도 postgres 회귀 가드 추가 불필요. 후속 TASK 권장: insecure-registry + Postgres backend 의 e2e 가드 신규.
- **§3.11 (TASK-077 admin-initiated runner registration)** — 한 줄 추가: 401/403/400/201/409 응답은 memory `Map.has` + postgres `INSERT … ON CONFLICT DO NOTHING` 양 backend 에서 동등 회귀 가드. §3.5 + TASK-082 의 Postgres 운영 검증과 정합.

#### §3.12 React 빌드 mount 운영 명령 박스 — Postgres backend 예시 추가

- 기존 §3.12 의 운영 명령 박스는 memory backend 만 노출. 본 TASK 가 박스 안의 step "2) Build Server 부팅" 을 step 2-a (memory backend) + step 2-b (Postgres backend) 로 분리. Postgres backend 예시는 DATABASE_URL + BUILD_REPOSITORY_BACKEND=postgres + DB_AUTO_BOOTSTRAP=true 풀 셋업. §3.2 의 Postgres default 권장 가이드 + `docs/operations/source-archive-postgres-2026-07-18.md` reference.
- §3.12 회귀 baseline 끝 한 줄 추가: backend 선정과 무관하게 동일하게 통과 + Postgres 환경 (Prod / Staging) 의 default 운영 패턴에서도 React 단일 SPA 운영 baseline 유지. e2e-source-archive-postgres / e2e-multi-runner-postgres 모두 ALL PASS 로 확인.

#### §4 검증 포인트 — UI 변경 항목에 Postgres 운영 baseline 추가

- 기존 UI 변경 항목은 React 측 운영 baseline (vitest 130 / vite build:react gzip / TS 5 packages clean) 만 기술. 본 TASK 가 한 줄 추가: "Postgres backend 운영 baseline (TASK-102 양축 동기화) — vitest 130 / build-server 143 / e2e-source-archive-postgres ALL PASS / TASK-082 multi-runner-postgres ALL PASS / `applyMigrations` 자동 부팅 정상. frontend 변경 0 이므로 React 측 운영 baseline 영향 없음."

#### §5 / 다음에 읽을 문서 — 신규 운영 가이드 reference 추가

- 다음에 읽을 문서 끝에 신규 운영 가이드 reference 추가: "TASK-102 PROJECT_PROFILE §3 baseline 양축 동기화 운영 가이드: [project-profile-baseline-postgres-sync-2026-07-20.md](project-profile-baseline-postgres-sync-2026-07-20.md)".

### 신규 1

- `docs/operations/project-profile-baseline-postgres-sync-2026-07-20.md` (본 가이드) — 본 TASK 의 의도 / 변경 / 회귀 baseline / 사전 결함 + 보강 / follow-up 을 한 자리에 정리. 본 가이드는 PROJECT_PROFILE 본문과 별도로 후속 TASK 진입자 / 운영자가 빠르게 본 TASK 의 scope 와 영향 을 파악할 수 있도록 함.

## 사전 결함 + 보강 (3건, docs only)

1. **§3 명령 박스의 default 부재** — `run_local` / `run_local_postgres` 가 어느 backend 가 default 인지 명시 안 함. 본 TASK 가 §3.2 의 default 권장과 정합하도록 각 명령의 의도 + 권장 사용처 명시.
2. **§3 회귀 baseline 의 memory-only 표기** — TASK-082 + TASK-066 의 Postgres 운영 검증이 봉인됐지만 PROJECT_PROFILE 본문에는 메모되지 않음. 본 TASK 가 4개 §3 블록 (§3.5 / §3.6 / §3.10 / §3.11) 각각에 한 줄만 (Postgres) 추가.
3. **§3.12 의 memory-only 운영 명령** — React 단일 SPA 의 운영 명령 박스가 memory backend 만 예시로 노출. 본 TASK 가 step 2 를 2-a (memory) + 2-b (Postgres) 로 분리하여 두 backend 의 운영 명령을 모두 노출.

## 회귀 baseline (본 TASK 봉인 시점, docs only — 영향 없음)

- TS 5 packages `tsc --noEmit` clean (변경 파일에 영향 없음)
- build-server node:test **143/143 동일** (backend 변경 0)
- build-monitor vitest **130/130 동일** (frontend 변경 0 — React baseline)
- Go 7+ packages 모두 PASS
- svelte-check script 제거 (TASK-101 유지)
- vite build:react 정상 — gzip js **99.01KB** / css **30.62KB** (변경 없음)
- `e2e-source-archive-postgres.sh` (TASK-066 baseline 동일, ALL PASS)
- `e2e-multi-runner-postgres.sh` (TASK-082 baseline 동일, ALL PASS)
- `e2e-production-semantic.sh` (TASK-085 baseline 동일, ALL PASS)
- postgres migration 0001~0005 모두 적용 정상 (admin memory `applyMigrations` 자동 부팅)

본 TASK 의 변경은 docs only 이므로 위 모든 회귀 baseline 이 변경 전후 동일.

## follow-up

- **scripts/migrate.ts standalone CLI 운영 workflow** — TASK-064 에서 봉인, `docs/operations/smoke-and-migration.md` §3 에 standalone 사용법 있음. 운영자가 "신규 migration 추가 시 어떤 순서로 검증하나"를 한 자리에 정립하는 후속 TASK 가 본 TASK 와 직교. 본 TASK 의 scope 외 (별도 사용자 결정 대기).
- **postgres migration 0004 build_source 의 TOAST 전략** — 256 MiB body limit 으로 충분. 후속 TASK 결정 대기.
- **운영 안정화** — main HEAD `cf6b3bd` 자체는 안정. 신규 TASK 진입 (release workflow / CHANGELOG / 운영 배포 체크리스트) 결정 대기.
- **신규 기능 추가 / Nextcloud Tasks 통합** — 항목 6 / 7 follow-up 결정 대기.

## 관련 문서

- `docs/PROJECT_PROFILE.md` §3 / §3.2 / §3.5 / §3.6 / §3.10 / §3.11 / §3.12 / §4 (본 TASK 의 본 변경 표면)
- `docs/operations/source-archive-postgres-2026-07-18.md` (TASK-066 follow-up batch 3 — Postgres default 개발 경로 권장, 본 TASK 의 선행 가이드)
- `docs/operations/smoke-and-migration.md` §3 (Postgres migration 운영)
- `apps/build-server/scripts/e2e-source-archive-postgres.sh` (Postgres backend 5 단계 회귀 가드)
- `apps/build-server/scripts/e2e-multi-runner-postgres.sh` (Postgres backend multi-runner 운영 검증)
- `apps/build-server/scripts/e2e-production-semantic.sh` (memory backend 7 단계 운영 검증)
- `docs/operations/production-semantic-2026-07-07.md` (TASK-085)
- `docs/operations/multi-runner-claim-postgres-2026-07-06.md` (TASK-082)
