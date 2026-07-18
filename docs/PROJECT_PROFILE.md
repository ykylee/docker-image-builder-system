<!-- standard-ai-workflow-kit: v0.11.21-beta -->

# Project Workflow Profile

- 문서 목적: 프로젝트 특화 규칙과 실행/검증 기준을 정의한다.
- 범위: 프로젝트 개요, 문서 구조, 기본 명령, 검증 포인트, 예외 규칙
- 대상 독자: 개발자, 운영자, AI agent, 프로젝트 온보딩 담당자
- 상태: draft
- 최종 수정일: 2026-07-05
- 관련 문서: [공통 표준](../ai-workflow/core/global_workflow_standard.md)

## 1. 프로젝트 개요
- 프로젝트명: Docker Image Builder System
- 프로젝트 목적: 외부 사용자 또는 AI 에이전트가 전달한 앱 산출물을 빌드 서버가 받아 Docker build, 컨테이너 테스트, 외부 시스템 배포, 결과 전달까지 자동화하는 플랫폼을 설계한다.
- 주요 이해관계자: 비개발자 사용자, AI 에이전트 운영자, Build Server/Runner 설계자, 플랫폼 운영자

## 2. 문서 구조 (Path)
- 문서 위키 홈: README.md
- 운영 문서 홈: ai-workflow/memory/active/
- 백로그 위치: ai-workflow/memory/active/backlog/
- 세션 인계 문서: <ai-workflow/memory/active/session_handoff.md>
- 환경 기록 위치: <ai-workflow/memory/active/repository_assessment.md>
- 제품 온보딩 기준: docs/sdlc/01-mvp-onboarding.md
- 컨셉 고도화 문서: docs/sdlc/02-concept-refinement.md
- 요구사항 기준선: docs/sdlc/03-requirements-baseline.md
- 설계 구조 문서: docs/sdlc/04-design-structure.md
- Step 05 진입 문서: docs/sdlc/05-design-closure-and-step-05-entry.md
- Step 06 구현 축 문서: docs/sdlc/06-implementation-axis-and-workstreams.md
- Step 07 구현 backlog 문서: docs/sdlc/07-implementation-backlog-baseline.md
- Step 08 기술 스택 문서: docs/sdlc/08-build-server-tech-stack-baseline.md
- Step 09 저장소 구조 문서: docs/sdlc/09-repository-package-structure-baseline.md
- Step 10 `PKG-002` 세분화 문서: docs/sdlc/10-pkg-002-build-server-request-intake-breakdown.md
- Step 11 `PKG-003` 세분화 문서: docs/sdlc/11-pkg-003-build-server-persistence-breakdown.md
- Step 12 `PKG-004` 세분화 문서: docs/sdlc/12-pkg-004-build-server-query-api-breakdown.md
- Step 13 우리 시스템 skill/MCP 개발 계획: docs/sdlc/13-skills-and-mcp-plan.md
- Step 15 리팩토링 로드맵 및 마일스톤: docs/sdlc/15-refactoring-roadmap-and-milestones.md
- SDLC 리뷰 문서: docs/review/01-sdlc-review.md
- 과제 계획안: docs/report/01-assignment-plan.md
- 보고용 자료: docs/report/02-sdlc-review-report.html
- 공통 계약 기준 문서: docs/sdlc/contracts/01-shared-build-contract-baseline.md
- Step 05 baseline decisions: docs/sdlc/decisions/
- 설계 문서 1: docs/sdlc/design/01-system-context-and-responsibilities.md
- 설계 문서 2: docs/sdlc/design/02-domain-model-and-state-transitions.md
- 설계 문서 3: docs/sdlc/design/03-api-contract-design.md
- 설계 문서 4: docs/sdlc/design/04-data-model-design.md
- 설계 문서 5: docs/sdlc/design/05-build-and-preview-execution-flow.md
- 설계 문서 6: docs/sdlc/design/06-user-messaging-and-failure-handling.md

## 3. 기본 명령 (Commands)
- 설치: `pnpm install` (`esbuild` 계열 승인 정책 때문에 환경에 따라 `ERR_PNPM_IGNORED_BUILDS`가 날 수 있으며, 이 경우 watch/dev dependency 승인 또는 direct `tsc` 검증으로 우회)
- 로컬 실행 (memory backend, Build Server API 만 — 단일 포트 mount 미사용): `./node_modules/.bin/tsc -p packages/shared-contract/tsconfig.json && ./node_modules/.bin/tsc -p packages/shared-config/tsconfig.json && ./node_modules/.bin/tsc -p packages/db/tsconfig.json && ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json && BUILD_REPOSITORY_BACKEND=memory node apps/build-server/dist/apps/build-server/src/index.js`
- Postgres 실행 (memory backend 와 동일하게 Build Server API 만): `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/docker_image_builder BUILD_REPOSITORY_BACKEND=postgres DB_AUTO_BOOTSTRAP=true node apps/build-server/dist/apps/build-server/src/index.js`
- **단일 포트 reverse proxy (TASK-075)** — Build Server 가 build-monitor 의 React vite build 산출물 (`apps/build-monitor/dist-react/`) 을 정적 mount + SPA fallback 으로 함께 노출, `:3000` 한 포트로 backend + frontend 동시 접근:
  ```bash
  # 1) build-monitor 의 React vite build 산출물 생성 (workspace root 에서)
  ./node_modules/.bin/tsc -p packages/{shared-contract,shared-config,db}/tsconfig.json && \
    ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json && \
    (cd apps/build-monitor && ./node_modules/.bin/vite build --config vite.react.config.ts) && \
    BUILD_REPOSITORY_BACKEND=memory \
    BUILD_MONITOR_REACT_DIST_PATH=apps/build-monitor/dist-react \
    node apps/build-server/dist/apps/build-server/src/index.js
  # 2) postgres backend 면 BUILD_REPOSITORY_BACKEND=postgres + DATABASE_URL + DB_AUTO_BOOTSTRAP=true 추가.
  ```
  그 다음 `curl http://127.0.0.1:3000/` (Build Monitor SPA), `curl http://127.0.0.1:3000/admin/builds` (SPA deep link fallback), `curl http://127.0.0.1:3000/api/builds` (Build Server API) 모두 동일 port 로 동작. Build Monitor 의 `react/src/lib/api.ts` 가 `baseUrl: "/api"` 로 fetch 하기 때문에 `/api/*` 가 Build Server 의 자체 route (`/builds`, `/admin/*`) 로 307 transparent redirect. dev 환경에서는 vite dev (`:5173`) 가 별도 port 에 떠서 `/api/*` 를 `:3000` 으로 프록시 (vite.config.ts) — 그 경로는 그대로 유지. e2e 검증: `bash apps/build-server/scripts/e2e-single-port.sh`.
- 빠른 테스트: `./node_modules/.bin/tsc -p packages/shared-contract/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p packages/shared-config/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json --noEmit && (cd apps/runner && go build ./...)`
- 격리 테스트: `curl http://127.0.0.1:3000/health && curl -X POST http://127.0.0.1:3000/builds ...` (memory / postgres backend smoke 모두 확인 완료)
- 실행 확인: `GET /health`, `POST /builds`, `GET /builds/:buildId`, `GET /builds/:buildId/logs` 응답과 `state.json`, `session_handoff.md`, `work_backlog.md`의 current focus 정합성 점검
- 출처: `docs/sdlc/08-build-server-tech-stack-baseline.md`, `docs/sdlc/09-repository-package-structure-baseline.md`
- 소스 아카이브 라운드트립 (TASK-066): `POST/GET/DELETE /builds/:buildId/source` 3종. Skill 은 `POST /builds` 로 `sourceArchive` 메타데이터 (objectKey + sha256 + size) 를 선언한 뒤, 동일 buildId 로 raw archive bytes 를 `application/octet-stream` 으로 POST. Runner 는 `GET /builds/:buildId/source` 로 bytes + `X-Source-Checksum-Sha256` 헤더 검증 후 `<workspaceRoot>/<buildID>/src/` 에 추출. 재업로드/교체 는 last-write-wins, cleanup 은 `DELETE /builds/:buildId/source`. e2e: `apps/build-server/scripts/e2e-source-archive.sh` (memory) + `e2e-source-archive-postgres.sh` (postgres bytea direct verify).
- 메모: `apps/build-server`는 현재 `BUILD_REPOSITORY_BACKEND=memory|postgres` 두 경로를 모두 가진다. `postgres`는 Colima + Docker + `docker-image-builder-postgres`(127.0.0.1:15432) 기준 live smoke까지 통과했다. 현재 `tsconfig` 산출물은 `dist/apps/build-server/src/index.js` 경로를 사용한다. `pnpm --filter @docker-image-builder-system/build-server dev` 는 `tsx` build script 승인 이후 dev watch 경로로 재개방한다.
- 외부 deploy (TASK-068 + TASK-071a robustness): `apps/runner/internal/deploy/client.go` adapter 는 `RUNNER_DEPLOY_MODE` env 로 `skeleton` (default, `deploy-result.json` 만 workspace 에 emit) / `cli` (real `docker tag <sourceImage> <targetRef>:<buildID>` + `docker push`, timeout `RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS` default 120s) 두 모드 지원. `RUNNER_DEPLOY_TARGET_TYPE` (default `DOCKER_REGISTRY`) / `RUNNER_DEPLOY_TARGET_REF` (default `registry.example.com/docker-image-builder-system`) / `RUNNER_DOCKER_BIN` (default `docker`). BuildService.ProcessClaim 가 `containerStatus.ImageTag` 를 `DeployOptions.SourceImage` 로 전달 — cli mode 일 때 registry 에 push, skeleton mode 일 때 SourceImage 무시 (기존 동작 보존). TASK-071a 로 `runWithTimeout(parentCtx, fn, args...)` helper 도입 — tag / push / future steps 동일 pushTimeout (default 120s) budget 으로 강제 종료. 기존 v1 (TASK-068) 의 `runPush` 만 timeout 이었던 asymmetry 해소. 외부 interface (`PushTimeout()` / `RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS` env) 그대로 유지. e2e: `apps/runner/scripts/e2e-deploy-push.sh` (Build Server memory backend + local `registry:2` 부팅 + busybox Dockerfile + Runner cli mode + registry `/v2/<repo>/tags/list` 검증 + cleanup). TASK-071a 추가 보강으로 busybox 미설치 환경에서는 자동으로 deploy-only 시나리오 (`RUNNER_DOCKER_RUN_MODE=skeleton` — build cli + run skeleton mock + deploy cli) 로 전환되어 offline 환경에서도 deploy 단계 (tag + push) 만 실제 검증 가능. **M5 (Deployment Capability) milestone 종료** — TASK-059 / TASK-064 / TASK-068 / TASK-071a 가 main 모두 합류되어 docs/sdlc/15 §5 완료 기준 5 항목 모두 충족. 후속: TASK-072 `RUNNER_REGISTRY_CONFIG_DIR` env 도입 (private Docker Hub / ECR / GCR 인증) + 다른 deploy target axis 확장 옵션.

## 3.1 활성 워크플로우 자산 (Active Skills / MCPs)
- 본 프로젝트가 표준 워크플로우 키트(`ai-workflow/`)에서 active로 채택한 자산을 정리한다. 미채택 prototype은 명시적으로 deferred 처리한다.
- 출처: `docs/PROJECT_PROFILE.md` §2 문서 경로, `ai-workflow/harnesses/codex/apply_guide.md` §2.1/§2.2, `ai-workflow/skills/README.md`, `ai-workflow/mcp_servers/README.md`
- 관련 결정: TASK-023 workflow skill/MCP 셋업

### 3.1.1 Active Skills (`ai-workflow/skills/`)
- `session-start` — 세션 시작 시 `ai-workflow/memory/active/` 핵심 문서 + 본 프로젝트 문서 경로를 자동 복원
- `backlog-update` — `work_backlog.md` ↔ `backlog/<date>.md` 동기화
- `doc-sync` — 변경 파일에 영향받는 `docs/` 후보 추천 및 링크/메타 점검

### 3.1.2 Active MCP Servers (`ai-workflow/mcp_servers/`)
- `latest-backlog` — 가장 최신 날짜의 backlog markdown 경로 조회
- `check-doc-links` — 상대 링크 무결성 검사
- `check-doc-metadata` — markdown 메타데이터 누락 검사

### 3.1.3 Deferred (현재 미채택)
- Skills: `merge-doc-reconcile`, `validation-plan`, `code-index-update` — 본 프로젝트는 아직 merge conflict/대규모 인덱싱 단계가 아니므로 보류
- MCP: `create-backlog-entry`, `suggest-impacted-docs`, `check-quickstart-stale-links` — 위 active 3종으로 먼저 운영 자동화를 검증한 뒤 활성 검토

### 3.1.4 Transport / 노출 상태
- 키트 prototype의 실제 MCP transport 계층은 표준 키트 측에서 미구현 상태이며, 본 프로젝트는 `.codex/config.toml.example`을 additive로 유지한다 (`transport_ready=false` 명시).
- 전역 `~/.codex/config.toml`에 프로젝트별 명령이나 backlog 경로를 직접 넣지 않는다 (`apply_guide.md` §2.3, §8).

## 3.2 Admin 엔드포인트 (ADMIN-* task group)
- Build Server 는 운영자용 admin 엔드포인트 2종을 노출한다.
  - `GET /admin/builds` — 모든 owner 의 build summary 를 한 번에 조회 (BuildListQuery 호환, `requestedBy` filter 도 그대로 지원).
  - `GET /admin/users` — 빌드 history 가 있는 userId 별 `buildCount` / `lastBuildAt` rollup.
- 인증: `X-Admin-Id` header 가 build server 의 `ADMIN_IDS` env (default `admin,yky.lee`) 에 포함될 때만 허용. 미일치 시 401 (header 누락) / 403 (not in allow-list).
- OpenAPI: `Admin` tag 가 추가됐고 `/admin/*` paths, `AdminListBuildsQuery` / `AdminListBuildsResponse` / `AdminUserBuildSummary` / `AdminUserListResponse` components 가 emit 된다. `/docs` Swagger UI 에서 확인 가능.
- build-monitor 측 진입점 (TASK-076 + TASK-077 + TASK-084 + TASK-097 + TASK-098): `/admin/login` 라우트는 제거됐다. 일반 Login 페이지(`/login`)에서 userId 입력 → localStorage `userId` 키에 저장 → admin allow-list (`ADMIN_IDS`) 에 해당 userId 가 포함되어 있으면 React 측 `Header` 가 단일 "Admin" 진입점 (`/admin/builds`) 을 자동 노출한다 (`X-Admin-Id` 헤더는 userId 그 자체로 채워짐). admin 섹션 (Builds / Users / Admins / Runners) 사이의 이동은 페이지 상단 공통 탭 바 `<AdminTabs />` (React 측 `react/src/components/AdminTabs.tsx` + react-router-dom NavLink) 가 담당한다 — `Header` 는 더 이상 4개의 섹션 링크를 나열하지 않는다. 별도 admin login / admin logout 단계가 없다 — 일반 Logout 한 번에 userId 가 clear 되면 admin 메뉴도 함께 사라진다. userId 가 admin allow-list 에 없는 상태에서 `/admin/*` 라우트로 직접 진입하면 React 측 `<AdminAccessDenied />` 패널이 친절한 안내 + "Back to Builds" / "Switch user" 두 액션을 노출한다 (TASK-084 frontend 가드 — backend 의 401/403 envelope 직접 노출 회피). backend 동작은 변경 없음 (defense in depth — frontend 가드 통과 후에도 Build Server 의 `X-Admin-Id` 401/403 envelope 그대로 유지).
- 회귀 (TASK-098 + TASK-100 + TASK-101 + 디자인 토큰 단일화 TASK-096.5 + 디자인 가드 TASK-084): TS 5 packages `tsc --noEmit` clean, build-monitor vitest **130/130 PASS** (TASK-088 baseline 7 → 244 in M4.5 → 130 in TASK-101 with Svelte 135 case 일괄 삭제), svelte-check script 제거 (TASK-101 Svelte scaffold 일괄 정리로 불필요), vite build:react 정상 — gzip js **99.01KB** / css **30.62KB**, vite build svelte script 제거 (TASK-101), build-server 143/143 PASS (TASK-101 baseline), e2e-single-port PASS. frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 8-PR 시리즈 (TASK-095~098 + TASK-099 + TASK-100 + TASK-101) + 디자인 토큰 단일화 (TASK-096.5) 까지 16 TASK 연속 봉인 완료 (2026-07-08 ~ 2026-07-18).
- 운영 가이드 (운영 환경 배포 시 필수): `ADMIN_IDS` 는 시크릿처럼 취급 — 외부 저장소/PR description/issue 에 노출 금지, 운영에선 CORS wildcard (`CORS_ORIGIN=true`) 를 끄고 명시 origin 화이트리스트로 제한. admin 인증은 평문 id 비교이므로 SSO/JWT 로의 마이그레이션은 후속 ADMIN-* task group 에서 다룬다.

## 3.3 Build Monitor UI 정합 (TASK-083 + TASK-095 + TASK-096 + TASK-096.5)
- 의도: admin 4 페이지 (Builds / Users / Admins / Runners) + BuildsList + Login + BuildDetail + BuildRequest + ApiConsole + Header 의 시각 정합 — `.page` wrapper + `<header class="page-head">` 컨테이너 + fadeIn 애니메이션 + h1 gradient text + `var(--size-xxl)` 단일 source, chip 디자인의 canonical 컴포넌트화 (FilterChips), 디자인 토큰 단일화 (Svelte baseline 60+ 토큰 + light/dark cascade 의 React 측 사본 — `react/src/tokens.css`).
- TASK-095 (Header / ThemeToggle / FilterChips React 마이그레이션): React 측 `apps/build-monitor/react/src/components/{Header, ThemeToggle, FilterChips}.tsx` 신규 추가 + `adminAllowListStore` (Zustand) + `Header` 가 모든 route 에서 mount (`App.tsx`).
- TASK-096 (StatusPill 디자인 토큰 baseline 정합): React 측 `StatusPill.tsx` 가 12 canonical + 2 legacy + RunnerStatus 상태 매핑 + Svelte baseline 정합.
- TASK-096.5 (디자인 토큰 단일화): Svelte `tokens.css` 가 단일 source-of-truth. React 측 `tokens.css` 사본이 우리 토큰 정의. Astryx Theme 컴포넌트 보호용 `theme.css` 별도 layer 분리. `globals.css` 의 placeholder fallback 정리 (`#app` → `#app-react` 정합).
- 회귀: TS 5 packages `tsc --noEmit` clean, build-monitor vitest **130/130 PASS** (TASK-101 baseline), vite build:react 정상 — gzip js **99.01KB** / css **30.62KB**. Header sticky bar 의 1px light-only shadow 는 의미적으로 `--shadow-card` 와 구분되어 후속 TASK (sticky-bar 디자인 토큰 신설) 후보로 보류.

## 3.4 Admin 가드 deep link UX (TASK-084 + TASK-097)
- 의도: TASK-076/077 의 admin 진입점 통일까지는 backend 가 401/403 으로 거부하지만 frontend 가 친절한 안내 없이 raw error envelope 을 그대로 노출하던 결함(`docs/operations/dogfood-e2e-review-and-followup-2026-07-06.md` §3.4 G-4 gap) 봉인. 비-admin user (`alice` 등 `ADMIN_IDS` env 부재) 가 `/admin/builds` 같은 deep link 를 직접 입력했을 때 backend 호출 없이 frontend 에서 거부 → React 측 `<AdminAccessDenied />` 패널이 reason-aware 메시지 + "Back to Builds" / "Switch user" 두 액션을 노출한다.
- 핵심 컴포넌트 + helper (단일 source):
  - `apps/build-monitor/react/src/lib/admin-guard.ts` — `ensureAdminAccess(callerId)` helper. `adminAllowListStore` (Zustand) 캐시가 비어 있으면 refresh 시도 후 `contains` 체크. 결과는 `{ isAdmin, allowList, reason: "NO_USER" | "FORBIDDEN" | "NOT_IN_ALLOW_LIST" }`. backend 가 401/403 으로 거절한 케이스만 `FORBIDDEN` 으로 표면화 — 나머지 (5xx / 빈 캐시) 는 `NOT_IN_ALLOW_LIST` fallback (사용자가 새로고침하면 재시도).
  - `apps/build-monitor/react/src/components/AdminAccessDenied.tsx` — 공통 권한 없음 패널. `page-head` + danger accent h1 + Login.tsx `.card` 패턴 차용 카드 + 두 액션 (`Back to Builds` 는 userId 유지하며 `/builds` 로 이동, `Switch user` 는 userIdStore clear 후 `/login` redirect).
- amend: `AdminBuilds.tsx` / `AdminUsers.tsx` / `AdminAdmins.tsx` / `AdminRunners.tsx` — useEffect 첫 단계에서 (1) `userId` 부재 시 navigate("/login") (기존), (2) `ensureAdminAccess(userId)` 호출, (3) `!isAdmin` 시 `accessDenied` state set + 친절한 패널 노출. backend 호출 (listAdminBuilds / listAdminUsers / listAdminRunners / refresh)은 frontend 가드 통과 후에야 일어남 — raw 403 envelope 이 화면에 노출될 surface 가 사라진다.
- Backend 동작은 변경 없음. Build Server 의 `X-Admin-Id` 401/403 envelope (TASK-049 / TASK-076) 은 그대로 유지 — frontend 가드 통과 후에도 backend 는 동일하게 한 번 더 검증 (defense in depth).
- 신규 회귀 가드: `admin-guard.test.ts` 4건 + admin 페이지 test 4종 신규 케이스 합계 5건 (AdminBuilds/AdminUsers/AdminRunners/AdminAdmins 각 1건 + AdminUsers 의 FORBIDDEN 별도 1건) — 비-admin userId 시 accessDenied 분기 + backend API 미호출 검증.
- 회귀: TS 5 packages `tsc --noEmit` clean, build-monitor vitest **130/130 PASS** (TASK-101 baseline), vite build:react 정상 — gzip js **99.01KB** / css **30.62KB**.

## 3.5 Production semantic 운영 검증 (TASK-085)
- 의도: TASK-081-B / TASK-082 의 dummy (size 0 source) 검증이 build 가 FAILED 로 끝나는 시나리오만 다뤘던 한계를 보완. busybox/scratch Dockerfile + 실제 `tar.gz` source archive 로 build 가 COMPLETED 까지 가는 운영 시나리오 자동 재현. `docs/operations/dogfood-e2e-2026-07-06.md` §2.2 의 `bab5995f-…-95d53684263d` (수동 dogfood) 의 자동 재현 동등물.
- 핵심 변경:
  - `apps/build-server/scripts/e2e-production-semantic.sh` 신규 — 7 단계 자동 검증 (busybox pull warm-up → compose up → build-server health → runner registry → source archive POST → build COMPLETED → 10 phase + preview URL 검증 → container cleanup).
  - `compose.dev.e2e-production.yaml` 신규 override — single runner + `RUNNER_DOCKER_BUILD_MODE=cli` / `RUNNER_DOCKER_RUN_MODE=cli` / `RUNNER_DEPLOY_MODE=skeleton` / `RUNNER_STOP_CONTAINER_ON_DONE=true` / `PREVIEW_INTERNAL_PORT=8080` / `RUNNER_HEALTHCHECK_PATH=/` / `RUNNER_HEALTHCHECK_TIMEOUT_SECONDS=60` / `network_mode: host` (host network namespace 공유로 spawn container 의 published host port 가 runner 의 localhost 에 노출).
  - `apps/runner/internal/docker/client.go` 보강 — `RunContainer` 의 host port auto-assign path 의 `docker inspect` 를 최대 5 회 × 200ms 로 retry. 빈 응답 시 다음 시도까지 대기, port 가 확인된 즉시 break. 회귀 가드 `TestRunContainerCliModeInspectRetriesUntilPortAppears` + `TestRunContainerCliModeInspectAllAttemptsEmptyLeavesHostPortZero` 신규.
- 사전 결함 + 보강 3건 (자세한 내역은 `docs/operations/production-semantic-2026-07-07.md` §5):
  - busybox `httpd` 의 default Basic Auth (`/login` 302 redirect) → e2e Dockerfile 의 `printf 'A:*\n' > /etc/httpd.conf && httpd ... -c /etc/httpd.conf` 로 permissive access rule 명시 적용.
  - docker inspect race (hostPort=0) → 위 retry 보강.
  - compose bridge network 의 host namespace 격리 → `network_mode: host` override.
- 회귀 baseline: TS 4 packages `tsc --noEmit` clean, build-server node:test **131/131 동일** (backend 변경 0), build-monitor vitest **121/121 동일** (frontend 변경 0), Go 7 packages 모두 PASS (기존 + 신규 docker test 2건), svelte-check 0/0, `e2e-production-semantic.sh` **ALL PASS** (cold start 30s + busybox pull warmup 10s + build lifecycle ~30s + cleanup, 총 ~2분).

## 3.6 e2e-multi-runner.sh BASE + heredoc 결함 봉인 (TASK-086)
- 의도: TASK-081-B 의 `apps/build-server/scripts/e2e-multi-runner.sh` 가 봉인될 때 못 가져간 두 가지 결함 — (1) `BASE="http://build-server:3000"` 가 docker network 내부 DNS 이름을 host shell 에서 사용, (2) `[5/6]` admin 분산 검증 의 `echo "${RUNNERS}" | python3 <<'PY'` 가 bash redirections 처리 순서상 heredoc 이 stdin 을 hijack 해서 `sys.stdin.read()` 가 항상 빈 응답 — 을 봉인. 같은 race (TASK-085 에서 발견된 runner registration 30-90s) 와 stale image caching 결함도 동시 보강.
- 핵심 변경 (amend 1 file + sibling follow-on):
  - `apps/build-server/scripts/e2e-multi-runner.sh` — `BASE="${BUILD_SERVER_URL:-http://127.0.0.1:3000}"` (TASK-082 동일 패턴), `[2/6]` runner registry 대기 30s → 90s, `[0/6] compose up` 에 `--build` 추가 (runner image caching 회피), project name 에 `$$` suffix (병렬 실행 안전), `[5/6]` heredoc 를 `RUNNERS_JSON="${RUNNERS}" python3 <<'PY'` + `os.environ["RUNNERS_JSON"]` 패턴으로 교체.
  - `apps/build-server/scripts/e2e-production-semantic.sh` follow-on — TASK-085 의 `[6/7]` 10 phase 검증 의 `printf '%s' "${LOGS_JSON}" | python3 <<PY` 도 동일 heredoc stdin hijack 결함 (그래서 우연히 동작 — `${LOGS_JSON}` shell expand 로 우회). env var 패턴 + `<<'PY'` quoted marker 로 견고화. log JSON 의 `'''` / escape 시퀀스에 silent fail 하지 않게 됨.
- 사전 결함 + 보강 4건:
  - `BASE="http://build-server:3000"` 가 host shell 에서 unresolved → `BASE="${BUILD_SERVER_URL:-...127.0.0.1:3000}"` 로 정렬 (TASK-082 동일).
  - heredoc 가 stdin pipe 를 hijack → env var 명시적 전달 패턴으로 교체.
  - runner registration 대기 30s 가 부족 (TASK-085 의 `30-90s` race 와 동일) → 90s 로 확장.
  - compose 가 cached image 사용 시 runner binary 변경 미반영 → `[0/6] compose up` 에 `--build` 추가.
- 회귀 baseline: TS 4 packages `tsc --noEmit` clean (변경 파일에 영향 없음), build-server node:test **131/131 동일** (스크립트만 amend — backend 변경 0), build-monitor vitest **135/135 동일** (frontend 변경 0), Go 7 packages 모두 PASS, svelte-check 0/0, `e2e-multi-runner.sh` **ALL PASS** (~3-4 분 — TASK-081-B 와 정합), `e2e-production-semantic.sh` follow-on 도 동일 ALL PASS (TASK-085 회귀 baseline 유지).

## 3.7 Private registry 인증 foundation (TASK-073)
- 의도: TASK-081/082 의 운영 보강 후보 — `RUNNER_REGISTRY_CONFIG_DIR` env 로 docker CLI 의 registry 인증 config dir 을 override, private Docker Hub / ECR / GCR push 의 foundation. 본 TASK 는 insecure-registry 케이스로 env 전파 + cli mode push round-trip + registry catalog/tags/manifest 회귀 가드 를 봉인.
- 핵심 변경:
  - `apps/runner/internal/config/config.go` amend — `Config.RegistryConfigDir` 필드 + `parseString("RUNNER_REGISTRY_CONFIG_DIR", "")` (default empty → docker default `~/.docker/config.json` 사용, 회귀 없음).
  - `apps/runner/cmd/runner/main.go` amend — `os.Setenv("DOCKER_CONFIG", cfg.RegistryConfigDir)` 호출, 후속 모든 docker CLI invocation (`docker tag` / `docker push`) 이 그 dir 의 config.json 사용. fatal on Setenv 실패.
  - `apps/runner/internal/config/config_test.go` 신규 — `TestLoadRegistryConfigDirDefaultEmpty` + `TestLoadRegistryConfigDirFromEnv` + `TestLoadAllFieldsWithEnv` + `TestLoadPollIntervalDefaults` + `TestLoadPollIntervalAcceptsBareIntegerSeconds` + `TestSetenvIsObservableWithinSameProcess` 6/6 PASS.
  - `compose.dev.e2e-registry.yaml` 신규 — `registry:2` container (HTTP 5000 + healthcheck `/v2/`) + `runner` override (`network_mode: host` + `RUNNER_DOCKER_BUILD_MODE=cli` / `RUNNER_DOCKER_RUN_MODE=cli` / `RUNNER_DEPLOY_MODE=cli` / `RUNNER_DEPLOY_TARGET_REF=localhost:5000/docker-image-builder-system/cli` / `RUNNER_REGISTRY_CONFIG_DIR=/registry-config` + host 의 임시 config.json volume mount).
  - `apps/build-server/scripts/e2e-registry-push.sh` 신규 — 8 단계 + 보너스: busybox/registry warm-up → HOST_REGISTRY_CONFIG + config.json 생성 → compose up → registry healthy → build-server healthy → runner registered → source archive + cli push lifecycle → registry API catalog/tags 검증 → bonus manifest 검증.
  - `docs/operations/registry-push-2026-07-07.md` 운영 가이드 (동기 / 환경 / 사용 절차 / 8 단계 매트릭스 / 사전 결함 4건 / 빠른 재현 / 후속 TASK).
- 사전 결함 + 보강 4건 (운영 가이드 §5):
  1. runner binary 에 `RUNNER_REGISTRY_CONFIG_DIR` 가 없었음 — config.go + main.go amend, `DOCKER_CONFIG` env 로 docker CLI 에 propagate.
  2. compose 검증 시 `group_add` 항목 중복 — `group_add` 제거, Dockerfile 의 `addgroup runner docker` 에 의존 (TASK-078 권한 정렬 정합).
  3. `RUNNER_DEPLOY_TARGET_REF` 가 registry 의 slash split 에서 의도된 repo 가 안 잡힘 — `localhost:5000/docker-image-builder-system/cli` 로 정렬, e2e 가 catalog 에서 `docker-image-builder-system/cli` 검증.
  4. manifest v2 vs v1 schema — bonus 단계의 Accept: v2 가 v1 호환 manifest (fat manifest) 응답 시 parse 실패 가능. main 8 단계는 fatal 아님.
- 회귀 baseline: TS 4 packages `tsc --noEmit` clean (변경 파일 영향 없음), build-server node:test **131/131 동일** (backend 변경 0), build-monitor vitest **135/135 동일** (frontend 변경 0), Go 7 packages 모두 PASS + config package 신규 6/6 PASS, svelte-check 0/0, `e2e-registry-push.sh` **ALL PASS** (~2-3 분: registry:2 cold start 5-10s + build-server healthcheck 30s + cli push lifecycle ~30-60s + cleanup).

## 3.8 htpasswd 인증 registry push (TASK-074)
- 의도: TASK-073 의 insecure-registry foundation 위에서 registry:2 의 `REGISTRY_AUTH=htpasswd` 가 enabled 일 때 cli mode docker push 가 base64 auths entry + bcrypt htpasswd entry 와 정합되어 통과하는지 검증. 운영 환경의 private Docker Hub / ECR / GCR 인증의 foundation 을 htpasswd 형식 (basic auth) 으로 봉인.
- 핵심 변경:
  - `compose.dev.e2e-registry.yaml` amend — `REGISTRY_AUTH: htpasswd` + `REGISTRY_AUTH_HTPASSWD_REALM: "Registry Realm"` + `REGISTRY_AUTH_HTPASSWD_PATH: /auth/htpasswd` env 3종 + `${HOST_REGISTRY_AUTH_DIR}:/auth:ro` volume mount + healthcheck `nc -z 127.0.0.1 5000` 로 단순화 (status code 무관 listen only).
  - `apps/build-server/scripts/e2e-registry-push.sh` amend — `HOST_REGISTRY_AUTH_DIR` 임시 디렉터리 + `chmod 0755` (mktemp default 0700 의 uid mismatch 회피) + `docker run --rm httpd:alpine htpasswd -nbB` 로 bcrypt hash 생성 (apr1 의 registry:v2 검증 비호환 회피) + `config.json` 의 `auths` entry key `localhost:5000` 정렬 (push target URL 과 exact match) + insecure-registries `localhost:5000` + `127.0.0.1:5000` 둘 다 + bonus-A 인증 헤더 부재 → 401 검증 + bonus-B 잘못된 credential → 401 검증 + [8/8] 인증 부착 curl + bonus-9 manifest 검증 (TASK-073 와 동일).
  - `docs/operations/registry-push-auth-2026-07-07.md` 운영 가이드 신규 (검증 결과 / 사용 절차 / TASK-073 foundation 위의 추가 4가지 보강 / 한계 / 빠른 재현 / K8s 운영 도입 패턴).
- 사전 결함 + 보강 4건 (운영 가이드 §5):
  1. config.json auths entry key 가 exact match — `localhost:5000` 정렬 (push target 의 URL 과 동일).
  2. host 임시 디렉터리의 permission (mktemp default 0700) — `chmod 0755` 로 runner uid 1500 이 read 가능.
  3. registry:2 가 apr1 hash format 을 인식 안 함 — `httpd:alpine htpasswd -nbB` 로 통일, bcrypt ($2y$) 형식.
  4. KEEP_PROJECT=1 의 bind mount dangling source (debug 보강) — trap 의 `rm -rf` 도 보류, 운영자 manual cleanup 으로 debug 가능.
- 회귀 baseline: TS 4 packages `tsc --noEmit` clean (변경 파일 영향 없음), build-server node:test **131/131 동일** (backend 변경 0), build-monitor vitest **135/135 동일** (frontend 변경 0), Go 8 packages 모두 PASS (TASK-073 baseline 유지), svelte-check 0/0, `e2e-registry-push.sh` **ALL PASS** (~3-4 분: httpd:alpine pull 20s + registry:2 cold start 5-10s + build-server healthcheck 30s + cli push lifecycle ~30-60s + cleanup). catalog `{"repositories":["docker-image-builder-system/cli"]}` + tags list 에 buildId 노출 + bonus 인증 부재/잘못된 credential 모두 401.

## 3.9 Credential rotation e2e (TASK-075)
- 의도: TASK-074 의 htpasswd 인증 환경에서 htpasswd + config.json 의 auths entry 를 runtime 중 갱신해도 docker CLI + registry 가 새 credential 로 push 동작함을 검증. 운영자가 rotate 시점에 알아야 할 두 가지 운영 규약도 정립: (a) htpasswd 갱신 후 registry container restart 필수, (b) htpasswd 와 config.json 둘이 어긋나면 즉시 unauthorized.
- 핵심 변경:
  - `apps/build-server/scripts/e2e-credential-rotation.sh` 신규 — 9 단계 + 보너스 2 (busybox/registry warm-up → 초기 credential v1 셋업 → compose up → registry healthy → build-server healthy → runner registered → 첫 build (v1) push 통과 → htpasswd v2 + config.json v2 갱신 → SIGHUP+restart fallback → 두 번째 build (v2) push 통과 → 옛 credential 401 → 새 credential catalog 정상 + 두 buildId tags 노출).
  - 사전 결함 + 보강 4건 동시 봉인 (운영 가이드 §5):
    1. htpasswd file 0444 read-only 가 갱신 시 Permission denied (silent fail 위험) → `update_htpasswd()` 가 `chmod 0644` 후 redirect + `chmod 0444` 재부착.
    2. `submit_and_wait()` 함수의 stdout 이 buildId 와 progress log 가 혼합 → log() helper + `>&2` redirect, stdout 에는 buildId 만.
    3. **registry:v2 가 htpasswd file 의 container-runtime 갱신을 즉시 반영 안 함** — SIGHUP 시도 → 안 되면 restart fallback. 운영 환경 credential rotation workflow 의 보안 결함(옛 credential 이 cache 기간 동안 동작) 명시화.
    4. v2 credential 갱신 후 옛 credential 의 즉시 무효화 → restart 후엔 즉시 401 보장 (htpasswd cache 가 새 file 로 reset).
  - `docs/operations/credential-rotation-2026-07-07.md` 운영 가이드 신규 (검증 결과 / 사용 절차 / 9 단계 매트릭스 / 사전 결함 4건 / 빠른 재현 / 운영 환경 credential rotation playbook).
- 회귀 baseline: TS 4 packages `tsc --noEmit` clean (변경 파일 영향 없음), build-server node:test **131/131 동일** (backend 변경 0), build-monitor vitest **135/135 동일** (frontend 변경 0), Go 8 packages 모두 PASS (TASK-074 baseline 유지), svelte-check 0/0, `e2e-registry-push.sh` (TASK-074) **ALL PASS** (회귀 baseline 유지), `e2e-credential-rotation.sh` (TASK-075) **ALL PASS** (~3-4 분: httpd:alpine pull 20s + registry:2 cold start 5-10s + build-server healthcheck 30s + cli push v1 ~30s + htpasswd 갱신 + SIGHUP+restart ~10s + cli push v2 ~30s + cleanup). catalog `{"repositories":["docker-image-builder-system/cli"]}` + tags list build_v1+build_v2 둘 다 노출 + bonus 옛 credential 401 + 새 credential 정상.

> ⚠ **TASK-074 / TASK-075 superseded by TASK-076 (insecure-registry-only)** — 사용자 결정 ("htpasswd 제외") 에 따라 TASK-076 가 htpasswd / REGISTRY_AUTH=htpasswd / credential rotation 을 모두 제외한 insecure-registry 운영 모델로 supersede. `e2e-registry-push.sh` (TASK-074) 와 `e2e-credential-rotation.sh` (TASK-075) 는 git history 에 보존되지만 운영 운영의 canonical 은 §3.10 의 `e2e-insecure-registry.sh`. 운영 가이드 §5 의 결함 발견 (registry:v2 htpasswd cache 즉시 reload 안 함) 이 본 TASK 의 motivation 이었지만, insecure-registry 모델에서는 htpasswd 자체가 없어 결함 자체도 회피됨.

## 3.10 Insecure-registry only 운영 패턴 (TASK-076)
- 의도: htpasswd / REGISTRY_AUTH=htpasswd / credential rotation 을 모두 제외하고 `registry:2` 의 anonymous access 모드만 운영 — internal network (VPC / k8s service mesh) 으로 외부 노출을 차단하고 권한 분리는 upstream access control (k8s RBAC / docker daemon ACL / network policy) 에서 처리. 이 모델이 운영 부담 0 / 단순함 / image lifecycle 단순화 의 장점으로 TASK-074/075 의 htpasswd 모델을 supersede.
- 핵심 변경:
  - `compose.dev.e2e-insecure-registry.yaml` 신규 — `REGISTRY_AUTH` env 미설정 (anonymous access) + `REGISTRY_STORAGE_DELETE_ENABLED=true` + `${HOST_REGISTRY_AUTH_DIR}` volume 제거 + htpasswd 인증 환경 일체 제거.
  - `apps/build-server/scripts/e2e-insecure-registry.sh` 신규 — 8 단계 + 보너스 (busybox/registry warm-up → HOST_REGISTRY_CONFIG 셋업 / insecure-registries 만, auths 없음 → compose up → registry healthy (`/v2/` 200 — anonymous access) → build-server healthy → runner registered → **5 build 동시 push** (per-build unique source archive — build_idx 가 Dockerfile 의 RUN line content 에 반영되어 manifest digest 가 build 별 unique) → image retention 검증 (catalog + tags list 노출 → DELETE API 로 1 tag 삭제 → 다른 4 tag 영향 없음 확인) → [bonus] retention 후 새 build push — storage 재사용).
  - `apps/build-server/scripts/e2e-registry-push.sh` (TASK-074), `e2e-credential-rotation.sh` (TASK-075) 삭제 — htpasswd 모델로 canonical 운영은 insecure-registry only 로 supersede. git history 에 보존.
  - `compose.dev.e2e-registry.yaml` (TASK-074) 삭제 — htpasswd 환경 전용. `compose.dev.e2e-insecure-registry.yaml` 가 supersede.
  - `docs/operations/registry-push-2026-07-07.md` (TASK-073) + `registry-push-auth-2026-07-07.md` (TASK-074) + `credential-rotation-2026-07-07.md` (TASK-075) 삭제 — htpasswd 모델 운영 가이드. `insecure-registry-only-2026-07-07.md` 가 supersede.
  - `docs/operations/insecure-registry-only-2026-07-07.md` 운영 가이드 신규 — internal network 격리 + image lifecycle 운영 패턴 (k8s Deployment + NetworkPolicy + CronJob 의 self-contained 검증).
- 사전 결함 + 보강 3건 (운영 가이드 §5):
  1. **동일 Dockerfile 의 5 build 가 manifest digest 가 동일 → 1 tag DELETE = 모든 tag 영향** (TASK-076 의 핵심 발견). 운영자가 같은 Dockerfile 의 build 5 개 push 후 가장 오래된 1 개를 retention 으로 지우면 가장 최근 4 개까지 영향 — 보존해야 할 build 들까지 사라지는 silent failure. 해결: e2e 가 build_idx 를 Dockerfile 의 RUN line 에 주입해 per-build unique source archive — 같은 busybox base image 라도 layer content 가 build 별 다름 → manifest digest unique → DELETE 가 target tag 한정. **운영 권고**: image 의 `LABEL build_id=$CI_COMMIT_SHA` 또는 build time 의 `RUN echo "Build: $(date +%s)"` 같은 unique content 보장.
  2. **curl `-I` (HEAD) 가 Docker-Content-Digest header 를 안 보냄** — registry:2 가 GET 요청에서만 digest header emit. 해결: `curl -sS -D - -o /dev/null` 패턴 — `-D -` 가 response header 를 stdout 으로 dump, `-o /dev/null` 가 body 는 discard.
  3. **submit_and_wait 의 per-build source archive 가 mktemp cleanup 으로 source archive 까지 삭제** — `per_src="$(mktemp -d)"` 후 `rm -rf "${per_src}"` 를 source archive 생성 직후에 호출 → upload 가 0 bytes. 해결: `rm -rf "${per_src}"` 를 upload / build lifecycle 완료 후로 이동.
- 회귀 baseline: TS 4 packages `tsc --noEmit` clean (변경 파일 영향 없음), build-server node:test **131/131 동일** (backend 변경 0), build-monitor vitest **135/135 동일** (frontend 변경 0), Go 8 packages 모두 PASS (TASK-075 baseline 유지), svelte-check 0/0, `e2e-insecure-registry.sh` ALL PASS (~3-4 분: registry:2 cold start 5-10s + build-server healthcheck 30s + 5 build 동시 push ~30-60s + retention 검증 ~5s + cleanup). catalog `{"repositories":["docker-image-builder-system/cli"]}` + tags 5 buildId 다 노출 (per-build unique manifest digest) + DELETE 202 Accepted (target tag 만 삭제, 다른 4 tag 영향 없음) + retention 후 새 build push 통과.

## 3.11 Admin-initiated runner registration (TASK-077)
- 의도: TASK-069 의 self-register on first claim 은 runner 가 boot 되어 첫 `POST /builds/claim` 호출 시점에 비로소 admin registry 에 record 가 생성. 운영자가 신규 cluster / k8s pod / EC2 instance 에서 runner 를 띄우기 전 그 runner 가 곧 들어온다는 것을 admin UI 에 미리 알릴 수 없었음. 본 TASK 가 봉인하는 `POST /admin/runners` endpoint + admin UI 의 "+ Register Runner" 버튼이 그 gap 을 매움.
- 핵심 변경:
  - `packages/shared-contract/src/build/runner-registry.ts` amend — `adminRunnerRegisterRequestSchema` (runnerId 만, strict) + `adminRunnerRegisterResponseSchema` (adminRunnerSchema wrap). empty / extra field / type mismatch → 400 (strict schema).
  - `packages/db` schema 변경 없음 (기존 `runner` table 그대로 사용).
  - `apps/build-server/src/routes/admin-routes.ts` amend — `POST /admin/runners` endpoint 신규. 401 (X-Admin-Id missing) / 403 (non-admin) / 400 (invalid body) / 409 (duplicate) / 201 (created) 응답.
  - `apps/build-server/src/services/build-service.ts` amend — `createAdminRunner(runnerId)` method.
  - `apps/build-server/src/repositories/{memory,postgres}-build-repository.ts` amend — `createAdminRunner()` method (memory: `Map.has` check, postgres: `INSERT … ON CONFLICT DO NOTHING` — atomic). 반환 타입: `{ kind: "created"; runner }` / `{ kind: "duplicate" }`.
  - `apps/build-server/src/app/openapi.ts` amend — `AdminRunnerRegisterRequest` + `AdminRunnerRegisterResponse` component 등록 + POST path 등록 (201/400/401/403/409).
  - `apps/build-monitor/src/lib/api.ts` amend — `createAdminRunner(adminId, body)` helper + `AdminRunnerRegisterRequest/Response` type re-export.
  - `apps/build-monitor/src/components/RegisterRunnerModal.svelte` 신규 — runnerId input + Enter/Escape 키보드 / backdrop click → close. 성공시 (201) close + onSuccess, 실패 (400/401/403/409) 시 inline error 표시 + modal 유지.
  - `apps/build-monitor/src/routes/AdminRunners.svelte` amend — page-head 의 `page-head-actions` div 에 "+ Register Runner" 버튼 + `<RegisterRunnerModal bind:open={registerModalOpen} onSuccess={refresh} />`. submit 성공시 `refresh()` 호출.
- 사전 결함 + 보강 4건 (운영 가이드 §5):
  1. **strict schema 의 extra fields 거부** — zod `.strict()` 가 admin 의 typing 실수를 400 으로 거부. backend 가 새 field 를 받기 전 contract 정합성 보장.
  2. **self-register 와의 race condition 방지** — postgres `ON CONFLICT DO NOTHING` / memory `Map.has` 가 atomic. 어느 한 쪽이 success, 다른 한 쪽이 409.
  3. **admin UI 의 modal close vs error 표기 policy** — error 시 modal 닫지 않음 (재시도 가능). 성공시에만 close + refresh.
  4. **`runnerId` 가 `RUNNER_ID` env 와 일치해야 함** — modal 의 modal-help 가 명시. 운영자가 mismatch 를 사전에 알 수 있도록.
- 회귀 baseline: TS 4 packages `tsc --noEmit` clean (변경 파일 영향 없음), build-server node:test **131 → 139 PASS** (8건 신규: 401/403/400 empty/400 extra/201 created/409 duplicate/409 self-then-admin/200 list), build-monitor vitest **135 → 140 PASS** (5건 신규: button visible/modal opens/success refresh+close/409 modal open/400 modal open), Go 8 packages 모두 PASS (TASK-076 baseline 유지), svelte-check 0 errors (1 warning — modal backdrop 의 a11y click-without-keyboard 핸들러 권장, 무해), `vite build` OK (gzip js 39.46KB / css 6.93KB — RegisterRunnerModal 추가로 +0.22KB / +0.05KB), GitHub Actions `build + smoke` SUCCESS.

## 4. 검증 포인트 (Validation)
- 코드 변경: 현재 단계에서는 해당 사항 없음. 구현 전에는 도메인 경계와 책임 분리가 문서로 먼저 확정되어야 함
- 문서 변경: README, `docs/sdlc/01-mvp-onboarding.md`, `docs/sdlc/02-concept-refinement.md`, `docs/sdlc/contracts/01-shared-build-contract-baseline.md`, handoff, backlog, state가 같은 현재 focus와 canonical 상태 모델을 가리켜야 함
- UI 변경: 해당 사항 없음. 테스트 runtime 또는 결과 조회 UI 논의가 생기면 별도 기준 정의
- 배포/운영: Docker 실행 권한, 테스트 runtime 노출 정책, 컨테이너 수명 정책, 외부 배포 경로가 문서로 합의되기 전에는 운영 판단 금지

## 5. 예외 규칙 (Policy)
- 병합: 현재 단계에서는 구현보다 컨셉 문서 정합성을 우선한다
- 승인: Docker 보안 정책, registry 연동, 테스트 runtime 노출 정책, 외부 배포 대상 정책은 운영자 승인 필요
- 제약: Postgres smoke는 통과했지만 Drizzle migration artifact 생성/운영 규칙은 아직 고정되지 않았다
- 기타: 현재 다음 단계는 postgres 경로를 기본 개발 경로로 승격할지 결정하고, `Runner -> Host Server API only`, `Host Server -> PostgreSQL only` 경계 위에서 Runner 연동으로 넘어가는 것이다

## 3.12 React 빌드 mount 운영 패턴 (TASK-093 + TASK-094 + TASK-100 + TASK-101)
- 의도: TASK-075 의 단일 포트 reverse proxy 위에서 Svelte 빌드를 React 빌드로 swap (TASK-093) + Svelte legacy mount 제거 (TASK-094) + App.svelte router 단순화 (TASK-100) + Svelte scaffold 일괄 정리 (TASK-101). frontend rewrite 7-PR 시리즈 + M4.5 8-PR 시리즈 후의 React 단일 SPA 운영 패턴. **React 빌드(`apps/build-monitor/dist-react/`) 만 primary SPA** — `/` + `/assets/*` + `/favicon.svg` + SPA fallback. **Svelte 빌드는 일괄 폐기** (TASK-101).
- 핵심 변경:
  - `apps/build-server/src/app/create-app.ts` `mountBuildMonitorDist` — React `@fastify/static` (decorateReply: true) 만 mount. SPA fallback: 그 외 unknown path → React index.html (`fs.createReadStream` raw stream). `BUILD_MONITOR_DIST_PATH` (Svelte) env + `mountSvelteIndexHtml` helper + `/svelte/*` SPA fallback 모두 삭제 (TASK-094). React 빌드 mount 만 활성.
  - env 단일: `BUILD_MONITOR_REACT_DIST_PATH` (default `apps/build-monitor/dist-react`).
  - `apps/build-monitor/src/` 디렉터리 일괄 폐기 (TASK-101) — App.svelte + components 8 + lib 7 + routes 16 + test 2 + main.ts. Svelte 측 App.svelte 의 routes 정의는 TASK-100 에서 `*` (NotFound) 1개로 단순화 후 TASK-101 에서 App.svelte 자체 일괄 폐기. Svelte 측 entrypoint (`main.ts`) + `tokens.css` + `theme.css` 도 일괄 폐기. React 측 `tokens.css` 가 단일 source-of-truth (TASK-096.5 디자인 토큰 단일화).
  - React 측 `App.tsx` 가 모든 route 의 단일 진입점. react-router-dom v7 `<Routes>` + `<Route>` 매핑 (`/` → `/login` replace, `/login`, `/builds`, `/builds/:buildId`, `/build-request`, `/api-console`, `/admin/{builds,users,admins,runners}`, `*` → `/login` replace). 모든 route 가 React 측 `Header` 공유. TASK-088~101 까지 frontend rewrite + M4.5 8-PR 시리즈 + 디자인 토큰 단일화 + Svelte scaffold 정리.
- 운영 명령 (Build Server 단일 port, React 단일 SPA):
  ```bash
  # 1) React 빌드 생성 (TASK-101: Svelte 빌드 폐기 — React 만 운영)
  (cd apps/build-monitor && ./node_modules/.bin/vite build --config vite.react.config.ts)

  # 2) Build Server 부팅 (React dist 만 검증)
  ./node_modules/.bin/tsc -p packages/{shared-contract,shared-config,db}/tsconfig.json && \
    ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json && \
    BUILD_REPOSITORY_BACKEND=memory \
    node apps/build-server/dist/apps/build-server/src/index.js
  ```
  그 다음 한 port 에서:
  - `curl http://127.0.0.1:3000/` → React index.html (primary SPA)
  - `curl http://127.0.0.1:3000/admin/builds` → React index.html (SPA fallback, `/admin/*` deep link)
  - `curl http://127.0.0.1:3000/api/builds` → Build Server API (307 transparent redirect)
  - `curl http://127.0.0.1:3000/builds/<uuid>` → Build Server 의 `GET /builds/:buildId` route (UUID validation 통과 시 200 JSON; non-uuid 입력 시 500 zod validation)
- 사전 결함 + 보강:
  - `mountBuildMonitorDist` 가 React 만 mount — `@fastify/static` decorateReply decorator 충돌 회피 단순화.
  - `/builds/<id>` direct URL 입력 → Build Server 의 wildcard GET route 가 UUID validation 으로 거절 (500). 운영자는 React BuildDetail 진입은 `/api/builds/<id>` (Build Server 가 응답) 또는 `<Link>` 클릭 사용. 정직한 동작.
- 회귀 baseline: TS 5 packages `tsc --noEmit` clean, build-server node:test **131 → 143 PASS** (TASK-075 baseline 131 + TASK-093 신규 12 + TASK-101 Svelte scaffold 정리 영향 0), build-monitor vitest **130/130 PASS** (TASK-101 Svelte 135 case 일괄 삭제), Go 7 packages 모두 PASS. svelte-check script 제거 (TASK-101 Svelte scaffold 정리).

## 다음에 읽을 문서
- [세션 인계 문서](../ai-workflow/memory/active/session_handoff.md)
- [작업 백로그](../ai-workflow/memory/active/work_backlog.md)
