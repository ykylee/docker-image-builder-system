# Release Notes — v0.2.1 (2026-07-23)

- 문서 목적: `v0.2.1` (Phase 1 후속 패치) 의 종합 리뷰 — 수정된 결함, 운영 영향, 검증 결과, 업그레이드 안내.
- 범위: `v0.2.0` 이후 TASK-153 ~ TASK-155 코드 델타 (5 commits)
- 대상 독자: 운영자, release reviewer, AI agent
- 상태: stable
- 최종 수정일: 2026-07-23
- 관련 문서: [CHANGELOG](../CHANGELOG.md), [Phase 1 회고](./PHASE-1-RETROSPECTIVE.md), [Release Notes 2026-07-22](./RELEASE_NOTES-2026-07-22.md)

## 1. 요약

`v0.2.0` 으로 Phase 1 을 봉인한 직후 **실이미지 빌드 e2e 를 처음 실행**하면서 드러난 결함들을 수정한 patch release 다. 표면적으로는 "e2e 를 돌려봤다" 이지만, 실제로는 **프로덕션 경로에 잠복해 있던 결함 2건**(이미지 빌드 파손 / chunked build 가 claim 되지 않음)을 잡았다.

- 코드 델타: TASK-153 ~ TASK-155 (5 commits)
- 5 package.json: `0.2.0` → **`0.2.1`**
- git tag: **`v0.2.1`**
- 회귀 baseline: build-server **178 → 181**, e2e **13/13 PASS**

## 2. 수정된 결함

### 2.1 🔴 chunked 업로드 build 가 runner 에게 claim 되지 않음 (TASK-155)

**증상**: `POST /builds/:buildId/source/chunk` 로 소스를 업로드한 build 가 `QUEUED` / `REQUEST_ACCEPTED` 에서 영원히 진행되지 않는다. runner 는 정상적으로 `POST /builds/claim` 을 폴링하지만 서버가 아무 build 도 내주지 않는다.

**원인**: TASK-080 의 claim source-gate 가 legacy 단일행 `build_source` 테이블로 **inner join** 해 자격을 판정했다. 그런데 TASK-106 의 chunked 업로드는 **첫 chunk 를 쓸 때 그 legacy row 를 삭제**하고 `build_source_chunk` 에 기록한다 (두 저장소가 authoritative 를 두고 충돌하지 않게 하려는 의도). 결과적으로 chunked 경로의 build 는 join 이 비어 자격 판정에서 영구 탈락했다.

실측 (e2e 실행 중 DB):

| app_name | status | declared | legacy_rows | chunk_rows | cumulative |
|---|---|---|---|---|---|
| mr-chunked-pg-0 | QUEUED | 1024 | 0 | 1 | 1024 |
| mr-chunked-pg-2 | QUEUED | 4096 | 0 | 4 | 4096 |

**수정**: claim 자격을 `(legacy row 존재) OR (chunk 가 1건 이상 AND 누적 size >= 선언 total)` 로 확장 (postgres / memory 양쪽 동일 의미). `EXISTS(chunk)` 를 AND 로 함께 걸어, chunk 0건일 때 `SUM` 이 NULL → `COALESCE 0` 이 되어 `sizeBytes 0` 인 build 가 source 없이 `0 >= 0` 으로 가드를 뚫는 것을 차단했다.

**회귀 가드 3건 신규** — chunked 경로 claim 성공 / 부분 업로드는 claim 안 됨 / source 전무는 여전히 거부(TASK-080 보존).

> **왜 지금까지 몰랐나**: chunked 업로드와 runner claim 을 함께 타는 e2e 가 `e2e-multi-runner-chunked-postgres.sh` 하나뿐인데, 그 스크립트가 `--build` 없이 compose up 해서 **오래된 이미지만 검증**하고 있었다.

### 2.2 🔴 루트 `Dockerfile` 의 build-monitor 빌드 파손 (TASK-153/154)

**증상**: `docker build` 가 `Cannot find package '@sveltejs/vite-plugin-svelte'` 로 실패 → 이미지 자체를 만들 수 없음.

**원인**: Dockerfile 이 `vite build`(config 미지정)를 호출했는데, vite 는 config 확장자 우선순위(`.js > .ts`)로 Svelte 시절 잔재 `vite.config.js` 를 먼저 잡았다. React 이관(TASK-088~101)이 로컬 build 명령만 `--config vite.react.config.ts` 로 바꾸고 **Dockerfile 은 손대지 않아** `v0.2.0` 까지 잠복했다. `.gitignore` 에는 그 잔재가 있었지만 **Docker build context 는 `.gitignore` 가 아니라 `.dockerignore` 를 따른다**는 사각지대도 겹쳤다.

**수정**: TASK-153 에서 즉시 복구한 뒤, TASK-154 에서 근본 원인인 config 이원화를 제거 — build-monitor 는 이제 **단일 canonical `vite.config.ts`** (root=`react/`, outDir=`dist-react`, build+dev+test 통합)만 갖는다.

## 3. 그 외 개선 (e2e 인프라)

전수 실행 과정에서 수정한 e2e 인프라 결함 12건:

| 분류 | 내용 |
|---|---|
| 경로 | `REPO_ROOT` off-by-one (`../..` → `apps/` 착지) |
| 빌드 | `tsc -p` 에 brace 확장으로 3 project 전달 → TS5042 |
| 접속 | `DATABASE_URL` 기본값이 `postgres://memory://test`(무효) / 검증 psql 이 포트 `15432` 하드코딩 |
| 재실행성 | 고정 `appName` → 재실행 시 409 `ACTIVE_BUILD_EXISTS` |
| 단언 | chunk cap 은 `ceil(total/1024)` **개수** 기준인데 "선언 total 초과" 로 오해 / `schema_migrations` 컬럼명(`version_num`→`version`) / flaky 분배 단언 |
| 셸 | 큰따옴표 안 백틱 → 의도치 않은 명령 치환 |
| 격리 | **`--build` 누락 2건**(오래된 이미지만 검증) / **죽은 cleanup trap**(`COMPOSE_PID` 미할당 → 볼륨 누수 → 카운터 런 간 누적) |
| 환경 | `compose.dev.yaml` 의 postgres 호스트 포트 하드코딩(`5432:5432`) → `${DIBS_POSTGRES_HOST_PORT:-5432}` |

## 4. 검증

| 스위트 | 결과 |
|--------|------|
| build-monitor `vitest run` | **277 PASS** (25 files) |
| build-server `node --test` | **181 PASS** (178 → 181, 회귀 가드 3건) |
| runner `go test ./...` | **8 pkg PASS** |
| `tsc --noEmit` × 5 packages | **clean** |
| `vite build` | 초기 index js gzip **134.64 KB** / css **24.08 KB** |
| **e2e 전수** | **13/13 PASS, 0 FAIL** |

e2e 내역: 로컬 5(source-archive ×2 / chunked ×2 / single-port) + compose 6(production-semantic ×2 / multi-runner ×3 / insecure-registry) + runner 2(container-run / deploy-push). 실제 `docker build`(busybox+httpd) → `docker run` → preview HTTP 200 → 10 phase → container cleanup 경로 포함.

## 5. 업그레이드 안내

- **DB migration 변경 0** (0001~0006 유지). 별도 마이그레이션 불요.
- **API 계약 변경 0**. claim 자격 확장은 *더 많은 build 가 claim 되는* 방향이라 기존 동작을 깨지 않는다. 다만 **그동안 QUEUED 로 멈춰 있던 chunked build 가 업그레이드 직후 claim 되기 시작**하므로, 운영 중이라면 대기 중인 build 수를 먼저 확인할 것.
- **빌드 명령 변경**: `apps/build-monitor` 는 플래그 없는 `vite` / `vite build` 를 쓴다. `vite.react.config.ts` / 루트 `index.html` / `svelte.config.js` 는 삭제됐다. 로컬 스크립트나 CI 가 `--config vite.react.config.ts` 를 참조한다면 제거해야 한다.
- **신규 env (선택)**: `DIBS_POSTGRES_HOST_PORT` — 로컬에 native PostgreSQL 이 5432 를 점유한 환경에서 compose postgres 의 호스트 포트를 바꾼다 (미지정 시 기존과 동일한 5432).

## 6. 운영자 검증 순서

1. `git fetch && git checkout v0.2.1` + 5 package version `0.2.1` 확인.
2. `pnpm install` → 5 pkg TS clean → `vite build` → build-server 부팅.
3. `GET /health` → `{"status":"ok"}` / SPA 라우트 진입 / `POST /builds` 202 왕복.
4. **chunked 경로 회귀 확인** — `POST /builds/:id/source/chunk` 로 업로드한 build 가 실제로 claim 되어 진행되는지.
5. Rollback: `git checkout v0.2.0` (단, 2.1 의 chunked claim 결함이 되살아난다).

## 7. follow-up

- **e2e·visual baseline 의 CI/nightly 통합 (최우선)** — 본 release 의 결함 2건 모두 "e2e 를 안 돌리면 잠복한다"가 실증됐다.
- 사후 알림 자동화 / 외부 object storage / 신규 기능 / Nextcloud Tasks / CI migration validation. ([CHANGELOG §6](../CHANGELOG.md))
