<!-- standard-ai-workflow-kit: v0.11.21-beta -->

# Session Handoff

- Purpose: Compact restore context for the next AI agent session.
- Scope: current focus, task status, key changes, next actions, risks
- Audience: AI agents, maintainers
- Status: draft
- Updated: 2026-07-03 (rev 29→30: PR #11 squash merge `343f78c` main 합류. 회귀 342+ OK. 브랜치 codex/admin-auto-manage-2026-07-03 정리. 다음 PR #12 — BuildPhase timestamps (startedAt / completedAt) shared-contract + 서버 repos + PhaseTimeline.svelte 재구현 (전체 phase 표시, 완료/진행/미진행 구분, completedAt / updatedAt 타임스탬프). 후속 PR #13 — TASK-017 stdio + TASK-037 sweeper + admin owner block-delete.) server schema + DELETE path param + createAdminAllowList seed validation (empty/non-conforming throw) + in-process add 검증 + client-side pre-check in AdminAdmins.svelte. capture.py 정리 (imports / add_init_script 위치 / dead ternary). baseline/ .gitkeep. 회귀 build-server 68/68 + build-monitor 46/46 + Go 13/13 + Python 215/215 = 342+ OK. 다음 후속: PR #11 merge, PR #12 (TASK-017 stdio + TASK-037 sweeper + admin owner block-delete), visual QA PNG baseline 실측, 운영자 마이그레이션 수동 적용.) commit/push — backend createAdminAllowList mutable Set + /admin/admins GET/POST/DELETE + frontend adminAllowListStore + Header auto-enable + AdminAdmins.svelte + visual QA capture.py. 회귀 build-server 61/61 + build-monitor 44/44 + Go 13/13 + Python 215/215 = 333+ OK. 다음 후속: (a) PR #11 merge, (b) PR #12 — TASK-017 stdio transport + TASK-037 sweeper + admin owner block-delete, (c) visual QA PNG baseline 실측, (d) 운영자 마이그레이션 수동 적용.). 회귀 319+ OK. 브랜치 codex/light-mode-qa-2026-07-03 정리. 다음 후속: (a) light mode visual QA (Playwright headless), (b) TASK-017 stdio, (c) TASK-037 sweeper, (d) admin owner block-delete.). Login/AdminLogin input border 흐릿 문제 토큰 1곳에서 해결. 회귀 319+ OK.). vitest 35→37. 회귀 272/272. PR #10 예정. 다음 후속: TASK-017 stdio / TASK-037 sweeper / admin owner block-delete.
- Related docs: [Project Profile](../../docs/PROJECT_PROFILE.md), [Work Backlog](./work_backlog.md)

## Current Focus

- 요구사항 기준선, Step 04 설계 문서 6종, Step 05 baseline decision 5종, Step 06~12 구현 세분화 문서가 모두 정리되었다.
- Build Server P0 범위는 `PKG-001`~`PKG-004` 기준으로 구현 착수 가능한 수준까지 분해되었다.
- SDLC 리뷰 문서, 과제 계획안, 보고용 HTML 자료가 추가되었다.
- root 개념 문서와 workflow 메타 문서를 `docs/sdlc/` 및 shared contract canonical source 기준으로 정합성 보정했다.
- 보고용 HTML 자료를 검토 결과 보고서가 아니라 구현 착수 기획안 톤으로 재작성했다.
- 과제 계획안을 Build Server 착수 메모에서 프로젝트 개요 중심 기획안 문서로 전면 재구성했다.
- 보고용 HTML 자료를 리더 소개용 slide deck 구조로 다시 재작성하고 개요/구성/흐름 도식을 추가했다.
- 보고용 HTML 자료에 CSS 시각 강화와 인라인 SVG 에셋을 추가해 오프라인 완결형 자료로 보강했다.
- 보고용 HTML 자료의 카피를 더 짧은 승인안 톤으로 압축했다.
- 현재 다음 착수점은 shared package 또는 API 스캐폴드다.

- 표준 워크플로우 키트 prototype skill/MCP를 우리 프로젝트 운영에 active/deferred로 묶고, Codex 측 진입 메모와 additive MCP 스니펫을 운영 폴더 미러 위치에 정리했다.
- `TASK-017`에서 root workspace, shared packages, `apps/build-server`, `apps/runner` 최소 골격과 1차 smoke 검증까지 완료했다.
- `apps/build-server`는 이제 `BUILD_REPOSITORY_BACKEND=memory|postgres` 두 경로를 가지며, `postgres`는 schema auto-bootstrap, insert/query, duplicate `409`까지 live smoke를 통과했다.
- Runner 는 Host Server API 만 바라보고 PostgreSQL 은 Host Server 만 직접 접근하는 경계로 고정했다.
- 현재 next focus는 P0 skill 2종 + P0 MCP 2종 (총 107 tests) 이 PR #3 로 main 에 합류된 직후 단계다.
- 후속 후보: (a) P1 skill 1종 (`failure-summary-shaper`) 또는 (b) TASK-017 의 stdio transport 활성화로 4종 MCP 를 real process 로 잇는 일.

## Work Status

- TASK-001 컨셉 기반 온보딩 및 MVP 작업축 정리: done
- N/A: blocked
- TASK-002 컨셉 고도화 및 정책 문서 정리: done
- TASK-003 요구사항 도출 및 정제: done
- TASK-004 Step 04 설계 문서 구조화: done
- TASK-005 Step 05 진입 기준 및 baseline decision 정리: done
- TASK-006 Step 06 구현 축 및 workstream 정리: done
- TASK-007 Step 07 구현 backlog baseline 정리: done
- TASK-008 PKG-001 공통 계약 기준선 정리: done
- TASK-009 Build Server 기술 스택 baseline 정리: done
- TASK-010 저장소 패키지 구조 초안 정리: done
- TASK-011 `PKG-002` Build Server request intake 세부 태스크 정리: done
- TASK-012 `PKG-003` persistence 세부 태스크 정리 또는 코드 스캐폴드 진입 판단: done
- TASK-013 shared package 코드 스캐폴드 또는 `PKG-004` 조회 계층 세분화 판단: done
- TASK-014 shared package 또는 API 스캐폴드 진입 판단: done
- TASK-015 SDLC 리뷰 및 보고 패키지 작성: done
- TASK-016 문서 정합성 보정 및 스캐폴드 진입 준비: done
- TASK-018 보고자료 재구성 및 기획안 재작성: done
- TASK-019 리더 소개용 HTML 보고자료 시각화 재작성: done
- TASK-020 HTML 시각화 보강 및 오프라인 에셋 내장화: done
- TASK-021 발표용 카피 압축 및 승인안 톤 보정: done
- TASK-023 워크플로우 skill/MCP 셋업: done
- TASK-017 shared package / build-server / runner 골격 스캐폴드 및 1차 검증: done

## Key Changes

- PR #11 follow-up (rev 29): Header.svelte adminLogout 4-space → 2-space. adminId charset 정규식 (^[a-zA-Z0-9._-]+$) server schema + DELETE path param + createAdminAllowList seed validation (empty/non-conforming throw) + in-process add 검증 + client-side pre-check. capture.py 정리 (dead imports / add_init_script 위치 / dead ternary). baseline/ .gitkeep 추가 (PNG binary 비tracked 명시). 회귀 342+ OK.

- PR #11 (TASK-047/048/049) (rev 28): backend createAdminAllowList (mutable Set, seed[0] protected) + GET/POST/DELETE /admin/admins. frontend adminAllowListStore (Svelte writable + api helpers) + Header auto-enable (userId 가 admin list 에 포함되면 admin menu 자동 노출) + AdminAdmins.svelte (/admin/admins 라우트, add/remove UI, seed badge). TASK-047 visual QA capture.py (Playwright headless 두 모드 PNG diff) + baseline 디렉터리. 회귀 333+ OK.

- PR #10 squash merge (rev 27): TASK-046 light mode contrast QA 1차 + follow-up. tokens 4종 (muted 5.36:1 AA 통과, border-strong 3.28:1 UI 통과, surface-elevated vs canvas 1.17:1, disabled 2.64:1) light contrast 완성. Login/AdminLogin input border 토큰 변경으로 해결. 회귀 319+ OK.

- TASK-046 follow-up (rev 26): light 모드 토큰 4종 추가 조정. muted 5.36:1 AA 통과, border-strong 3.28:1 UI 통과, surface-elevated vs canvas 1.17:1 분리, disabled muted보다 옅게 2.64:1. Login/AdminLogin input border 코멘트도 토큰 변경 결과 반영으로 갱신.

- `docs/sdlc/01-mvp-onboarding.md` 추가
- `docs/sdlc/02-concept-refinement.md` 추가
- `docs/sdlc/03-requirements-baseline.md` 추가
- `docs/sdlc/04-design-structure.md` 추가
- `docs/sdlc/design/01-system-context-and-responsibilities.md` 추가
- `docs/sdlc/design/02-domain-model-and-state-transitions.md` 추가
- `docs/sdlc/design/03-api-contract-design.md` 추가
- `docs/sdlc/design/04-data-model-design.md` 추가
- `docs/sdlc/design/05-build-and-preview-execution-flow.md` 추가
- `docs/sdlc/design/06-user-messaging-and-failure-handling.md` 추가
- `docs/sdlc/05-design-closure-and-step-05-entry.md` 추가
- `docs/sdlc/SRS/01-priority-matrix.md` 추가
- `docs/sdlc/SRS/02-functional-requirements.md` 추가
- `docs/sdlc/SRS/03-non-functional-requirements.md` 추가
- `docs/sdlc/SRS/04-policy-and-constraints.md` 추가
- `docs/sdlc/SRS/05-open-issues-and-decisions.md` 추가
- `docs/sdlc/SRS/06-mvp-must-requirements.md` 추가
- `docs/sdlc/decisions/` 추가
- `docs/sdlc/06-implementation-axis-and-workstreams.md` 추가
- `docs/sdlc/07-implementation-backlog-baseline.md` 추가
- `docs/sdlc/contracts/01-shared-build-contract-baseline.md` 추가
- `docs/sdlc/08-build-server-tech-stack-baseline.md` 추가
- `docs/sdlc/09-repository-package-structure-baseline.md` 추가
- `docs/sdlc/10-pkg-002-build-server-request-intake-breakdown.md` 추가
- `docs/sdlc/11-pkg-003-build-server-persistence-breakdown.md` 추가
- `docs/sdlc/12-pkg-004-build-server-query-api-breakdown.md` 추가
- `docs/review/01-sdlc-review.md` 추가
- `docs/report/01-assignment-plan.md` 추가
- `docs/report/02-sdlc-review-report.html` 추가
- `docs/report/01-assignment-plan.md` 기획안 톤 정리
- `docs/report/01-assignment-plan.md` 프로젝트 개요 중심 구조로 전면 재작성
- `docs/report/02-sdlc-review-report.html` 기획안형 전면 재작성
- `docs/report/02-sdlc-review-report.html` 리더 브리프형 slide deck으로 전면 재작성
- `docs/report/02-sdlc-review-report.html` CSS 및 인라인 SVG 기반 오프라인 완결형 시각 자료로 보강
- `docs/report/02-sdlc-review-report.html` 발표용 승인안 카피로 압축
- `docs/GLOSSARY_AND_STATE_MODEL.md` 정합성 보정
- `docs/IDENTITY_MODEL.md` 정합성 보정
- `docs/sdlc/SRS/04-policy-and-constraints.md` stale 제약 보정
- `ai-workflow/memory/active/repository_assessment.md` 최신화
- `docs/PROJECT_PROFILE.md` 최신화
- `README.md`, `docs/PROJECT_PROFILE.md`를 제품 컨셉 기준으로 정렬
- `ai-workflow/memory/active/repository_assessment.md` 추가

- `docs/PROJECT_PROFILE.md` §3 명령 placeholder를 Step 08/09 baseline 기준으로 좁힘
- `ai-workflow/memory/active/state.json` `commands` 5종과 `next_documents`를 그룹 코멘트와 함께 갱신
- `ai-workflow/memory/active/project_status_assessment.md` 진단 요약/매트릭스/로드맵 본문 작성
- `docs/report/README.md` 신규 추가 (산출물 정체와 진화 이력 인덱스)
- `docs/MVP_ONBOARDING.md`, `docs/CONCEPT_REFINEMENT.md` 상단에 superseded 배너 추가
- `ai-workflow/memory/active/backlog/2026-07-02.md` TASK-013/014/016 본문 done 봉인 + 후속 세션 노트 추가
- `ai-workflow/memory/active/session_handoff.md`의 `Next Actions`/`Risks & Blockers` 갱신, MiniMax overlay 후속 점검 1줄 추가
- `docs/sdlc/08-build-server-tech-stack-baseline.md` rev 2: Build Server=TS / Runner=Go baseline 정합, polyglot 보류항목 정리
- `docs/sdlc/09-repository-package-structure-baseline.md` rev 2: `apps/runner` Go (`go.mod`/`cmd/runner`/`internal/...`) 예시, 의존방향 cross-language 정합, PKG-005~007 Go 경로 갱신
- `ai-workflow/memory/active/state.json` rev 25: current_focus=TASK-024, done 카운트 23
- `ai-workflow/memory/active/work_backlog.md` TASK-024 추가, TASK-017 planned 유지
- `ai-workflow/memory/active/backlog/2026-07-03.md` §8 TASK-024 섹션 추가
- `ai-workflow/memory/active/session_handoff.md` rev 4: TASK-024 work status, Key Changes, Next Actions 보강
- root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` 추가
- `packages/shared-contract`, `packages/shared-config`, `packages/db` 스캐폴드 추가
- `apps/build-server` Fastify skeleton (`/health`, `POST /builds`, `GET /builds/:buildId`, `GET /builds/:buildId/logs`) 추가
- `apps/runner` Go skeleton (`go.mod`, `cmd/runner`, `internal/...`) 추가
- direct `tsc` + `node` + `go build` 기반 1차 검증 경로를 `docs/PROJECT_PROFILE.md`에 반영
- `packages/shared-config`에 `BUILD_REPOSITORY_BACKEND`, `DB_AUTO_BOOTSTRAP` runtime 설정 추가
- `packages/db` schema 확장 (source archive size, preview TTL, metadata, last error) 및 `ensureDbSchema` bootstrap helper 추가
- `apps/build-server`에 `PostgresBuildRepository`와 backend 선택 로직 추가
- Colima + Docker + `docker-image-builder-postgres` (`127.0.0.1:15432`) 기준 live Postgres smoke 통과
- `apps/runner`의 DB 직접 접근 skeleton 을 제거하고 `internal/hostclient` 기반 Host Server API client skeleton 으로 전환
- `codex/skills-mcp-dev-2026-07-03` 브랜치를 main 으로 rebased 것으로 총 4개 신규 커밍을 squash 해서 PR #3 로 링크 예정
- TASK-034 PKG-005 Host Server 1차 골격: shared-contract 에 claimRequest/claimResponse/phaseUpdateRequest 3종 schema, BuildRepository 2 method (claimNextBuild/updatePhase) + memory/postgres 동시성 안전 구현, BuildService + 2 endpoint (POST /builds/claim, POST /builds/:buildId/phase)
- TASK-035 PKG-005 Go Runner: HTTPBuildControlClient (claim/phase 실제 호출, 2-depth nesting 처리) + BuildService.ProcessClaim 4 phase 자동 + worker ticker loop + 10 Go tests
- TASK-036 PKG-006 Preview Queue + Readiness: 5종 schema (testDeployment/Queue/Ready/Status), BuildRepository 3 method (queueTestDeployment/reportPreviewStatus/getTestDeployment), 4 endpoint, Runner queue 2회 + ready 1회 자동 보고 (8 phase e2e)
- 누적 회귀 265/265 OK (TS 37 + Go 13 + Python 215), 브랜치 `codex/backend-build-queue-2026-07-03` 10 commits (push 완료, PR 미오픈)

## Next Actions

- [ ] memory fallback 을 계속 기본값으로 둘지, postgres 를 기본 개발 경로로 승격할지 결정
- [ ] build-server 산출물 경로(`dist/apps/build-server/src/index.js`)를 단순화할지 검토
- [ ] Runner 가 소비할 Host Server claim/report API shape 를 닫고 skeleton client를 실제 호출로 연결 (`PKG-005`)
- [ ] `POST /builds`, `GET /builds/{id}`, `GET /builds/{id}/logs` 응답을 persistence 운영 기준으로 더 정교화 (`PKG-002`, `PKG-003`, `PKG-004`)
- [ ] shared-contract 의 Go 측 generated binding 전략 결정
- [ ] `OI-008`, `OI-009`, `OI-006` 후속 decision 착수 여부 결정
- [ ] `MiniMax.md`, `MiniMax_config.example.json` vendor-specific overlay 점검 (MiniMax 하네스 환경에서 별도 진행, 본 세션에서는 기록만)
- [x] TASK-034/035/036 일괄 PR #4 오픈 (`codex/backend-build-queue-2026-07-03` → main) — squash merge 완료 (5d023a7), 회귀 265/265 OK
- [ ] TASK-037 PKG-007 Preview Cleanup Policy Binding (TTL 만료 sweeper) — TASK-036 의 expiresAt 활용
- [x] TASK-038: Build Server OpenAPI/Swagger UI + CORS + DESIGN.md 1차안 부착 (PR #5). /openapi.json 10 paths + 17 components.schemas + 4 tags, /docs Swagger UI, hand-rolled CORS, DESIGN.md 1차안. 회귀 266/266 OK. 후속: frontend Vite+React 작업 또는 TASK-017 stdio transport 활성화.
- [ ] docker.BuildImage 실제 구현 (Docker SDK + SOURCE_PREPARED/DOCKER_BUILD_STARTED 사이 실제 image build) — 현재 noop
- [ ] Postgres testDeployment host/hostPort/expiresAt/internalPort 컬럼 정밀화 (1차 골격은 null 응답)

- [x] TASK-039: Build Monitor frontend 부착 1차 골격 (PR #6) 완료. Svelte 5 + Vite + TypeScript.
- [x] TASK-041: Build Monitor 프론트엔드 프리미엄 디자인 적용 완료. Light/Dark 모드 대응, Glassmorphism, Micro-animations 추가 (theme.css, tokens.css 전면 개편 및 UI 컴포넌트 프리미엄화).
- [x] TASK-042: 진입 페이지(Login.svelte) 추가. 사용자 ID 입력 및 `localStorage` 기반 간이 세션 구성, 헤더 내 사용자 ID 및 로그아웃 버튼 반영, 빌드 목록 필터링 연동.

- [x] TASK-040: Build Server GET /builds list endpoint + openapi-typescript 자동 client (PR #7). Memory + postgres 양쪽 listBuilds (filter status, cursor pagination, limit max 200). zod BuildListQuery/BuildListResponse schema + .meta. build-monitor 측 openapi-typescript 7 + openapi-fetch 0.13 + tsx script (predev/prebuild hook) 로 ./.generated/openapi.d.ts 자동 생성. lib/api.ts 재작성 (SAMPLE_BUILDS 제거, openapi-fetch helper apiGet, BuildLogsResponse inline). 회귀 268/268 OK (TS 42+8 + Go 13 + Python 215). live e2e: vite proxy /api/builds → 3 builds, ?limit=2 → 2 + nextCursor.

## Next Actions

- [ ] memory fallback 을 계속 기본값으로 둘지, postgres 를 기본 개발 경로로 승격할지 결정
- [ ] build-server 산출물 경로(`dist/apps/build-server/src/index.js`)를 단순화할지 검토
- [ ] Runner 가 소비할 Host Server claim/report API shape 를 닫고 skeleton client를 실제 호출로 연결 (`PKG-005`)
- [ ] `POST /builds`, `GET /builds/{id}`, `GET /builds/{id}/logs` 응답을 persistence 운영 기준으로 더 정교화 (`PKG-002`, `PKG-003`, `PKG-004`)
- [ ] shared-contract 의 Go 측 generated binding 전략 결정
- [ ] `OI-008`, `OI-009`, `OI-006` 후속 decision 착수 여부 결정
- [ ] `MiniMax.md`, `MiniMax_config.example.json` vendor-specific overlay 점검
- [ ] TASK-037 PKG-007 Preview Cleanup Policy Binding (TTL 만료 sweeper)
- [ ] docker.BuildImage 실제 구현
- [ ] Postgres testDeployment host/hostPort/expiresAt/internalPort 컬럼 정밀화
- [ ] admin owner 차단/삭제/메모 (후속 결정)

## Risks & Blockers

- 애플리케이션 코드와 실행 명령이 아직 없어서 구현 backlog가 문서 수준 추정치에 머물러 있다.
- `docs/MVP_ONBOARDING.md`, `docs/CONCEPT_REFINEMENT.md`는 superseded 배너를 부착했지만 실제로는 archive로 이동하지는 않았다. archive 이동은 본 브랜치 범위에서 제외했고, 후속 TASK에서 처리한다.
- `.git`이 read-only로 마운트된 환경에서 작업해 writable clone(`/home/yklee/repos/docker-image-builder-system.work`)으로 커밋을 작성했다. 사용자 측에서 원본 저장소로 옮기는 절차가 필요하다.
- 저장소 root의 `.codex/`, `.agents/`는 권한상 read-only로 잠겨 있어, 본 TASK의 진입 메모와 MCP 스니펫은 `ai-workflow/memory/active/.codex/`, `ai-workflow/memory/active/.agents/` 미러 위치에 둔다. 권한이 풀리면 root로 이동 검토.
- 표준 키트 prototype의 실제 MCP transport는 미구현이므로 active MCP 3종은 `transport_ready=false` 상태에서 동일 계약의 수동 절차로 운영한다.
- `pnpm -r check` 는 현재 환경에서 `ERR_PNPM_IGNORED_BUILDS` 정책에 걸릴 수 있다. 이 저장소의 1차 검증 경로는 direct `tsc` + `go build` + HTTP smoke 로 우회 중이다.
- Colima 기반 Postgres smoke는 통과했지만, 컨테이너 lifecycle 과 migration artifact 운영 규칙은 아직 문서화/자동화되지 않았다.
- TASK-036 의 Postgres testDeployment 응답은 host/hostPort/expiresAt/internalPort 가 null (buildRequestTable 컬럼 미보유). 별도 table 또는 컬럼 추가가 후속.
- docker.BuildImage 가 noop — 실제 image build / docker run / docker stop 후속. 현 단계에서는 phase 흐름만 canonical contract 와 정합.
- phase 자동 status 전이 휴리스틱 (DOCKER_BUILD_STARTED→BUILDING 등) 단순 매핑. canonical phase machine 도입 시 invalid_transition 분기 활용.
- Preview queue 2회 호출은 idempotent retry 의도였으나 interface 정돈 필요 (단일 queue + status 매핑).
