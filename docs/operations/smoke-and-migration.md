# Smoke / Migration / Visual QA 운영 가이드 (TASK-064)

이 문서는 build-server + runner + build-monitor 통합 검증과, postgres
migration 운영, visual QA baseline 운영을 한 자리에서 다룬다. 모든
명령은 repository root 에서 실행하는 것을 전제로 한다.

대상 독자: 운영자, backend 개발자, devops.

## 1. Backend 선택 (memory vs postgres)

`BUILD_REPOSITORY_BACKEND` env 로 두 backend 를 선택한다. 둘 다
canonical contract (TASK-052~058) 와 동일한 `BuildStatusResponse`
shape 를 노출한다.

| backend | 적합한 경우 | 데이터 영속 | 회귀 |
| --- | --- | --- | --- |
| `memory` | 로컬 dev / smoke | process restart 시 휘발 | O (default) |
| `postgres` | staging / e2e / 운영 | row 단위 영속 | O (TASK-051~053) |

운영 migration 은 postgres 만 적용된다.

## 2. Quick smoke (`scripts/smoke.sh`)

memory 또는 postgres backend 에 대해 동일한 e2e 시나리오를 빠르게
검증한다. 5 단계로 구성돼 있다:

1. `tsc --noEmit` (4 packages)
2. build-server boot
3. `POST /builds` + `GET /builds/:id` + `GET /builds/:id/logs` +
   `GET /builds?limit=10&requestedBy=...`
4. duplicate POST → 409 (또는 운영 정책상 다른 status)
5. `/admin/builds` (X-Admin-Id: admin) → 200

### Memory backend

```bash
SMOKE_BACKEND=memory bash scripts/smoke.sh
```

기본 30 초 안에 종료된다.

### Postgres backend

```bash
# 1) Colima + Docker 가 떠 있는지 확인
docker ps | grep docker-image-builder-postgres

# 2) DATABASE_URL 환경 변수 설정
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/docker_image_builder

# 3) smoke 실행 — boot 시 ensureDbSchema + applyMigrations 가 자동 실행됨
SMOKE_BACKEND=postgres bash scripts/smoke.sh
```

smoke 가 `build-server died during boot` 으로 실패하면,
`/tmp/build-server-smoke.*.log` 의 tail 을 확인한다. 일반적으로는
DATABASE_URL 오타 / Postgres 컨테이너 미기동 / 15432 포트 충돌.

## 3. Postgres migration 운영

### 파일 위치

`apps/build-server/migrations/000N_*.sql`. 현재 3 종:

- `0001_app_name.sql` (TASK-045): `project_id`/`repository_id` →
  `app_name` 단일 식별자, brownfield idempotent.
- `0002_phase_history.sql` (TASK-051): `phase_history JSONB` 컬럼 추가.
- `0003_build_test_and_deployment_attempt.sql` (TASK-053):
  `build_test` / `deployment_attempt` 신규 테이블, FK + DEFAULT 추가.

모든 SQL 은 `IF NOT EXISTS` / `IF EXISTS` 로 idempotent 하다. 부분 적용
상태에서도 재실행 안전.

### 자동 경로 (build-server boot)

`DB_AUTO_BOOTSTRAP=true` 가 default. build-server 가 postgres backend
로 부팅될 때 자동으로:

1. `ensureDbSchema` — greenfield `CREATE TABLE IF NOT EXISTS` bootstrap.
2. `applyMigrations` — `0001~000N` 까지 미적용 SQL 을 한 transaction 씩
   적용. `schema_migrations` 테이블에 `version` / `applied_at` /
   `checksum` row 가 추가된다.

별도 운영 작업 없이 boot 만 해도 migration 이 따라간다.

### 수동 경로 (CLI)

dry-run / 부분 적용 / 수동 운영이 필요할 때 standalone CLI 사용:

```bash
# 1) 적용 계획만 확인 (실제 SQL 미실행)
node --import tsx apps/build-server/scripts/migrate.ts \
  --database-url "$DATABASE_URL" --dry-run

# 2) 0002 까지만 적용
node --import tsx apps/build-server/scripts/migrate.ts \
  --database-url "$DATABASE_URL" --to 0002

# 3) 현재 적용 / 미적용 상태
node --import tsx apps/build-server/scripts/migrate.ts \
  --database-url "$DATABASE_URL" --list

# 4) greenfield bootstrap DDL 도 함께 적용
node --import tsx apps/build-server/scripts/migrate.ts \
  --database-url "$DATABASE_URL" --bootstrap
```

exit code: 0 (성공) / 1 (실패) / 2 (인자 오류).

### 마이그레이션 추가 절차 (개발자용)

새 마이그레이션을 추가할 때는 다음을 지킨다:

1. `000N_<topic>.sql` 파일을 `apps/build-server/migrations/` 에 추가.
   `N` 은 lexicographic 순서로 (0004 → 0005 → ...).
2. SQL 안에 `BEGIN` / `COMMIT` 을 박아 단일 transaction 으로 보호.
3. 모든 구문은 idempotent (IF EXISTS / IF NOT EXISTS).
4. `packages/db` 의 `applyMigrations` 가 자동으로 인식한다.
5. 부분 적용된 상태에서도 재실행 안전성 검증: `applyMigrations` 가
   `schema_migrations.version` row 가 없으면 적용, 있으면 skip.

### 운영 체크리스트

- [ ] 신규 마이그레이션 추가 시, `apps/build-server/migrations/` 에
  `000N_*.sql` 만 추가. `packages/db`/`apps/build-server` 코드 수정
  불필요.
- [ ] brownfield 운영 DB 에 신규 마이그레이션 적용 시, build-server
  재기동만으로 자동 적용. 별도 psql 작업 불필요.
- [ ] 수동 운영이 필요한 경우 `--dry-run` 으로 사전 계획 확인 후
  `--to NNNN` 으로 단계적 적용.

## 4. Visual QA baseline (`apps/build-monitor/tests/visual/`)

build-monitor 의 핵심 라우트 PNG baseline 을 유지하고 의도하지 않은
시각 회귀를 검출한다. `capture.py` + `diff.py` + `test_diff.py` +
`README.md` 가 한 묶음.

### Baseline 캡쳐 절차

```bash
# 1) build-server + build-monitor dev server 동시 기동
BUILD_REPOSITORY_BACKEND=memory node apps/build-server/dist/apps/build-server/src/index.js &
cd apps/build-monitor && rtk ./node_modules/.bin/vite --port 5173 &
# (dev server 가 ready 될 때까지 대기)

# 2) 캡쳐
python3 apps/build-monitor/tests/visual/capture.py \
  --base http://127.0.0.1:5173 \
  --out .visual/$(date -u +%Y-%m-%dT%H-%M-%SZ)
```

`/login`, `/builds`, `/admin/builds`, `/admin/users`, `/admin/admins`
각각의 dark/light PNG 가 생성된다.

### Diff 검증 절차

```bash
# Pillow 설치 — 시스템 Python 보호 위해 venv 권장
python3 -m venv .venv-visual
source .venv-visual/bin/activate
pip install Pillow

python3 apps/build-monitor/tests/visual/diff.py \
  --baseline apps/build-monitor/tests/visual/baseline \
  --run .visual/<ts> \
  --threshold 0.001
```

- `--threshold 0.001` = 0.1% 초과 픽셀 차이면 FAIL.
- `--out-diff .visual/diff/<ts>` = 초과한 PNG 만 저장.
- `--allow-missing` = baseline 없는 신규 라우트는 skip.

### Baseline 업데이트 절차 (의도된 UI 변경)

1. 변경 후 `capture.py` 로 새 run 생성.
2. `diff.py` 로 baseline 과 비교, 의도된 변경임을 확인.
3. PNG 자체는 binary 라 git LFS 또는 외부 diff 도구로 관리. 본 repo
   에선 `baseline/` 디렉터리 구조와 `capture.py` / `diff.py` 만 commit.

### 한계

- mock 로그인 (`localStorage.userId`/`adminId` 주입) 상태 — 데이터
  fetch 가 비어있거나 에러 화면. 시각 검증의 목적은 "토큰이 의도대로
  적용됐는지" 라 정적 surface 위주.
- 폰트 anti-aliasing 은 baseline 과 0.01% 수준 미세 차이를 만들 수 있어
  threshold 를 너무 낮게 잡으면 CI 가 자주 깨진다. 0.1% 가 권장.

## 5. Frontend 테스트 (vitest)

build-monitor 의 vitest 환경은 TASK-064 에서 다음 보강을 받았다:

- `vite.config.ts` — `environmentOptions.jsdom.url = "http://localhost/"`
  추가 (opaque origin 회피).
- `src/test/setup.ts` — JSDOM 기반 localStorage / sessionStorage
  fallback 추가 (vitest 환경 자체가 깨졌을 때의 안전망).
- `src/test/jsdom.d.ts` — jsdom 25 의 type 정의 누락 보완.
- `src/lib/chipFilter.ts` — `BuildsList` / `AdminBuilds` 의 chip filter
  helper 를 single source-of-truth 로 추출 + canonical success 가
  COMPLETED chip 으로 분류되는 success-exclusion 보강.

실행:

```bash
cd apps/build-monitor
rtk ./node_modules/.bin/vitest run
```

60/60 green (component 4 + routes 7 + lib 1).

## 6. 회귀 baseline

TASK-064 시점 누적 회귀:

- TS 4 packages tsc clean
- `packages/db` migrate 8 tests
- `apps/build-server` focused tests 27 (memory-preview + phase-history +
  build-routes + admin + build-service + openapi + memory-repo +
  admin-repo + shared-contract-response)
- `apps/build-server` postgres build-service + admin-repo + build-routes
- `apps/build-monitor` vitest 60 (StatusPill 7 + BuildRow 1 +
  PhaseTimeline ? + Header 6 + ThemeToggle 2 + AdminAdmins + BuildsList
  + Login + BuildDetail + AdminBuilds + AdminUsers + AdminLogin +
  chipFilter 6)
- `apps/runner` `go test ./...` 17 passed
- `apps/skill_mcp` pytest 226 (canonical contract v2 + 3 skills + 2 MCPs)
- drift-checker 9 sync groups 0 drift (TS↔Python 4 + TS↔Go 5)

## 7. 일상 운영 흐름

1. **로컬 dev** — `BUILD_REPOSITORY_BACKEND=memory node apps/build-server/dist/apps/build-server/src/index.js` + `cd apps/build-monitor && rtk ./node_modules/.bin/vite`.
2. **PR 회귀** — `tsc --noEmit 4 packages` + `(cd apps/runner && go build ./...)` + `cd apps/build-server && rtk ../../node_modules/.bin/tsx --test tests/*.test.ts` + `cd apps/skill_mcp && python3 -m pytest tests/` + `cd apps/build-monitor && rtk ./node_modules/.bin/vitest run`.
3. **postgres staging 검증** — `pg_isready -h 127.0.0.1 -p 15432` → `SMOKE_BACKEND=postgres bash scripts/smoke.sh`.
4. **visual QA** — capture → diff → 의도된 변경이면 baseline 교체.
5. **신규 migration** — `000N_*.sql` 추가만으로 끝. build-server 재기동 시 자동 적용.

## 8. 향후 작업 (후속 TASK 후보)

- `runner.internal.deploy` 의 mock URL / targetRef → real registry
  push / HTTP API / SCP/SFTP 구현 (TASK-064 의 명시적 follow-up).
- OpenAPI regenerated 자동 트리거 (현재는 build-server 재기동 시
  `apps/build-monitor/.generated/openapi.d.ts` 가 hand-refresh).
- visual QA baseline PNG 자체의 git LFS 또는 S3 외부 저장소 도입.
- migration runner 의 checksum drift 검출 (현재 옵션은 있으나 강제
  검출은 미통합).