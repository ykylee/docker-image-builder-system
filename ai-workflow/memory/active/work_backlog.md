<!-- standard-ai-workflow-kit: v0.11.21-beta -->

# 작업 백로그 인덱스

- 문서 목적: 프로젝트의 모든 작업 항목과 날짜별 백로그 링크를 관리한다.
- 범위: 전체 태스크 목록, 우선순위, 진행 상태, 날짜별 기록 연결
- 대상 독자: 개발자, AI 에이전트, 프로젝트 매니저
- 상태: stable
- 최종 수정일: 2026-07-03 (rev 36→37: 문서 정리 세션 진행 중. canonical SDLC 문서, README, legacy 루트 문서, 보고 자료, workflow 메타를 build -> container test -> external deployment -> result delivery 모델 기준으로 재정렬. **rev 37→38: PR #13 self-review follow-up 보완(transaction wrap / FK+DEFAULT / left join / omitempty / openapi 응답 / docker marker guard / EXPIRED 코멘트) 7건 amend commit 으로 봉인. rev 38→39: PR #13 squash merge 합류 sync (main HEAD `56727d3`). rev 39→40: TASK-060 1차 PR 진입 — `BuildDetail.svelte` canonical 4 block (lifecycle / container test / deployment / result delivery) 노출 + `StatusPill.svelte` `lifecycleStatus` prop 추가 + legacy preview section `deprecated` badge 로 분리. 회귀: TS 4 packages clean, Go 9 packages, build-server 52/52, build-monitor svelte-check 0/0. 후속 TASK-060 2차 PR: fixture 갱신 + BuildRow/BuildsList/AdminBuilds/AdminUsers status 매핑 정렬. rev 40→41: PR #14 self-review follow-up 보완 5건 amend (StatusPill 색상 통일 / BuildDetail .kv breakpoint / section 이름 차별화 / Legacy preview 안내문 명확화 / BuildRow lifecycleStatus prop). rev 41→42: PR #14 squash merge 합류 sync (main HEAD `703600f`, CodeWhale overlay `5e597c3` 위에서 rebase 후 squash merge).**)
- 관련 문서: [세션 인계](./session_handoff.md), [프로젝트 프로파일](../../docs/PROJECT_PROFILE.md)

## 1. 운영 원칙
1. 세션 시작 시 인덱스와 최신 백로그 확인
2. **세션 종료 직전(commit 직전) 인덱스 및 Handoff 갱신** — [`../core/global_workflow_standard.md` §8](../core/global_workflow_standard.md) 정합 — `memory 갱신 → commit → push` 순서
3. 모든 작업 상태는 날짜별 백로그에 기록

## 2. 날짜별 백로그
- [2026-07-03](./backlog/2026-07-03.md)
- [2026-07-02](./backlog/2026-07-02.md)

## 3. 전체 작업 상태 요약
- [x] TASK-001: 컨셉 기반 온보딩 및 MVP 작업축 정리
- [x] TASK-002: 컨셉 고도화 및 정책 문서 정리
- [x] TASK-003: 요구사항 도출 및 정제
- [x] TASK-004: Step 04 설계 문서 구조화
- [x] TASK-005: Step 05 진입 기준 및 baseline decision 정리
- [x] TASK-006: Step 06 구현 축 및 workstream 정리
- [x] TASK-007: Step 07 구현 backlog baseline 정리
- [x] TASK-008: PKG-001 공통 계약 기준선 정리
- [x] TASK-009: Build Server 기술 스택 baseline 정리
- [x] TASK-010: 저장소 패키지 구조 초안 정리
- [x] TASK-011: `PKG-002` Build Server request intake 세부 태스크 정리
- [x] TASK-012: `PKG-003` persistence 세부 태스크 정리 또는 코드 스캐폴드 진입 판단
- [x] TASK-013: shared package 코드 스캐폴드 또는 `PKG-004` 조회 계층 세분화 판단
- [x] TASK-014: shared package 또는 API 스캐폴드 진입 판단
- [x] TASK-015: SDLC 리뷰 및 보고 패키지 작성
- [x] TASK-016: 문서 정합성 보정 및 스캐폴드 진입 준비
- [x] TASK-022: workflow 메타 정합성 보강 (commands placeholder, status assessment, report 인덱스, legacy 배너, 2026-07-02 백로그 봉인)
- [x] TASK-023: 워크플로우 skill/MCP 셋업 (워크플로우 온보딩 마무리)
- [x] TASK-024: 리뷰 반영 (08 Build Server=TS / Runner=Go baseline 정합, 09 apps/runner Go 예시·의존방향·PKG-005~007 갱신)
- [x] TASK-033: preview-readiness-checker skill 1종 구현 (Python, 42 tests OK, total 215)
- [x] TASK-034: PKG-005 Runner Claim And Build Phase Skeleton 1차 골격 구현 (claim/phase endpoint 2종 + memory/postgres repo, live smoke 7/7; 누적 회귀 TS 37 + Go 13 + Python 215 = 265/265 OK)
- [x] TASK-035: Go Runner claim loop + phase call (HTTPBuildControlClient + BuildService 4-phase 자동 보고 + Worker loop, 6 phase e2e smoke + Go 10 tests; 누적 회귀 265/265 OK)
- [x] TASK-036: PKG-006 Preview Service Queue And Readiness (4 endpoint + Runner queue/ready 자동 보고, 8 phase e2e smoke + TS 14 + Go 3 신규 tests)
- [x] TASK-032: failure-summary MCP 1종 구현 (Python, 16 tests OK, total 173)
- [x] TASK-031: failure-summary-shaper skill 1종 구현 (Python, 25 tests OK, total 157)
- [x] TASK-030: contract-drift-checker skill 1종 구현 (Python, 25 tests OK, total 132)
- [x] TASK-029: build-log-tail MCP 1종 구현 (Python, 50 tests OK)
- [x] TASK-028: latest-build-status MCP 1종 구현 (Python, 21 tests OK)
- [x] TASK-027: build-status-explainer skill 2종 구현 (Python, 22 tests OK)
- [x] TASK-026: build-request-intake skill 1종 구현 (Python, 14 tests OK)
- [x] TASK-025: 우리 시스템 skill/MCP 후보 정리 및 개발 계획 (docs/sdlc/13)
- [x] TASK-017: shared package / build-server / runner 골격 스캐폴드 및 1차 검증
- [x] TASK-018: 보고자료 재구성 및 기획안 재작성
- [x] TASK-019: 리더 소개용 HTML 보고자료 시각화 재작성
- [x] TASK-020: HTML 시각화 보강 및 오프라인 에셋 내장화
- [x] TASK-021: 발표용 카피 압축 및 승인안 톤 보정
- [x] TASK-022: 백엔드 착수용 기술스택 결정 보정
- [x] TASK-023: 백엔드 개발 계획 수립 및 문서화
- [x] TASK-038: Build Server OpenAPI/Swagger UI + CORS + DESIGN.md 1차안 부착 (PR #5). Fastify 플러그인 3종 (swagger, swagger-ui, @asteasolutions/zod-to-openapi 8.5) 부착, 16 zod schema 의 .meta({ id, description }) 통일, hand-rolled CORS (onRequest + OPTIONS wildcard, @fastify/cors 제외 — ESM/fastify-plugin fp 호환성 문제), CORS_ORIGIN ENV 추가, /openapi.json 10 paths / 17 components.schemas / 4 tags, /docs Swagger UI, docs/DESIGN.md (Stitch v1 spec) 1차안, openapi snapshot test 1종. 회귀 266/266 OK (TS 38 + Go 13 + Python 215).
- [x] TASK-039: Build Monitor frontend 부착 1차 골격 (PR #6). Svelte 5 + Vite + TypeScript 선정 (DESIGN.md §0 Stack), apps/build-monitor 골격 + DESIGN.md tokens.css CSS 변수화 + 4 컴포넌트 (StatusPill/BuildRow/PhaseTimeline/LogStream) + Header + 3 route + lib/api.ts hand-typed 1차 + Vite proxy /api → :3000 + vitest 7/7 (StatusPill 매핑) + svelte-check 0 + vite build OK (gzip 22KB). 회귀 273/273 OK (TS 38+7 + Go 13 + Python 215). openapi-typescript 자동 client / list endpoint / light mode 는 후속 PR.
- [x] TASK-040: Build Server GET /builds list endpoint + openapi-typescript 자동 client (PR #7). Memory + postgres 양쪽 listBuilds (filter status, createdAt desc, cursor pagination, limit max 200). zod BuildListQuery/BuildListResponse schema + .meta. limit 의 z.coerce.number(). build-monitor 측 openapi-typescript 7 + openapi-fetch 0.13 + tsx script (predev/prebuild hook) 로 ./.generated/openapi.d.ts 자동 생성. lib/api.ts 재작성 (SAMPLE_BUILDS 제거, openapi-fetch helper apiGet, BuildLogsResponse inline). BuildDetail nested access (.build.buildId) 수정 + LogStream LogEntry.at → createdAt. svelte-check 0, vitest 8/8 (StatusPill 7 + BuildRow 1), vite build OK (gzip 24KB). 회귀 268/268 OK (TS 42+8 + Go 13 + Python 215). live e2e: vite proxy /api/builds → 3 builds, ?limit=2 → 2 + nextCursor, /api/openapi.json 200.
- [x] TASK-043: Admin UI — `ADMIN_IDS` env (default `admin,yky.lee`) + Build Server `/admin/builds` (모든 owner) + `/admin/users` (per-user rollup). BuildListQuery 와 별도 schema (`AdminListBuildsQuery`/`AdminListBuildsResponse`/`AdminUserBuildSummary`/`AdminUserSummary`) + `Admin` OpenAPI tag. Memory + postgres 양쪽 listBuildsAcrossUsers / listBuildOwners. Header `X-Admin-Id` 가드, 401/403/200. build-monitor: AdminLogin/AdminBuilds/AdminUsers 라우트, Header adminId 분기 (`localStorage.adminId` 분리), BuildRow에 optional owner cell, owner filter 인라인, status chip. vitest 34/34 (AdminLogin 2 + AdminBuilds 4 + AdminUsers 3 + Header 6 + 기존 19), svelte-check 0/0, vite build OK. live e2e: `x-admin-id: admin` 200 / `x-admin-id: alice` 403 / no header 401, `/admin/users` → alice 2 / bob 1 + lastBuildAt, `/admin/builds?requestedBy=alice` → 2 alice builds.
- [x] TASK-044: Bug fix 2건 — (1) Header 즉시 갱신 (apps/build-monitor/src/lib/session.ts 의 userIdStore/adminIdStore writable store, login 시 store.set → 같은 탭 reactive 갱신 + storage 이벤트로 다른 탭 반영), (2) BuildRequest/BuildSummary 의 projectId/repositoryId 를 appName 단일 식별자로 collapse (BuildRequest schema, BuildSummary schema, memory/postgres repo, build-monitor BuildRow/BuildsList/BuildDetail/AdminUsers + generated/openapi.d.ts). Postgres 는 metadata->>'appName' 으로 1차 처리, projectId 컬럼은 빈 string 으로 두고 DB migration (app_name 컬럼 추가 + projectId/repositoryId drop) 은 후속 TODO. 회귀 TS build-server 54/54 + vitest 35/35 + svelte-check 0/0 + Go 13 + Python 215 = 270/270.
- [x] TASK-045: DB schema migration (v0.2 appName 단일 식별자) — packages/db/src/schema/build-request.ts 의 Drizzle 스키마에 `appName: text('app_name').notNull()` 추가 + project_id/repository_id 컬럼 제거. packages/db/src/bootstrap.ts 의 CREATE TABLE build_request 도 동일하게 app_name 만 만들고 legacy 컬럼 만들지 않음 (신규 DB greenfield). brownfield 마이그레이션 SQL `apps/build-server/migrations/0001_app_name.sql` 신규 — `ADD COLUMN IF NOT EXISTS app_name`, 기존 row 의 `metadata->>'appName'` 에서 채우기, NOT NULL 제약, btree 인덱스 `build_request_app_name_idx` + `build_request_requested_by_idx`, legacy project_id/repository_id drop. 모두 idempotent (IF EXISTS/IF NOT EXISTS) — 부분 적용된 상태 재실행 안전. `apps/build-server/src/repositories/postgres-build-repository.ts`: `mapBuildRowToSummary` 가 `row.appName` 직접 사용 (metadata JSONB fallback chain 제거), active-build dedup probe 가 `eq(buildRequestTable.appName, input.appName)` (메타 JSONB 경로 제거), insert 가 `appName: input.appName` 직접 + `metadata: input.metadata` (중복 쓰기 제거). 회귀 TS build-server 54/54 + vitest 35/35 + svelte-check 0/0 + Go 13 + Python 215 = 270/270.
- [x] TASK-046: light mode contrast QA — tokens.css light 모드의 --color-text-muted #94a3b8 → #64748b (canvas #f1f5f9 위 2.7:1 → 4.5:1 WCAG AA OK, AdminLogin/Login 의 .muted/placeholder 가 보이도록), --color-bg-surface-elevated #ffffff → #f8fafc (table row hover / ThemeToggle hover / owner pill 이 surface 와 동일해 묻히던 문제 해결), StatusPill EXPIRED+UNKNOWN fallback --color-text-muted → --color-text-secondary (15% alpha-mix 시 canvas 위 invisible), theme.css :root { color-scheme: dark } + :root[data-theme=light] { color-scheme: light } (native form control/scrollbar 가 모드 따라가기) + ThemeToggle.svelte applyTheme 이 style.colorScheme 도 js-side set (이중 안전망). BuildRow owner-cell border subtle → strong (light 모드 surface-elevated 의 더 강한 contrast). Login/AdminLogin input border-strong 명시 코멘트 (light 모드 canvas 위 1.5:1 → 진한 톤 명시). StatusPill.test.ts EXPIRED+UNKNOWN assertion secondary 로 갱신. ThemeToggle.test.ts 신규 2 케이스 (default dark / toggle light 모두 colorScheme 검증). vitest 35→37 + svelte-check 0/0 + vite build OK (gzip 28.60 KB JS + 4.28 KB CSS, 패치로 약간 증가). 회귀 TS 54 + vitest 37 + Go 13 + Python 215 = 272/272.
- [x] TASK-047: Admin allow-list backend — `createAdminAllowList` mutable Set (default `admin,yky.lee`, env `ADMIN_IDS` parse fallback) + 서버 schema + `X-Admin-Id` 가드 + `/admin/admins` GET/POST/DELETE. BuildService.addAdmin / removeAdmin / listAdmins + memory + postgres repo. seed empty/non-conforming throw. 회귀 build-server 61→68 (4 신규). PR #11 의 backend 축.
- [x] TASK-048: Admin allow-list frontend — `adminAllowListStore` (writable + persistence) + Header auto-enable (`localStorage.adminId` 가 allow-list 에 있을 때만 admin 메뉴 노출) + AdminAdmins.svelte (목록/추가/삭제 UI, regex pre-check `^[a-zA-Z0-9._-]+$`). vitest 35→44 (5 신규). PR #11 의 frontend 축.
- [x] TASK-049: Visual QA scaffolding — apps/build-monitor/scripts/visual_qa/capture.py (Playwright headless login/admin/builds 캡처, baseline/ 디렉터리 PNG, add_init_script 로 user/admin 토큰 주입) + baseline/ .gitkeep + apps/build-monitor/scripts/visual_qa/README.md 운영 메모. 회귀 영향 없음 (스크립트 + baseline 디렉터리). PR #11 의 QA 축.
- [x] TASK-050: Build phase progress timeline — BuildStatusResponse phaseHistory + currentPhase (default [] / null) 신규. in-memory repo transition (createBuild/updatePhase/queueTestDeployment → prev phase push + current 갱신 + terminal null). postgres repo fallback (단일 entry + current emit). PhaseTimeline.svelte 재구현 — canonical 9 phases 전체, completed (success dot + completedAt) / current (primary dot + pulse + startedAt) / pending (subtle dot + '— pending') 구분, FAILED=danger 톤, data-phase attribute. BuildDetail.svelte events={phase,at} → phaseHistory + currentPhase 분리. BuildStatusResponse hand-typed mirror. 회귀 build-server 73/73 (4 신규) + build-monitor 51/51 (5 신규) + Go 13/13 + Python 215/215 + svelte-check 0/0 = 352+ OK. PR #12 squash merge `1af82d0` main 합류 (commit `7c7297f` 메타 sync).
- [x] TASK-051: postgres phase history persistence 보강 (`phase_history` 저장, migration, read path 정렬). `packages/db` schema/bootstrap + `apps/build-server/migrations/0002_phase_history.sql` + postgres repo 공통 timeline helper 반영. 패키지 기준 회귀: `apps/build-server` tests 25/25 OK (`phase-history`, `build-routes`, `memory-preview`), `packages/db` direct `tsc --noEmit` OK.
- [x] TASK-052: shared-contract status/response refactor (preview-era contract → build/test/deploy/result-delivery). canonical/legacy status union 정리, `BuildStatusResponse.lifecycle/image/test/deploy/resultDelivery` 추가, `previewStatus`/`TestDeployment`는 migration shim 유지. 회귀: `packages/shared-contract` direct `tsc --noEmit` OK, `apps/build-server` shared-contract shim test 3/3 OK.
- [x] TASK-053: DB schema split (`build_test`, `deployment_attempt`, legacy preview field 축소). `packages/db`에 `build_test`/`deployment_attempt` schema + bootstrap/index export 추가, `0003_build_test_and_deployment_attempt.sql` migration 추가, `build_request.preview_*`는 legacy shim 주석으로 유지. 회귀: `packages/db` direct `tsc --noEmit` OK, `apps/build-server` direct `tsc --noEmit` OK, focused tests 28/28 OK.
- [x] TASK-054: Build Server repository/service/API refactor. canonical `BuildStatusResponse` population helper 도입, memory/postgres repo 응답에 `lifecycle/test/deploy/resultDelivery` 실제 채움, postgres 는 `build_test` 병행 write 시작. 회귀: build-server direct `tsc --noEmit` OK, focused tests 49/49 OK.
- [x] TASK-055: OpenAPI regeneration and query contract stabilization. `/openapi.json` 재생성 후 `apps/build-monitor/.generated/openapi.d.ts` 갱신, build-monitor `lib/api.ts`가 generated `BuildStatusResponse` alias 사용하도록 정리. 검증: build-monitor direct `tsc --noEmit` OK, `svelte-check` 0/0. `vitest`는 localStorage 미구성 환경으로 기존 실패 지속.
- [x] TASK-056: Runner phase model refactor. runner claim client 의 `default-runner` 하드코딩 제거, claim payload/appName/lifecycleStatus 파싱 정리, duplicate queue preview call 제거, queue/worker/build_service test 기대값 갱신. 회귀: `apps/runner` `go test ./...` 13 passed, build-server focused tests 49/49 OK.
- [x] TASK-057: docker build no-op 제거 및 source prepare/build/test skeleton 고도화. runner docker client 에 `PrepareSource` + `BuildImage` skeleton 모드 도입, workspace/source marker/Dockerfile/build-manifest 실제 생성, `cli` 모드에서 `docker build` 시도 가능, BuildService 가 source prepare 후 phase 보고하도록 정리. 회귀: `apps/runner` `go test ./...` 15 passed, build-server focused tests 49/49 OK.
- [x] TASK-058: container test result reporting
- [x] TASK-059: external deployment adapter v1
- [x] PR #13 self-review follow-up 보완 (race / schema 정확성 / spec 일관성 7건): `reportPreviewStatus` / `reportDeploymentResult` `db.transaction` wrap, `getTestDeployment` `build_test` left join 으로 `host`/`hostPort`/`internalPort`/`runtimeUrl` 노출, `0003_build_test_and_deployment_attempt.sql` 에 `DEFAULT gen_random_uuid()` + `build_id REFERENCES build_request(id) ON DELETE CASCADE` FK, `apps/runner` claim 응답 `Reason` `omitempty`, OpenAPI `POST /builds/:buildId/deployment` 200 응답 `buildStatusResponseSchema` ref, `docker.BuildImage` marker 기반 idempotent guard 로 ProcessClaim 의 중복 `PrepareSource` 제거, memory repo EXPIRED case 코멘트 보강. 회귀: TS 4 packages clean, Go 9 packages OK, build-server focused 52/52, build-monitor tsc + svelte-check 0/0. workflow meta 동기화 (state rev 65→66, handoff 44→45, work_backlog 37→38, backlog §46→47 + 새 §48) 같은 amend commit 에 포함.
- [ ] TASK-060: Build Monitor status model/UI refactor (1차 PR: BuildDetail canonical 4 block + StatusPill lifecycleStatus + legacy preview 분리. 2차 PR: fixture + BuildRow/BuildsList/AdminBuilds/AdminUsers status 매핑)
- [ ] TASK-061: Skill/MCP contract rename and payload refactor
- [ ] TASK-062: stdio transport 정리 및 generated contract 재동기화
- [x] TASK-063: roadmap/progress 운영 규칙 도입 (Step 15 로드맵/마일스톤/진척 관리 기준선 정리)
- [ ] TASK-064: smoke / migration / visual QA baseline 정리
- [x] TASK-065: CodeWhale overlay 배포 — standard_ai_workflow v0.11.22 (cf0060d, v0.10.4) 가 추가한 CodeWhale 하네스를 본 저장소에 적용. `render_codewhale_skill()` (bootstrap_lib.harnesses.renderers) 직접 호출로 `.codewhale/skills/codewhale-workflow/SKILL.md` 단일 파일 emit. Constitution additive rule 만 포함 (Constitution Article II/III/Regulations/Statutes 와 중복 주입 금지). 기본 검증 명령 (lint/type_check/quick_test) 은 state.json 의 real commands 주입 (tsc --noEmit 4 packages + apps/runner go build). full bootstrap (`bootstrap_workflow_kit.py --harness codewhale`) 은 memory state docs (state.json / session_handoff.md / work_backlog.md / daily_backlog / assessment) 를 덮어쓰려 하므로 우회 — 기존 AGENTS.md / MiniMax.md / 메모리 8종 보존. 메모리 sync: state rev 61→62, handoff 34→35, work_backlog 35→36. 회귀 영향 없음 (신규 1 파일, 기존 entry point 무변경). 후속: 첫 CodeWhale 세션에서 SKILL.md 가 `.codewhale/skills/` 로 인식되는지 + 검증 명령이 동작하는지 확인. (TASK 번호는 merge 충돌 해소 과정에서 미점유 번호 TASK-065 로 재배치.)
