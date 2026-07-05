<!-- standard-ai-workflow-kit: v0.11.21-beta -->

# Session Handoff

- Purpose: Compact restore context for the next AI agent session.
- Scope: current focus, task status, key changes, next actions, risks
- Audience: AI agents, maintainers
- Status: draft
- Updated: 2026-07-05 (rev 60→61: TASK-069 runner registry v1 + admin menu main 합류 회수 (`beb49f0`). 23 신규 build-server test + 4 build-monitor test + 5 Go canonical test 모두 PASS. drift checker 13 sync group (TS↔Python↔Go) RUNNER_STATUSES 신규 추가 포함 missing=0 extra=0. 다음: TASK-068 real deploy adapter 진입.) (rev 54→55: TASK-061 self-review amend 4건 봉인 후 sync. PR #17 에 fix commit (single source-of-truth 보강 + dead branch 정리) 추가. 회귀 221/221 PASS 유지. 다음: PR #17 squash merge. rev 56→57: TASK-062 Go canonical contract mirror PR #18 진입. 회귀 Python 226/226 + Go 6 packages 모두 PASS. 다음: PR #18 self-review 후 squash merge.) [**rev 57→58: TASK-064 smoke / migration / visual QA baseline 진입. branch `codex/task-064-ops-baseline-2026-07-04` 에 5 축 — (1) vitest localStorage 환경 보강 (vite.config.ts `environmentOptions.jsdom.url` + setup.ts JSDOM fallback + jsdom.d.ts) + chipFilter 단일 source-of-truth + success-exclusion 보강 (40 failed → 0, vitest 60/60); (2) `packages/db/src/migrate.ts` + 8 tests (schema_migrations 테이블 + 한 transaction 씩 idempotent + --dry-run/--to flag) + `apps/build-server/src/app/create-app.ts` postgres boot 시 자동 통합 + `apps/build-server/scripts/migrate.ts` standalone CLI; (3) `scripts/smoke.sh` 5 단계 (memory backend PASS); (4) `apps/build-monitor/tests/visual/diff.py` Pillow 기반 per-channel histogram diff + 5 unit test + README 재작성; (5) `docs/operations/smoke-and-migration.md` 8 섹션 신설. 회귀: TS 4 packages clean, packages/db migrate 8/8, apps/build-server focused 27/27, apps/runner go 17 packages, apps/skill_mcp 226/226, apps/build-monitor vitest 60/60, scripts/smoke.sh memory PASS. drift 54 pre-existing (TASK-064 변경 전후 동일, canonical §4~§8 잔재, follow-up). 다음: PR #19 self-review 후 squash merge. **rev 58→59: TASK-066 Runner source archive fetch + real docker build PR #20 squash merge main 합류 (`3930f12`). 5 commit 구조 (`47b83a9` → `bc60458` → `4189677` e2e+meta → `1f86b46` self-review fix 3건 → `ac41866` 보완 5 area) — Build Server `build_source` memory/postgres `bytea` + POST/GET/DELETE `/builds/:buildId/source` 3 endpoint + octet-stream content parser 256 MiB + checksum/size 재계산 + SourceArchiveUploadResponse schema + DELETE RETURNING. Runner `internal/source/fetcher.go` (BuildControlClient.DownloadSource + tar.gz extract + validateTarEntryName absolute/`..`/NUL/control/backslash reject + transport-error 1 retry + cleanup) + `docker.BuildImage(ctx, buildID, sourceDir, dockerfileRelPath)` signature (scratch Dockerfile 제거) + BuildService.ProcessClaim fetcher wire-up. 보완: validateTarEntryName unit 16 case + DELETE route 5 case + memory e2e 7/7 + postgres e2e 5/5 (신규 `e2e-source-archive-postgres.sh` bytea round-trip 직접 verify) + PROJECT_PROFILE docs. rebase: TASK-064 (`5265844`) 가 main 에 머지된 후 state.json + work_backlog.md 충돌 2건 해결 (TASK-064 컨텍스트 + TASK-066 merge entry 모두 보존). 회귀 baseline: TS 4 packages clean, build-server 94/94 PASS (TASK-066 11 신규 = POST/GET 6 + DELETE 5), Go 7 packages 모두 PASS (fetcher 5 + validateTarEntryName 16 unit), packages/db migrate 11/11, Python skill_mcp 동일, e2e memory 7/7 + e2e postgres 5/5. 다음: TASK-067 (container run + healthcheck) 또는 TASK-068 (real deploy adapter) — branch 생성 대기. **rev 59→60: TASK-067 Runner container run + healthcheck 1차 PR 작성. branch `codex/task-067-container-run-healthcheck-2026-07-05` (main `957da99` base). 신규 `docker.Client.RunContainer/WaitForHealth/StopContainer` + `ContainerStatus` / `ContainerRunOptions` + RunContainer skeleton mode (mock 정합 38124) + cli mode (real `docker run -d --name -p` + `docker inspect` host port auto-assign + OS ephemeral port fallback via `pickFreePort` + `net.Dial` TCP probe + HTTP 2xx probe + consecutive-3 stability polling + `ErrContainerHealthcheckTimeout` sentinel) + BuildService.ProcessClaim 통합 (queueTestDeployment 후 RunContainer + WaitForHealth + ReportPreviewReady 에 ContainerStatus 그대로 전달, RUNNER_STOP_CONTAINER_ON_DONE=true 시 defer StopContainer) + 신규 env (RUNNER_DOCKER_RUN_MODE / RUNNER_HEALTHCHECK_PATH / RUNNER_HEALTHCHECK_TIMEOUT_SECONDS) + `apps/runner/scripts/e2e-container-run.sh` (Build Server memory backend 부팅 + busybox/scratch Dockerfile + source archive upload + Runner cli mode + docker ps lifecycle 확인 + Build Server status readback + cleanup) + 테스트 8 신규 (docker 6 + build_service 2). 회귀 baseline: TS 4 packages clean, Go 7 packages 모두 PASS, build-server 94/94 동일, Python skill_mcp 226/226 동일. 다음: PR 오픈 → self-review → squash merge → 후속 TASK-068 (real deploy adapter).**])
- Related docs: [Project Profile](../../docs/PROJECT_PROFILE.md), [Work Backlog](./work_backlog.md)

## Session wrap-up note
- 본 세션은 사용자 요청 ('codewhale 용 배포를 docker-image-builder-system 에 하자') 으로 시작. 상위 standard_ai_workflow 가 v0.11.22 (cf0060d) 에서 추가한 CodeWhale 하네스를 본 저장소에 적용. `render_codewhale_skill()` 직접 호출 (full bootstrap 의 메모리 파일 overwrite 회피) 로 `.codewhale/skills/codewhale-workflow/SKILL.md` 단일 파일 emit. memory sync (state rev 61→62, handoff 34→35, work_backlog 35→36) 와 함께 단일 commit. 신규 code 없음, 회귀 영향 없음. 다음 PR #13 (TASK-017 stdio + TASK-037 sweeper + admin owner block-delete) 및 TASK-051 postgres phase_history column 진행 가능.
- 사용자 후속 요청으로 PR #13 (`codex/task-056-pr-prep-2026-07-03` → `main`, 87 files / +4546 / −4197, TASK-051~059 + TASK-063 묶음) 을 오픈한 뒤 self-review 를 진행. PR #13 에 self-review follow-up 보완 7건을 amend commit (`dc45b60`) 으로 묶어 머지 차단 이슈를 0건으로 닫고, gh pr merge --squash 로 main 에 합류 (`56727d3`). 본 sync commit 으로 workflow 메타 (state rev 66→67, handoff 45→46, work_backlog 38→39, backlog index 20→21 / latest 24→25) 를 main 에 동기화.
- 이후 TASK-060 (Build Monitor status/UI refactor, M4 진입) 1차 PR (`codex/task-060-build-monitor-ui-refactor-2026-07-03`) 으로 `BuildDetail.svelte` canonical 4 block (lifecycle / container test / deployment / result delivery) 노출 + `StatusPill.svelte` `lifecycleStatus` prop + `BuildRow.svelte` `lifecycleStatus` forwarding + legacy preview section `deprecated` badge 분리. self-review follow-up 보완 5건 (success 색상 통일 / .kv breakpoint / section 이름 차별화 / 안내문 명확화 / BuildRow lifecycleStatus) amend commit (`457856c`) 으로 봉인. rebase (CodeWhale overlay `5e597c3` 이후) + squash merge.

## Latest wrap-up note (2026-07-05)

- TASK-067 (Runner container run + healthcheck) PR #21 squash merge main 합류 (`574932d`). branch `codex/task-067-container-run-healthcheck-2026-07-05` (main `957da99` base), 2 commit 구조 (`fe15ebb` 본 PR + `d025b18` self-review fix). 신규 surface: `docker.Client.RunContainer/WaitForHealth/StopContainer` + `ContainerStatus/ContainerRunOptions` + skeleton mode (mock 정합 38124) + cli mode (real `docker run -d --name -p` + `docker inspect` host port auto-assign + pickFreePort OS ephemeral fallback + `net.Dial` TCP probe + HTTP 2xx probe + consecutive-3 stability polling + `ErrContainerHealthcheckTimeout` sentinel). BuildService.ProcessClaim 통합: queueTestDeployment 후 RunContainer + WaitForHealth + ReportPreviewReady 에 ContainerStatus 그대로 전달 + `RUNNER_STOP_CONTAINER_ON_DONE=true` 시 `defer StopContainer(context.Background(), ...)` (parent ctx cancel 영향 차단). 신규 env 4종 — `RUNNER_DOCKER_RUN_MODE` / `RUNNER_HEALTHCHECK_PATH` / `RUNNER_HEALTHCHECK_TIMEOUT_SECONDS` / `RUNNER_STOP_CONTAINER_ON_DONE` + `BuildService.WithHostPort(int)` test seam + `apps/runner/scripts/e2e-container-run.sh` (Build Server memory backend 부팅 + busybox/scratch Dockerfile + source archive upload + Runner cli mode + docker ps lifecycle 확인 + status readback + cleanup, `docker info` 실패 시 graceful skip).
- self-review fix 3건 봉인 — `TestPickFreePortReturnsEphemeral` 추가 (pickFreePort 가 OS ephemeral port 1..65535 emit 직접 검증, dead code escape) + `TestProbePortAndHealth` 의 hand-rolled `fmtSscan`/`strconvErr` 제거 후 stdlib `strconv.Atoi` 교체 (가짜 "import cycle" 명목 폐기) + client.go 의 cli mode + inspect-fail path 주석 정직화 ("probe :0 으로 재시도 가능" 거짓 정정 → 실제는 `pickFreePort` 기반 host-port pre-allocation 권장 + 후속 port-collision retry TASK 와 함께 도입).
- 회귀 baseline: TS 4 packages clean, Go **64/64 PASS** (직전 63 + pickFreePort 신규 1), build-server 94/94 동일, Python skill_mcp 226/226 동일. e2e live container smoke 는 본 머지에서 추가 안 함 — 1차 PR self-review 시 docker daemon 미설치 환경 graceful skip 만 검증, 실제 7단계 live smoke 는 `bash apps/runner/scripts/e2e-container-run.sh` (사용자 측 live 실행).
- 다음: **TASK-068 (real deploy adapter) 진입** — M3 (Runner Realignment) 의 마지막 축. 현재 `apps/runner/internal/deploy/client.go` 의 skeleton adapter (deploy-result.json emit 만) 를 실제 외부 deploy target 으로 연결. 후보: docker registry push / compose / k8s / GitHub Pages (codewhale 영역 이식 결과물) 등. 사용자가 정할 사항 (target 선택 + scope 정의).
- 메타 sync — state rev 80→81, handoff 59→60, work_backlog 53→54, backlog 2026-07-03 → 2026-07-05 § 신규. main HEAD `574932d` clean. PR #21 branch `--delete-branch` 자동 삭제 완료.

## Current Doc Cleanup Note
- 사용자 요청에 따라 SDLC 문서 정리를 이어가며 preview-first 서사를 build -> container test -> external deployment -> result delivery 서사로 정렬했다.
- 이번 정리에서 핵심 수정 문서는 `docs/sdlc/02-concept-refinement.md`, `docs/sdlc/13-skills-and-mcp-plan.md`, `docs/sdlc/decisions/03-preview-auth-policy.md`, `docs/PROJECT_PROFILE.md`다.
- `rtk grep` 재검증 결과 `docs/sdlc/03-requirements-baseline.md`의 preview URL 2건만 의도적으로 남겼다. 해당 문구는 "여전히 가능한 운영 모델이지만 핵심 MVP 산출물은 아님"이라는 예외 설명이다.
- 2차 정리에서 `README.md`, legacy 루트 문서 6종, `docs/report/01-assignment-plan.md`, `docs/report/02-sdlc-review-report.html`, `ai-workflow/memory/active/repository_assessment.md`, 여러 SDLC 제목/관련 링크도 함께 정합화했다.

## Current Planning Note
- 문서 정합성 보정 이후, 구현 코드 refactor 와 기능 개발을 함께 관리하기 위해 `docs/sdlc/15-refactoring-roadmap-and-milestones.md`를 신설했다.
- active roadmap 은 `M1 Contract Reset -> M2 Build Server Refactor -> M3 Runner Realignment -> M4 Consumer Refactor -> M5 Deployment Capability` 순서다.
- 새 backlog 축은 `TASK-051`~`TASK-064`이며, `TASK-051`~`TASK-059`는 완료되었고 현재 추천 active queue 는 `TASK-060`, `TASK-061` 또는 현재 기준선 PR 정리다.

## Current Implementation Note
- `TASK-059`에서 external deployment adapter v1 을 추가했다.
- `packages/shared-contract`는 `DEPLOYMENT_STARTED`, `DEPLOYMENT_COMPLETED`, `DeploymentReportRequest`를 받도록 확장됐다.
- Build Server 는 `/builds/:buildId/deployment` route 와 `deployment_attempt` persistence 를 연결했고, `getBuild` read-path 도 `deployment_attempt` left join 으로 canonical `deploy` / `resultDelivery` block 을 실제 채운다.
- Runner 는 `apps/runner/internal/deploy/client.go` skeleton adapter 를 통해 workspace 아래 `deploy-result.json`을 생성하고, deploy in-progress / success 를 Host Server 로 순차 보고한다.
- OpenAPI regenerated 후 `apps/build-monitor/.generated/openapi.d.ts`를 갱신했고, build-monitor direct typecheck + `svelte-check`도 통과했다.
- 회귀: shared-contract direct `tsc --noEmit` OK, `apps/runner` `go test ./...` 17 passed, build-server focused tests 52/52 OK, build-monitor direct `tsc --noEmit` OK, `svelte-check` 0/0.
- `TASK-058`에서 container test result reporting 을 실제 데이터 기반으로 정리했다.
- `packages/shared-contract/src/build/response.ts`의 `TestDeploymentReadyRequest`는 이제 `containerRef`, `healthCheckPassed`, `portOpen`, `stabilityWindowPassed`를 optional 로 받는다.
- Runner `BuildService.ProcessClaim`은 READY 보고 시 위 필드를 함께 전송하고, Host client / service tests 기대값도 갱신했다.
- Build Server `build-status-response.ts`는 previewStatus 추정값만 보지 않고 `build_test` snapshot 을 우선 사용해 canonical `test` block 을 채운다.
- memory repository 는 queue/ready/fail 경로에서 `buildTest` snapshot 을 유지하고, postgres repository 는 `build_test` write/read-path (`left join`) 를 연결했다.
- 회귀: shared-contract direct `tsc --noEmit` OK, `apps/runner` `go test ./...` 15 passed, build-server focused tests 49/49 OK.
- `TASK-057`에서 Runner docker client 가 더 이상 no-op 이 아니게 됐다.
- 기본 `RUNNER_DOCKER_BUILD_MODE=skeleton` 에선 workspace/source marker/Dockerfile/build-manifest 를 실제 생성한다.
- `RUNNER_DOCKER_BUILD_MODE=cli` 로 바꾸면 같은 컨텍스트에 대해 `docker build`를 시도한다.
- `apps/runner` 회귀는 `go test ./...` 기준 15 passed.
- `TASK-056`에서 Runner claim/build flow 를 한 번 더 정리했다.
- `apps/runner/internal/hostclient/build_control_client.go`는 이제 claim payload에 실제 `runnerId`를 보내고, claim 응답에서 `appName/lifecycleStatus`를 파싱한다.
- `ProcessClaim`은 preview queue 를 1회만 호출하고, 그 위에 preview ready / completed 를 순서대로 보고한다.
- `apps/runner` 회귀는 `go test ./...` 기준 13 passed.
- `TASK-055`에서 memory backend build-server를 띄워 `/openapi.json` 기준 `apps/build-monitor/.generated/openapi.d.ts`를 재생성했다.
- build-monitor `src/lib/api.ts`는 더 이상 hand-typed `BuildStatusResponse` mirror 를 쓰지 않고 generated component alias 를 직접 사용한다.
- `TASK-054`에서 `apps/build-server/src/repositories/build-status-response.ts` helper 를 도입해 canonical `lifecycle/image/test/deploy/resultDelivery` 블록을 memory/postgres 응답에 실제 populate 하도록 정리했다.
- postgres repository 는 `build_test`에 병행 write 를 시작했고, `build_request.preview_*`와 `test_deployment`는 migration shim 으로 계속 유지된다.
- build-server focused 회귀 49/49 통과, build-monitor direct `tsc --noEmit` + `svelte-check` 통과.
- build-monitor `vitest`는 현재 localStorage 미구성 환경으로 기존 실패가 재현된다. 이번 변경으로 새 failure 가 추가된 것은 아니다.
- `TASK-053`에서 DB 레벨 canonical split 을 열었다. `packages/db/src/schema/build-test.ts`, `deployment-attempt.ts`, bootstrap DDL, `0003_build_test_and_deployment_attempt.sql`가 추가됐다.
- `build_request.preview_status`, `preview_ttl_minutes`, `preview_url`는 아직 current repository/service code 가 의존하므로 legacy shim 주석과 함께 유지했다.
- `test_deployment` 테이블도 현재 server migration 이 끝나지 않았기 때문에 bootstrap 에서 제거하지 않았다.
- 검증: `packages/db` direct `tsc --noEmit` OK, `apps/build-server` direct `tsc --noEmit` OK, focused tests 28/28 OK.
- `TASK-052`에서 shared-contract status/response 모델을 문서 기준의 build/test/deploy/result-delivery 서사로 넓혔다.
- `packages/shared-contract/src/build/status.ts`에 canonical/legacy status union 과 generic execution status 를 추가했다.
- `packages/shared-contract/src/build/response.ts`에 `BuildLifecycle`, `BuildImage`, `ContainerTestResult`, `DeploymentResult`, `ResultDelivery`와 `BuildStatusResponse.lifecycle/image/test/deploy/resultDelivery`를 추가했다.
- 기존 `previewStatus`, `previewUrl`, `TestDeployment`는 deprecated migration shim 으로 유지해 현재 build-server/build-monitor 구현이 바로 깨지지 않게 했다.
- 검증: `packages/shared-contract` direct `tsc --noEmit` OK, `apps/build-server/tests/shared-contract-response.test.ts` 3/3 OK, `apps/build-server` direct `tsc --noEmit` OK.
- `TASK-051`에서 postgres fallback timeline 을 제거하고 `build_request.phase_history` persisted history 를 기준으로 `BuildStatusResponse.phaseHistory/currentPhase`를 구성하도록 정리했다.
- `packages/db/src/schema/build-request.ts`, `packages/db/src/bootstrap.ts`, `apps/build-server/migrations/0002_phase_history.sql`가 같은 schema shape 를 가리키도록 맞췄다.
- `apps/build-server/src/repositories/phase-history.ts` helper 를 기준으로 claim/phase update/preview queue/preview ready 흐름이 모두 같은 transition 규칙을 사용한다.
- 회귀: `apps/build-server` package 기준 `phase-history`, `build-routes`, `memory-preview` tests 통과. `packages/db` direct `tsc --noEmit` 통과.
- `pnpm exec` 기반 검증은 현재 workspace 의 `ERR_PNPM_IGNORED_BUILDS` 정책 때문에 install 단계에서 막히므로 direct binary 호출로 우회했다.

## Current PR #13 Self-Review Follow-up
- `reportPreviewStatus` 와 `reportDeploymentResult` 는 본래 transaction 밖에서 `build_request` update + `build_test` / `deployment_attempt` upsert + `build_log` insert 를 따로 실행. partial failure 시 build 가 half-reported 상태가 될 수 있어 두 함수 모두 `db.transaction` 으로 wrap. 동시에 마지막 read 도 transaction 안에서 `leftJoin` 한 번으로 통일해 응답의 canonical `test` / `deploy` / `resultDelivery` block 이 항상 가장 최근 upsert 와 정합하도록 보장.
- `apps/build-server/migrations/0003_build_test_and_deployment_attempt.sql` 의 `build_test` / `deployment_attempt` 테이블에 `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` 와 `build_id UUID NOT NULL REFERENCES build_request(id) ON DELETE CASCADE` 를 추가. Drizzle schema (`packages/db/src/schema/build-test.ts`, `deployment-attempt.ts`) 의 `defaultRandom()` 와 정합하고, build 가 삭제될 때 test / deployment row 도 함께 정리되어 orphaned row 가능성을 차단.
- `apps/build-server/src/repositories/postgres-build-repository.ts` 의 `getTestDeployment` 가 `build_test` left join 으로 `host` / `hostPort` / `internalPort` / `runtimeUrl` 를 노출. `getBuild` 의 canonical `ContainerTestResult` 와 응답 정합.
- `apps/runner/internal/hostclient/build_control_client.go` 의 `claimResponseBody.Reason` 에 `omitempty` 를 추가. server 의 `z.enum([...]).nullable()` 가 빈 string 을 invalid 로 거부하던 잠재 회귀 차단.
- `apps/build-server/src/app/openapi.ts` 의 `POST /builds/{buildId}/deployment` 200 응답에 `buildStatusResponseSchema` ref 를 명시. 실제 응답은 `BuildStatusResponse` 이므로 spec 정확성 회복.
- `apps/runner/internal/docker/client.go` 의 `BuildImage` 가 marker (`src/source-prepared.txt`) 기반 idempotent guard 로 변경. `BuildService.ProcessClaim` 의 happy path 에서는 `PrepareSource` 가 먼저 호출되어 marker 가 있으니 skip. 단독 호출 (테스트 등) 에서는 marker 가 없으니 `PrepareSource` 호출.
- `apps/build-server/src/repositories/memory-build-repository.ts` 의 `reportPreviewStatus` EXPIRED case 주석 보강 — preview TTL 만료이지 build 자체의 terminal 이 아니며, phaseHistory 도 push 하지 않는다.
- 회귀: TS 4 packages clean, Go 9 packages OK (docker 패키지는 marker guard 분기 추가로 재실행), build-server focused 52/52, build-monitor tsc + svelte-check 0/0. PR #13 의 머지 차단 이슈 0건.

## Current Focus (TASK-064)

- TASK-064 smoke / migration / visual QA baseline 작업 중. PR #19 (branch `codex/task-064-ops-baseline-2026-07-04`) 에 5 축 동시 진행.
- vitest 60/60 green (frontend test baseline 복원). build-server 가 postgres boot 시 `applyMigrations` 자동 호출. standalone CLI 로 dry-run / 부분 적용 가능. `scripts/smoke.sh` memory PASS. `apps/build-monitor/tests/visual/diff.py` + `test_diff.py` 5/5.
- `docs/operations/smoke-and-migration.md` 8 섹션 운영 가이드 신설. workflow meta sync (state rev 77→78, handoff 57→58, work_backlog 48→49) 같은 PR 안에 포함.
- 다음: PR #19 self-review → squash merge → canonical §4~§8 baseline 잔재 정리 (drift 54) 또는 stdio transport 별도 PR.

## Current Focus

- SDLC 문서의 중심 모델을 preview 제공에서 build, container test, external deployment, result delivery 폐루프로 전환했다.
- Step 02 / Step 13 / baseline decision 03 / Project Profile 이 같은 용어 체계를 가리키도록 다시 맞췄다.
- README, 보고 패키지, legacy 루트 문서를 더 이상 source-of-truth 경쟁자가 아니라 canonical 문서 포인터 또는 발표 자료로 역할 분리했다.
- 이제 다음 작업의 중심은 Build Monitor status/UI refactor (`TASK-060`), Skill/MCP contract rename (`TASK-061`), 또는 현 상태 기준 PR 정리다.
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
