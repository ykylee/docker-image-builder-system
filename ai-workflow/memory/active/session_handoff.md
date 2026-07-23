<!-- standard-ai-workflow-kit: v0.15.19-beta -->

# Session Handoff

- Purpose: Compact restore context for the next AI agent session.
- Scope: current focus, task status, key changes, next actions, risks
- Audience: AI agents, maintainers
- Status: stable (TASK-120 정합)
- Updated: 2026-07-23 (rev 157→158: **Doc-sync — v0.2.1 의 진짜 범위(TASK-156~160/P2-M1)를 운영자/사용자가 볼 수 있도록 문서 동기화**).

  ## 동기화 대상 4건
  1. **`CHANGELOG.md` §2** — v0.2.1 표에 TASK-156/157 행 추가 + 신규 §2.1a "동일 release cycle 의 후속 refactor (TASK-158~160, P2-M1)" 절 신설. 운영자 영향(migration 0007 / 응답 필드 2종 제거 / API 계약 정렬) 명시.
  2. **`docs/RELEASE_NOTES-2026-07-23.md` §8** — TASK-156 e2e·visual CI / TASK-157 runner e2e hard assertion / TASK-158~160 P2-M1 5건의 의도·변경·검증·follow-up 을 v0.2.1 직후 후속 작업으로 통합.
  3. **`docs/DESIGN.md` §2 Predictability** — StatusPill 배지 정책 표에서 legacy status(`CLAIMED` / `TEST_READY` / `PREVIEW_*`) 제거 후 canonical(`PREPARING_SOURCE` / `CONTAINER_TEST_STARTED`) 로 정렬 + `PHASE-2-CONCEPT.md` §P2-M1 cross-reference.
  4. **`docs/PHASE-2-CONCEPT.md` §8 진입 전 결정 대기** — 시점 명시(2026-07-23, P2-M1 완료 / P2-M2 진입 직전) + 결정별 *(미정)* / *(결정됨)* 표기.

  ## 검증
  `scripts/check-doc-integrity.sh` staged 검사 **PASS**(4건 모두 통과). 회귀 baseline / 코드 / SQL / schema / migration / version / git tag 변경 0 — docs only.

  ## 의도적으로 손대지 않은 곳
  `PROJECT_PROFILE.md`(state.json SSOT 정합), `Step 15 로드맵`(historical 사료), `Phase 1 회고`(Phase 1 종료 시점 회고라 TASK-158 이후 미포함), SDLC 결정 문서들(P2-M2 에서 재검토 후 정정).

  workflow meta sync (state purpose_digest_rev 199→200, handoff_rev 121→122, task_count 66→67, work_backlog 115→116) 같은 commit.

- Updated: 2026-07-23 (rev 156→157: **P2-M1 완료 — Step 3 legacy 응답 필드 + DB 컬럼 제거 (TASK-160)**).

  ## 제거한 것
  `buildSummary.previewStatus` / `buildRequest.previewTtlMinutes` / DB 컬럼 `preview_status`·`preview_ttl_minutes`(**migration 0007**) / dead `packages/db/src/schema/test-deployment.ts`(사용처 0).

  ## 핵심 설계 — buildTestResult 를 canonical 전용으로 축소
  이전에는 `buildTest` 가 없으면 legacy `previewStatus` 로 폴백했다. **memory·postgres 양쪽 다 `build_test` 를 채우므로** 폴백이 불필요했다(근거: `test.healthCheckPassed` 는 canonical 분기에서만 나오는 값인데 e2e 가 True 를 실측한다). 이제 buildTest 부재 = 아직 테스트 시작 안 함 = `NOT_STARTED`.

  ## 의도적으로 남긴 것 → **P2-M2 로 이월**
  엔드포인트 재설계와 결합돼 분리할 수 없는 것들이다:
  - `previewUrl` — 컨테이너 **런타임 URL 을 나르는 유일한 필드**다. canonical 이름(`runtimeUrl`, `build_test` 컬럼명)으로의 정렬은 test-deployment 엔드포인트와 함께 간다.
  - `previewStatuses` enum — `testDeploymentSchema.status` 가 쓴다.
  - `TestDeployment` 및 queue/ready/status 요청·응답 DTO 일가 — runner 가 실제로 호출하는 **live 엔드포인트의 계약**이다.
  - **임시 어댑터 `executionToPreviewStatus`** (postgres 저장소) — previewStatus 컬럼이 사라져 TestDeployment 응답의 status 를 `build_test` 에서 유도해야 했다. P2-M2 에서 엔드포인트와 함께 제거할 것.
  - `reportPreviewStatus`/`queueTestDeployment`/`getTestDeployment` 메서드명.
  - 참고: `GET /builds/:id/test-deployment` 는 **소비자 0**(build-monitor·skill_mcp·e2e 어디서도 호출 안 함)이고 canonical `test` 블록과 중복이라 **제거 후보**다.

  ## UI
  deprecated "Legacy preview" 섹션 제거 → 런타임 URL 을 canonical **Container test** 블록으로 이동. BuildRequest 폼의 `previewTtlMinutes` 필드 제거.

  ## 검증
  TS 5 clean / build-server **181** / build-monitor **273** / go **8 pkg** / skill_mcp **222** / **e2e 13/13 PASS (290s)**.
  compose postgres e2e 가 migration `0001~0007` 을 적용한 뒤 정상 동작해 컬럼 drop 을 실증한다.

  ## P2-M1 완료 — 다음은 P2-M2 (서버 정렬)
  build-server 의 repository/service/routes/OpenAPI 를 canonical 로 재정렬하고 **test-deployment 엔드포인트 3종을 재설계**한다. 위 "이월" 목록이 그 작업 목록이다.

  workflow meta sync (state 198→199, handoff_rev 120→121, handoff doc 156→157, work_backlog 114→115) 같은 commit.
- Updated: 2026-07-23 (rev 155→156: **P2-M1 Step 2 봉인 — legacy status 제거 (TASK-159)**).

  `legacyBuildStatuses`(CLAIMED, TEST_READY) / `previewStatuses` 정의를 **TS·Go·Python 3계층에서 삭제**하고 사용처를 canonical 로 치환했다 — `CLAIMED → PREPARING_SOURCE`, `TEST_READY → TEST_SUCCESS`.

  ## 과매칭 회피 (Phase 1 교훈 적용)
  `QUEUE_CLAIMED` phase 가 `CLAIMED` 를 **부분문자열로 포함**한다. 그래서 따옴표를 포함한 **정확 매칭**(`"CLAIMED"`)만 치환했고, 치환 후 `QUEUE_PREPARING_SOURCE` 같은 오염이 0 임을 확인했다.

  ## 부수 발견 — StatusPill 배지 정책 충돌
  rename 으로 `CLAIMED`(info)가 기존 `PREPARING_SOURCE`(warning)와 병합되고 `TEST_READY`(info)가 `TEST_SUCCESS` 가 되면서, 테스트가 **자기모순**에 빠졌다(같은 status 가 warning/info 양쪽에, `TEST_SUCCESS` 가 배지/평문 양쪽에). 컴포넌트에 이미 문서화돼 있던 정책 — **`*_SUCCESS` 는 평문**("성공은 기대되는 결과이므로 강조할 이유가 없다", TASK-141) — 에 맞춰 legacy 유래 항목을 제거해 해소했다.

  ## skill_mcp 정리
  `LEGACY_BUILD_STATUSES` export/참조 제거 / `contract_drift_checker` 의 `statusLegacy` 그룹 제거 / 의미를 잃은 `LegacyCompatTests` 4종 삭제.

  ## 검증
  TS 5 clean / build-server **181** / build-monitor **274** / go **8 pkg** / skill_mcp **222** / **e2e 13/13 PASS (313s)**. openapi 재생성 후 legacy 잔존 0.

  ## 다음 — Step 3
  legacy 응답 필드 제거(`previewStatus`/`previewUrl`/`previewTtlMinutes`/`TestDeployment`) + **DB migration 0007**.
  - **주의**: `build_request.preview_status` 가 **NOT NULL** 이라 응답 필드 제거와 migration 을 **동시에** 해야 한다.
  - **설계 근거**: `buildTestResult` 는 canonical `buildTest` 가 있으면 그것을 쓰고 없으면 legacy 로 폴백한다. memory/postgres **양쪽 모두 build_test 를 채우므로** 폴백 제거가 안전하다(실측 `test.healthCheckPassed=True` 는 canonical 분기에서만 나오는 값이다).

  workflow meta sync (state 197→198, handoff_rev 119→120, handoff doc 155→156, work_backlog 113→114) 같은 commit.
- Updated: 2026-07-23 (rev 154→155: **P2-M1 Step 1 봉인 — phase 이름 변경 (TASK-158)**).

  Phase 2 첫 실작업. `PREVIEW_QUEUED`/`PREVIEW_READY` → **`CONTAINER_TEST_STARTED`/`CONTAINER_TEST_PASSED`**.

  ## 의미
  **컨테이너 테스트가 1급 phase 가 됐다.** 제품 목적의 4단계(build → container test → deploy → result delivery) 중 하나가 모델에 존재하지 않던 문제를 해소한 것이 이 작업의 핵심이다.

  ## 범위
  3-way canonical 정의점 + 사용처 = **18 파일 44 출현**:
  - TS `packages/shared-contract/src/build/phase.ts`
  - Go `apps/runner/internal/contract/phase.go` (식별자 `PhasePreviewQueued/Ready` → `PhaseContainerTestStarted/Passed` 포함)
  - Python `apps/skill_mcp/contract/canonical.py`
  - build-server(src+tests) / build-monitor(PhaseTimeline·StatusPill) / e2e 스크립트 / compose

  ## 함정 — `.generated/openapi.d.ts` 재생성 필수
  build-monitor 는 커밋된 `.generated/openapi.d.ts` 를 타입 원천으로 쓴다. 계약만 바꾸고 이걸 안 고치면 **TS2322(옛 enum)** 로 컴파일이 깨진다. 재생성 절차: build-server 재빌드 → 기동 → `tsx scripts/generate-openapi.ts`(= `/openapi.json` fetch). 다음 Step 에서도 동일하게 필요하다.

  ## 검증
  TS 5 packages clean / build-server **181** / build-monitor **277** / go **8 pkg** / skill_mcp **226** / **e2e 13/13 PASS (272s)**.
  production-semantic 이 10 phase 를 `… DOCKER_BUILD_COMPLETED → CONTAINER_TEST_STARTED → CONTAINER_TEST_PASSED → DEPLOYMENT_STARTED …` 로 실증.

  ## 범위 정정 (컨셉 문서 갱신함)
  최초 407 은 **`dist/` 포함** 수치였다. 소스만 재측정하면 **345** — shared-contract/src **26** · build-server 176(src 124+tests 52) · skill_mcp 65 · build-monitor 50 · runner 24 · db 4. **계약 자체는 26 으로 작다.**

  ## 남은 P2-M1
  - **Step 2**: legacy status 제거 — `legacyBuildStatuses`(CLAIMED→`PREPARING_SOURCE`, TEST_READY→`TEST_SUCCESS`) / `previewStatuses` 제거.
  - **Step 3**: legacy 응답 필드 제거(`previewStatus`/`previewUrl`/`previewTtlMinutes`/`TestDeployment`) + **DB migration 0007**. 주의: `build_request.preview_status` 가 **NOT NULL** 이라 응답 필드 제거와 migration 은 **동시에** 가야 한다.
  - 사용자 결정: 외부 소비자 없음 → **즉시 제거**(alias 유예 없음).

  workflow meta sync (state purpose_digest_rev 196→197, handoff_rev 118→119, backlog +1, task_count 63→64, handoff doc 154→155, work_backlog 112→113) 같은 commit.
- Updated: 2026-07-23 (rev 153→154: **TASK-157 runner e2e hard assertion 화 봉인**).

  TASK-156 이 한계로 기록한 "runner 그룹 신호 약함"을 해소했다. P2-M1 진입 전 정지작업.

  ## soft 단언이 가리고 있던 실제 결함 3건
  1. **존재하지 않는 CLI 인터페이스** — e2e 가 `--host`/`--id` 를 넘겼지만 **runner 는 CLI 플래그를 파싱하지 않는다**(`cmd/runner/main.go` 에 flag 처리 없음). 설정은 env(`HOST_SERVER_BASE_URL` 기본 `127.0.0.1:3000` / `RUNNER_ID` 기본 `runner-default`). 인자가 조용히 무시돼 runner 가 엉뚱한 host 로 붙고 claim 이 영구 실패했다.
  2. **통과 불가능한 픽스처** — Dockerfile 에 **서버를 띄우는 CMD 가 없었다**. busybox 기본 CMD 는 `sh` 라 즉시 종료 → 8080 에 아무것도 없음 → healthcheck 필연 timeout.
  3. **대기 예산 부족 + racy 판정** — 30s 는 build+run+healthcheck 에 부족했고, `RUNNER_STOP_CONTAINER_ON_DONE=true` 라 성공해도 컨테이너가 지워져 `docker ps` 기반 판정이 경주였다.

  ## 수정
  env 기반 호출로 교체 / 검증된 픽스처(`e2e-production-semantic` 의 busybox httpd + permissive `A:*`)로 교체 / 판정을 **canonical `test`(ContainerTestResult)** 기준 hard fail 로 전환(기존엔 응답 top-level 에 없는 legacy `testDeployment` 를 읽었다) / deploy-push 는 **registry tag 도달**을 hard assert / `E2E_LOG_DIR`·`E2E_KEEP_LOGS` 로 진단성 확보.

  ## 검증
  `phase=COMPLETED / test.status=SUCCESS / containerRunning=True / healthCheckPassed=True`, deploy-push registry tags 에 buildId 노출. **음성 검증**: `runner-bin` 제거 시 **exit=1**(강화 전엔 vacuous PASS), 복원 시 exit=0. 전체 **e2e 13/13 PASS (294s)** — runner 그룹 97s→15s (이제 timeout 을 기다리지 않고 실제 성공).

  ## P2-M1 에 중요한 부수 발견
  `buildStatusResponseSchema` 에 **canonical 필드 `test`(ContainerTestResult) / `deploy`(DeploymentResult) / `resultDelivery` 가 이미 optional 로 존재**하고, runner 가 `test` 를 실제로 채운다(실측). 즉 **P2-M1 은 신규 구축이 아니라 legacy 표면 제거 + phase 이름 정렬**에 가깝다 — 컨셉 문서의 추정보다 진척이 앞서 있다.

  ## 다음
  **P2-M1 착수** — preview-era 심볼 정리 + `CONTAINER_TEST_*` 1급 승격. 진입 전 결정: deprecated alias 유지 기간.

  workflow meta sync (state purpose_digest_rev 195→196, handoff_rev 117→118, backlog index·latest +1, task_count 62→63, handoff doc 153→154, work_backlog 111→112) 같은 commit.
- Updated: 2026-07-23 (rev 152→153: **Phase 2 개발 컨셉 확정**).

  Phase 1(v0.2.0/v0.2.1) 종료 후 Phase 2 의 축을 정했다. 결과물 = `docs/PHASE-2-CONCEPT.md`.

  ## 축 (사용자 결정)
  **preview-era 청산 → 배포 능력 완성** — 모델 정합을 먼저 하고 그 위에 외부 배포를 올린다. Step 15 로드맵 §3 의 경고("새 기능이 preview-era 구조 위에 쌓이지 않도록 먼저 기반 refactor 를 연다")를 채택.

  ## 실측으로 규명한 격차 4종
  1. **모델이 하이브리드에 정체** — 11 phase 에 `PREVIEW_QUEUED/READY`(preview-era)와 `DEPLOYMENT_*`(신 모델)가 공존. **`CONTAINER_TEST_*` 가 없어 "컨테이너 테스트"가 1급 개념이 아니다** — 제품 목적의 한 단계가 모델에 부재.
  2. **외부 배포 미구현** — `RUNNER_DEPLOY_MODE` 기본 `skeleton`, `cli` 도 레지스트리 push 까지. 제품 목적의 절반.
  3. **AI 에이전트 진입점 동결** — `apps/skill_mcp` 가 TASK-069 이후 미접촉. Phase 1 전체(TASK-088~156)가 안 건드림. `preview_readiness_checker` 등 이름까지 preview-era. 단위 테스트 226 은 통과(죽어있진 않으나 계약 드리프트).
  4. **결과 전달 경로 부재**.

  ## 청산 대상 실측 (407 출현 / 6계층)
  shared-contract **123** / build-server **117** / skill_mcp **77** / build-monitor **50** / runner **28** / db **12**.

  ## 중복 작업 방지 — 이미 끝난 것
  **DB 스키마 분리는 완료**(migration `0003`, TASK-053 으로 `build_test`/`deployment_attempt` 생성). `build_request` 의 `preview_status`/`preview_ttl_minutes`/`preview_url` 은 **의도적 shim**(스키마 주석이 "Retained during TASK-053" 로 명시). 즉 가산은 끝났고 **감산이 남았다**.

  ## 마일스톤
  `P2-M1 계약 청산` → `P2-M2 서버 정렬(+migration 0007)` → `P2-M3 runner 정렬` → `P2-M4 소비자 정렬` → `P2-M5 배포 능력`. contract 선행 원칙 — 계약을 먼저 바꾸면 나머지 드리프트가 TSC 에서 끌려 나온다(TASK-130 자산).

  ## 다음 작업
  **P2-M1** — `PREVIEW_QUEUED/READY` → `CONTAINER_TEST_STARTED/PASSED` 승격, `TestDeployment` → canonical test 모델, `previewUrl`/`TtlMinutes` → optional runtime artifact 격하.

  ## 진입 전 결정 4종 (사용자)
  배포 adapter 1호 대상(compose/k8s/ssh/registry 확장) / 결과 전달 채널 1호(webhook/Slack/Nextcloud Tasks) / deprecated alias 유지 기간 / visual baseline 외부 LFS 정책(Phase 1 이월).

  workflow meta sync (state purpose_digest_rev 194→195, handoff_rev 116→117, phase.phase_2 신규, handoff doc 152→153, work_backlog 110→111) 같은 commit.
- Updated: 2026-07-23 (rev 151→152: **TASK-156 e2e·visual CI/nightly 통합 봉인**).

  v0.2.1 의 프로덕션 결함 2건이 모두 "e2e 를 안 돌리면 잠복" 이었던 사각지대를 자동 검출로 덮었다.

  ## 산출물 4종
  1. **`scripts/run-e2e-suite.sh`** — e2e 13종 그룹 실행(`local` 5 / `compose` 6 / `runner` 2 / `all`). env 정규화(`DOCKER_SOCKET_GID` getent 자동 유도 / `ADMIN_IDS` / `PGPORT` / `DIBS_POSTGRES_HOST_PORT` / `DATABASE_URL`) + 전제 점검(부족 시 exit 3 조기 실패) + `docker_image_builder` DB 자동 생성 + **`runner-bin` 자동 `go build`** + 스크립트 간 `dibs-*` 잔재 정리(TASK-155 이름 충돌 방지) + fail-open 요약.
  2. **`scripts/run-visual-check.sh`** — build-server(memory)+vite 기동 → `capture.py` → **baseline 없이도 유효한 구조 검증 4종**(`capture.py` 의 `ROUTES` 를 단일 출처로 파싱한 라우트 셋 완전성 / 0 byte / dark≠light / modal≠base) + 선택적 `--baseline` 픽셀 diff.
  3. **`.github/workflows/nightly-e2e.yml`** — cron **04:00 UTC**(b-layer 03:00 과 1h 분리) + main push(14 경로 필터) + `workflow_dispatch`(group, run_visual). e2e 잡: postgres service(trust) + node20/pnpm10.15/go1.22 + 빌드 산출물 준비 → wrapper → 로그 artifact. visual 잡: setup-chrome + pip playwright → wrapper → PNG artifact(14일).
  4. **`docs/operations/e2e-visual-ci-2026-07-23.md`** — 8 섹션 운영 가이드.

  ## 발견 — runner e2e 2종은 신호가 약하다
  `e2e-{container-run,deploy-push}.sh` 는 이름 그대로 **smoke**: `! container not running` / `! hostPort not populated` 여도 경고만 찍고 **PASS** 한다. 게다가 **`runner-bin` 이 없으면 runner 가 아예 안 뜨는데도 PASS** 한다(세션 중 실제로 그 상태였다). 즉 기존 "13/13 PASS" 중 이 2종은 plumbing 수준의 신호였다.
  → wrapper 가 `go build` 를 대신해 가짜 PASS 를 막고, 가이드 §6 에 신호 강도를 명시. **후속 후보**: 두 스크립트의 단언을 hard fail 로 강화.

  ## 한계 기록
  - **모달 픽셀 diff 흔들림** — 실측 `admin-runners/dark-modal.png` ratio 0.0017 (> 0.001). Dialog 애니메이션/합성 타이밍 추정. baseline diff 를 켤 때 모달은 별도 threshold 또는 제외 검토.
  - **baseline LFS 정책 미결** — CI 는 구조 검증만. 정책 확정 시 워크플로에 `--baseline` 한 줄 추가로 활성화.

  ## 검증
  wrapper `--group all` → **13/13 PASS (388s)** (local 19s / compose 272s / runner 97s) / visual 구조 검증 20 PNG 통과 / `--baseline` 경로 실동작 확인 / YAML 3종 파싱 OK / `bash -n` 통과.

  workflow meta sync (state purpose_digest_rev 193→194, handoff_rev 115→116, backlog index·latest +1, task_count 61→62, handoff doc 151→152, work_backlog 109→110) 같은 commit.
- Updated: 2026-07-23 (rev 150→151: **v0.2.1 릴리스 태깅 — Phase 1 후속 패치**).

  TASK-153/154/155 를 묶어 patch release `v0.2.1` 로 태깅했다. `v0.2.0` 봉인 직후 **실이미지 e2e 를 처음 돌리며 드러난 프로덕션 결함 2건**을 담은 릴리스다.

  ## 릴리스 산출물
  - 5 package.json `0.2.0` → **`0.2.1`** 통일 bump (runner 는 Go module — git tag 로 관리)
  - **annotated git tag `v0.2.1`** (+ origin push)
  - `CHANGELOG.md` — §2 v0.2.1 신규 + 섹션 재번호(2~8) + Release model/history + baseline 표 v0.2.1 기준(build-server 178→181, e2e 13종)
  - `docs/RELEASE_NOTES-2026-07-23.md` 신규 (7 섹션 — 요약 / 수정된 결함 / e2e 인프라 / 검증 / 업그레이드 안내 / 운영자 검증 순서 / follow-up)

  ## 릴리스 범위 (v0.2.0..HEAD, 5 commits)
  `c170082` TASK-153 이미지 빌드 회귀 + 실이미지 e2e 검증 / `e0f2c81` TASK-154 dual vite config 통일 + e2e 전수 / `f4e6010` TASK-155 chunked claim 제품 결함 / `615c013` TASK-155 죽은 trap + flaky 단언 / `dbe508c` 봉인 + meta sync.

  ## 운영 주의 (RELEASE_NOTES §5)
  - DB migration 변경 0 / API 계약 변경 0.
  - **claim 자격 확장은 "더 많은 build 가 claim 되는" 방향** — 업그레이드 직후 그동안 QUEUED 로 멈춰 있던 chunked build 들이 일제히 claim 되기 시작한다. 운영 중이라면 대기 build 수를 먼저 확인할 것.
  - 빌드 명령 변경: `--config vite.react.config.ts` 제거(단일 `vite.config.ts`). CI/로컬 스크립트가 참조하면 수정 필요.
  - 신규 선택 env: `DIBS_POSTGRES_HOST_PORT` (로컬 native postgres 가 5432 점유 시 compose 포트 override).

  ## baseline
  frontend **277** / build-server **181** / runner go **8 pkg** / TS 5 clean / e2e **13/13** / 초기 index js gzip 134.64KB·css 24.08KB.

  ## 환경 (부수 작업)
  docker 정리 누적 **약 54GB 회수** — 이미지 302개/54.43GB → 36개/2.36GB, 볼륨 42개/1.70GB → 0, 컨테이너 26 → 2(grafana/prometheus만). devhub 자산 전량 삭제(사용자 지시, DB 볼륨 포함 — 복구 불가). **빌드 캐시(1.09GB)는 사용자 지시로 보존**. grafana/prometheus 는 bind mount(`/opt/monitoring/*`) 라 무영향 — 실측 확인.

  ## 다음
  Phase 2 진입 대기. 최우선 후보 = **e2e·visual baseline 의 CI/nightly 통합** (v0.2.1 의 결함 2건 모두 "e2e 를 안 돌리면 잠복" 실증).

  workflow meta sync (state purpose_digest_rev 192→193, handoff_rev 114→115, handoff doc 150→151, work_backlog 108→109) 같은 commit.
- Updated: 2026-07-23 (rev 149→150: **TASK-154 + TASK-155 봉인 — dual vite config 통일 / e2e 13/13 전수 PASS / chunked claim 제품 결함 해소**).

  사용자 요청 2건("dual vite config 통일", "나머지 e2e 변종 전수 실행")을 수행했고, 그 과정에서 **제품 결함 1건 + e2e 인프라 결함 12건**을 발견·수정했다.

  ## TASK-154 — dual vite config 통일 (commit `e0f2c81`)

  build-monitor 가 `vite.config.ts`(dev+test, root 미설정 → stale 루트 index.html 로 **build 불가**)와 `vite.react.config.ts`(build, root=react/)로 이원화돼 있었다. **이 틈이 TASK-153 이미지 빌드 회귀의 구조적 원인**이었다.
  - 단일 canonical `vite.config.ts` 로 병합: root=react/ + `build.outDir=dist-react` + publicDir + server(5174) + test(vitest, setupFiles 절대경로).
  - 제거: `vite.react.config.ts` / 루트 `index.html`(→`/src/main.ts` Svelte 엔트리) / `svelte.config.js` / 미추적 `src/`.
  - 갱신: `package.json`(플래그 없는 `vite`/`vite build`, `:react` 별칭은 e2e-single-port.sh 힌트 호환 유지) / `tsconfig.react.json` / `Dockerfile`(plain `vite build`) / visual README + ops 가이드.
  - 검증: vitest 277 / TS 5 clean / 번들 동일(index js gzip 134.64KB) / 실이미지 e2e ALL PASS.

  ## TASK-155 — e2e 전수 실행 + 제품 결함 (commits `f4e6010`, `615c013`)

  ### 제품 결함: chunked 업로드 build 가 claim 되지 않음
  `claimNextBuild` 의 source-gate(TASK-080)가 legacy `build_source` 로만 inner join 해 자격을 판정했다. 그런데 TASK-106 chunked 업로드는 **첫 chunk 에서 그 legacy row 를 삭제**하고 `build_source_chunk` 에 쓴다 → chunked 로 올린 build 는 **영원히 claim 되지 않고 QUEUED/REQUEST_ACCEPTED 로 정체**(runner 3대가 5s 주기로 정상 폴링, `legacy_rows=0 / chunk_rows>=1` 로 실증).
  - 수정: postgres/memory 양쪽 자격을 `(legacy 존재) OR (chunk>=1 AND 누적 size >= 선언 total)` 로 확장. `EXISTS(chunk)` 를 AND 로 함께 걸어 chunk 0건 + sizeBytes 0 인 build 가 `0>=0` 으로 가드를 뚫는 것을 차단.
  - 회귀 가드 3건 신규 → build-server **178 → 181**.
  - 잠복 이유: chunked 업로드 + claim 을 함께 타는 e2e 가 하나뿐인데 그 스크립트가 `--build` 없이 **stale 이미지만 검증**해왔다.

  ### e2e 인프라 결함 12건
  `REPO_ROOT` off-by-one / `tsc -p` 다중 project(TS5042) / 엉터리 `DATABASE_URL`(`postgres://memory://test`) / 검증 psql 포트 하드코딩 / 고정 appName 재실행 충돌(409) / 잘못된 단언 전제(cap 은 `ceil(total/1024)` **개수** 기준) / `schema_migrations` 컬럼명(`version_num`→`version`, `2>/dev/null` 가 원인 은폐) / 큰따옴표 안 백틱 명령치환 / **`--build` 누락 2건** / **죽은 cleanup trap**(`COMPOSE_PID` 미할당 → 실패 런이 postgres 볼륨을 남겨 고정 project name 탓에 `buildsClaimed` 가 런 간 누적 5→10→15) / flaky 분배 단언(서버가 `active_build_exists` 로 동시 1건만 처리 → 타이밍 의존, 경고로 강등) / `compose.dev.yaml` postgres 호스트 포트 하드코딩(`5432:5432` → `${DIBS_POSTGRES_HOST_PORT:-5432}`).

  ### 최종 검증 — **e2e 13/13 PASS, 0 FAIL**
  로컬 5(source-archive ×2 / chunked ×2 / single-port) + compose 6(production-semantic ×2 / multi-runner ×3 / insecure-registry) + runner 2(container-run / deploy-push). 실이미지 `docker build`+`docker run` 경로 포함.

  ## 회귀 baseline
  frontend vitest **277** / build-server **181** / runner go **8 pkg** / TS 5 packages clean / vite build 초기 index js gzip 134.64KB·css 24.08KB / e2e **13/13**.

  ## 환경 정리
  docker 이미지 302→95개(54.4GB→14.1GB), 빌드 캐시 5.3GB→137MB — **약 45GB 회수**. 중지 컨테이너 23개·볼륨 41개는 다른 프로젝트(devhub/bamboo 등) 데이터가 섞여 있어 **의도적으로 미정리**.

  ## follow-up
  - **e2e·visual baseline 의 CI/nightly 통합** — 실이미지 빌드 경로(TASK-153)와 chunked claim(TASK-155) 둘 다 "e2e 를 안 돌리면 잠복한다"가 실증됐다. 최우선 후보.
  - 사후 알림 자동화 / 외부 object storage / 신규 기능 / Nextcloud Tasks / CI migration validation.
  - v0.2.1 태깅 여부(사용자 결정 대기) — TASK-153/154/155 는 v0.2.0 이후 패치.

  workflow meta sync (state purpose_digest_rev 191→192, handoff_rev 113→114, backlog index 85→86·latest 63→64, handoff doc 149→150, work_backlog 107→108, daily rev 29→30 §31·§32) 같은 commit.
- Updated: 2026-07-23 (rev 148→149: **TASK-153 실이미지 빌드 e2e 검증 + Dockerfile 회귀 수정 — Phase 1 유일 미결 해소**).

  사용자가 "실이미지 e2e 검증 위해 docker 설치부터 안내" 요청. **확인 결과 환경엔 Docker 29.1.3 + compose v2 가 이미 설치·구동 중**(Ubuntu 25.10, user 가 `docker` 그룹) — CLAUDE.md 의 "Docker 미설치" 노트가 **outdated 였음**(정정). 설치 대신 `e2e-production-semantic.sh` (RUNNER_DOCKER_BUILD_MODE=cli) 실행.

  ## 잠복 회귀 발견 → 수정 → 검증

  - **첫 실행 실패**: 루트 `Dockerfile` 이 build-monitor 를 `vite build`(config 미지정)로 빌드 → vite 확장자 우선순위(.js>.ts)로 (a) Svelte 잔재 `vite.config.js`(`@sveltejs/vite-plugin-svelte` 미설치→`ERR_MODULE_NOT_FOUND`) 또는 (b) half-migrated `vite.config.ts`(루트 `index.html`→`/src/main.ts` 미존재→rollup fail)를 잡아 이미지 빌드 파손. **React 이관(TASK-088~101)이 로컬 build 명령만 `vite.react.config.ts` 로 바꾸고 Dockerfile 은 안 바꿔 v0.2.0 까지 잠복** — 실이미지 e2e 를 한 번도 안 돌려서 안 드러남.
  - **수정 (3곳)**: ① `Dockerfile` build 스텝 → `vite build --config vite.react.config.ts`(유일 유효 config, root=`react/` outDir=`dist-react`) ② stage3 `COPY` 를 `dist`→`dist-react`(런타임 경로 `dist` 유지) ③ `.dockerignore` 에 `vite.config.js`/`.map` 제외(`.gitignore` 엔 있었으나 `.dockerignore` 누락 — **Docker build context 는 `.gitignore` 를 무시**).
  - **재실행 ALL PASS**: 실제 `docker build`(busybox+httpd) + `docker run`(previewUrl `127.0.0.1:32768` HTTP 200) + **10/10 phase** + container auto-cleanup. e2e 는 trap 으로 `compose down -v` 자동 정리.

  ## 커밋 산출물

  `Dockerfile` + `.dockerignore` (수정) + `CLAUDE.md` (Docker 노트 정정 + TASK-153 교훈) + `docs/PHASE-1-RETROSPECTIVE.md` (§4/§5/§6 미결 해소) + `CHANGELOG.md` (§4/§5) + workflow meta.

  ## 상태 / follow-up

  - **Phase 1 유일 미결(실이미지 e2e)이 해소됨.** v0.2.1 후보.
  - follow-up: 실이미지 e2e 를 CI/nightly 에 통합(Dockerfile 회귀 재발 방지) / compose.dev.*.yaml 나머지 e2e 변종 전수 실행 / dual vite config(`vite.config.ts`↔`vite.react.config.ts`) 통일 검토(현재 `vite.config.ts`·루트 `index.html` 은 stale).
  - 참고: 사용자 머신에 dangling docker image 186개 누적(기존 환경) — 정리는 사용자 판단(`docker image prune`).

  workflow meta sync (state purpose_digest_rev 190→191, handoff_rev 112→113, handoff doc 148→149) 같은 commit.
- Updated: 2026-07-23 (rev 147→148: **Phase 1 완료 정리 — v0.2.0 baseline**).

  TASK-152 봉인 직후, 사용자 결정에 따라 **Phase 1(초기 시스템 구축 국면)을 baseline 으로 긋고 Phase 2 진입을 준비**했다. Phase 1 = 백엔드/영속화/API + runner + React 19+Astryx 프론트엔드 + 운영 가드 2계층 + 서버-프론트 계약 고정 + 시각 QA baseline (TASK-001~152 누적).

  ## 산출물 (6종)

  1. **5 package.json bump** — `apps/build-server` / `apps/build-monitor` / `packages/shared-contract` / `packages/shared-config` / `packages/db` 를 `0.1.0` → `0.2.0` 통일 (각 1줄만 변경). `apps/runner` 는 Go module 이라 version field 없이 git tag 로 관리.
  2. **git tag `v0.2.0`** — Phase 1 완료 anchor (annotated).
  3. **CHANGELOG.md v0.2.0 전면 갱신** — v0.1.0 이후 코드 델타 = TASK-124~152 그룹 테이블 + 회귀 baseline 종합(TASK-088→v0.2.0) + follow-up 7종.
  4. **docs/PHASE-1-RETROSPECTIVE.md 신규** — 정의 / 아키텍처 / 성과(마일스톤) / 회귀 baseline / 미결 / 교훈(반복 패턴 6종) / Phase 2 기준선.
  5. **docs/RELEASE_NOTES-2026-07-22.md 신규** — v0.2.0 종합 리뷰 + 운영자 staging.
  6. **시각 요약 아티팩트** — Phase 1 대시보드 (claude.ai artifact).

  ## 실측 검증 (v0.2.0 baseline, 전 green)

  - build-monitor `vitest run` → **277 PASS** (25 files)
  - build-server `node --import tsx --test tests/*.test.ts` → **178 PASS** (42 suites)
  - runner `go test ./...` → **8 pkg PASS**
  - `tsc --noEmit` × 5 packages → **clean**
  - `vite build` → 초기 index js gzip **134.64 KB** / css **24.08 KB** (lazy: BuildDetail 38.53 / buildColumns 9.85 / RegisterRunnerModal 5.74)
  - 문서 무결성 가드 (staged) → PASS

  ## 주의 / 미결

  - **실이미지 빌드 e2e 미검증** — 본 로컬 Docker 미설치 + runner `RUNNER_DOCKER_BUILD_MODE=skeleton` 기본. compose.dev.*.yaml 기반 e2e 11종은 Docker 환경에서 별도 검증 필요.
  - **Phase 2 진입 후보 7종** — 사후 알림 자동화 / visual baseline CI 통합 / 외부 object storage / 신규 기능 / Nextcloud Tasks / CI migration validation / 실이미지 e2e. (CHANGELOG §5 / 회고 §5)

  workflow meta sync (state purpose_digest_rev 189→190, handoff_rev 111→112, phase 마커 신규, handoff doc 147→148) 같은 commit.
- Updated: 2026-07-23 (rev 146→147: **TASK-152 완전 봉인 — 남은 5단계 완료**).

  이전 세션의 부분 봉인(rev 145→146, commit `bd1dfb7`)이 이월한 5단계를 본 세션에서 마무리했다. **주의**: 이전 handoff 는 "working tree 에 staged 변경 + untracked PNG 22개" 로 적혔으나, 실제로는 부분 봉인 commit `bd1dfb7` 가 이미 main 에 반영돼 **working tree 는 clean·origin/main 동기** 상태였고, `.visual/` baseline PNG 는 gitignore 대상이라 세션 종료 후 로컬에서 소거된 상태였다.

  ## TASK-152 완료 내역 (5단계)

  1. **baseline 재캡처 + 승격** — `.visual/` 산출물이 없어 재생성: `pnpm install`(`@vitejs/plugin-react` 미설치 복구) + Pillow `--user` 설치 → build-server(memory, dist 직접 실행, `/health` 200) + vite dev(5174) 기동 → `capture.py --base http://127.0.0.1:5174` → **20 PNG**(9 라우트 × 2 + RegisterRunnerModal 2), zero-size 0 / dark≠light MD5 상이 / modal≠baseline 확인 → `apps/build-monitor/tests/visual/baseline/` 로 승격(gitignore 대상, 커밋 안 됨).
  2. **diff.py self-test** — `--threshold 0.001` → matched 20 / missing 0 / exceeded 0 / **PASS**(전 항목 ratio 0.0000), exit 0.
  3. **test_diff.py 단위** — 5/5 PASS.
  4. **운영 가이드 신규** — `docs/operations/build-monitor-ui-visual-2026-07-22.md`(7 섹션).
  5. **workflow meta sync + commit** — 본 handoff(146→147) / state.json(purpose_digest_rev 188→189, handoff_rev 110→111, backlog index 84→85·latest 61→62, done/recent_done 등록) / work_backlog(104→105) / daily 2026-07-21(rev 27→28, §29 신규).

  **커밋 산출물**: 운영 가이드 1종 + workflow meta 4종. baseline PNG 는 gitignore 로 제외 → 코드/테스트/번들 변경 0.

  **회귀 baseline 불변**: frontend vitest 277 / build-server 178 / TS 5 packages clean / go 8/8.

  **follow-up**: ① baseline PNG 외부 LFS/저장소 동기화 정책(미결) — visual baseline 의 CI 통합(nightly-visual) 선행 조건 ② 사후 알림 자동화(nightly 실패 → Issue/Slack) ③ 결정 대기 5종.
- Updated: 2026-07-23 (rev 145→146: **TASK-152 DESIGN.md v2 + visual QA baseline** — 부분 봉인, 다음 세션이 5단계로 즉시 완료 가능).

  브랜치 미생성 (working tree 에 staged 변경 + untracked PNG 22개만 있는 상태) — 다음 세션이 `git status` 확인 후 `feat/task-152-design-and-visual` 같은 브랜치 파서 작업 권장.

  ## TASK-152 현재 상태 (다음 세션 즉시 이어받기)

  **완료**:
  - `docs/DESIGN.md` v2 — 9 섹션 (Stack / Tokens / Foundations / Components / Layout / Voice & Tone / A11y / Do & Don't / References) **React 19 + Astryx 0.1.4 정합**. tokens.css 단일 source-of-truth 와 1:1 정합. 현 라우트 셋 (9개) + RegisterRunnerModal 1호 오버레이 + Task-150 PhaseTimeline drift + Task-151 buildColumns 등 포함. Svelte 5 시절 stack / PR#5·6 / Svelte 측 components 모두 폐기 reference §8.3 명시.
  - `apps/build-monitor/tests/visual/capture.py` v3:
    - `set_theme_and_reload` (mode 마다 reload + data-theme 강제 적용)
    - Login 라우트 격리 컨텍스트 (userId 없음)
    - `capture_admin_runners_isolated` (admin 가드 fetch 영향 차단)
    - `capture_modal` (RegisterRunnerModal 별도 컨텍스트)
    - data-testid 셀렉터 안정 (role+name regex 회피)
  - `apps/build-monitor/tests/visual/README.md` v3 (현 라우트 셋 + 모달)
  - `.gitignore` 보강 (`tests/visual/baseline/` binary 제외, README 의 LFS 정책)
  - `apps/build-monitor/package.json` devDependency: `playwright: ^1.61.1` 추가 (TASK-149 B층 가드와 동일 패턴)
  - `pip3 install --user --break-system-packages playwright` (시스템 Python) — baseline 22 PNG 모두 정상 캡처, dark ≠ light MD5 다름 확인
  - `.visual/2026-07-22T16-10-00Z/` 22 PNG (login × 2, builds/build-detail/build-request/api-console/admin-builds/admin-users/admin-admins × 2 each, admin-runners × 2 baseline, admin-runners × 2 modal — 모두 별도 컨텍스트)

  **남은 5단계** (다음 세션이 즉시 수행):
  1. **PNG baseline 승격**:
     ```
     rm -rf apps/build-monitor/tests/visual/baseline
     mkdir -p apps/build-monitor/tests/visual/baseline
     cp -r .visual/2026-07-22T16-10-00Z/* apps/build-monitor/tests/visual/baseline/
     ```
  2. **`diff.py` self-test**:
     ```
     python3 apps/build-monitor/tests/visual/diff.py \
         --baseline apps/build-monitor/tests/visual/baseline \
         --run .visual/2026-07-22T16-10-00Z \
         --threshold 0.001
     ```
     20/20 PASS 확인 (run == baseline 이라 0 차이). diff.py 자체는 라우트 셋을 직접 들고 있지 않고 디렉터리를 walk 하므로 셋 정합은 자동.
  3. **운영 가이드 신규** — `docs/operations/build-monitor-ui-visual-2026-07-22.md` (TASK-152, 7 섹션 — Why / 라우트 선택 근거 / 절차 / diff 검증 / 단위 테스트 / 한계 / 변경 이력). §1 라우트 셋 + RegisterRunnerModal 1호 오버레이 + 채널 chrome + 1440×900 정합.
  4. **workflow meta sync** (rev 145→146):
     - `state.json` (rev 188→189): `current_baseline` 에 TASK-152 추가, `current_focus` 에 사후 알림 자동화 유지
     - `work_backlog.md` (104→105): 헤더 rev 한 줄
     - `backlog/2026-07-21.md` (rev 27→28): §29 TASK-152 신규 (시도 / 진단 — set_theme 안 되는 문제 → data-theme 강제 적용 → MD5 다름 확인)
  5. **commit + main push**: 한 sync commit 으로 6 파일 (DESIGN.md, capture.py, README.md, .gitignore, package.json, 운영 가이드) + 4종 workflow meta + 1 baseline 승격은 untracked PNG 가 .gitignore 에 의해 제외되므로 staged 안 됨.

  **TASK-152 follow-up 후보 (봉인 후)**:
  - 사후 알림 자동화 (nightly 실패 → Issue / Slack) — TASK-149 후속
  - 결정 대기 5종 유지 (옵션 Z 외부 object storage / 신규 기능 / Nextcloud Tasks / CI migration validation / git tag 다음 version)
  - visual baseline 의 CI 통합 (nightly-visual 워크플로) — 가드 PNG 들 git LFS 외부 저장소 동기화 정책 결정 필요 (가벼운 워크플로)

  **이전 봉인 (TASK-149 → TASK-150/151)**: `c9ed95c` CI 통합 + `d9b3f07` 이월 해소 2건 main push 완료. 그 사이 4 sync commit 모두 `origin/main` 동기.

  **핵심 교훈 (TASK-152 캡처)**: ① React 19 SPA + `themeStore.init()` 가 mount-time 1회만 localStorage 의 theme 를 읽음 → mode 전환 시 setItem 만으로는 store.mode 가 안 바뀜. ② store 가 mode 를 reset 하면 `<Theme>` 가 useEffect 에서 mode 를 localStorage 의 mode 로 동기화 + `themeStore.applyMode` 가 `data-theme` attribute 박음. ③ 두 효과가 충돌 → screenshot 직전에 `documentElement.setAttribute('data-theme', mode)` + `removeAttribute` (dark) 직접 evaluate + 200ms wait 가 정답. ④ capture.py 가 setItem + reload + data-theme 강제 적용 3-단계로 안정.
- Updated: 2026-07-22 (rev 144→145: **TASK-150 + TASK-151 이월 해소 sync commit** — 단일 commit 으로 묶음).

  브랜치 `feat/task-150-151-rollover` (병합·push 상태는 `git status -sb`).

  **TASK-150: PhaseTimeline 9 → 11 phase drift 수정**.
  - `apps/build-monitor/react/src/components/PhaseTimeline.tsx` 가 9 phase 를 하드코딩하면서 shared-contract 의 11 phase 와 drift. DEPLOYMENT_STARTED / DEPLOYMENT_COMPLETED 2종이 누락돼 운영자가 PREVIEW_READY → COMPLETED 직행으로 오해할 수 있는 시각 회귀.
  - **수정**: `import { buildPhases, type BuildPhase } from "@docker-image-builder-system/shared-contract"` + `const CANONICAL_PHASES: readonly BuildPhase[] = buildPhases`. drift 자체를 **구조적으로 봉인** (배열 변경 시 컴파일 타임에 잡힘).
  - `BuildDetail.test.tsx` 의 "9 phases" → "11 phases" 정정 (5 completed + 1 current + 5 pending) + DEPLOYMENT_* 노출 단언 추가.
  - **사전 작업**: `apps/build-monitor/package.json` 에 `@docker-image-builder-system/shared-contract: workspace:*` devDependency 추가 + `pnpm install` (TASK-135 의 breaking change 와 같은 계열 — import 가 필요한 패키지는 의존성으로 명시).

  **TASK-151: 진단-필드 응답 helper 흡수**.
  - TASK-130 의 follow-up 이월. build-routes.ts 의 4xx 응답이 `{ message: "..." }` (message-only, 17 곳) + `{ message, ...extras }` (multi-line, 11 곳) = **28 곳**이 `validationErrorBody` 외에 각자 리터럴로 박혀 있어 envelope 일관성 결여.
  - **신규 helper** (`packages/shared-contract/src/build/errors.ts`): `errorBody(message, ...extras)` + `notFoundBody(message)`. 둘 다 `ApiErrorResponse` (좁은 타입) 반환 → `message` 강제 / extras 는 `Object.assign({}, ...extras, { message })` 로 순차 merge. `notFoundBody` 는 `errorBody(message)` 의 thin alias.
  - **흡수**: build-routes.ts 28 곳을 `notFoundBody("...")` / `errorBody("...", { ...extras })` 로 변환. envelope 동일 → `parseApiError` 가 같은 분기로 처리 가능.
  - **자기 정정 1건(반복 패턴)**: 첫 시도가 Python regex 일괄 변환이었는데 (1) `""...""` 이중 quote 가 들어가거나 (2) extras 가 object 가 아닌 bare 로 들어가거나 (3) brace 가 한 개 더 들어가거나 — 4가지 결함 동시 발생 → git revert 후 **read_file + search_replace 1:1** 로 재작업. **`bash -n` OK / TSC clean / vitest 277 / build-server 178 / go 8/8** 전부 PASS — 회귀 0.

  **검증**: TSC 5 packages clean / vitest 277 / build-server 178 / go 8/8 / 문서 무결성 가드 staged PASS / state.json JSON valid. 운영 영향 0 (외부 계약 동일 — envelope 의 message 가 보존되고 extras 도 같은 키로 전달).

  **다음 후보** (state.json current_focus 갱신):
  (1) 사후 알림 자동화 (nightly 실패 → Issue / Slack) — TASK-149 후속
  (2) 이월: PhaseTimeline 9 → 11 drift (TASK-150) ✅ 해소 / 진단-필드 응답 helper 흡수 (TASK-151) ✅ 해소 / 결정 대기 5종 (옵션 Z / 신규 기능 / Nextcloud Tasks / CI migration validation / git tag 다음 version).

  workflow meta sync (state rev 187→188, handoff 144→145, work_backlog 103→104, backlog index 86→87 / latest 63→64) 같은 commit 안에 포함.
- Updated: 2026-07-22 (rev 143→144: **TASK-149 CI 통합 봉인 — B층 + 문서 무결성 가드의 nightly/main-push/수동 운영**).

  브랜치 `feat/task-149-ci-integration` (병합·push 상태는 `git status -sb`).

  **문제** — B층 가드(대비/CSS 유출) + 문서 무결성 가드(`--range`) 가 모두 **앱 기동 + (B층만) Chrome** 이 필요해 PR 단계에 끼우면 PR 시간이 길어진다. **해결** = PR 단계 = 정적 가드만(`docker-build.yml` 기존), 실측 가드는 nightly + main push(관련 경로만) + 수동 워크플로(`nightly-b-layer.yml` 신규).

  **구현 4종**:
  - `compose.ci.yaml` — `build-server`(`node:22-bookworm-slim` + pnpm + tsx + healthcheck) + `guard`(`mcr.microsoft.com/playwright:v1.55.0-jammy` — Chrome 포함) + 옵션 `postgres` (profile). default = memory backend. host docker socket mount 없음 — CI 환경 단순화.
  - `compose.ci.postgres.yaml` — override. `BUILD_REPOSITORY_BACKEND=postgres` + `DATABASE_URL` + `DB_AUTO_BOOTSTRAP=true`. 사용: `docker compose -f compose.ci.yaml --profile postgres -f compose.ci.postgres.yaml up -d`.
  - `scripts/run-b-layer-guards.sh` — wrapper. 환경 점검(node / Chrome / curl /health) → 3 가드 직렬 → 종료 코드/소요시간 요약. **fail-open** (첫 실패에서 멈추지 않음).
  - `.github/workflows/nightly-b-layer.yml` — `cron: 0 3 * * *` + main push(관련 경로 필터) + workflow_dispatch(memory/postgres 선택). `concurrency: cancel-in-progress: true`.

  **검증** (로컬 dry-run): `docker compose -f compose.ci.yaml --profile memory config` 통과 (YAML 의미 OK) / `... --profile postgres -f compose.ci.postgres.yaml config` 통과 / `bash -n run-b-layer-guards.sh` 통과 / YAML 셋 Python yaml.safe_load 통과. 실측 가드 실행은 CI 환경(Chrome + 도커)에서 최종 확인 — 본 환경에선 의존성 미설치.

  **운영 가이드 1종 신규**: `docs/operations/ci-integration-2026-07-22.md` (7 섹션 — 왜 / compose / wrapper / 워크플로 / 운영 주의 / 후속 결정 / 한 줄 요약).

  **다음 후보** (state.json current_focus 갱신):
  (1) 사후 알림 자동화 (nightly 실패 → Issue / Slack) — TASK-149 후속
  (2) 이월: PhaseTimeline 9 phase 수동 복제 / 진단-필드 응답 helper 흡수 / 결정 대기 5종.

  workflow meta sync (state rev 186→187, handoff 143→144, work_backlog 102→103, backlog index 85→86 / latest 62→63) 같은 commit 안에 포함.
- Updated: 2026-07-22 (rev 142→143: **TASK-148 B층 가드 오버레이(모달) 검사 확장 봉인**).

  브랜치 `feat/task-148-overlay-guard` (병합·push 상태는 `git status -sb`).

  **문제** — TASK-137 회고에 "B층 가드가 모달을 열지 않아 오버레이는 검사 범위 밖" 이라고 적혀 있었고, TASK-146 에서 CSS 유출 가드만 admin/runners 의 Register Runner 모달을 인라인으로 클릭해 열었다. 그 외 라우트의 모달 / 미래 모달은 자동으로 열리지 않았다. **해결** = `data-open-modal` 어트리뷰트 트리거 규약 + 공용 helper `_overlay-trigger.mjs` + 양 가드의 2차 패스. 모달 추가 시 마크업 어트리뷰트 1줄 + 가드 등록 1줄로 끝.

  **구현**: AdminRunners 의 "+ Register Runner" 버튼에 `data-open-modal="register-runner"` 추가 / `_overlay-trigger.mjs` 신규 — `MODAL_TRIGGERS` 배열로 라우트 매치, 트리거 클릭 후 scopeSelector 의 DOM 존재 확인(지연 로드 모달 대비 2초 폴링), 미발견 시 stderr 경고 + **fail-open** / `check-theme-contrast.mjs` 와 `check-css-leak.mjs` 의 `auditInPage` 에 `scope` 옵션 추가해 모달 안만 tree-walk / 오버레이 잡힌 위반·하이재킹은 `오버레이: ` prefix 로 어느 패스인지 표시.

  **사전 결함 1건(이번 sync commit 에 포함)**: `LogStream.tsx` 가 `syntaxTheme={tokyoNight}` prop 을 박고 있었는데 Astryx 0.1.4 의 `CodeBlockProps` 는 이 prop 을 **노출하지 않는다** (defineTheme.d.ts 주석엔 "per-instance via syntaxTheme prop" 이라 적혀 있으나 인터페이스엔 부재 — Astryx 측 미구현). TASK-140 봉인 시점에 prop 박은 것이 type 과 어긋났다. **수정** = prop + import(`@astryxdesign/core/theme/syntax`) 제거 + 헤더 코멘트의 "syntaxTheme 에 다크 프리셋을 고정" 서술을 정직한 표현("양 테마 터미널 톤은 wrapper 배경으로 표현")으로 갱신.

  **운영 가이드 1종 신규**: `docs/operations/b-layer-overlay-extension-2026-07-22.md` (7 섹션 — 의도 / 트리거 규약 / 동작 흐름 / 사용법 / 한계 / 추후 모달 추가 절차). `theme-contrast-guard-2026-07-21.md` §7 에 짧은 cross-reference 추가.

  **검증**: TSC 5 packages clean (LogStream 사전 결함 해소) / vitest 277 (회복) / build-server 178 / go 8/8 / 가드 셋 syntax OK (node --check) / 문서 무결성 가드 (staged) PASS / JSON valid. 운영 가드 실측은 다음 CI 통합(TASK-149 후보)에서 Chrome + 앱 기동 단계로.

  **다음 후보**: (1) **CI 통합** — B층·문서 무결성·CSS 유출 실측 가드가 모두 앱 기동 단계 필요라 같이 다룰 이월 항목 / (2) 이월: PhaseTimeline 9 phase 수동 복제 / 진단-필드 응답 helper 흡수 / 결정 대기 5종. workflow meta sync (state rev 185→186, handoff 142→143, work_backlog TASK-148 등록, backlog 2026-07-21 rev 25) 같은 commit 안에 포함.
- Updated: 2026-07-22 (rev 141→142: **헤더-본문 24px 정렬 — 수용 확정 (코드 변경 0)**. TASK-144 봉인 시 "Astryx 기본값 따름" 으로 수용했던 항목을, 본 세션에서 사용자가 명시적으로 확정. 손 정렬 안 함, contentPadding 조정 안 함. 이월 후보에서 제외 — 향후 거슬리면 별도 task 로 contentPadding 조정 옵션을 다시 검토).

  작업 0건. 문서 4종(session_handoff / state.json / backlog/2026-07-21 / work_backlog)의 "수용 중" 표현을 "수용 확정" 으로만 정정. workflow meta sync (state rev 184→185, handoff 141→142, work_backlog 헤더 한 줄 추가, backlog 2026-07-21 rev 24) 같은 commit 안에 포함. TSC / vitest / go / 가드 / 번들 **변경 0** — 전부 baseline 그대로.
- Updated: 2026-07-22 (rev 140→141: **TASK-147 Astryx reset.css 도입 검토 — 미도입 결정, 코드 변경 0**).

  브랜치 `feat/task-147-reset-css` (변경 없는 빈 브랜치 — 결정만 남기고 삭제 예정).

  TASK-136 이 "손 CSS 2,000여 줄을 흔들 수 있어" 미룬 항목을, 손 CSS 가 **1,956줄로 줄고** 폼·버튼·테이블이 Astryx 로 넘어간 시점에 재검토했다.

  **실측**: reset.css 를 astryx.css 앞에 임시 import 후 빌드 → 전 라우트 실브라우저 측정 + reset **ON/OFF 요소별 computed-style 지문 대조**.

  **결론 = 미도입.** 근거 3가지:
  1. **안전하나 무익** — reset.css 는 `@layer reset`(최하위) + `:where()`(zero specificity)라 우리 unlayered CSS·Astryx atomic 을 절대 못 이긴다. 우리 앱의 모든 요소는 우리 클래스 또는 Astryx atomic 으로 **이미 스타일**돼 reset 이 닿는 순수 미스타일 요소가 없다. `h1`/`input`/`section`/`.preset-btn` 요소별 지문이 reset **ON/OFF 완전 동일**(margin/padding/border/bg 전부 불변).
  2. 우리 globals 가 이미 필요한 reset(`* { box-sizing: border-box }`, `html,body { margin:0; padding:0 }`)을 보유 — reset.css 의 실질 추가분이 우리 요소엔 0.
  3. 비용은 CSS gzip **+0.97KB** + import 1줄 + 의존 표면.

  **부수 실증**: reset ON 상태로 TASK-146 실측 CSS 유출 가드 전 6 라우트 통과 → reset.css 가 Astryx primary 버튼을 **안 깬다**는 것을 가드가 확인(가드 가치 재실증).

  **자기 정정 1건(반복 패턴)**: 첫 측정에서 `button.astryx-button` **첫 요소**의 bg 가 transparent 라 "reset 이 Astryx 버튼 깸" 으로 오판했으나, 그 첫 요소는 **Logout(ghost variant, 정상 투명)** 이었고 실제 **Submit Build 는 `rgb(126,129,243)` 인디고 정상**. 엉뚱한 요소 잡고 회귀로 단정하는 측정 오류가 또 재발(TASK-140/141 계열) — DOM 측정 시 **어떤 요소를 잡았는지 먼저 확인**.

  **결과**: `main.tsx` 원복(reset import 없음), 코드/테스트/번들 변경 0. TASK-136 미도입 판단이 데이터로 유효 확인(단 근거를 "위험해서" → "무익해서" 로 정정). **reset.css 검토는 종결 — 재개 불필요.** workflow meta sync (state rev 183→184, handoff 140→141) 포함.
- Updated: 2026-07-22 (rev 139→140: **TASK-146 실측 CSS 유출 가드 스크립트화 봉인 — CSS 유출 방어 2층 완성**).

  브랜치 `feat/task-146-css-leak-guard` (병합 상태는 `git status -sb`).

  TASK-145 의 정적 lint(`css-leak.test.ts`)는 **bare element 셀렉터**만 잡는다. 그러나 우리 CSS 사고의 절반은 **일반 클래스명 충돌**이었다 — TASK-140 의 `.card { max-width }` 가 Astryx CodeBlock(container="card" 일 때 literal `card` 클래스를 붙임)을 덮은 것. `.card` 는 CSS 문법상 정당해 정적으로 못 잡고, Astryx 가 런타임에 붙이는 클래스는 실브라우저에서만 안다. TASK-145 에서 그 회귀를 찾은 실측 로직을 재사용 opt-in 가드 `scripts/check-css-leak.mjs` 로 남겼다 (B층 대비 가드와 동일 패턴).

  **검사 2종**: (1) 클래스 충돌 — 우리 **단독 클래스 규칙**(`.card {}`)의 클래스명을 가진 요소가 동시에 Astryx 클래스를 가지면 유출. (2) element 유출 — Astryx solid Button(대비색 글자)이 배경을 잃으면 우리 `button` reset 유출.

  **정밀화**: 초판이 "클래스 이름 존재"만 봐서 `.md`(주석 `DESIGN.md` 오인) / `.secondary`(우리는 `.preset-btn.secondary` 복합으로만 씀)를 오탐 → 주석 제거 + **단독 클래스 셀렉터**만 수집(복합/자손은 조상·형제가 함께 있어야 매칭돼 Astryx 를 우연히 안 덮음).

  **실증**: 정상 상태 전 6 라우트 통과 / TASK-145 회귀 재현(button reset 제외 제거) 시 Register(primary) 등 배경 소실 **3건 검출**. admin/runners 는 Register Runner 모달을 자동으로 열어 오버레이 버튼도 검사한다.

  **검증**: TSC clean / vitest **277 불변** / 가드 정상 통과·회귀 검출 실증 / `package.json` `check:css-leak` 등록. 코드 동작 변경 0(가드 도구 + 등록만), 백엔드 영향 0.

  **CSS 유출 방어가 2층 완성됐다**: 정적 lint(항상, bare element) + 실측 가드(opt-in, 클래스 충돌 + element 유출) — B층 대비 가드(정적 A층 + 실측 B층)와 같은 구조.

  **다음 후보**: (1) ~~헤더-본문 24px 정렬~~ 수용 확정 (rev 142, 코드 변경 0) / (2) B층 가드 오버레이 검사 확장 / (3) reset.css 도입 검토(손 CSS 감소로 재검토 시점) / (4) **CI 통합** — B층·문서 무결성·CSS 유출 실측 가드가 모두 앱 기동 단계 필요라 함께 다룰 이월 항목 / (5) 이월: PhaseTimeline 9 phase 수동 복제 / 진단-필드 응답 helper 흡수 / 결정 대기 5종. workflow meta sync (state rev 181→182, handoff 139→140, work_backlog TASK-146 등록, backlog 2026-07-21 rev 23) 같은 commit 안에 포함.
- Updated: 2026-07-22 (rev 138→139: **TASK-145 라우트 CSS 전역 유출 감사 봉인 — 실제 회귀 발견·수정**).

  브랜치 `fix/task-145-css-leak-audit` (병합·push 상태는 `git status -sb`).

  **감사가 진짜 시각 회귀를 발견했다.** Login.css 에서 두 번 나온 유출 패턴(TASK-138 bare label/input, TASK-140 `.card`)을 전 CSS 에서 기계적으로 감사(정적 grep + 실측). 정적 스캔은 bare 일반 클래스 5개(`.badge`/`.banner`/`.chip`/`.form`/`.grid`) 후보만 줬고 **클래스 충돌 실측은 0건**. 그런데 **globals 의 bare `a`/`button` 실측이 진짜 문제를 드러냈다**:

  - Astryx TopNavItem(`<a>`) color 가 우리 `--dib-color-accent-primary` 로 덮임
  - **Astryx Button(`<button>`) background 가 우리 `button { background: none }` 으로 덮여 사라짐**

  실브라우저 확인: BuildRequest 의 **Submit Build** + RegisterRunnerModal 의 **Register**(둘 다 Astryx primary)가 **배경 없이 회색 텍스트**로 렌더 — **모든 Astryx primary/secondary 버튼이 배경을 잃은 상태**였다.

  **근본 원인 — unlayered × element 셀렉터**: 우리 CSS 는 Astryx @layer 보다 우선하는 unlayered 다. `button {}` 은 element 셀렉터라 Astryx `<button>` 에도 적용되고, **unlayered 라 specificity 무관하게 atomic 을 이긴다**. TASK-137(Dialog 이관) 때부터 있던 회귀인데 그동안 못 봤다.

  **오판 정정**: 처음엔 `:where()` 화가 원인이라 의심했으나 원복 후에도 transparent 라 `:where` 무관(specificity 가 아니라 layer 문제)임이 드러났다.

  **수정**: `a`/`button` base reset 을 **`:not([class*="astryx-"])`** 로 Astryx 요소를 매칭에서 제외 → Submit Build 배경 `rgb(126,129,243)` 인디고 **복구**(실측), 순수 `<a>`/우리 버튼 유지. bare `iframe`(ApiConsole.css)도 `.frame-wrap iframe` 스코프.

  **재발 방지 lint**: `css-leak.test.ts` 신규 2건 — 라우트 CSS 에 bare element 셀렉터 금지(globals 예외, @keyframes from/to 제외) + globals 의 a/button 이 Astryx 제외 확인. **실증**: iframe 을 bare 로 되돌리니 lint 정확히 실패, 스코프 후 통과.

  **검증**: TSC clean / vitest **275 → 277** / B층 하이재킹 0 · 대비 위반 0 / Astryx 버튼 배경 복구 / 검수 데이터 정리. 코드 로직 변경 0(CSS 스코프 + 테스트만), 백엔드 영향 0.

  **다음 후보**: (1) **실측 CSS 유출 가드 스크립트화** — 이번에 쓴 "우리 클래스가 Astryx 요소에 붙는가" 실브라우저 검사를 B층처럼 opt-in 스크립트로(정적 lint 가 못 잡는 클래스 충돌 커버). (2) ~~헤더-본문 24px 정렬~~ 수용 확정 (rev 142, 코드 변경 0). (3) B층 오버레이 검사 확장. (4) reset.css 도입 검토. (5) 이월: PhaseTimeline 9 phase 수동 복제 / 진단-필드 응답 helper 흡수 / 결정 대기 5종. workflow meta sync (state rev 180→181, handoff 138→139, work_backlog TASK-145 등록, backlog 2026-07-21 rev 22) 같은 commit 안에 포함.
- Updated: 2026-07-22 (rev 137→138: **TASK-144 Astryx 3-5 — 레이아웃 셸 → `AppShell`+`TopNav` 봉인, 3단계 마지막 큰 이관**).

  브랜치 `feat/task-144-appshell` (병합·push 상태는 `git status -sb` 를 볼 것). **이것으로 Astryx 컴포넌트 이관이 사실상 마무리됐다.**

  **사용자 결정 2건**: 이관 범위 = **AppShell 전면 교체** / 폭 = **Astryx 기본값 따름**(`--dib-layout-max` 제거).

  **이관**: `Header` + `<main class=app-main>` → `AppShell topNav={<AppHeader/>}` (height="auto" / contentPadding={4}). `AppHeader` 신규 — Header 로직(admin auto-enable/logout/prefetch) 유지, 마크업만 TopNav 슬롯. **react-router 통합**: Astryx 링크는 `as` 컴포넌트에 `href` 를 넘기는데 `Link` 는 `to` 를 읽으므로 `RouterLink` 어댑터(href→to, 외부·`_blank` 는 네이티브 `<a>`) + `<LinkProvider component={RouterLink}>` **전역 등록** → 모든 Astryx 링크가 SPA 내비게이션. **얻은 것**: skip-to-content 자동 / `role="main"` 랜드마크 / responsive mobile-bar+drawer. **제거**: `Header.tsx`·`css`(298줄) + `--dib-layout-max`/`gutter`/`header-h` + globals 의 `.app-main`/`#app-react` flex/반응형 gutter. 손 CSS 2,120 → **1,956줄**.

  **모바일 반응형 회귀 — 발견하고 해결** (사용자 "지금 고치고 봉인"): 이관 직후 **모바일 390px 가로 스크롤**(TASK-132 회귀). **원인 규명**: (1) AppShell 의 `mobileNav` 자동 처리는 **SideNav 전용**이다. (2) TopNav 의 mobile-bar 모드는 **startContent(nav items)만 숨기고 endContent 는 그대로** 둔다. (3) 우리가 endContent 에 링크 3개(API Console/OpenAPI/Docs)를 넣어 모바일에서 넘쳤다(login 페이지 585px, FilterChips 무관). **해결**: 탐색 링크 전부를 startContent 로 이동(mobile-bar 가 숨김 + 햄버거 drawer 로 접근), endContent 는 세션 컨트롤(@user/Logout/Theme)만, `mobileNav={{breakpoint:"md"}}` 명시, FilterChips `.page-head`/`.chips` 에 `flex-wrap`(칩 잘림 해결). **부수효과**: 데스크톱 헤더도 개선(탐색 좌측 / 컨트롤 우측 분리).

  **jsdom 폴리필**: AppShell 이 `ResizeObserver` 를 써서 App.test 4건이 죽었다 → `test/setup.ts` 에 no-op 폴리필(Dialog 폴리필과 같은 자리). **반응형 브레이크포인트 동작은 jsdom 으로 검증 불가**라 실브라우저에 맡긴다고 주석 명시.

  **테스트**: `Header.test`(14) → `AppHeader.test`(8). TopNav 로 링크 testid 가 사라져 접근성 질의(role="link"+name)로 전환, 지속 계약(로그인 시 링크 노출 / admin auto-enable / logout / 외부 링크 target)만 유지.

  **검증**: TSC clean / vitest **275** / B층 하이재킹 0 · 대비 위반 0 / skip-to-content 자동 / **모바일 390px 가로 스크롤 0 · 햄버거 drawer · 칩 4개 전부 표시** / Login 회귀 없음.

  **번들**: 초기 JS gzip 94.66 → **134.63** (+40). **AppShell/TopNav 는 셸이라 모든 페이지가 쓰므로 초기 번들 필수 비용**이다(라우트 청크로 뺄 수 없다). CSS gzip 24.51 → 24.07.

  **남은 것 (수용 확정, 코드 변경 0)**: 헤더 브랜드(x=40) vs 본문 heading(x=16) **24px 정렬 어긋남** — TopNav 브랜드 패딩과 AppShell contentPadding 의 기본 차이. "Astryx 기본값 따름" 결정 + TASK-132 의 "손 정렬은 반드시 어긋난다" 교훈으로 픽셀 조정하지 않고 수용. 거슬리면 contentPadding 조정 가능(단 반응형 재어긋남 위험). rev 142 에서 사용자 명시 확정.

  **다음 세션 — Astryx 이관이 마무리됐으므로 마감/보강 국면**: (1) ~~헤더-본문 24px 정렬~~ 수용 확정 (rev 142, 코드 변경 0) / (2) **라우트 CSS 전역 유출 감사** — Login.css 에서 두 번 연속 나왔으므로 다른 파일에도 `.card` 같은 일반 클래스명·bare 셀렉터 충돌 가능 / (3) B층 가드 오버레이(모달) 검사 확장 / (4) **reset.css 도입 검토** — 손 CSS 가 1,956줄로 줄었으니 전역 리셋 재검토 시점 / (5) 이월: PhaseTimeline 9 phase 수동 복제 / 진단-필드 응답 helper 흡수 / 결정 대기 5종. workflow meta sync (state rev 178→179, handoff 137→138, work_backlog TASK-144 등록, backlog 2026-07-21 rev 21) 같은 commit 안에 포함.
- Updated: 2026-07-22 (rev 136→137: **TASK-143 admin 라우트 통합 테스트 복원 + PROJECT_PROFILE §3.4 정정 봉인**).

  브랜치 `feat/task-143-admin-tests` (병합·push 상태는 `git status -sb` 를 볼 것).

  **왜 필요했나**: admin 라우트 테스트는 **Svelte 트리에만** 있었고 TASK-101(`313ae2e`)이 삭제했다. React 트리로는 이관된 적이 없어 TASK-084 의 admin 가드 라우트 레벨 회귀가 2026-07-18 이래 부재했다(TASK-137 발견). **그 공백의 대가를 TASK-142 유령 헤더 결함으로 치렀다** — 이 테스트가 있었으면 잡혔을 것이다.

  **복원**: 살아있는 테스트(`admin-guard.test` 헬퍼 / `AdminAccessDenied` 패널 / `AdminTabs` 탭)가 이미 덮는 것은 반복하지 않고, **라우트가 실제로 가드를 호출하고 그 결과에 맞게 동작하는가** 라는 통합 계약에 집중했다. `react/src/routes/admin-routes.test.tsx` 신규 **15건**:
  - **4 라우트 공통 3 시나리오** (AdminBuilds/Users/Runners 는 `describe.each`, AdminAdmins 는 store 기반이라 별도): userId 없음 → `/` redirect + backend·가드 **미호출** / 비-admin → AdminAccessDenied + **목록 API 미호출**(defense in depth) / admin → 정상 렌더 + 목록 API 호출(callerId 로 admin id 전달)
  - **페이지 고유 회귀**: AdminBuilds **유령 헤더**(정확히 Status/Build/App/Owner/Updated 5열, Project/Repository 없음) / AdminUsers recent 패널 / AdminRunners Register Runner 모달

  **유령 헤더 가드 실증**: 가드를 만든 것과 가드가 동작하는 것은 다르므로 **결함을 되살려** 확인했다 — `buildColumns(true)` 를 Project/Repository 유령 컬럼을 섞은 버전으로 임시 교체 → 해당 테스트가 **정확히 실패**, 원복 후 통과. 발견 과정에서 구현 특성도 확인: **AdminBuilds 는 `visible.length === 0` 이면 "No builds" 분기라 Table 을 렌더하지 않는다** — 헤더 검사는 빌드 1건이 필요하다(반영).

  **PROJECT_PROFILE §3.4 정정**: 문서가 "admin 페이지 test 4종 신규 케이스 합계 5건" 을 **현재 사실로** 서술 중이었으나 그건 삭제된 Svelte 것이었다. React 통합 테스트로 교체하고 경위(Svelte 전용 → TASK-101 삭제 → 미이관 → TASK-143 복원)를 명시했다.

  **검증**: TSC clean / vitest **266 → 281** / 유령 헤더 가드 실증(재현 시 실패·정상 시 통과) / 문서 무결성 가드 통과. 코드 동작 변경 0(테스트 + 문서만), 백엔드 영향 0.

  **다음: 3-5 `AppShell`+`TopNav` ← 레이아웃 셸** (3단계의 마지막 큰 이관). TASK-132 가 손으로 만든 셸(`--dib-layout-max`/`--dib-header-h`/`<main class=app-main>`/Header)을 Astryx `AppShell`+`TopNav` 로 대체. AppShell 은 responsive mobile nav + skip-to-content 를 자동 처리한다. 단 TASK-132 가 실측한 정렬(272/272)을 Astryx 기준으로 **재검증** 필요. Header 재구성 시 admin 조건부 노출 로직이 얽혀 있는데, **이제 TASK-143 의 admin 통합 테스트가 안전망을 깔았으므로 셸 교체가 admin 진입을 깨면 잡힌다.**

  이월: 라우트 CSS 전역 유출 감사 / B층 가드 오버레이 검사 / `PhaseTimeline.tsx` 9 phase 수동 복제 / 진단-필드 응답 helper 흡수 / 결정 대기 5종. workflow meta sync (state rev 177→178, handoff 136→137, work_backlog TASK-143 등록, backlog 2026-07-21 rev 20) 같은 commit 안에 포함.
- Updated: 2026-07-22 (rev 135→136: **TASK-142 Astryx 3-4b — Admin 테이블 이관 + BuildRow 제거 봉인**).

  브랜치 `feat/task-142-admin-table` (병합·push 상태는 `git status -sb` 를 볼 것).

  TASK-141 이 만든 `buildColumns.tsx` 를 그대로 재사용해 AdminBuilds / AdminUsers 를 Astryx `Table` 로 이관했고, 두 사용처가 사라져 **`BuildRow.tsx`(111줄) 삭제**. buildColumns 의 재사용 설계가 검증됐다.

  **발견한 기존 결함 — AdminBuilds 유령 헤더.** 헤더가 **6열**(Status/Build/Project/Repository/Owner/Updated)을 선언했는데 `BuildSummary` 에는 `project`/`repository` 필드가 **존재하지 않는다**. 본문 `BuildRow` 는 App(appName) 한 열이었다 — 즉 "Project | Repository" 는 **존재하지 않는 데이터를 가리키는 유령 헤더**였고 헤더 6열 vs 본문 4~5열로 정렬이 어긋나 있었다. **admin 라우트 테스트가 삭제된 상태(TASK-137 에서 발견)라 이 결함이 잡히지 않았다.** `buildColumns(true)`(5열)로 이관하며 헤더-본문이 단일 정의로 통일돼 **자동 해소**됐다 (실브라우저 헤더 6 → 5 확인).

  **이관 상세**: AdminUsers recent-builds 패널은 `buildColumns(false)` — owner 는 이미 `@selectedUser` 로 필터된 단일 사용자라 열로 반복하지 않는다. user rollup 테이블(User/Builds/Last build)은 손 테이블 그대로 유지. 배지 정책(TASK-141)이 admin 에도 적용됨(실브라우저 BUILDING/FAILED 배지 확인).

  **flaky 테스트 안정화**: BuildRow 삭제 후 전체 스위트에서 `App.test.tsx` 의 "renders the BuildsList" 가 **간헐적으로** 실패했다(격리 실행은 항상 통과). TASK-139 지연 로드의 `findBy` 기본 타임아웃(1000ms)이 전체 스위트를 함께 돌릴 때 부하로 초과된 것이다. 청크 로딩을 기다리는 성격이 분명하므로 타임아웃을 **5000ms 로 명시**(로직 검증이 아니라 I/O 대기). **3회 연속 266 통과**로 해소 확인.

  **검증**: TSC clean(BuildRow 삭제 후에도) / vitest **266 불변** / B층 통과 / AdminBuilds 헤더 6 → 5 정렬 + @bob owner + 배지 정책 / AdminUsers recent 4열 + 배지 + rollup 유지 / 검수 데이터 정리(`build_request` 0건).

  **번들**: 초기 JS gzip 94.65 → **94.66**(불변), admin 청크 거의 불변(Table 은 공용 청크 공유). `BuildRow.tsx` 111줄 삭제, StatusPill 실사용 5파일로 정리.

  **다음: 3-5 `AppShell`+`TopNav` ← 레이아웃 셸** — TASK-132 가 손으로 만든 셸(`--dib-layout-max` / `--dib-header-h` / `<main class=app-main>`)을 Astryx `AppShell`+`TopNav` 로 대체. AppShell 은 responsive mobile nav + skip-to-content 를 자동 처리한다. 단 TASK-132 가 실측해 맞춘 정렬(272/272, 헤더-본문 기준선 일치)을 Astryx 기준으로 **재검증**해야 한다. **이것이 3단계의 마지막 큰 이관이다.**

  이월: **admin 라우트 테스트 4종 복원**(이번에 유령 헤더 결함을 놓친 직접 원인) + PROJECT_PROFILE §3.4 정정 / 라우트 CSS 전역 유출 감사 / B층 가드 오버레이 검사 / `PhaseTimeline.tsx` 9 phase 수동 복제 / 결정 대기 5종. workflow meta sync (state rev 175→176, handoff 135→136, work_backlog TASK-142 등록, backlog 2026-07-21 rev 19) 같은 commit 안에 포함.
- Updated: 2026-07-22 (rev 134→135: **TASK-141 Astryx 3-4 — BuildsList → `Table` + StatusPill 배지 정책 변경 봉인**).

  브랜치 `feat/task-141-buildslist-table` (병합·push 상태는 `git status -sb` 를 볼 것).

  **핵심은 Table 이관이 아니라 배지 정책 변경이다.** Astryx `Badge` 문서가 *"정상 상태에 success 배지를 달지 말라 / 모든 행에 같은 배지를 반복하지 말라 — 정보가 아니라 노이즈다"* 를 명시하는데, 빌드 목록은 대부분의 행이 COMPLETED 로 끝난다. 전부 초록 배지를 달면 화면이 초록으로 덮이고 **정작 봐야 할 FAILED 가 묻힌다.**

  세 안(직역 이관 / Table 만 이관 / 권고 반영) 중 사용자가 **권고 반영**을 선택했다 — **주의가 필요한 상태만 배지**:

  | | 상태 | 표시 |
  |---|---|---|
  | warning | PREPARING_SOURCE, BUILDING | 배지 |
  | info | TESTING, DEPLOYING, CLAIMED, TEST_READY, PROVISIONING, PREVIEW_* | 배지 |
  | error | FAILED, DISABLED | 배지 |
  | — | RECEIVED, QUEUED, *_SUCCESS, COMPLETED, CANCELLED, EXPIRED, ACTIVE | **평문** |

  **`success` variant 를 어떤 상태에도 쓰지 않는 것**이 정책의 핵심이다 (성공은 기대되는 결과이므로 강조할 이유가 없다). 테스트로 고정했다. **실브라우저 확인**(COMPLETED 2 / FAILED 1 / BUILDING 1 시드): `BUILDING [배지]` `FAILED [배지]` `COMPLETED (평문)` `COMPLETED (평문)` — 실패와 진행 중이 한눈에 들어온다.

  이 변경은 `StatusPill` 을 쓰는 **6개 파일 전체**에 전파된다 (BuildRow / PhaseTimeline / AdminRunners / BuildDetail / BuildRequest).

  **a11y 계약 유지**: 평문으로 낮췄다고 스크린리더에서 상태가 사라지면 안 되므로, **배지든 평문이든** `role="status"` + `aria-label="Status: <STATUS>"` 를 동일하게 유지했다.

  **Table 이관**: 손수 만든 `<table>` + `BuildRow` → Astryx `Table`. 열 정의를 `buildColumns.tsx` 로 분리해 **AdminBuilds / AdminUsers 이관 때 재사용**할 수 있게 했다(`withOwner` 로 5열 지원). "Build" 셀은 탐색이므로 `Link` 유지. **과도기 중복**: admin 2종이 아직 `BuildRow` 를 쓰므로 셀 렌더링이 두 곳에 있다 — admin 이관 후 `BuildRow.tsx` 를 지운다.

  **테스트**: 기존 `StatusPill.test.tsx` 는 인라인 스타일 세부(`--dib-pill-color` / `padding 4px` / `alpha 15%`)에 결합돼 있었고 그 구현을 의도적으로 걷어냈으므로 해당 단언도 함께 제거했다. **지속되는 계약**(a11y / 상태→심각도 / lifecycleStatus 우선 / UNKNOWN)만 남겨 43건 재작성. `BuildsList.test.tsx` 의 `getAllByTestId("build-row")` 는 Table 이 자체 행을 렌더하므로 **시맨틱 `role="row"`** 로 전환(검증 의도 동일).

  **검증**: TSC clean / vitest **246 → 266** / B층 하이재킹 0 · 대비 위반 0 / 실브라우저 정책 확인(양 테마) / 테이블 4열·4행·hover·우측 정렬 / 검수 데이터 정리(`build_request` 0건).

  **번들**: 초기 JS gzip 94.59 → **94.65**(사실상 불변), BuildsList 청크 0.92 → **12.07**. TASK-139 분할 덕에 Table 비용이 그 라우트에만 실렸다.

  **측정 오류 1건 (자기 정정)**: 브라우저에서 행 수를 `querySelectorAll('[role="row"]')` 로 세다 **0** 이 나와 "테이블이 안 그려졌다" 고 오판했다. 속성 선택자는 `<tr>` 의 **암묵 role** 을 잡지 못한다 (RTL 의 `getAllByRole` 은 잡는다). `tbody tr` 로 세니 4행 정상. **TASK-140 에 이어 측정 방법 오류가 반복되고 있다** — DOM 을 볼 때 암묵 role / 렌더 경로 차이를 먼저 확인할 것.

  **다음**: (1) **AdminBuilds / AdminUsers 를 `buildColumns` 로 이관** → `BuildRow.tsx` 제거. (2) **3-5 `AppShell`+`TopNav` ← 레이아웃 셸** — TASK-132 의 수작업을 대체하되 그때 실측한 정렬(272/272)을 Astryx 기준으로 **재검증**해야 한다. 이월: 라우트 CSS 전역 유출 감사 / B층 가드 오버레이 검사 / admin 라우트 테스트 4종 복원 + PROJECT_PROFILE §3.4 정정 / `PhaseTimeline.tsx` 9 phase 수동 복제 / 결정 대기 5종. workflow meta sync (state rev 174→175, handoff 134→135, work_backlog TASK-141 등록, backlog 2026-07-21 rev 18) 같은 commit 안에 포함.
- Updated: 2026-07-22 (rev 133→134: **TASK-140 Astryx 3-3 — LogStream → `CodeBlock` 봉인**).

  브랜치 `feat/task-140-logstream-codeblock` (병합·push 상태는 `git status -sb` 를 볼 것).

  **얻은 것**: 로그 **복사 버튼**(이전에는 드래그 선택뿐이라 운영자가 실패 로그를 공유할 수단이 없었다) / 줄 번호 / `maxHeight`·`isWrapped` prop 화(인라인 스타일 14종 제거).

  **보존한 것**: (1) **양 테마 터미널 톤** — `tokens.css` 의 "라이트도 터미널 톤 유지" 는 의도적 선택인데 CodeBlock 은 테마를 따라가므로 `syntaxTheme={tokyoNight}` 로 다크 프리셋을 고정했다(실브라우저 확인). (2) **부분별 색 구분** — 타임스탬프/`[PHASE]` 구분은 "운영자가 빠르게 스캔" 이라는 TASK-091 의 목적 그 자체라, `code: string` 평탄화로 사라지므로 custom `tokenizer` 로 되살렸다.

  **한계 (기록해 둠)**: CodeBlock 은 본래 **코드**용이고 로그는 구조화된 레코드다. 토크나이저로 맞춘 것이지 의미가 완전히 일치하지는 않는다 — 검색·필터·자동 스크롤 요구가 붙으면 전용 컴포넌트로 되돌리는 편이 나을 수 있다.

  **발견한 결함 — `Login.css` 전역 유출, 두 번째.** TASK-138 에서 이 파일의 bare `label {}` / `input {}` 을 고쳤는데 **같은 파일에 같은 종류가 더 있었다**: bare `form {}` / `h1 {}` + 일반 클래스명 `.card` / `.logo` / `.subtitle` / `.btn-primary`. **`.card` 가 실제 피해를 냈다** — Astryx `CodeBlock` 은 `container="card"` 일 때 요소에 literal `card` 클래스를 붙이는데(실측 `astryx-codeblock sm log card`), `.card { max-width: 400px }` 가 unlayered 라 이겨서 **로그 뷰어가 400px 로 잘렸다**(`width="100%"` 를 넘겨 `--x-width: 100%` 도 설정됐는데 그 위에서 `max-width` 가 덮음). 한 규칙만 고치면 재발하므로 **파일 전체를 `.login-page` 스코프로 닫았다** → 로그 뷰어 400 → **1342px**, Login 은 카드 400px·input 47px **불변**(양쪽 실측).

  **자기 정정 2건 — 둘 다 제 측정 오류였다**:
  1. **"토크나이저가 프로덕션에서 동작하지 않는다"** — DOM 에서 `astryx-token-*` span 을 찾았는데 없었다. 실제로는 CodeBlock 이 경로를 나눈다: `useSpans = 'spans' || (auto && !hasHighlightAPI()) || (auto && isSafari())`. **jsdom 은 CSS Custom Highlight API 가 없어 span 경로, Chrome 은 있어 Range 기반 `::highlight()` 경로**라 DOM 은 평문이고 색은 Highlight API 가 입힌다 (`CSS.highlights.size === 2` 확인, 화면에서도 색 정상). **span 이 없다 ≠ 색이 없다.** → 부작용: `LogStream.test.tsx` 의 색 검증은 **span 폴백 경로**를 검사한다(Chrome 사용자가 보는 경로가 아니다) — 테스트에 주석으로 남겼다.
  2. **"라이트 모드에서 배경이 흰색"** — 바깥 컨테이너를 재고 있었다. 실제 코드 영역은 양 테마 모두 다크였다.

  **테스트 — 무의미해진 단언 1건을 발견해 고쳤다.** BuildDetail 의 `expect(queryAllByTestId("log-entry")).toHaveLength(0)` 은 이관 후 `log-entry` 요소 자체가 사라져 **로그가 렌더되든 말든 항상 통과**하게 됐다. 실제로 비어 있는지 보도록 바꿨다(CodeBlock 은 빈 내용에도 zero-width space 를 렌더). `LogStream.test.tsx` 신규 7건 — 색 검증은 **색이 지정돼 있는지 먼저 확인**해 공허한 통과를 막았다.

  **검증**: TSC clean / vitest **239 → 246** / B층 하이재킹 0 · 대비 위반 0 / 실브라우저 양 테마(다크 터미널 톤·줄 번호·색 구분·복사 버튼·전체 폭) / Login 회귀 없음 / 검수 데이터 정리(`build_request` 0건).

  **번들 — TASK-139 의 전제가 그대로 확인됐다**: 초기 JS gzip 94.56 → **94.59**(사실상 불변), BuildDetail 청크 3.15 → **12.14**. CodeBlock 비용이 **그것을 쓰는 라우트 청크에만** 실렸다. `LogStream.tsx` 107 → 137줄 — 이 이관은 코드를 줄이는 게 아니라 **기능을 얻는** 이관이었다.

  **다음: 3-4 `Table` ← BuildsList.** 착수 전 **StatusPill → Badge 논점 선결 필요** — Astryx Badge 문서가 *"모든 행에 같은 배지를 반복하지 말라(정보가 아니라 노이즈)"* 를 명시하는데 BuildsList 는 전 행에 StatusPill 을 렌더한다. 이어서 3-5 `AppShell`+`TopNav`.

  **신규 follow-up: 다른 라우트 CSS 도 전역 유출 감사 필요** — Login.css 에서 두 번 연속 나왔으므로 `.card` 같은 일반 클래스명 충돌이 다른 파일에도 있을 수 있다. 이월: B층 가드 오버레이 검사 / admin 라우트 테스트 4종 복원 + PROJECT_PROFILE §3.4 정정 / `PhaseTimeline.tsx` 9 phase 수동 복제 / 결정 대기 5종. workflow meta sync (state rev 173→174, handoff 133→134, work_backlog TASK-140 등록, backlog 2026-07-21 rev 17) 같은 commit 안에 포함.
- Updated: 2026-07-22 (rev 132→133: **TASK-139 라우트 지연 로드 봉인** — Astryx 이관 재개 전 정지작업).

  브랜치 `feat/task-139-route-lazy` (병합·push 상태는 `git status -sb` 를 볼 것).

  **왜 이관을 멈추고 이걸 먼저 했나**: 라우트 9종이 **전부 정적 import** 라 모든 사용자가 모든 페이지 코드를 초기 번들로 받고 있었다 — `/login` 만 여는 사용자도 admin 4종과 빌드 요청 폼을 함께 내려받는다. TASK-138 에서 **BuildRequest 한 페이지**를 옮기자 초기 JS gzip 이 104.30 → 134.51 로 뛰었고, 남은 이관(LogStream / BuildsList / 레이아웃 셸)마다 같은 증가가 반복될 구조였다. TASK-137 의 모달 `lazy` 는 국소 처방이라 **메인 라우트가 Astryx 를 쓰기 시작하면 효과가 없다**는 것이 TASK-138 에서 드러났다.

  **구현**: `Login` 을 제외한 8종을 `React.lazy` + `Suspense` 로 분리. **`Login` 만 eager 인 이유** — `/` 가 `/login` 으로 redirect 하므로 인증 전 사용자의 **첫 화면**이고, 이것까지 lazy 면 첫 페인트에 청크 왕복이 하나 더 붙는다. `Suspense` fallback 은 각 페이지가 자체 로딩에 쓰는 `.muted` 문구와 같은 형태라 전환이 튀지 않는다.

  **효과 (실측, gzip)**:

  | | TASK-136 (이관 전) | TASK-138 | **TASK-139** |
  |---|---|---|---|
  | 초기 JS | 98.21 | 134.51 | **94.56** |
  | 초기 CSS | 27.38 | 26.88 | **24.51** |
  | **초기 합계** | 125.59 | 161.39 | **119.07** |

  `/login` 진입 기준 **-42.3KB gzip**. 주목할 점은 초기 JS 가 **Astryx 이관을 시작하기 전인 TASK-136 의 98.21 보다도 낮아졌다**는 것 — 분할이 이관 비용을 상쇄하고도 남았다. CSS 도 라우트별로 쪼개졌고(BuildsList 0.78 / BuildRequest 1.22 / admin 각 0.74~0.93), 공용 Astryx 폼 기계장치는 `TextInput` 청크(gzip **29.57**)로 분리되어 **그것을 쓰는 페이지에서만** 로드된다.

  **실브라우저 확인**: `/login` 초기 진입 JS **299,094 bytes**(메인 청크만) → Builds / New Build / API Console 탐색 시 필요한 청크만 **374,960 bytes** 추가 로드. 탐색·렌더 정상.

  **테스트 조정 2건**: `App.test.tsx` 의 BuildsList / BuildDetail 검증이 동기 `getBy` 였는데 지연 로드는 본질적으로 비동기라 `findBy` 로 바꿨다 — **검증 대상(라우터가 이 경로에 이 페이지를 붙이는가)은 그대로다.** BuildDetail 테스트에는 주석을 남겼다: 여기서 기다리는 것은 **청크 로딩**이고, 검증 대상인 **BuildDetail 자체의 loading state** 는 `getBuild` 가 영원히 pending 이라 그대로 남아 있다 — 둘을 혼동하면 가드가 무의미해진다.

  **검증**: TSC clean / vitest **239 불변** / B층 하이재킹 0 · 대비 위반 0 / 실브라우저 탐색 정상. 백엔드 영향 0.

  **다음: 3-3 `CodeBlock` ← LogStream.** 라우트 분할이 끝났으므로 **이후 이관은 해당 라우트 청크만 커지고 초기 로드에는 영향이 없다** — 매 단계 번들 기록은 계속하되 압박은 줄었다. 이어서 3-4 `Table` ← BuildsList(**StatusPill → Badge 논점 선결**) / 3-5 `AppShell`+`TopNav` ← 레이아웃 셸.

  이월: B층 가드가 오버레이(모달)를 검사하지 못함 / **admin 라우트 테스트 4종이 없는데 PROJECT_PROFILE §3.4 는 있다고 서술 중** / `PhaseTimeline.tsx` 9 phase 수동 복제 / 진단-필드 응답 helper 흡수 / 결정 대기 5종. workflow meta sync (state rev 171→172, handoff 132→133, work_backlog TASK-139 등록, backlog 2026-07-21 rev 16) 같은 commit 안에 포함.
- Updated: 2026-07-22 (rev 131→132: **TASK-138 Astryx 3-2 — BuildRequest 폼 → `TextInput`/`NumberInput` 봉인**).

  브랜치 `feat/task-138-buildrequest-form` (병합·push 상태는 `git status -sb` 를 볼 것).

  **착수 중 TASK-137 기록의 오기를 발견해 정정했다 (별도 커밋 `4e09115`).** Astryx `TextInput` 동작을 실측하다 "사전 결함 3" 이 사실이 아님을 확인 — `data-testid` 는 **실제 `<input>` 에** 붙고 `getByLabelText` 와 동일 요소이며 `fireEvent.change` 도 정상 동작한다(원래 질의로 되돌려 재현 → 통과). 당시 4건 실패는 error-testid 3건 + **Escape 1건**이었고 `"called 1 times, got 0"` 은 `onSuccess` 가 아니라 `onClose` 였다. **실패 목록을 정확히 읽지 않고 원인을 추정한 것이 잘못이다.** 덕분에 본 TASK 는 기존 회귀 18건의 `getByTestId` 결합을 **그대로 유지**할 수 있었다.

  **구현**: 8개 필드가 `<label><span><input><small>` 를 각각 반복하던 약 130줄을 **`FIELDS` 선언 테이블 + `.map()`** 으로 대체 — 라벨·힌트·필수 표시·에러 결속이 한 곳에 모여 필드 간 어긋남이 구조적으로 사라진다. `errorPath` 로 검증 오류를 **해당 입력에 결속**(실브라우저에서 `aria-invalid="true"` + `aria-describedby` 확인). **요약 배너는 유지** — 필드 결속 + 요약 병행이 폼 접근성 권장 패턴이다. 액션 버튼 2종은 Astryx `Button` 으로, 단 **"View Builds list" 는 `Link` 로 유지**(탐색이므로 버튼으로 바꾸면 새 탭·주소 복사가 막히고 스크린리더가 button 으로 읽는다).

  **TASK-099 의 ref 우회는 불필요했다.** "React state batching 회피" 로 8개 input 에 ref 를 달아 submit 시점 DOM 값을 직접 읽던 것을 state 읽기로 되돌렸고, **기존 회귀 18건이 그대로 통과하는지로 그 우회가 실제로 필요했는지 확인했다** — 통과했다.

  **사전 결함 2건**:
  1. **`NumberInput` 의 `min` 은 화면과 상태를 갈라놓는다 (실측).** `min={1}` 인 입력에 `"0"` 을 넣으면 **표시값은 0 인데 `onChange` 가 호출되지 않아 상태는 이전 값(60)으로 남는다** — 사용자가 보는 값과 제출될 값이 다르다. → `min` 을 일부러 넘기지 않고 범위 검증을 우리 쪽에 두어 `status` 로 필드에 결속.
  2. **`Login.css` 의 bare element 셀렉터가 앱 전체로 유출되고 있었다.** `label {}` / `input {}` 이 스코프 없이 선언돼 있었고, 라우트 CSS 는 한 번들로 합쳐지고 **unlayered 라 Astryx 의 @layer 보다 우선**한다 — Login 을 거치지 않아도 다른 페이지의 Astryx `TextInput` 내부 input 을 덮었다. **실제 피해**: BuildRequest 이관 직후 입력 높이가 **48.8px** 이 되어 Astryx 의 **32px** 래퍼를 뚫고 나오고 힌트와 **4px 겹쳤다** (`padding:12px`/`font-size:16px` 이 정확히 Login 의 `--dib-space-md`/`--dib-size-md`). → `.login-page` 스코프로 한정. 수정 후 입력 20px/padding 0/래퍼 초과 없음, **Login 은 47px 로 불변**(양쪽 실측). TASK-132 의 중복 `@import` 와 같은 계열 — **페이지 CSS 가 자기 경계를 넘는 구조**.

  **검증**: 기존 회귀 **18/18 그대로 통과**(질의 변경 없이) / TSC clean / vitest **239 불변** / B층 하이재킹 0 · 대비 위반 0 / 겹침 해소 실측 / Login 회귀 없음.

  **번들 — 라우트 지연 로드가 시급해졌다**:

  | | TASK-137 | TASK-138 |
  |---|---|---|
  | 초기 JS gzip | 104.30 | **134.51** |
  | 모달 청크 gzip | 38.21 | **8.99** |
  | CSS gzip | 26.99 | **26.88** |

  모달 청크가 준 것은 공용 폼 기계장치가 **초기 번들로 이동**했기 때문이다(BuildRequest 는 메인 라우트인데 정적 import). 모달을 여는 사용자 총량은 142.51 → 143.50 으로 거의 같지만 **`/login` 만 여는 사용자도 +30.2KB 를 받는다.** 손 CSS **2,175 → 2,120줄**.

  **다음 세션 권장: 라우트 지연 로드를 먼저 (TASK-139 후보).** 라우트 9종이 전부 정적 import 라 이관이 진행될수록 모든 사용자의 초기 번들이 같이 커진다. TASK-137 에서 모달 하나를 lazy 로 뺐지만 그건 국소 처방이고, 메인 라우트가 Astryx 를 쓰기 시작하면 효과가 없다. 3-3(LogStream)·3-4(BuildsList) 를 이관하면 같은 증가가 반복되므로 **먼저 깔아두는 편이 낫다.** 이어서 3-3 `CodeBlock` ← LogStream / 3-4 `Table` ← BuildsList(**StatusPill → Badge 논점 선결**) / 3-5 `AppShell`+`TopNav` ← 레이아웃 셸.

  이월: B층 가드가 오버레이(모달)를 검사하지 못함 / **admin 라우트 테스트 4종이 없는데 PROJECT_PROFILE §3.4 는 있다고 서술 중** / `PhaseTimeline.tsx` 9 phase 수동 복제 / 진단-필드 응답 helper 흡수 / 결정 대기 5종. workflow meta sync (state rev 170→171, handoff 131→132, work_backlog TASK-138 등록, backlog 2026-07-21 rev 15) 같은 commit 안에 포함.
- Updated: 2026-07-21 (rev 130→131: **TASK-137 Astryx 3-1 — RegisterRunnerModal → `Dialog` 이관 봉인**).

  브랜치 `feat/task-137-dialog-migration`. **병합·push 상태는 `git status -sb` / `git log origin/main..main` 을 볼 것** (봉인 시점 서술이 세 번 연속 낡아 정정 커밋이 났으므로 확정 서술을 하지 않는다).

  **착수 시 발견 — 이관 대상에 테스트가 0이었다.** `RegisterRunnerModal` 은 물론 **admin 라우트 4종 전부** 테스트 파일이 없다. 그런데 `docs/PROJECT_PROFILE.md` §3.4 는 "admin 페이지 test 4종 신규 케이스 합계 5건" 을 사실로 서술 중이다. git 이력 확인 결과 그 테스트들은 **Svelte 트리에만**(`apps/build-monitor/src/routes/Admin*.test.ts`) 있었고 **TASK-101(`313ae2e`)이 삭제**했으며 React 트리로는 **한 번도 이관된 적이 없다.** TASK-084 의 admin 가드 라우트 레벨 회귀 5건이 2026-07-18 이래 사라진 상태다. TASK-131 의 문서 무결성 가드는 줄 수·placeholder 만 보므로 이런 **주장-실제 불일치**는 못 잡는다.

  **이관 방식 (앞으로의 본보기)**: 테스트가 0인 컴포넌트를 바로 뜯으면 무엇이 깨졌는지 알 수 없다. **특성화 테스트 10건을 먼저 써서 현재 구현에서 10/10 통과를 확인한 뒤** 이관했고, 이관 후에도 같은 10건이 통과했다 — "겉만 바뀌고 계약은 유지됐다"의 근거.

  **이관으로 실제로 얻은 것** (전부 실브라우저 확인):
  - 손수 만든 `<div role="dialog">` 는 **`:modal` 이 아니었고 포커스 트랩도 없었다** (Tab 으로 모달 밖으로 나갈 수 있었다) → 네이티브 `<dialog>`, `:modal` **true**
  - `purpose="form"` — 입력 시작 후 backdrop 클릭 무시. **이전에는 타이핑 도중 backdrop 을 잘못 눌러도 닫혀서 입력이 날아갔다**
  - `setTimeout(0)` 포커스 해킹 → `hasAutoFocus`
  - 에러가 `TextInput status` 로 **필드에 결속** (이전엔 별도 문단이라 AT 가 어느 입력인지 몰랐다)
  - CSS 148줄 삭제

  **사전 결함 4건**: (1) **`Button`/`Badge` 는 children 이 아니라 `label` prop** — TSC 가 TS2741 로 잡았다. TASK-135 의 렌더 스파이크는 vitest 라 타입검사를 안 거쳐 children 으로 써도 통과했었다 — **스파이크 통과와 타입 통과는 다르다.** (2) **jsdom 25 가 `showModal()` 미구현** → 9건 실패. `test/setup.ts` 에 폴리필 추가 (**포커스 트랩·backdrop 은 재현하지 않는다** — jsdom 으로 검증 불가라 실브라우저에 맡긴다고 주석 명시). (3) ~~`data-testid` 가 래퍼에 붙어 `fireEvent.change` 가 안 먹음~~ — **오기. TASK-138 에서 실측으로 반박**: testid 는 실제 `<input>` 에 붙고 change 도 정상 동작한다. 당시 4건 실패는 error-testid 3건 + **Escape 1건**이었는데 그것을 성공 테스트 실패로 잘못 읽고 원인을 지어냈다. `getByLabelText` 전환 자체는 정당한 개선이라 유지하되, 그것이 실패 원인은 아니었다. (4) Escape 리스너가 `window` → **dialog 엘리먼트**로 이동 → 발화 지점을 사실에 맞춤 (의도는 유지).

  **번들 — 지연 로드가 필요했다.** 이관 직후 초기 JS gzip 이 **98.21 → 142.57 (+44.4)** 로 뛰었다. Dialog 가 오버레이 기계장치를 끌고 오는데, 라우트가 전부 정적 import 라 **`/login` 만 여는 일반 사용자까지** 그 비용을 받는다. 모달은 이미 조건부 렌더이므로 `lazy`+`Suspense` 로 분리:

  | | TASK-136 | 이관 직후 | 지연 로드 후 |
  |---|---|---|---|
  | 초기 JS gzip | 98.21 | 142.57 | **104.30** |
  | 모달 청크 gzip | — | — | **38.21** (열 때만) |
  | CSS gzip | 27.38 | 26.99 | **26.99** |

  초기 번들 순증 **+6.09KB gzip**. 손 CSS **2,323 → 2,175줄**, 파일 15 → 14.

  **검증**: 특성화 10/10 (이관 전·후 동일) / TSC clean / vitest **229 → 239** / B층 하이재킹 0 · 대비 위반 0 / 실브라우저 `:modal` true + 포커스 dialog 내부 INPUT / 모달 대비 **다크 12.64:1 · 라이트 18.78:1**.

  **자기 정정 1건**: 스크린샷을 보고 "페이지는 다크인데 모달만 라이트"라고 판단했으나 **실측이 반박했다** — 모달 배경은 `rgb(31,31,34)` 로 정상 다크였고 backdrop 이 주변을 덮어 상대적으로 밝아 보였을 뿐이다. 육안 판단을 실측이 뒤집은 사례.

  **드러난 가드 공백**: **B층 가드가 오버레이를 검사하지 못한다** — 3개 라우트를 방문할 뿐 모달을 열지 않는다. 이번엔 수동 측정으로 확인했지만 자동 가드는 덮지 않는다. (sr-only "Close" 텍스트는 rect 0×0 이라 가드의 `isVisible` 이 정확히 건너뛴다 — 오탐 우려 없음 확인.)

  **다음**: **3-2 `Field`+`FormLayout`+`TextInput` ← BuildRequest**. 이어 3-3 `CodeBlock` ← LogStream / 3-4 `Table` ← BuildsList(**StatusPill → Badge 논점 선결**) / 3-5 `AppShell`+`TopNav` ← 레이아웃 셸. follow-up 3건: B층 가드 오버레이 검사 추가 / admin 라우트 테스트 4종 복원 + PROJECT_PROFILE §3.4 정정 / 라우트 지연 로드(admin 4종이 여전히 초기 번들). workflow meta sync (state rev 168→169, handoff 130→131, work_backlog TASK-137 등록, backlog 2026-07-21 rev 14) 같은 commit 안에 포함.
- Updated: 2026-07-21 (rev 129→130: **TASK-136 Astryx 도입 2단계 — 기반 구축 봉인**).

  **✅ 두 브랜치 모두 main 에 병합 완료** — `chore/task-135-astryx-0-1-7` → `feat/task-136-astryx-foundation` fast-forward (`5bcb18f` → `662a828` → **`8894012`**), 작업 브랜치 삭제. 병합 후 main 회귀 재확인: frontend **229** / build-server **178** / TSC 5 clean. **push 완료** — 원격 HEAD `7b9d275` (직전 `61ea7b2`). ahead/behind 0.

  **사용자 결정 3건**: 시각 정체성 = **브랜드 색만 이식**(나머지는 Astryx neutral 위임) / **점진 이관**(매 단계 회귀 통과 유지) / 레이아웃 셸 = **AppShell 로 교체**(3단계에서).

  **재도입 전에 실측한 안전 근거 4가지** — TASK-132 가 제거했던 것을 다시 넣는 것이므로 P0 재발 불가 근거를 먼저 확인했다:
  1. **토큰 충돌 0종** — TASK-134 개명으로 우리 67종 vs Astryx 172종이 안 겹친다. 이름이 안 겹치면 하이재킹이 성립하지 않는다.
  2. **`astryx.css` 에 전역 element 셀렉터 0건 + `:root`/`html`/`body` 규칙 0건** — 순수 스코프 클래스(StyleX atomic)라 우리 마크업에 샐 수 없다.
  3. **@layer 계층** `reset → astryx-base → astryx-theme` 이고 **unlayered 인 우리 손 CSS 가 항상 이긴다** — 점진 이관 중 기존 화면이 밀리지 않는다.
  4. **`light-dark()` 경로 부재** — 우리 CSS 는 이 함수를 안 쓰고 `color-scheme` 을 `:root` 에 명시 선언한다. P0 의 기전이 성립할 수 없다.

  `reset.css` 는 **의도적으로 도입하지 않았다** — 전역 리셋이라 이관 중인 손 CSS 2,000여 줄을 흔들 수 있다. 손 CSS 가 사라진 뒤 재검토.

  **구현**: `theme.ts` 신규(`defineTheme`, **이식 토큰 1종** `--color-accent`) / `themeStore.ts` 신규(Zustand — 테마 상태를 ThemeToggle 지역 state 에서 끌어올렸다. `<Theme mode>` 가 App 보다 **위**에서 같은 값을 봐야 하기 때문이고, 부수적으로 **"토글 버튼이 없는 페이지에서 테마 미적용" 여지**도 해소됐다) / `main.tsx` 에 `ThemedApp` 도입 — **`mode="system"` 을 쓰지 않고** store 값을 명시 전달한다 (Astryx 내부가 `light-dark()` 를 쓰므로 어긋나면 페이지는 다크인데 Astryx 컴포넌트만 light 로 렌더된다) / `theme.test.ts` 신규(브랜드 색이 `theme.ts` 와 `tokens.css` 양쪽에서 일치 — 어긋나면 **같은 화면에 두 가지 인디고**).

  **테스트 조정 2건 (동작 이전에 따른 정당한 갱신)**: (a) store 싱글턴 누수로 테스트 사이 상태가 새어 `beforeEach` 초기화 추가 (이 가드 없이 2건이 깨졌다). (b) "저장값 복원" 검증을 ThemeToggle 마운트 → `themeStore.init()` 으로 이동 — **의도는 그대로 두고 위치만 실제 구현에 맞췄다.** `themeStore.test.ts` 신규 11건.

  **검증**: TSC clean / vitest **216 → 229** / **B층 실브라우저 다크·라이트 × 3 라우트 — 하이재킹 0 · 대비 위반 0**(수용 기준) / 배선 확인 `data-astryx-theme="dib"` · **wrapperIsRoot: true** · `--color-accent` = `light-dark(#4f46e5, #7e81f3)` / 스크린샷 양 테마 정상.

  **가장 의미 있는 확인**: `<Theme>` 가 **P0 때와 똑같이 문서 루트에 속성을 붙였는데도**(`wrapperIsRoot: true`) 하이재킹이 0 이다. "이름이 겹치지 않으면 하이재킹은 성립하지 않는다" 가 실측으로 증명됐다 — TASK-134 결정의 직접 검증.

  **번들 고정비용**: css 41.59 → **163.62KB** (gzip 5.44 → **27.38**) / js 297.03 → **318.62KB** (gzip 90.69 → **98.21**). **아직 Astryx 컴포넌트를 하나도 안 쓴 상태**의 비용이다 (`astryx.css` 는 단일 파일이라 전량). 3단계에서 손 CSS 2,000여 줄이 줄며 상쇄된다 — **상쇄 추이를 매 단계 기록할 것.**

  **다음 세션 = 3단계 컴포넌트 점진 이관. 제안 순서**:
  | 순서 | 대상 | Astryx | 비고 |
  |---|---|---|---|
  | 3-1 | RegisterRunnerModal | `Dialog` | 가장 독립적, 위험 낮음. 미정의 토큰 사고가 있던 파일이라 정리 효과도 큼 |
  | 3-2 | BuildRequest | `Field`+`FormLayout`+`TextInput` | 폼 접근성 이득 최대 |
  | 3-3 | LogStream | `CodeBlock` | 구문 강조 + 복사 버튼을 공짜로 |
  | 3-4 | BuildsList | `Table` | 가장 큼. **StatusPill → Badge 논점 선결** (Astryx Badge 문서가 "모든 행에 같은 배지를 반복하지 말라"를 명시) |
  | 3-5 | 레이아웃 셸 | `AppShell`+`TopNav` | TASK-132 수작업 대체. 정렬 실측 재검증 필요 |

  이월: B층 CI 통합 / `PhaseTimeline.tsx` 9 phase 수동 복제 / 진단-필드 응답 helper 흡수 / 결정 대기 5종. workflow meta sync (state rev 165→166, handoff 129→130, work_backlog TASK-136 등록, backlog 2026-07-21 rev 13) 같은 commit 안에 포함.
- Updated: 2026-07-21 (rev 128→129: **TASK-135 Astryx 0.1.4 → 0.1.7 업데이트 봉인** — 2단계 사전 정지작업).

  **commit `662a828` — main 병합 완료 (작업 브랜치 삭제, 미push).** (TASK-133/134 는 병합 완료, main 이 `origin/main` 보다 3 커밋 앞선 채 미push.)

  **왜 2단계 전에 했나**: 어차피 `<Theme>` 를 재도입하는 김에 최신에 맞추면 breaking change 를 한 번에 처리한다. 3버전치를 재도입 이후로 미루면 **"재도입 때문에 깨진 것"과 "버전 올려서 깨진 것"이 섞여** 원인 분리가 어려워진다.

  **Breaking change 2건 (동봉 CHANGELOG 조사)**:
  - Table plugin render-prop 의 StyleX 배열 필드 `styles` → `xstyle` (`TableRenderProps` 등 6종 + `scrollWrapper` 계약, codemod 제공) → **우리 영향 0** (custom plugin 작성자 대상, 사용처 0)
  - peer `@stylexjs/stylex` `^0.18.3` → **`^0.19.0`** → **영향 있음.** pnpm `unmet peer` 경고 발생 → `@stylexjs/stylex@^0.19.0` 을 **명시 의존성으로 선언**해 해소. 지금까지 transitive 였으나 Astryx 를 실제로 쓸 것이므로 요구사항이 드러나게 두는 편이 낫다.

  **주목할 신규 기능**: `Button` 의 `width` prop (full-width CTA 에서 xstyle override 불필요) / **i18n** (`<InternationalizationProvider>` + `useTranslator()`, 미사용 시 기존 영문 그대로) / authoring factory 를 core 에서 직접 export.

  **검증**: core 0.1.7 / theme-neutral 0.1.7 / stylex 0.19.0, peer 경고 해소 / 렌더 스파이크(임시, 후 제거) — `<Theme>` 안에서 `Button` + `Badge` + **신규 `width` prop** 통과 / **Astryx 토큰 충돌 0종** / TSC clean / vitest **216 불변** / **vite build 산출물이 해시까지 동일** (`index-B9RCS-CJ.css` / `index-Bu3GPmdg.js`) → Astryx 미import 상태라 런타임 동작 변화 0.

  **TASK-134 네임스페이스의 효과 확인**: theme-neutral 0.1.7 은 토큰을 **172종** 정의하는데 우리와 겹치는 것은 **0**. 다만 네임스페이스가 없었다면 겹쳤을 토큰은 4종으로 **0.1.4 때와 동일** — 늘지는 않았다 (과대평가 금지).

  **부수 확인 2건**:
  1. `Badge` 는 children 이 아니라 **`label` prop** — 스파이크 초판이 `<Badge>QUEUED</Badge>` 로 썼다 실패했다. 동봉 **docs CLI** (`node node_modules/@astryxdesign/core/docs.mjs <Component>`) 로 확인. 3단계 이관에서 이 CLI 가 유용하다.
  2. **3단계 설계 논점 발견** — Astryx `Badge` 문서가 *"Don't: Repeat the same badge in every row of a table or list"* 를 명시한다. 그런데 우리 `BuildsList` 는 **모든 행에 StatusPill 을 렌더**한다. StatusPill → Badge 이관은 단순 치환이 아니라 이 논점을 함께 판단해야 한다.

  **다음 세션 우선순위**: (0) 미push 3 커밋 + TASK-135 브랜치 병합 여부. (1) **Astryx 2단계** — `<Theme>` + `astryx.css` 재도입. 충돌 0 이라 안전하며 **B층 가드의 하이재킹 0 확인이 수용 기준**. 비용 예상 CSS gzip **+21.6KB**. (2) **3단계 점진 이관** — Table(BuildsList) / Dialog(RegisterRunnerModal) / Badge(StatusPill, 위 논점 선결) / CodeBlock(LogStream) / Field+FormLayout(BuildRequest). (3) 이월: B층 CI 통합 / PhaseTimeline.tsx 9 phase 수동 복제 / 진단-필드 응답 helper 흡수 / 결정 대기 5종. workflow meta sync (state rev 164→165, handoff 128→129, work_backlog TASK-135 등록, backlog 2026-07-21 rev 12) 같은 commit 안에 포함.
- Updated: 2026-07-21 (rev 127→128: **TASK-134 Astryx 도입 1단계 — 디자인 토큰 네임스페이스 `--dib-*` 봉인**).

  **✅ 두 브랜치 모두 main 에 병합 완료.** `fix/task-133-theme-contrast-guard` → `feat/task-134-token-namespace` 를 fast-forward 로 병합 (`61ea7b2` → `6d60b2d` → **`4147a3f`**), 작업 브랜치 2개 삭제. 병합 후 main 에서 회귀 재확인 — frontend 216 / build-server 178 / TSC 5 clean. **단 아직 push 하지 않았다 — main 이 `origin/main` 보다 2 커밋 앞서 있다.**

  **Astryx 재검토 → "제대로 도입" 결정 (사용자).** 재검토에서 확인한 사실:
  - **진짜 Meta 프로젝트다.** npm maintainer 에 `astryxdesignteam@meta.com` / `opensource+npm@fb.com` / `liya@meta.com`. MIT, 107 컴포넌트, StyleX 기반. 이 앱이 손으로 만든 것과 직접 대응되는 것이 **17종** (Table / Dialog / Badge / CodeBlock / Field / FormLayout / AppShell / TopNav …).
  - **단 4주 된 pre-1.0.** 최초 배포 2026-06-24, latest `0.1.7` 인데 우리는 `0.1.4` 고정 — 한 달에 3버전 뒤처졌다. canary 다수. churn 추적 비용을 감수하기로 한 결정.
  - **StyleX 컴파일러는 불필요했다** — `dist/astryx.css` 로 컴파일된 CSS 를 동봉한다. 즉 TASK-088 PoC 가 미완이었던 것이지 기술적 장벽이 있었던 게 아니다.
  - **`neutralTheme` 은 default 가 아니라 named export** (`import { neutralTheme }`). PoC 가 여기서 막혔을 가능성이 있다 — 스파이크 첫 시도가 정확히 이 오류(`Cannot read properties of undefined (reading 'name')`)로 실패했다.
  - 스파이크 통과: `<Theme theme={neutralTheme}><Button>` 렌더 성공.
  - **번들 비용 실측** (스파이크 후 원복): CSS gzip **5.34 → 26.98** (+21.6 — astryx.css 가 단일 파일이라 컴포넌트 1개만 써도 전량) / JS gzip **90.66 → 103.55** (Button+Badge 기준).

  **본 단계가 선행 필수인 이유**: theme-neutral 과 이름이 겹치는 토큰이 **4종**이었다 — TASK-132 P0 의 직접 원인인 `--color-text-primary`/`secondary`/`disabled` 에 더해 **어제 TASK-133 에서 새로 만든 `--color-on-accent` 까지** 겹쳤다. 이 마지막 항목이 시사적이다: **이름 충돌은 한 번 치우면 끝나는 문제가 아니라, 새 토큰을 만들 때마다 다시 발생하는 구조적 문제**다. 접두사로만 구조적으로 차단된다.

  **실행**: `tokens.css` 선언 66종 + `StatusPill` 지역 선언 `--pill-color` = **67종**을 `--dib-*` 로 개명. 치환은 **긴 이름부터** + 토큰 경계 `(?![a-z0-9-])` 고정 — `--color-text` 를 먼저 바꾸면 `--color-text-primary` 가 깨진다. 대상은 **우리가 선언한 토큰만** (Astryx 토큰 미접촉). `react/src` 31 파일 + `scripts/check-theme-contrast.mjs` (react/src 밖이라 수동 갱신). TASK-133 의 A층/B층 가드는 같은 문자열을 쓰므로 자동 반영됐다.

  **검증**: **Astryx 충돌 4종 → 0종** / 잔여 미개명 0 (남은 3건은 TASK-132 경위를 서술한 주석) / TSC clean / frontend vitest **216 불변** / A층 81 PASS / **B층 실브라우저 다크·라이트 × 3 라우트 하이재킹 0 · 대비 위반 0** / css 38.46 → 41.59KB (gzip 5.34 → 5.44 — 접두사 6자 × 사용처). 백엔드 영향 0. SQL / schema / migration / version / git tag 변경 0.

  **다음 세션 우선순위**: (1) **Astryx 2단계** — `<Theme>` + `astryx.css` 재도입. 충돌 0 이므로 안전하며, **B층 가드가 재도입 직후 하이재킹 0 을 확인하는 것이 수용 기준**이다. (2) **3단계 컴포넌트 점진 이관** — `Table`(BuildsList) / `Dialog`(RegisterRunnerModal) / `Badge`(StatusPill) / `CodeBlock`(LogStream) / `Field`+`FormLayout`(BuildRequest) 우선. 이관이 진행되면 손 CSS 2,323줄이 줄어드는 만큼 astryx.css 의 +21.6KB 를 상쇄한다. (3) `0.1.4 → 0.1.7` 업데이트. (4) 이월: B층 CI 통합 / `PhaseTimeline.tsx` 9 phase 수동 복제 / 진단-필드 응답 helper 흡수 / 기존 결정 대기 5종. workflow meta sync (state rev 162→163, handoff 127→128, work_backlog TASK-134 등록, backlog 2026-07-21 rev 11) 같은 commit 안에 포함.
- Updated: 2026-07-21 (rev 126→127: **TASK-133 테마별 시각 회귀 가드 봉인** — TASK-132 최대 교훈의 직접 대응).

  **✅ main 에 병합 완료** (commit `6d60b2d`, TASK-134 와 함께 fast-forward). 작업 브랜치 삭제. 미push 상태.

  **사용자 결정 3건**: (1) 가드 범위 = **계층 방어 (A+B)** — A층만으로는 TASK-132 의 P0 를 원리적으로 못 잡기 때문. (2) 발견된 AA 위반 = **전수 수정** (allowlist 없이 임계값을 WCAG AA 그대로). (3) 사용처 0건인 Astryx 의존성 2종은 **유지** (재도입 가능성) — 그래서 B층의 가치가 더 크다.

  **A층 (vitest, 항상 실행, +83 케이스)**: `react/src/test/contrast.ts` (파싱 + WCAG 계산. light 맵은 `:root` 상속 후 덮는 **실제 cascade 를 재현** — light 블록만 읽으면 재정의 안 한 토큰에서 실제와 다른 값을 검사하게 된다) + `tokens.contrast.test.ts` 81건 (양 테마 × 본문텍스트 / 비텍스트 UI / 터미널 / **StatusPill 합성 배경** / 솔리드 accent 위 전경 / 중립면 accent + **테마 대칭성**) + `tokens.defined.test.ts` 2건 (미정의 토큰 lint — **폴백이 있어도 실패**로 본다. 폴백은 테마 전환에 반응하지 않아 정확히 TASK-132 P3 증상을 만든다).

  **B층 (opt-in)**: `scripts/check-theme-contrast.mjs` + `pnpm check:theme-contrast`. 의존성은 `playwright-core` (브라우저 미포함) + `channel: "chrome"` — 번들 chromium 은 이 네트워크에서 CDN **ETIMEDOUT** 이라 못 받는다 (TASK-132 와 동일 제약). 검사 2종 = 토큰 하이재킹 + 실제 텍스트 대비.

  **착수 실측 — AA 위반 11건.** TASK-046 이 라이트만 교정하고 **다크 동등물이 없던 비대칭**이 그대로 남아 있었다 (`tokens.css` 주석도 라이트 수정만 기록 중): dark `text-muted` 3.65 / `border-strong` 1.72 / `code-muted` 4.11 / pill primary 3.51 / pill danger 4.18. 그리고 **라이트 StatusPill 4종은 아무도 측정한 적이 없었다** (warning 2.72 / success 3.14 / info 3.39 / danger 3.81) + `.result-head.duplicate` 2.91.

  **핵심 구조 발견**: `--color-accent-*` 하나가 **세 역할**(틴트 위 pill 텍스트 / 솔리드 배경 위 전경 / 중립면 텍스트)을 겸하는데, 라이트는 세 요구가 같은 방향(어둡게)이라 명도 조정으로 동시에 풀리지만 **다크는 정면 충돌**한다. 게다가 **흰 글자 on 앰버는 어떤 명도로도 4.5 에 도달할 수 없다** (최대 2.15 — 앰버가 본질적으로 밝은 색). 같은 앰버에 canvas 색을 얹으면 9.10. 즉 **다크의 실패 원인은 색 선택이 아니라 `color: white` 하드코딩 15곳**이었다 → `--color-on-accent` 토큰 도입 (다크 `#0b0c10` / 라이트 `#ffffff`) 으로 해소. **시각 변화: 다크 모드 primary 버튼·활성 탭·배지 글자가 흰색 → 짙은 색.** 기본 테마가 다크라 첫 화면에서 보인다 (사용자 승인).

  **가드가 즉시 찾아낸 미발견 결함**: `RegisterRunnerModal.css` 가 존재하지 않는 `--color-text` / `--color-border` 를 **9곳**에서 참조 중이었다. TASK-132 가 **같은 파일**의 `--color-bg-elevated` / `--color-bg-input` 만 고치고 놓친 잔여분 (수동 grep 의 한계). 폴백 `#f0f0f0` 는 거의 흰색인데 `.modal` 배경은 `surface-elevated` (라이트 `#dde4ed`) 라 **라이트 모드에서 이 모달만 글자가 안 보이는 상태**였다.

  **사전 결함 3건 (2번이 가장 중요)**: (1) 초기 토큰 해를 canvas 기준으로만 계산 → A층이 `surface` / `surface-elevated` 미달을 즉시 검출, 최악 배경 기준 재계산. **가드가 가드 제작자의 실수를 잡았다.** (2) **B층 하이재킹 검출기 초판이 사고를 놓쳤다** — 초판은 "루트 계산값 vs 하위 계산값" 비교였는데, 사고를 재현해 돌리니 대비 위반 7건은 잡으면서 **하이재킹 0건**이었다. Astryx 는 `<Theme>` 가 **루트에** 속성을 붙였으므로 루트도 함께 오염돼 차이가 사라진다. 기준을 `tokens.css` **선언값**으로 바꾸니 2건 정확 검출 (`:root (문서 루트)` 로 귀속). → *가드를 만든 것과 가드가 동작하는 것은 다르다 (TASK-130 교훈의 반복).* (3) 그라디언트 배경 위 로고를 canvas 위로 오판해 6건 오탐 → **측정 불가로 명시 보고** + 건수를 요약에 출력 (조용히 건너뛰면 "전부 검사했다" 로 오독된다).

  **회귀**: TS 5 clean / frontend **133 → 216 PASS** / build-server **178 불변** / go **8/8** / B층 정상앱 = 하이재킹 0 · 위반 0 · 측정불가 6 / B층 사고재현 = 하이재킹 2 · 위반 7 (브랜드 텍스트 1.04:1). SQL / schema / migration / version / git tag 변경 0. 신규 devDependency 1종.

  **운영 가이드 신규**: `docs/operations/theme-contrast-guard-2026-07-21.md` (8 섹션 — 왜 있는가 / 왜 2계층인가 / A층 / B층 + 함정 실측 / 해소한 위반 목록 / 폴백을 실패로 보는 이유 / 한계 / follow-up).

  **다음 세션 우선순위**: (1) **B층 CI 통합** — 앱 기동 단계 필요. 문서 무결성 가드 `--range` CI 통합과 같은 계열이라 함께 처리하면 효율적. (2) **디자인 토큰 네임스페이스 `--dib-*`** — 본 TASK 는 하이재킹을 *검출*만 하고 *차단*하지 못한다. Astryx 2종이 유지 결정됐으므로 재도입 시 필수. (3) 호버/포커스/비활성 상태 대비 확장. (4) 이월: `PhaseTimeline.tsx` 9 phase 수동 복제 / 진단-필드 응답 40여 곳 helper 흡수 / 기존 결정 대기 5종. workflow meta sync (state rev 161→162, handoff 126→127, work_backlog TASK-133 등록, backlog 2026-07-21 rev 10) 같은 commit 안에 포함.
- Updated: 2026-07-21 (rev 125→126: **구동 확인 완료 + TASK-132 UI 균형 붕괴 수정 봉인**).

  **✅ push 완료 — 로컬과 원격이 동기화된 상태로 인계한다.** TASK-132 는 `fix/task-132-ui-balance` 에서 작업한 뒤 사용자 승인으로 main 에 fast-forward 병합했고, 이전 세션부터 보류돼 있던 9 커밋(TASK-124~131)과 함께 **11 커밋을 push** 했다: `origin/main` `8905cb0` → **`36cedfc`**. 작업 브랜치는 병합 후 삭제. `main...origin/main` ahead/behind 0 확인. **2026-07-20 이후 처음으로 원격이 갱신됐다** — 다음 세션은 미push 커밋 걱정 없이 시작하면 된다.
  - TASK-132 커밋: `306c2be` (UI 수정) + `36cedfc` (메타 동기화)
  - push 직전 회귀 재확인: TSC 4 프로젝트 clean / frontend **133 PASS** / build-server **178 PASS, fail 0**

  **이전 세션이 남긴 "구동 확인" 과제는 완료됐다.** TS 빌드 → `vite build:react` → Postgres backend 로 build-server 기동 → `/health` · SPA · `/api` 307 · TASK-127 400 계약 · Postgres 왕복 전부 확인. 그 과정에서 **포트는 3000** 임이 확인됐다 (문서에 명시가 없어 로그로 확인 — `curl :3000`). 확인 중 사용자가 "UI 균형이 굉장히 이상하다" 고 보고해 TASK-132 로 이어졌다.

  **TASK-132 — UI 검수 및 수정 (P0~P3)**. 코드 정독 후 **Playwright + 로컬 Chrome 실측**으로 검증 (playwright 번들 chromium 은 `cdn.playwright.dev` 가 이 네트워크에서 **ETIMEDOUT** 이라 받을 수 없다 → `chromium.launch({ channel: "chrome" })` 로 설치된 Chrome 구동. 다음에도 같은 방법을 쓸 것).
  - **P0 근본 원인 — Astryx 디자인 토큰 하이재킹**: `@astryxdesign/theme-neutral` 이 우리와 **이름이 같은 토큰 3종** (`--color-text-primary` / `--color-text-secondary` / `--color-text-disabled`) 을 재정의하고, `<Theme>` 가 `data-astryx-theme="neutral"` 을 문서 루트에 붙여 하위 전체에 상속시켜 tokens.css 값이 컴포넌트 위치에서 덮였다. 동시에 하위 `color-scheme` 이 `light dark` 가 되어 **`light-dark()` 가 다크 모드에서도 light 분기**를 골랐다 → `.brand` 계산색 `rgb(23,23,23)` on `#0b0c10` = **대비 약 1.16:1**, 브랜드명·배지·칩이 비가시. **기본 테마가 다크라 첫 진입 화면이 이 상태**. 조치: `<Theme>` + `theme.css` 제거 (Astryx 컴포넌트 사용처 **0건**). 폰트 Figtree → Inter 복귀, CSS **175→38KB**, JS **328→296KB**.
  - **P1 페이지 셸 부재**: 로고 x 264 vs 본문 x 32 (**232px 어긋남**), sticky 헤더가 좌우 32px 안쪽에 갇힘, 768px 가로 스크롤, BuildRequest 좌측 쏠림 → `--layout-max` / `--layout-gutter` / `--header-h` 단일 출처 + `<main class="app-main">` 신규. 세로 `calc(100vh-...)` 전부 flex 로 대체.
  - **P2 SPA 딥링크**: `Sec-Fetch-Dest: document` 기반 `onRequest` 분기로 주소창 진입만 SPA. runner bare 경로 · 프론트 `/api/*` **영향 0**. 회귀 가드 6건.
  - **P3**: 미정의 토큰 3종 + `line-height` 에 모션 토큰 3곳.
  - **부수 발견**: `BuildsList.css` / `Login.css` 의 중복 `@import "../tokens.css"` 가 `:root` 를 globals.css 뒤에 재선언해 **모든 반응형 override 를 무력화**하고 있었다 → 제거.

  **본 세션 최대 교훈**: **기본 테마는 다크인데 육안 검증은 라이트 기준으로만 이뤄져 P0 가 오래 잠복했다.** 라이트에서는 `#171717` 이 정상으로 보이기 때문. 또한 `tokens.css`/`theme.css` 주석이 "Astryx 토큰은 우리에게 영향 0" 이라 **단언**하고 있었고 그 단언이 가장 많이 쓰는 토큰에서 틀렸다 — 주석의 단언을 실측 없이 신뢰하면 안 된다.

  **누적 baseline 갱신**: frontend vitest **133** (불변) / build-server **172 → 178** (P2 가드 6건) / go **8/8 package** / TS 5 프로젝트 clean.

  **정리 상태**: 검수용 샘플 빌드 3건 삭제 완료 (`build_request` 0건), build-server 종료, 포트 3000 해제. 단 `build_log` 에 **이전 세션 잔재로 보이는 고아 레코드 3건**(대응 `build_request` 없음)이 남아 있다 — 본 세션 데이터가 아니라 손대지 않았다.

  **다음 세션 우선순위**: (1) **테마별 시각 회귀 가드** (본 세션 교훈의 직접 대응), (2) **디자인 토큰 네임스페이스** (`--dib-*` 접두사 — 서드파티 충돌을 구조적으로 차단, Astryx 재도입 시 필수), (3) 미정의 토큰 lint, (4) 이월 중인 CI 통합 (`--range origin/main..HEAD`) 과 `PhaseTimeline.tsx` 9 phase 수동 복제 drift, (5) 기존 결정 대기 5종. workflow meta sync (state rev 155→156, handoff 125→126, work_backlog TASK-132 등록, backlog 2026-07-21 rev 9) 같은 commit 안에 포함.
- Updated: 2026-07-21 (rev 124→125: **세션 종료 정리**). 본 세션 8 TASK 봉인 (TASK-124~131). 사용자 결정: **CI 통합은 보류**, 다음 세션은 **구동 확인**부터. (**rev 126 에서 이 과제는 완료됨** — 위 항목 참조.)

  **⚠️ 다음 세션이 가장 먼저 알아야 할 것 — 로컬 main 이 `origin/main` 보다 8 커밋 앞서 있고 아직 push 하지 않았다.** 미push 커밋: `f5f8fc2`(124) `e5c0333`(125) `1cbea4e`(126) `f661679`(127) `3eff1a5`(128) `31edefb`(129) `9d39386`(130) `fbbce1c`(131). push 여부는 사용자 결정 대기.

  **다음 세션 작업: 구동 확인 (실제 앱 기동 + 동작 검증)**. 본 세션은 단위 테스트 · 계약 · 스크립트 레벨까지 검증했고 API smoke 도 돌렸지만, **React SPA 를 포함한 단일 포트 전체 구동은 확인하지 않았다**. 준비된 전제:
  - Postgres 18.4 native 기동 중 (`localhost:5432`, `postgres/postgres`, DB `docker_image_builder`, migration 0001~0006 적용 완료, `build_request` 등 9 테이블 존재, smoke 데이터 정리됨)
  - 의존성 설치 완료 (`pnpm install`, 319 packages)
  - 절차: (1) TS 4 패키지 `tsc -p ... ` emit 빌드 → (2) `cd apps/build-monitor && vite build --config vite.react.config.ts` 로 `dist-react/` 생성 → (3) `BUILD_MONITOR_REACT_DIST_PATH=apps/build-monitor/dist-react` + `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/docker_image_builder` + `BUILD_REPOSITORY_BACKEND=postgres` 로 build-server 기동 → (4) `curl :3000/` (SPA) · `:3000/admin/builds` (deep link fallback) · `:3000/api/builds` (API 307) 3종 확인. 자세한 명령은 `docs/PROJECT_PROFILE.md` §3 의 "단일 포트 reverse proxy (TASK-075)" 블록 참조 (TASK-124 에서 복원된 부분).
  - 확인 포인트: React SPA 가 실제로 뜨는지 / admin deep link 가 404 없이 SPA 로 fallback 되는지 / `/api/*` 가 Build Server route 로 307 되는지 / TASK-127 의 400 계약이 UI 의 field-level 에러로 렌더되는지 (TASK-129/130 계약 수정의 **실제 화면 확인** — 여태 코드·타입 레벨로만 검증됨).
  - **Docker 미채택 환경**이므로 e2e 11종과 실제 이미지 빌드는 여전히 검증 불가 (수용된 한계). runner 는 `RUNNER_DOCKER_BUILD_MODE=skeleton` 기본값으로만 동작.

  **환경 주의 2건**: (1) pre-commit hook 은 이 clone 에만 설치됨 (`.git/hooks/` 는 커밋 안 됨) — 다른 환경은 `scripts/check-doc-integrity.sh --install-hook` 1회 실행 필요. (2) git identity 를 저장소 로컬로 설정함 (`ykylee <ddn777@hotmail.com>`, `--global` 아님).

  **보류 / 이월 항목**: CI 통합 (`--range origin/main..HEAD`, 사용자 보류 결정 — 재개 시 가장 값어치 큼) / kit sync 절차에 `--range` 편입 / `PhaseTimeline.tsx` 의 9 phase 수동 복제 drift / 진단-필드 응답 40여 곳 helper 흡수 / 기존 결정 대기 5종 (옵션 Z 외부 object storage / 신규 기능 / Nextcloud Tasks / CI migration validation / git tag 다음 version).

  **본 세션 누적 baseline**: frontend vitest **133** / build-server **172** / go **8/8 package** / TS 5 프로젝트 clean / `db-migrate.sh` 6 게이트 실행 검증 / 서버-프론트 에러 계약 컴파일 타임 고정 / 문서 무결성 가드 (히스토리 166 쌍 오탐 0). workflow meta sync (state rev 154→155, handoff 124→125) 같은 commit 안에 포함.
- Updated: 2026-07-21 (rev 123→124: TASK-131 문서 무결성 가드 봉인 — **TASK-124 사고의 구조적 재발 방지. 본 세션 내내 이월되던 유일 항목 해소**). **설계 판단**: workflow kit 의 sync 도구는 `ai-workflow/scripts/` 아래 배포본이라 거기를 고쳐도 다음 kit 업데이트에 다시 덮어써진다 → 가드는 **저장소 자신**이 들고 있어야 한다. `scripts/check-doc-integrity.sh` 신규, kit 경로(`ai-workflow/`)는 검사 대상에서 제외 (sync 로 통째로 갈리는 것이 정상). **검출 신호는 실제 사고에서 역산**: (1) 급격한 축소 — 327 → 45줄 = 86.2%, (2) placeholder 회귀 — `TODO:` / `<...>` 마커 2개 → 16개. **두 번째 신호가 결정적**: 줄 수가 그대로여도 실제 내용이 템플릿 빈칸으로 바뀌면 잡힌다. 4 모드 (기본 staged / `--range A..B` / `--install-hook` / `--help`) + 임계값 env 3종 (`DOC_SHRINK_PCT_LIMIT` 기본 50 / `DOC_MIN_LINES` 기본 40 / `ALLOW_DOC_SHRINK` 우회). 보호 대상 8종 (`docs/PROJECT_PROFILE.md` / `docs/RELEASE_NOTES-*.md` / `docs/operations/*.md` / `CHANGELOG.md` / `CLAUDE.md` · `AGENTS.md` · `GROK.md` · `MiniMax.md`). **검증**: `bash -n` OK / 실제 사고 재현 (`7e9f777..b2cbe5e`) 차단 (86% + placeholder 2→16 감지) / 이번 세션 전체 (`8905cb0..HEAD`) + TASK-124 복구 커밋(45→328 증가) 통과 / **전체 히스토리 166 커밋 쌍 스캔 → 차단 2건, 오탐 0** / 우회 스위치 정상 skip / staged 모드 정상 통과·사고 재현 차단 / **pre-commit hook 으로 실제 커밋 차단 확인** (HEAD 에 테스트 커밋 없음). **가드가 즉시 찾아낸 미발견 사고 2호**: `9c069a9` (`feat(workflow): apply claude-code + codex harness v0.11.25-beta overlay`, 2026-07-09) 가 `AGENTS.md` 의 실행 기본값 6줄(실제 명령 + 출처)을 `TODO:` placeholder 로 덮어썼다. **줄 수는 63 → 63 이라 축소 검사로는 안 잡히고 placeholder 회귀 신호로만 검출**됐다. 같은 커밋이 `docs/PROJECT_PROFILE.md` 참조를 존재하지 않는 `ai-workflow/memory/active/PROJECT_PROFILE.md` 로 바꾸고 상태를 `stable` → `draft` 로 역행시키기도 했다 (경로는 이후 `b2cbe5e` 에서 우연히 원복). **12일간 방치** — `AGENTS.md` 를 진입점으로 읽는 에이전트가 실행 명령 자리에서 `TODO:` 만 보고 있었다. 본 TASK 에서 실측 명령으로 복구. **운영 가이드 신규** `docs/operations/doc-integrity-guard-2026-07-21.md` (8 섹션 — 왜 있는가 / 검출 원리 / 사용법 + 임계값 / 운영 절차 4단계 / 히스토리 스캔 결과 / 한계 / follow-up / 관련 문서) + `docs/PROJECT_PROFILE.md` 다음에 읽을 문서 reference. **한계 (문서화됨)**: staged 검사는 pre-commit hook 의존 — hook 미설치 / `--no-verify` / 도구가 직접 커밋하는 경로는 못 막으므로 CI `--range` 로 보완해야 함 / 줄 수 + placeholder 개수라는 **대리 지표**라 같은 줄 수로 내용만 통째로 교체되고 placeholder 도 안 늘면 검출 불가 / 임계값 50% 는 이 저장소 166 쌍 기준 오탐 0 이었으나 문서 구조가 바뀌면 재측정 필요. **다음 세션 우선순위**: (1) **CI 통합** — PR 마다 `--range origin/main..HEAD` 실행해 hook 미설치 · `--no-verify` 우회 구멍을 덮는 것이 가장 값어치 큼, (2) kit sync 절차(`apply_harness_update.py` 계열)에 `--range` 검사 편입, (3) `PhaseTimeline.tsx` 가 shared-contract 9 phase 를 수동 복제 중 (TASK-129/130 계열 drift), (4) 기존 결정 대기 5종. workflow meta sync (state rev 153→154, handoff 123→124, work_backlog TASK-131 등록, backlog 2026-07-21 rev 8) 같은 commit 안에 포함.
- Updated: 2026-07-21 (rev 122→123: TASK-130 shared-contract 에러 응답 스키마 도입 봉인 — TASK-129 회귀의 **구조적 재발 방지**). TASK-129 는 서버(400 `{message, issues}`)와 프론트(`message` 안의 zod JSON 문자열)의 에러 계약이 어긋나 **양쪽 테스트가 모두 green 인 채로** UI 의 field-level 에러 표시가 사라진 사건이었고, 계약이 어디에도 타입으로 존재하지 않았던 것이 근본 원인. **구현**: shared-contract `errors.ts` (기존 `errorCodes` 옆) 에 `apiErrorIssueSchema` (`ApiErrorIssue` — path/message/code?) + `apiErrorResponseSchema` (`ApiErrorResponse` — message + issues?) + `validationErrorBody(message, issues, extra?)` helper 정의 / build-server `openapi.ts` 에 두 스키마 component 등록 → `/openapi.json` 노출 / `build-routes.ts` **20곳** + `admin-routes.ts` **4곳** = 24곳의 검증 실패 응답을 helper 로 전환 / build-monitor `openapi.d.ts` 재생성 → `parseApiError` 의 envelope 타입을 `Pick<components["schemas"]["ApiErrorResponse"], "message"|"issues">` 로 결속. **설계 판단 2건**: (1) **스키마는 `.loose()`** — 라우트들이 상황별 진단 필드를 함께 싣고 있어 (`header` / `callerId` / `expected` / `actual` / `reason` / `runnerId` 등 실측 10여 종) 닫으면 기존 응답 20여 종이 깨지고 운영 진단 정보가 줄어듦. 계약이 고정하는 것은 "모든 에러에 `message` 가 있고 검증 실패에는 `issues` 가 있다" 두 가지로 한정. (2) **타입은 좁게** — `.loose()` 는 생성 타입에 `& { [key: string]: unknown }` index signature 를 만드는데, **이게 있으면 오타든 필드명 변경이든 `unknown` 으로 통과해 타입 검증이 무력화된다**. 그래서 shared-contract 는 `ApiErrorResponse` 를 명시적 interface 로 두고 `AssertEnvelopeMatchesSchema` 로 zod 스키마와의 일치를 컴파일 타임에 고정, frontend 는 `Pick<>` 으로 index signature 를 버림. **첫 구현은 `z.infer` 를 그대로 썼고, 검증 실험에서 계약 위반이 잡히지 않아 이 문제를 발견했다 — "타입을 도입했다" 와 "타입이 실제로 잡는다" 는 다르다.** **실증 (계약이 실제로 컴파일 타임에 깨지는지)**: 프론트가 계약에 없는 필드(`envelope.problems`) 접근 → **TS2339** `Property 'problems' does not exist` / zod 스키마에서 `issues` → `problems` 로 변경 (계약 파기) → **TS2322** `Type 'true' is not assignable to type 'never'` (assert 발동). **사전 결함 + 보강 3건**: (a) 정규식 일괄 치환이 `message` 만 있고 `issues` 없는 `send({...})` 까지 부분 매칭해 코드 손상 → `git checkout` 즉시 복구 후 **정확히 4줄 블록**(`.send({` / `message:` / `issues:` / `});`) 만 매칭하는 라인 기반 변환으로 재작업, (b) CRLF 로 라인 슬라이싱이 어긋나 `.status(400)..send(` 생성 → 재복구 후 개행 정규화 적용, (c) helper 초판이 `path`/`message` 만 매핑해 zod 진단 필드(`expected` / `code`)가 응답에서 사라짐 → **실서버 확인에서 발견**하고 `...issue` spread 로 원본 보존 + `path` 만 정규화(symbol 제거)하도록 수정. **회귀**: TS 5 프로젝트 전부 clean / build-server **172 PASS** / frontend **133 PASS** / go **8/8 package** / 실서버(Postgres) 응답 형태 보존 확인 — `POST /builds {"appName":"x"}` → 400 + issues(진단 필드 포함), non-UUID → 400, 정상 → 202, admin 401 의 `header` 진단 필드 보존 / smoke 데이터 정리 완료. **다음 세션 우선순위**: (1) TASK-124 의 **bulk sync 재발 방지 가드 (여전히 미봉인 — 본 세션 내내 이월된 유일한 항목)**, (2) `PhaseTimeline.tsx` 가 shared-contract 의 9 phase 를 주석만 달고 **수동 복제** 중 (`// shared-contract 와 동일한 순서/철자`) — TASK-129/130 과 같은 계열의 drift 위험이므로 생성 타입으로 묶을 후보, (3) 남은 진단-필드 응답 40여 곳의 helper 계열 흡수, (4) 기존 결정 대기 5종. workflow meta sync (state rev 152→153, handoff 122→123, work_backlog TASK-130 등록, backlog 2026-07-21 rev 7) 같은 commit 안에 포함.
- Updated: 2026-07-21 (rev 121→122: TASK-129 parseApiError envelope 계약 회귀 수정 봉인 — **TASK-127 이 만든 자체 회귀**). TASK-127 의 follow-up 제안 (결함 동작을 명세처럼 고정한 4xx/5xx 단언 전수 조사) 을 실제 수행하던 중 발견. **점검 결과**: build-server 테스트의 5xx 단언 **0건** (TASK-127 이 고친 `static-serve` 가 유일했음), 소스에 의도적으로 5xx 를 반환하는 코드 **0건** (즉 모든 5xx 는 처리되지 않은 예외), 라우트 3파일의 입력 검증용 bare `.parse` **0건** (잔여 `.parse` 는 전부 응답 직렬화용으로 정상). 그러나 frontend `BuildRequest.test.tsx` 가 **500 + ZodError envelope 을 모킹** 중인 것이 단서가 되어 계약 회귀를 발견. **결함**: `parseApiError` 가 `envelope.message` 가 `[` 로 시작하는 JSON 배열 문자열일 때만 zod issue 를 추출 — handler 가 bare `.parse` 를 쓰던 시절 500 응답 형태에 맞춰진 로직. TASK-127 이 서버를 `400 { message, issues }` 로 정렬하자 message 가 더 이상 `[` 로 시작하지 않아 **UI 의 field-level 에러 표시가 조용히 사라짐**. 실증 (양쪽 envelope 직접 투입): 구(500) → fieldErrors **1** (`1 field(s) failed: requestedBy`) / 신(400) → fieldErrors **0** (`Invalid build request payload` 만). **왜 놓쳤나 — 본 세션 최대 교훈**: frontend 테스트가 서버 응답을 mock 하므로 실제 계약 변화를 감지하지 못한다. TASK-127 시점에 build-server 172 + frontend 130 이 **모두 green 이었지만 둘 사이의 계약은 아무도 검증하지 않았다**. **수정**: `parseApiError` 가 (a) 현행 계약 `{ message, issues: [...] }` 를 `Array.isArray(envelope.issues)` 로 우선 확인 + (b) 레거시 `{ statusCode, error, message: "[...zod...]" }` 경로 유지 (이 형태로 응답하는 경로 잔존 가능성 + 서버/프론트 배포 시차 대비). **회귀 가드 3건 신규** — mock 이 아니라 양쪽 envelope 문자열을 직접 투입해 계약을 고정 (mock 이 계약 변화를 가린다는 것이 교훈이므로): 현행 400 `{message, issues}` → fieldErrors 2 + path 순서 + summary 형식 / 레거시 500 → fieldErrors 2 (하위호환) / issue 없는 404 → fieldErrors 0 + summary 만. **검증**: `tsc --noEmit -p tsconfig.react.json` clean / frontend vitest **130 → 133 PASS** (+3) / build-server 172 불변 (frontend 전용 변경). **follow-up (신규 제안)**: build-server 의 에러 응답 스키마를 `shared-contract` 에 정의하고 프론트가 그 타입을 쓰도록 하면 이 계열 회귀가 **컴파일 타임에** 잡힌다 — 본 회귀가 런타임에도 조용했던 만큼 값어치가 크다. **다음 세션 우선순위**: (1) 위 shared-contract 에러 스키마 도입, (2) TASK-124 의 bulk sync 재발 방지 가드 (여전히 미봉인), (3) 기존 결정 대기 5종. workflow meta sync (state rev 151→152, handoff 121→122, work_backlog TASK-129 등록, backlog 2026-07-21 rev 6) 같은 commit 안에 포함.
- Updated: 2026-07-21 (rev 120→121: TASK-128 `scripts/db-migrate.sh` pnpm 실행 경로 복구 봉인). **TASK-125 가 발견한 신규 결함 3건 전부 해소 완료** (TASK-126 보안 가드 / TASK-127 API 계약 / TASK-128 운영 스크립트). **결함**: 스크립트가 `cd "$REPO_ROOT"` 후 `node --import tsx apps/build-server/scripts/migrate.ts` 를 호출했는데 `tsx` 는 build-server 의 devDependency 이고 pnpm 은 기본 비-hoist 격리라 repo root 에서 해석되지 않아 `ERR_MODULE_NOT_FOUND` 로 죽었다 (npm 의 hoisting 환경에서는 우연히 동작). TASK-103 이 검증한 항목은 `bash -n` / `--help` / 게이트 부재 / `DATABASE_URL` 미설정 4종뿐이라 **실제 DB 연결 경로가 한 번도 실행된 적이 없었다** — 검증 범위가 "스크립트가 죽지 않는가" 에 머물러 "스크립트가 일을 하는가" 를 보지 않은 것이 근본 원인. **수정 4건**: (1) `run_cli()` 신규 — CLI 를 `apps/build-server` cwd 에서 실행해 tsx 가 해석되게 함 (문자열 변수 `$CLI` 의 word-splitting 의존도 함수 호출로 대체), (2) `resolve_migrations_dir()` 신규 — cwd 가 바뀌므로 `MIGRATIONS_DIR` 을 REPO_ROOT 기준 절대경로로 정규화 (상대경로를 그대로 넘기면 build-server cwd 기준으로 해석되는 2차 결함 예방; 이미 절대경로면 `/...` · `C:...` 그대로 사용), (3) `require_cli_deps()` 신규 — node 부재 / tsx 미설치 사전 점검으로 raw stack trace 대신 `pnpm install` 안내 (`preflight()` 로 `require_database_url` 과 묶어 전 게이트 공통 적용), (4) `DATABASE_URL` hint 포트 `15432` → `5432` 정정 (TASK-125 실측 반영 — 15432 는 compose 매핑 기준이라 Docker 사용 시에만 유효). **검증 — TASK-103 이 하지 않았던 실행 검증 수행**: 6 게이트 전부 실제 PostgreSQL 18.4 에 실행 (`--status` → applied 0001~0006 / `--plan` → would apply none / `--apply-all` → idempotent / `--apply-up-to 0002` → 목표까지만 + 인자 누락 exit 2 / `--bootstrap` → OK / `--dr-stop` → 안내만 exit 0) + `bash -n` OK + `--help` exit 0 + 게이트 부재 · unknown gate exit 2 + `DATABASE_URL` 미설정 exit 2 + hint + `MIGRATIONS_DIR` 상대 · 절대 override 둘 다 정상 + **다른 cwd (`/tmp`) 에서 호출 정상 (cwd 무관성 확보)** + 존재하지 않는 경로 exit 1 (실패가 조용히 묻히지 않음). **문서**: `docs/operations/migration-cli-workflow-2026-07-20.md` 에 TASK-128 정정 블록 (원래 실행되지 않았다는 사실 + 원인 + 수정) + §7 실행 검증 표 신규. SQL / schema / migration / version / git tag 변경 0, 애플리케이션 코드 영향 0. **다음 세션 우선순위**: (1) **4xx/5xx 단언 일괄 점검** — TASK-127 에서 `static-serve.test.ts` 가 결함 동작 (500) 을 명세처럼 고정하고 있던 사례가 나왔으므로 유사 사례 전수 조사 (본 세션 종료 시 사용자에게 상세 보고 예정), (2) TASK-124 의 bulk sync 재발 방지 가드 (여전히 미봉인), (3) 기존 결정 대기 5종. workflow meta sync (state rev 150→151, handoff 120→121, work_backlog TASK-128 등록, backlog 2026-07-21 rev 5) 같은 commit 안에 포함.
- Updated: 2026-07-21 (rev 119→120: TASK-127 POST /builds 요청 검증 400 계약 복구 + 회귀 가드 8건 봉인). TASK-125 발견 결함 3건 중 **3번 (API 계약, 우선순위 높음) 해소** — 남은 1건은 `scripts/db-migrate.sh` pnpm tsx 해석 실패. **결함**: `build-routes.ts` 상단 주석이 "Request validation is handled inline by each handler via `schema.safeParse(...)`" 를 규약으로 선언하는데 13개 라우트 중 **3곳만** bare `.parse(...)` 를 써서 ZodError 가 Fastify 기본 error handler 까지 새어 **500 Internal Server Error** 로 응답 (`POST /builds` / `GET /builds/:buildId` / `GET /builds/:buildId/logs`). 스키마 위반은 client error 이므로 400 이 맞고, 나머지 10개 라우트는 이미 `safeParse` + `400 { message, issues }` 로 올바르게 처리 중이었음 — 같은 파일 안의 규약 이탈 누락. **수정**: 3곳을 기존 규약 + 기존 message 관례로 정렬 (`"Invalid buildId parameter"` 는 `POST /builds/:buildId/phase` 등이 쓰던 값과 동일, `POST /builds` 는 `"Invalid build request payload"`) + `request.body ?? {}` 로 빈 body 도 스키마 경로로 유도. **회귀 가드 8건 신규**: POST /builds (202 정상 / 400 필수 필드 누락 — issues 에 requestedBy·sourceArchive·entrypointPath 포함 확인 / 400 빈 body / 400 타입 불일치) + GET :buildId 와 /logs (각 400 non-UUID + 404 well-formed unknown 으로 404 경로 보존 확인). 세 엔드포인트 모두 **라우트 레벨 테스트가 아예 없었던 것**이 결함 잔존의 직접 원인. **기존 테스트 1건 수정 (중요)**: `static-serve.test.ts:91` 이 `/builds/abc-123` 에 **500 을 기대**하고 있었음 — 의도된 명세가 아니라 결함 당시 동작을 그대로 받아적은 것 (주석에도 "UUID validation 으로 500 응답" 이라 서술). 테스트 제목은 "UUID validation 으로 거절" 이고 본래 목적은 SPA 라우팅 우선순위 검증이므로 단언을 400 으로 갱신하고 경위를 주석에 남김. **이로써 TASK-125 의 "이 경로에 회귀 가드가 없다" 는 진술이 부정확했음이 드러남 — 가드가 없던 게 아니라 잘못된 동작을 고정한 가드가 있었다 (더 나쁜 상태).** **검증**: `tsc --noEmit` clean / build-server **164 → 172 PASS, fail 0** (+8) / 실서버 (Postgres backend) 확인 — `POST /builds {"appName":"x"}` → 400 + `{"message":"Invalid build request payload","issues":[...]}`, `GET /builds/abc` → 400, `GET /builds/abc/logs` → 400, 정상 페이로드 → 202 (기존 동작 보존) / smoke 데이터 정리 완료 (`build_request` count 0). SQL / schema / migration / version / git tag 변경 0, frontend 영향 0. **다음 세션 우선순위**: (1) 남은 결함 `scripts/db-migrate.sh` pnpm tsx 해석 실패, (2) TASK-124 의 bulk sync 재발 방지 가드 (여전히 미봉인), (3) **신규 제안** — 다른 테스트에도 "당시 동작을 그대로 받아적은" 4xx/5xx 단언이 더 있을 수 있으므로 일괄 점검. workflow meta sync (state rev 149→150, handoff 119→120, work_backlog TASK-127 등록, backlog 2026-07-21 rev 4) 같은 commit 안에 포함.
- Updated: 2026-07-21 (rev 118→119: TASK-126 runner tar 절대경로 가드 크로스플랫폼 결함 수정 봉인). TASK-125 가 발견한 신규 결함 3건 중 **1번 (보안 가드, 우선순위 높음) 해소**. **결함**: `apps/runner/internal/source/fetcher.go` 의 `validateTarEntryName` 이 절대경로 판정에 `filepath.IsAbs` 를 사용 — `filepath` 는 호스트 OS 규약을 따르므로 Windows 빌드에서 `filepath.IsAbs("/etc/passwd") == false` 가 되어 Unix 절대경로 tar entry 가 보안 가드를 그대로 통과. tar entry 이름은 포맷 스펙상 항상 슬래시 구분자이므로 `filepath` 는 애초에 잘못된 도구였음. Linux 에서는 통과했으므로 **CI green 이라 그동안 미발견** (크로스플랫폼 결함의 전형 — 로컬 Windows 환경 셋업으로 비로소 드러남). **수정**: `import "path"` 추가 + `filepath.IsAbs(name)` → `path.IsAbs(name) || filepath.IsAbs(name)`. `path.IsAbs` 가 슬래시 형태를 플랫폼 무관하게 판정해 본 결함 직접 해소, `filepath.IsAbs` 는 제거하지 않고 병용해 Windows 호스트의 `C:\foo` 형태 추가 방어 유지. 주석에 `filepath` 가 아니라 `path` 를 써야 하는 이유 명시 (동일 실수 재발 방지). **검증**: 실패하던 2건 (`TestFetcher_RejectsTarEntryAbsolute` + `TestValidateTarEntryName_RejectsUnsafeNames/absolute_unix`) PASS 전환 / `TestValidateTarEntryName_AcceptsValidNames` 6종 (`Dockerfile` / `src/lib/internal/utils.ts` / `.hidden` / `trailing-slash/` 등) 계속 PASS 로 over-reject 회귀 없음 확인 / `go build ./...` + `go vet ./...` OK / **`go test ./...` 7/8 → 8/8 package PASS**. SQL / schema / migration / version / git tag 변경 0. TS / frontend 영향 0. **남은 틈 (미봉인)**: `C:/foo` 처럼 슬래시를 쓰는 Windows 드라이브 표기는 Linux 호스트에서 여전히 통과 (`path.IsAbs` false + Linux 의 `filepath.IsAbs` false). 다만 `filepath.Join(destDir, "C:/foo")` 가 destDir 하위로 정규화되므로 **디렉토리 탈출은 발생하지 않고** destDir 밑에 `C:` 디렉토리가 생기는 기묘함에 그침 — 드라이브 문자 패턴 (`^[A-Za-z]:`) 거부 추가는 별도 결정 사항. **다음 세션 우선순위**: TASK-125 발견 결함 중 남은 2건 (`POST /builds` 가 스키마 위반에 400 아닌 500 반환 — API 계약, 우선순위 높음 / `scripts/db-migrate.sh` pnpm tsx 해석 실패) + TASK-124 의 bulk sync 재발 방지 가드 (여전히 미봉인). workflow meta sync (state rev 148→149, handoff 118→119, work_backlog TASK-126 등록, backlog 2026-07-21 rev 3) 같은 commit 안에 포함.
- Updated: 2026-07-21 (rev 117→118: TASK-125 로컬 개발 환경 셋업 + baseline 실측 정정 봉인). 본 저장소에 의존성이 한 번도 설치된 적 없어 (`node_modules` 전무) 어떤 회귀 검증도 실행 불가하던 상태 해소. **환경**: `pnpm install` (319 packages / 5 workspace — `apps/skill_mcp` 는 Python 이라 대상 아님) + Go 1.26.5 + PostgreSQL 18.4 native (`localhost:5432`, `postgres/postgres`). DB `docker_image_builder` 생성 + migration 0001~0006 `--bootstrap` 적용 + 9 테이블 생성 확인 + Postgres 왕복 smoke PASS. **결정: Docker 미채택** (사용자) — runner 의 `RUNNER_DOCKER_BUILD_MODE` 기본값이 `skeleton` 이라 단위 테스트는 Docker 없이 통과하므로 개발·테스트 루프는 성립. 단 `compose.dev.*.yaml` 기반 **e2e 11종 + 실제 이미지 빌드는 검증 불가** (수용된 한계 — Docker 채택 시 복구). **실측 baseline**: tsc 5 프로젝트 clean / vitest 130-130 PASS (기록 일치) / build-server **164/164 PASS** (기록 165 와 불일치) / go build + vet clean, `go test ./...` 7/8 package PASS / `vite build:react` gzip js 99.26KB · css 30.60KB (기록 99.01 · 30.62, 오차 범위). **165 → 164 정정**: 실행값과 정적 `it()` 카운트가 둘 다 164, 조건부 skip 없음 (Postgres 설치로도 안 늘어남) + `tests/` 하위 디렉토리 없음 확인 → 기록된 165 가 산술 오류로 확정. 현재 baseline 서술만 정정 (`CHANGELOG.md` / `RELEASE_NOTES` §2·§7·§10 / `state.json` × 2); handoff · work_backlog 의 historical 30건은 TASK-120 정책 (각 시점 기록은 정합 대상 아님) 따라 **보존**. **부수 정리 3건**: `pnpm-lock.yaml` 298줄 삭제 (추가 0 — TASK-094/100/101 이 package.json 에서 걷어낸 Svelte 의존성의 lockfile 잔재) / `RELEASE_NOTES` §10 깨진 CHANGELOG 링크 2건 교정 (TASK-124 와 동일 결함 잔여분) / `CLAUDE.md` 실행 기본값 TODO 5종 → 실측 명령 + Windows 주의사항 4종 보정. 코드 / SQL / schema / migration / version / git tag 변경 0. **신규 발견 결함 3건 (본 TASK 미수정, 각각 독립 TASK 후보)**: (1) `apps/runner/internal/source` 의 tar 절대경로 가드가 Windows 에서 무력화 — `validateTarEntryName` (`fetcher.go:262`) 이 플랫폼 의존 `filepath.IsAbs` 를 써서 `/etc/passwd` 를 놓침, go test 2건 FAIL, **Linux 는 통과하므로 CI green** (크로스플랫폼 보안 가드 결함, 우선순위 높음 — `path.IsAbs` 병용이 정답). (2) `scripts/db-migrate.sh` 가 pnpm 비-hoist 격리로 `tsx` 해석 실패 (`ERR_MODULE_NOT_FOUND`) — TASK-103 이 검증한 것은 `bash -n` / `--help` / 게이트 부재 / DATABASE_URL 미설정 뿐이라 **실제 DB 연결 경로가 한 번도 실행된 적 없었음**. (3) `POST /builds` 가 스키마 위반 요청에 400 이 아닌 **500** 반환 (ZodError 미처리, `build-routes.js:27`) — 테스트 164건이 통과하는데도 안 잡혔으므로 이 경로 회귀 가드 부재 (API 계약 문제, 우선순위 높음). **다음 세션 우선순위**: 위 결함 3건 수정 + TASK-124 의 bulk sync 재발 방지 가드 (여전히 미봉인) + 기존 결정 대기 5종. workflow meta sync (state rev 147→148, handoff 117→118, work_backlog TASK-125 등록, backlog 2026-07-21 rev 2) 같은 commit 안에 포함.
- Updated: 2026-07-21 (rev 116→117: TASK-124 PROJECT_PROFILE.md bulk sync 회귀 복구 봉인). `/workflow-session-start` baseline 복원 중 `docs/PROJECT_PROFILE.md` 가 45줄 kit 템플릿 스켈레톤 (§1 목적 / §3 명령 5종 / §4 검증 / §5 정책 전부 `TODO:` · `<placeholder>`) 인데 TASK-102~113 의 봉인 기록은 일관되게 "§3.5 / §3.6 / §3.10 / §3.11 / §3.12 갱신" 을 주장하는 정합성 붕괴를 발견 → 원인 규명 후 복구. **원인**: `b2cbe5e` (`chore(workflow): bulk sync — workflow kit + active state rev144`, author `grok`, 2026-07-21) 가 PROJECT_PROFILE.md 를 **327줄 → 45줄** 로 덮어씀 (20 insertions / 302 deletions, 추가 20줄은 전부 kit placeholder 로 보존 가치 0). 커밋 메시지에 "프로젝트 메타 동기화" 로만 기재되어 TASK-121~123 세 TASK 동안 미발견 — 탐지 지연 자체가 리스크. **판정**: TASK-102~113 봉인 기록은 당시 정확했고 이후 bulk sync 가 프로젝트 고유 문서를 kit 템플릿으로 일괄 덮어쓴 사고 (봉인 기록 측 결함 아님). **피해 범위**: `docs/PROJECT_PROFILE.md` 단독 확정 — 동일 커밋의 AGENTS.md 9/9 · CLAUDE.md 8/8 · MiniMax.md 15/11 · MiniMax_config.example.json 2/2 는 삽입/삭제 균형으로 정상 sync, GROK.md 111/0 · opencode.json 45/0 은 신규 추가. **복구**: `7e9f777` 원본 327줄 복원 (302 insertions / 20 deletions — 유실분 정확히 역전) + 유실 이후 정당한 변경 3건 재적용 (kit 마커 `v0.11.21-beta` → `v0.15.19-beta` TASK-120 정책 정합 / 최종 수정일 `2026-07-05` → `2026-07-21` / CHANGELOG reference 경로 `../../CHANGELOG.md` → `../CHANGELOG.md` 교정 — TASK-123 이 넣은 원본은 `docs/` 기준 저장소 밖을 가리키던 깨진 링크). 회복 범위: §3.1 활성 워크플로우 자산 (3.1.1~3.1.4) / §3.2~§3.12 / §4 검증 포인트 / §5 예외 규칙 / 운영 가이드 reference 전체. **검증**: 운영 가이드 링크 전수 실파일 해석 (누락 0) + CHANGELOG 루트 존재 확인 + §3 명령 5종이 `state.json` commands SSOT 와 정합. SQL / schema / migration / version / git tag 변경 0. 회귀 영향 0 (docs only). **follow-up (미봉인)**: workflow kit bulk sync 가 프로젝트 고유 문서를 덮어쓸 수 있는 구조가 그대로 남아 있음 — sync 대상에서 `docs/PROJECT_PROFILE.md` 제외 또는 줄수 급감 (-50% 초과) 시 경고·중단 가드 도입을 후속 TASK 로 권장. 기존 결정 대기 5종 유지 (옵션 Z / 신규 기능 / Nextcloud Tasks / CI migration validation / git tag 다음 version). workflow meta sync 같은 commit 안에 포함.
- Updated: 2026-07-20 (rev 115→116: TASK-123 v0.1.0 release staging baseline 동기화 봉인). 본 세션 13 TASK (TASK-102~114) + TASK-122 working tree clean 보존의 운영자 release staging anchor 봉인. 신규 `CHANGELOG.md` (root, 9 섹션 — release model SemVer 정책 / 본 세션 13 TASK 1-line 표 / 운영 가이드 32 종 인덱스 / 회귀 baseline 종합 / follow-up 5종 / 결정 옵션 비교 A 채택 / 다음 release 가이드 / 운영자 release staging 운영 가이드 / 관련 문서) + git tag `v0.1.0` (annotated, main HEAD `53adb75` — TASK-122 sync commit) + `docs/RELEASE_NOTES-2026-07-20.md` §10 다음 세션 가이드에 v0.1.0 tag anchor 갱신 + `docs/PROJECT_PROFILE.md` 다음에 읽을 문서에 CHANGELOG reference 추가. 5 package.json 모두 이미 `0.1.0` 통일 → version bump 변경 0. SQL / schema / migration 변경 0. 운영 영향 0 (운영자 release staging anchor 신규 + git tag 신규 만). 회귀 영향 0. TASK-114 follow-up 6종 중 1종 (CHANGELOG / git tag + version bump) 봉인. 5종 후속 결정 대기 (옵션 Z / 신규 기능 / Nextcloud Tasks / CI migration validation / git tag 다음 version). workflow meta sync (state rev 145→146, handoff 115→116, work_backlog 109→110, backlog index 79→80 / latest 57→58) 같은 sync commit 안에 포함.
- Updated: 2026-07-20 (rev 114→115: TASK-122 untracked 52종 잔재 정리 봉인). main HEAD `b2cbe5e` 직전의 working tree 에 Svelte 시절 vite/tsx emit 산출물 50 .js + 50 .map + 구 vite.config.js 2종 = 총 52개 untracked 가 누적되어 있던 결함 해소. .gitignore 보강 (`apps/build-monitor/src/**` + `apps/build-monitor/vite.config.js` + `apps/build-monitor/vite.config.js.map` 3 entry 신규) 으로 ignore 매칭 → `git status` 에서 자동 제외 → `git clean` 불필요. working tree clean 복원. SQL / schema / migration / version / git tag 변경 0. 회귀 영향 0. TASK-114 follow-up 6종 중 1종 (git tag + version bump) 의 사전 working tree clean 보존. 다음: TASK-123 git tag + version bump 진입. workflow meta sync (state rev 144→145, handoff 114→115, work_backlog 108→109, backlog index 78→79 / latest 56→57) 같은 sync commit 안에 포함.
- Updated: 2026-07-20 (rev 113→114: TASK-114 본 세션 종합 RELEASE_NOTES + 운영 가이드 인덱스 봉인). 본 세션은 2026-07-08 ~ 2026-07-18 의 단일 작업 흐름에서 frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 Group A~D (TASK-095~098) + 디자인 토큰 단일화 (TASK-096.5) + BuildRequest + ApiConsole React 마이그레이션 (TASK-099) 까지 13 TASK 연속 봉인. TASK-099 결정: 옵션 A (단일 PR, TASK-098 Admin 4종 패턴 동일). branch `grok/task-099-build-api-react-2026-07-18` (main `1cf8d0c` base), commit `8a07881` — 9 file / +1880 / -7. 신규 6: `react/src/routes/BuildRequest.tsx` (useState + useRef 8 + useEffect + useMemo + useNavigate, input ref 패턴으로 React state batching 우회) / `BuildRequest.css` (Svelte inline `<style>` 1:1 정합) / `BuildRequest.test.tsx` (RTL 15 cases) / `ApiConsole.tsx` (useState + Link + iframe, key={reloadKey} 재마운트) / `ApiConsole.css` / `ApiConsole.test.tsx` (RTL 6 cases). 수정 2: `App.tsx` (routes `/build-request` + `/api-console` 추가) / `api.ts` (submitBuildRequest + parseApiError + 관련 타입 export — Svelte baseline 1:1 정합). 운영 가이드: `docs/operations/build-request-api-console-react-2026-07-18.md`. 사전 결함 + 보강 4건: (1) React state batching race → input ref 패턴, (2) RTL fireEvent.click(submit-button) 이 form submit 을 trigger 하지 않음 → `fireEvent.submit(form)` 으로 직접 trigger, (3) jsdom iframe onError 한계 → test 케이스 단순화, (4) Native form read race → ref 패턴. 회귀 baseline: TS 5 packages clean, vitest **265/265 PASS** (TASK-098 baseline 244 → +21 신규: BuildRequest 15 + ApiConsole 6), svelte-check **0/1**, vite build:react 정상 — gzip js **99.08KB** / css **30.62KB** (TASK-098 baseline js 95.14KB → +3.94KB / css 29.63KB → +0.99KB, BuildRequest + ApiConsole 추가분), vite build svelte 정상. follow-up: TASK-100 Group F (App.svelte router 단순화) / TASK-101 Group G (Svelte scaffold 일괄 정리 — admin / build-request / api-console Svelte pages + components/routes 일괄 삭제 + svelte / svelte-spa-router package 정리). M4.5 시리즈 Group A~E (TASK-095~099) 완료. workflow meta sync (state rev 120→121, handoff 89→90, work_backlog 84→85, backlog index 54→55 / latest 32→33) 같은 sync commit 안에 포함.)
- Updated: 2026-07-18 (rev 100→101: **세션 종료 종합 정리 sync (rev 130→131)**). 본 세션은 2026-07-08 ~ 2026-07-18 (10 일) 의 단일 작업 흐름에서 frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 8-PR 시리즈 (TASK-095~098 + TASK-099 + TASK-100 + TASK-101) + 디자인 토큰 단일화 (TASK-096.5) + PROJECT_PROFILE React baseline batch 1 (PR #57) + batch 2 (PR #58) + TASK-066 follow-up batch 3 (PR #59) 까지 **19 TASK 연속 봉인 완료**. 모든 Task 들이 main 합류. main HEAD `abb95fa` (workflow meta sync 회수). 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 130 (+123, Svelte 135 케이스 일괄 삭제) / build-server 113 → 143 (+30) / TS 5 packages clean. vite build:react 정상 (gzip js 99.01KB / css 30.62KB). 운영 영향 0 (모든 변경이 docs only 또는 cross-framework dead code 폐기). 결정: 옵션 A 일관 (단일 PR / src/ 일괄 삭제 / Svelte baseline → React baseline / Postgres default 개발 경로). 본 세션 운영 가이드 6 종 신규: TASK-096.5 디자인 토큰 단일화 / TASK-099 BuildRequest + ApiConsole React / TASK-100 App.svelte router 단순화 / TASK-101 Svelte scaffold 일괄 정리 / TASK-101 follow-up batch 1+2 PROJECT_PROFILE React baseline / TASK-066 follow-up batch 3 source archive Postgres. follow-up: 별도 사용자 결정 (PROJECT_PROFILE §3 명령의 run_local / run_local_postgres 명령 + memory vs Postgres baseline 회귀 baseline 갱신 / scripts/migrate.ts 의 standalone CLI 운영 workflow / postgres migration 0004 build_source 의 TOAST 전략 / 운영 안정화 / 신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK 우선). workflow meta sync (state rev 130→131, handoff 99→100, work_backlog 94→95, backlog index 64→65 / latest 42→43) 같은 sync commit 안에 포함. **세션 종료**.)
- Updated: 2026-07-20 (rev 101→102: TASK-102 (PROJECT_PROFILE §3 baseline 양축 동기화) docs only 봉인 sync (rev 131→132). 본 세션은 2026-07-20 신규 작업 흐름으로 TASK-102 (PROJECT_PROFILE.md 의 §3 명령 박스 run_local / run_local_postgres 의 default backend 정합 + §3.5 / §3.6 / §3.10 / §3.11 / §3.12 회귀 baseline 의 memory-only 표기를 Postgres 동등 baseline 양축 동기화 + §4 검증 포인트 Postgres 운영 baseline 추가 + 다음에 읽을 문서 reference 추가) 진행. branch 없음 — docs only 변경 (2 file, 123 insertions + 6 deletions) 으로 main `4ad57f2` 즉시 commit + push 후 workflow meta sync 단일 commit. 운영 가이드 신규 1 종: `docs/operations/project-profile-baseline-postgres-sync-2026-07-20.md` (의도 / 변경 / 사전 결함 + 보강 3건 / 회귀 baseline docs only / follow-up). 결정: 옵션 A (docs only + 1 운영 가이드, 사양 변경 없음). 회귀 영향 0 — TS 5 packages clean, vitest 130/130 PASS, build-server 143/143 PASS, Go 7+ packages PASS, vite build:react 정상 (gzip js 99.01KB / css 30.62KB). 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 130 (+123) / build-server 113 → 143 (+30) / TS 5 packages clean / vite build:react 정상. frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 8-PR 시리즈 (TASK-095~098 + TASK-099 + TASK-100 + TASK-101) + 디자인 토큰 단일화 (TASK-096.5) + PROJECT_PROFILE React baseline batch 1 (PR #57) + batch 2 (PR #58) + TASK-066 follow-up batch 3 (PR #59) + TASK-102 docs only (commit `4ad57f2`) 까지 **20 TASK 연속 봉인** (2026-07-08 ~ 2026-07-20). follow-up: 결정 대기 항목 중 scripts/migrate.ts standalone CLI 운영 workflow / postgres migration 0004 build_source TOAST 전략 / 운영 안정화 / 신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK 우선 모두 별도 사용자 결정 대기. workflow meta sync (state rev 131→132, handoff 101→102, work_backlog 95→96, backlog index 65→66 / latest 43→44) 같은 commit 안에 포함.)
- Updated: 2026-07-20 (rev 102→103: TASK-103 (scripts/migrate.ts standalone CLI 운영 workflow 정립 + 권고 스크립트 scripts/db-migrate.sh 신규) 봉인 sync (rev 132→133). 본 세션의 단일 작업 흐름에서 TASK-102 (PROJECT_PROFILE §3 baseline 양축 동기화, docs only, main `4ad57f2`) + TASK-103 (scripts/db-migrate.sh 권고 스크립트 + PROJECT_PROFILE §3 명령 끝 migration 운영 권장 참조 + 운영 가이드 신규, main `7b74614`) 까지 **2 TASK 연속 봉인**. TASK-103 결정: 옵션 A (운영 가이드 + 권고 스크립트). 신규 2 file: `scripts/db-migrate.sh` (6 게이트 단일 entrypoint --plan / --status / --apply-all / --apply-up-to / --bootstrap / --dr-stop, 모두 기존 standalone CLI 위임, SQL / schema 변경 0) + `docs/operations/migration-cli-workflow-2026-07-20.md` (의도 / 변경 / 자주 쓰는 5종 시나리오 / 기존 standalone CLI 와의 관계 / 사전 결함 + 보강 2건 / follow-up). PROJECT_PROFILE.md §3 끝 "Migration 운영 권장 (TASK-103)" 참조 + 다음에 읽을 문서 reference 추가. 회귀 영향 0 — TS 5 packages clean, vitest 130/130 PASS, build-server 143/143 PASS, Go 7+ packages PASS, vite build:react 정상 (gzip js 99.01KB / css 30.62KB), postgres migration 0001~0005 적용 정상, e2e-source-archive-postgres / e2e-multi-runner-postgres ALL PASS 유지. scripts/db-migrate.sh 자체 검증: bash -n syntax OK, --help exit 0 OK, 게이트 부재 exit 2 OK, --dr-stop 안내만 출력 OK, DATABASE_URL 미설정 hint + exit 2 OK. 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 130 (+123) / build-server 113 → 143 (+30) / TS 5 packages clean / vite build:react 정상. 결정 대기 항목 해소: scripts/migrate.ts standalone CLI 운영 workflow (TASK-103 봉인). follow-up: postgres migration 0004 build_source TOAST 전략 (256 MiB body limit 충분) / 운영 안정화 (release workflow / CHANGELOG / 운영 배포 체크리스트) / 신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK 우선 모두 별도 사용자 결정 대기. workflow meta sync (state rev 132→133, handoff 102→103, work_backlog 96→97, backlog index 66→67 / latest 44→45) 같은 commit 안에 포함.)
- Updated: 2026-07-20 (rev 103→104: TASK-104 (build_source SLO + TOAST follow-up 운영 가이드) docs only 봉인 sync (rev 133→134). 본 세션의 단일 작업 흐름에서 TASK-102 (PROJECT_PROFILE §3 baseline 양축 동기화, main `4ad57f2`) + TASK-103 (migration CLI 운영 workflow + scripts/db-migrate.sh, main `7b74614`) + TASK-104 (build_source SLO + TOAST follow-up 운영 가이드, main `d4fb554`) 까지 **3 TASK 연속 봉인**. TASK-104 결정: 옵션 A (현 운영 가이드 + 후속 결정 분리 절차 -- SQL / schema / migration 변경 0, SLO 확장 자체 봉인 안 함). 신규 1 file: `docs/operations/build-source-toast-strategy-2026-07-20.md` (현 주소 / 256 MiB 가 충분한 이유 / 트리거 5종 / 후속 후보 옵션 3종 / 후속 결정 분리 절차 5단계). PROJECT_PROFILE.md §3.5 회귀 baseline 끝 follow-up 한 줄 + 다음에 읽을 문서 reference 추가. 회귀 영향 0 — TS 5 packages clean, vitest 130/130 PASS, build-server 143/143 PASS, Go 7+ packages PASS, vite build:react 정상 (gzip js 99.01KB / css 30.62KB), postgres migration 0001~0005 적용 정상, build_source bytea column + bodyLimit: 256 MiB 동일, e2e-source-archive-postgres ALL PASS 유지. 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 130 (+123) / build-server 113 → 143 (+30) / TS 5 packages clean / vite build:react 정상. 결정 대기 항목 해소: postgres migration 0004 build_source TOAST 전략 (TASK-104 봉인, 본 TASK 가 SLO 확장 봉인 안 함 — 후속 trigger 5종 발동 시 별도 TASK). follow-up: 운영 안정화 (release workflow / CHANGELOG / 운영 배포 체크리스트) / 신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK 우선 / TASK-104 trigger 5종 발동 시 별도 TASK 모두 별도 사용자 결정 대기. workflow meta sync (state rev 133→134, handoff 103→104, work_backlog 97→98, backlog index 67→68 / latest 45→46) 같은 commit 안에 포함.)
- Updated: 2026-07-20 (rev 104→105: TASK-105 (운영 배포 체크리스트 운영 가이드) docs only 봉인 sync (rev 134→135). 본 세션의 단일 작업 흐름에서 TASK-102 (PROJECT_PROFILE §3 baseline 양축 동기화, main `4ad57f2`) + TASK-103 (migration CLI 운영 workflow + scripts/db-migrate.sh, main `7b74614`) + TASK-104 (build_source SLO + TOAST follow-up, main `d4fb554`) + TASK-105 (운영 배포 체크리스트 운영 가이드, main `4de639c`) 까지 **4 TASK 연속 봉인**. TASK-105 결정: 옵션 A (운영 배포 체크리스트 운영 가이드 8 섹션 — Pre-deploy / Deploy / Verify / Post-deploy Monitoring / DR-Rollback / Operational Safety / 운영 환경 baseline 갱신 / follow-up). SQL / schema / migration / version / git tag 변경 0 (옵션 B/C 미봉인). 신규 1 file: `docs/operations/release-checklist-2026-07-20.md` (8 섹션 + 7 종 회귀 가드 + 4 종 운영 안전장치). PROJECT_PROFILE.md §3 끝 "운영 배포 체크리스트 (TASK-105)" 굵은 텍스트 + 다음에 읽을 문서 reference 추가. 회귀 영향 0 — TS 5 packages clean, vitest 130/130 PASS, build-server 143/143 PASS, Go 7+ packages PASS, vite build:react 정상 (gzip js 99.01KB / css 30.62KB), postgres migration 0001~0005 적용 정상, e2e-source-archive-postgres / e2e-multi-runner-postgres / e2e-production-semantic / e2e-single-port 모두 ALL PASS 유지. 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 130 (+123) / build-server 113 → 143 (+30) / TS 5 packages clean / vite build:react 정상. 결정 대기 항목 해소: 운영 안정화 1 종 (TASK-105 봉인, Release notes / CHANGELOG / git tag + version bump 는 운영자가 본 운영 가이드를 따르면서 자연스럽게 발견하는 후속 TASK 권장). follow-up: 신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK 우선 / TASK-104 trigger 5종 발동 시 별도 TASK / TASK-105 운영 후 release notes 후속 TASK 모두 별도 사용자 결정 대기. workflow meta sync (state rev 134→135, handoff 104→105, work_backlog 98→99, backlog index 68→69 / latest 46→47) 같은 commit 안에 포함.)
- Updated: 2026-07-20 (rev 105→106: TASK-106 (source archive chunked split + multi-row schema) 봉인 sync (rev 135→136). 본 세션의 단일 작업 흐름에서 TASK-102 + TASK-103 + TASK-104 + TASK-105 + TASK-106 까지 **5 TASK 연속 봉인**. TASK-106 결정: 옵션 Y (chunked split + multi-row schema 완전 봉인 — legacy endpoint 보존, 신규 `POST /builds/:buildId/source/chunk` 도입). 신규 6 file: `migrations/0006_build_source_chunked.sql` + `packages/db/src/schema/build-source-chunk.ts` + `build-source-chunked.test.ts` (+11 cases) + `e2e-source-archive-chunked.sh` + `e2e-source-archive-chunked-postgres.sh` + `docs/operations/source-archive-chunked-2026-07-20.md`. amend 8 file: `build-repository.ts` (StoreSourceChunkResult + storeSourceChunk interface) + `memory-build-repository.ts` (sourceArchivesChunked Map + storeSourceChunk + cross-table cleanup) + `postgres-build-repository.ts` (storeSourceChunk + getSourceArchiveFromChunks + ON CONFLICT DO UPDATE) + `build-service.ts` (위임) + `build-routes.ts` (신규 endpoint) + `packages/db/src/bootstrap.ts` (ensureDbSchema 신규 DDL 3 종) + `index.ts` (export) + `docs/PROJECT_PROFILE.md` §3 source archive 라운드트립 갱신. 회귀 영향: TS 5 packages clean, vitest 130/130 (frontend 변경 0), build-server **legacy 143/143 (변경 0) + chunked 11/11 신규 = 154/154**, Go 7+ packages PASS, vite build:react 정상 (gzip js 99.01KB / css 30.62KB), postgres migration **0001~0006 적용 정상** (신규 0006 추가), e2e-source-archive-chunked 6 단계 + e2e-source-archive-chunked-postgres 6 단계 (psql bytea direct verify 포함). 운영 영향: **legacy endpoint 보존** (기존 client / Skill / Runner 의 source archive 동작 0 변경) + 신규 endpoint 자유 채택 가능. 사전 결함 + 보강 4건 (chunk index derivation floor → monotonically increasing sequence / isFinalChunk totalChunks → cumulative / legacy ↔ chunked cross-wipe / Fastify header string|string[] narrow). 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 130 (+123) / build-server 113 → 154 (+41, 변경 0 + 신규 +11) / TS 5 packages clean / vite build:react 정상. 결정 대기 항목 해소: TASK-104 trigger 5종 중 1+ 2 (multi-GB / 200+ MiB regular) 의 chunked split 봉인. follow-up: 옵션 Z 외부 object storage / RFC 7233 Content-Range 표준화 / TASK-066 follow-up batch 4 (release notes 후속 TASK 권장) / 신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK 모두 별도 사용자 결정 대기. workflow meta sync (state rev 135→136, handoff 105→106, work_backlog 99→100, backlog index 69→70 / latest 47→48) 같은 commit 안에 포함.)
- Updated: 2026-07-18 (rev 99→100: PR #59 (TASK-066 follow-up batch 3 source archive Postgres 운영 가이드) main 합류 회수 sync. 본 세션은 2026-07-08 ~ 2026-07-18 (10 일) 의 단일 작업 흐름에서 frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 8-PR 시리즈 (TASK-095~098 + TASK-099 + TASK-100 + TASK-101) + 디자인 토큰 단일화 (TASK-096.5) + PROJECT_PROFILE React baseline batch 1 (PR #57) + batch 2 (PR #58) + TASK-066 follow-up batch 3 (PR #59) 까지 19 TASK 연속 봉인. 모든 Task 들이 main 합류. main HEAD `9c9bbe3` (PR #59 squash). 결정: 옵션 A (Postgres default 개발 경로 권장). branch `task-066-postgres-source-archive-regression-2026-07-18` (main `0a5a250` base), commit `587ceec` — 2 file / +159 / -0. 운영 가이드 신규: `docs/operations/source-archive-postgres-2026-07-18.md`. PROJECT_PROFILE.md §3.2 + 다음에 읽을 문서 갱신. Postgres backend 가 memory backend 와 동등한 운영 baseline 으로 사용 가능함을 정립 (TASK-066 + TASK-081-B + TASK-082 의 5 단계 회귀 가드 + psql direct verify + FK CASCADE + idempotent migration). 4가지 권장 이유 (production 정합 / bytea round-trip 회귀 / FK CASCADE + migration / multi-runner 운영 검증). 회귀 baseline (변경 없음, docs only): TS 5 packages clean, vitest 130/130 PASS, vite build:react 정상 (gzip js 99.01KB / css 30.62KB), build-server 143/143 PASS. 운영 영향 0 (docs only). follow-up: 별도 사용자 결정 (PROJECT_PROFILE §3 명령의 run_local / run_local_postgres 명령 + memory vs Postgres baseline 회귀 baseline 갱신 / scripts/migrate.ts 의 standalone CLI 운영 workflow / postgres migration 0004 build_source 의 TOAST 전략). workflow meta sync (state rev 129→130, handoff 98→99, work_backlog 93→94, backlog index 63→64 / latest 41→42) 같은 sync commit 안에 포함.)
- Updated: 2026-07-20 (rev 106→107: TASK-107 (RFC 7233 Content-Range chunked wire-format follow-up 권장) docs only 봉인 sync (rev 136→137). 본 세션의 단일 작업 흐름에서 TASK-102 + TASK-103 + TASK-104 + TASK-105 + TASK-106 + TASK-107 까지 **6 TASK 연속 봉인**. TASK-107 결정: PROJECT_PROFILE.md §3 source archive 라운드트립 부분 끝에 한 항목 신규 (의미 A/B/C 3 종 + 권장 의미 C bipartite) + 다음에 읽을 문서 끝에 후속 TASK 권장 reference 신규. **의미 A**: caller 의 `Content-Range` 를 신뢰해 chunked envelope 의 idx derivation (Out-of-order 강함, corrupt 위험). **의미 B**: chunked size 만 신뢰 + monotonically increasing (현 상태 정합 = TASK-106 동작). **의미 C**: `Content-Range` 가 있으면 의미 A, 없으면 의미 B (bipartite, 권장). docs only — SQL / schema / migration / version / git tag 변경 0. 신규 0 file, amend 1 file (docs/PROJECT_PROFILE.md 6 insertions). 회귀 영향 0 — TS 5 packages clean, vitest 130/130, build-server legacy 143/143 + chunked 11/11 신규 = 154/154, Go 7+ PASS, vite build:react 정상, postgres migration 0001~0006 적용 정상. 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 130 (+123) / build-server 113 → 154 (+41) / TS 5 packages clean / vite build:react 정상. 결정 대기 항목 분석 완료: TASK-106 follow-up 중 옵션 Z 외부 object storage + 본 TASK 의 RFC 7233 + PROJECT_PROFILE §3.5 의 e2e-production-semantic-postgres (TASK-066 follow-up batch 4 후보) + chunked multi-runner 회귀 가드 후속 후보 4 종 식별. follow-up (남은 결정 대기): 신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK 우선 / TASK-107 의미 C 후속 TASK 권장 / 옵션 Z 외부 object storage 후속 TASK 권장 / release notes 후속 TASK 권장 / TASK-066 follow-up batch 4 e2e-production-semantic-postgres 후보 / chunked multi-runner 회귀 가드 모두 별도 사용자 결정. workflow meta sync (state rev 136→137, handoff 106→107, work_backlog 100→101, backlog index 70→71 / latest 48→49) 같은 commit 안에 포함.)
- Updated: 2026-07-20 (rev 107→108: TASK-108 (RFC 7233 Content-Range chunked wire-format 의미 C bipartite 완전 봉인) 봉인 sync (rev 137→138). 본 세션의 단일 작업 흐름에서 TASK-102 + TASK-103 + TASK-104 + TASK-105 + TASK-106 + TASK-107 + TASK-108 까지 **7 TASK 연속 봉인**. TASK-108 결정: 의미 C bipartite (RFC 7233 §4.2 의 `bytes <start>-<end>/<total>` + `*` total, 의미 A path 가 start offset 신뢰, 의미 B path 가 monotonic fallback). 신규 1 file (운영 가이드) + amend 7 file (build-repository.ts / memory / postgres repository / build-service.ts / build-routes.ts / build-source-chunked.test.ts +4 RFC 7233 cases / PROJECT_PROFILE.md §3 source archive 라운드트립 TASK-108 의미 C bipartite 항목 + 다음에 읽을 문서 reference). SQL / schema / migration / version / git tag 변경 0 — wire-format processing amend 만. 회귀 영향: TS 5 packages clean, vitest 130/130 (frontend 0 변경), build-server **legacy 143/143 (의미 B 0 변경) + chunked 11/11 (의미 B 0 변경) + RFC 7233 신규 4/4 = 158/158** (TASK-088 baseline 대비 +45), Go 7+ PASS, vite build:react 정상, postgres migration 0001~0006 적용 정상. 운영 영향: **의미 B callers = 기존 TASK-106 callers 의 wire-format 0 변경** — Content-Range 부재 callers 모두 그대로 동작, 신규 Content-Range 송신 callers 가 의미 A path 자유 채용. 사전 결함 + 보강 3건 (의미 A idx=0 메모리 누락 위험 cross-check / Content-Range total `*` 케이스 후속 / Fastify header string|string[] union type narrow). 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 130 (+123) / build-server 113 → 158 (+45) / TS 5 packages clean / vite build:react 정상. 26 TASK 연속 봉인 완료 (2026-07-08 ~ 2026-07-20). follow-up: TASK-108 `*` 케이스 후속 / chunked multi-runner 회귀 가드 / TASK-066 follow-up batch 4 e2e-production-semantic-postgres / 옵션 Z 외부 object storage / 신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK 모두 별도 사용자 결정. workflow meta sync (state rev 137→138, handoff 107→108, work_backlog 101→102, backlog index 71→72 / latest 49→50) 같은 commit 안에 포함.)
- Updated: 2026-07-20 (rev 108→109: TASK-109 (RFC 7233 §4.2 `*` 케이스 dynamic boundary check 봉인) 봉인 sync (rev 138→139). 본 세션의 단일 작업 흐름에서 TASK-102 + TASK-103 + TASK-104 + TASK-105 + TASK-106 + TASK-107 + TASK-108 + TASK-109 까지 **8 TASK 연속 봉인**. TASK-109 결정: lenient default (Content-Range.total 부재 시 numeric equality skip, 단 `end + 1 ≤ declaredTotalSizeBytes` dynamic boundary check 으로 silent accept 위험 봉인). 신규 1 file (운영 가이드) + amend 4 file (memory-build-repository.ts 의미 C branch 3 종 분기 + postgres-build-repository.ts 일대일 정합 + build-source-chunked.test.ts +3 cases + PROJECT_PROFILE.md §3 source archive 라운드트립 TASK-109 항목). build-routes.ts amend 0 (기존 분기들이 신규 결과 흡수). SQL / schema / migration / version / git tag 변경 0. 회귀 영향: TS 5 packages clean, vitest 130/130 (frontend 0 변경), build-server **legacy 143/143 (의미 B 0 변경) + chunked 11/11 (의미 B 0 변경) + 의미 C 4/4 (TASK-108 0 변경) + `*` 신규 3/3 = 161/161** (TASK-088 baseline 대비 +48), Go 7+ PASS, vite build:react 정상, postgres migration 0001~0006 적용 정상. 운영 영향: **의미 B callers (TASK-106) 의 wire-format 0 변경**, 의미 A numeric callers (TASK-108) 의 cross-check 0 변경, `*` 케이스 callers 의 동작 boundary-check 정교화만 (silent accept → 명시 검증). 사전 결함 + 보강 2건 (`*` silent accept 위험 / strict alternative 잠재 정밀화). 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 130 (+123) / build-server 113 → 161 (+48) / TS 5 packages clean / vite build:react 정상. 27 TASK 연속 봉인 완료 (2026-07-08 ~ 2026-07-20). follow-up: strict mode env flag (STRICT_CONTENT_RANGE=true) 후속 / chunked multi-runner 회귀 가드 / TASK-066 follow-up batch 4 의 e2e-production-semantic-postgres / 옵션 Z 외부 object storage / 신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK 모두 별도 사용자 결정. workflow meta sync (state rev 138→139, handoff 108→109, work_backlog 102→103, backlog index 72→73 / latest 50→51) 같은 commit 안에 포함.)
- Updated: 2026-07-20 (rev 109→110: TASK-110 (STRICT_CONTENT_RANGE env flag 의 운영적 strict 모드 봉인) 봉인 sync (rev 139→140). 본 세션의 단일 작업 흐름에서 TASK-102 + TASK-103 + TASK-104 + TASK-105 + TASK-106 + TASK-107 + TASK-108 + TASK-109 + TASK-110 까지 **9 TASK 연속 봉인**. TASK-110 결정: 운영자가 deployment 시점에 env flag 한 개 (`STRICT_CONTENT_RANGE`) 로 RFC 7233 §4.2 `*` total 케이스 거절 (400 `content_range_invalid`) + numeric total 의무화. 신규 1 file (운영 가이드) + amend 7 file (`create-app.ts` 의 `parseStrictContentRangeFlag` helper + `BuildService` instantiation 시 `{ strictContentRange }` 위임 / `build-service.ts` constructor 의 두 번째 인자 `{ strictContentRange: boolean }` / `build-repository.ts` 6 번째 parameter `strictContentRange?: boolean` / `memory-build-repository.ts` 의미 C branch 4 종 dispatch / `postgres-build-repository.ts` memory 와 일대일 정합 / `build-source-chunked.test.ts` +4 cases / `PROJECT_PROFILE.md` §3 source archive TASK-110 항목). build-routes.ts amend 0 (BuildService runtime field 자동 전파). SQL / schema / migration / version / git tag 변경 0. 회귀 영향: TS 5 packages clean, vitest 130/130 (frontend 0 변경), build-server **legacy 143/143 (의미 B 0 변경) + chunked 11/11 (의미 B 0 변경) + 의미 C 4/4 (TASK-108 0 변경) + `*` 3/3 (TASK-109 0 변경) + strict 신규 4/4 = 165/165** (TASK-088 baseline 대비 +52), Go 7+ PASS, vite build:react 정상, postgres migration 0001~0006 적용 정상. **운영 영향 0 (default)** — env unset / `"false"` 등 모든 callers TASK-109 동작 보존; strict 모드 활성은 deployment 정책 결정. 사전 결함 + 보강 2건 (운영 restart 없이 dynamic toggle 불가 / strict 모드 ON 시 기존 callers 의 breakdown 위험 — 운영 rollout playbook 의 부팅 시작점으로 strict OFF 권장, client 정렬 검증 후 flip). 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 130 (+123) / build-server 113 → 165 (+52) / TS 5 packages clean / vite build:react 정상. 28 TASK 연속 봉인 완료 (2026-07-08 ~ 2026-07-20). follow-up: 운영자 client 정렬 staging checklist / chunked multi-runner 회귀 가드 / TASK-066 follow-up batch 4 의 e2e-production-semantic-postgres / 옵션 Z 외부 object storage / 신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK 모두 별도 사용자 결정. workflow meta sync (state rev 139→140, handoff 109→110, work_backlog 103→104, backlog index 73→74 / latest 51→52) 같은 commit 안에 포함.)
- Updated: 2026-07-20 (rev 110→111: TASK-111 (Production-semantic Postgres backend 동등 보강) 봉인 sync (rev 140→141). 본 세션의 단일 작업 흐름에서 TASK-102 + TASK-103 + TASK-104 + TASK-105 + TASK-106 + TASK-107 + TASK-108 + TASK-109 + TASK-110 + TASK-111 까지 **10 TASK 연속 봉인**. TASK-111 결정: TASK-085 의 production-semantic 운영 검증의 postgres backend 동등 보강. 신규 3 file (compose.dev.e2e-production-postgres.yaml + e2e-production-semantic-postgres.sh + 운영 가이드) + amend 1 file (PROJECT_PROFILE.md §3.5 postgres backend follow-up 의 후속 TASK 해제 + 본 TASK 신규 항목). SQL / schema / migration / version 변경 0 — boot-time env + compose override 만. 회귀 영향: TS 5 packages clean, vitest 130/130 (frontend 0 변경), build-server vitest 165/165 (변경 0 — TASK-085 memory variant 0 변경 + 신규 postgres variant 0 영향), Go 7+ PASS, vite build:react 동일, postgres migration 0001~0006 적용 정상. 운영 영향 0 (memory variant callers) — TASK-085 의 memory variant 가 그대로 동등 운영; 신규 postgres variant 는 release staging 에서 운영자가 선택적으로 postgres 동등성 검증. 사전 결함 + 보강 3건 (3 layer compose 의 검증 부담 / postgres volume 자동 drop / build 5 분 상한 미달). 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 130 (+123) / build-server 113 → 165 (+52) / TS 5 packages clean / vite build:react 정상. 29 TASK 연속 봉인 완료 (2026-07-08 ~ 2026-07-20). follow-up: TASK-085 운영 가이드 postgres cross-reference / chunked multi-runner 회귀 가드 / 옵션 Z 외부 object storage / 신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK 모두 별도 사용자 결정. workflow meta sync (state rev 140→141, handoff 110→111, work_backlog 104→105, backlog index 74→75 / latest 52→53) 같은 commit 안에 포함.)
- Updated: 2026-07-20 (rev 111→112: TASK-112 (양 variant 운영 가이드 cross-reference 봉인) docs only sync (rev 141→142). 본 세션의 단일 작업 흐름에서 TASK-102 + TASK-103 + TASK-104 + TASK-105 + TASK-106 + TASK-107 + TASK-108 + TASK-109 + TASK-110 + TASK-111 + TASK-112 까지 **11 TASK 연속 봉인**. TASK-112 결정: TASK-085 follow-up 권장 — 운영자가 메모리 / postgres 양 variant 를 운영 가이드 인덱스에서 한 자릿에 식별 가능하도록 cross-reference 봉인. 신규 1 file (`docs/operations/production-semantic-2026-07-07.md` — TASK-085 메모리 variant 운영 가이드, §1 의도 / 결정 / §2 신규 회귀 가드 7 단계 / §3 Wire format 변경 없음 / §4 Schema 변경 없음 / §5 운영 rollout playbook 5 단계 / §6 사전 결함 + 보강 3건 / §7 회귀 baseline / §8 follow-up / §9 관련 문서) + amend 2 file (`docs/operations/production-semantic-postgres-2026-07-20.md` postgres variant 가이드 § 회귀 baseline 의 "신규 운영 가이드" row + follow-up 의 TASK-085 ↔ TASK-111 cross-reference 권장 반영 + `docs/PROJECT_PROFILE.md` §3.5 의 TASK-085 e2e-production-semantic.sh 회귀 baseline 줄 끝에 TASK-085 운영 가이드 reference + 다음에 읽을 문서에 TASK-085 운영 가이드 reference 추가). SQL / schema / migration / version / git tag 변경 0 — 운영 가이드 본체 + cross-reference 만. 회귀 영향: TS 5 packages clean, vitest 130/130 (frontend 0 변경), build-server vitest 165/165 (변경 0), Go 7+ PASS, vite build:react 동일, postgres migration 0001~0006 적용 정상. 운영 영향 0 — 신규 운영 가이드 + cross-reference 만; release staging 의 검증 / e2e 스크립트 동작 0 변경. 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 130 (+123) / build-server 113 → 165 (+52) / TS 5 packages clean / vite build:react 정상. 30 TASK 연속 봉인 완료 (2026-07-08 ~ 2026-07-20). follow-up: chunked multi-runner 회귀 가드 / 옵션 Z 외부 object storage / 신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK 모두 별도 사용자 결정. workflow meta sync (state rev 141→142, handoff 111→112, work_backlog 105→106, backlog index 75→76 / latest 53→54) 같은 commit 안에 포함.)
- Updated: 2026-07-20 (rev 112→113: TASK-113 (chunked multi-runner cross-backend 회귀 가드) 봉인 sync (rev 142→143). 본 세션의 단일 작업 흐름에서 TASK-102 + TASK-103 + TASK-104 + TASK-105 + TASK-106 + TASK-107 + TASK-108 + TASK-109 + TASK-110 + TASK-111 + TASK-112 + TASK-113 까지 **12 TASK 연속 봉인**. TASK-113 결정: TASK-082 의 postgres backend multi-runner 운영 검증 (5 build × 3 runner) 의 chunked split (TASK-106 의미 B + TASK-108 의미 C + TASK-109 `*` + TASK-110 strict 모드) 동시 사용 운영 검증. 신규 3 file (`compose.dev.multi-runner-chunked-postgres.yaml` — postgres profile + 3 runner + build-server 의 `STRICT_CONTENT_RANGE: "true"` / `apps/build-server/scripts/e2e-multi-runner-chunked-postgres.sh` — 7 단계 — compose up → postgres + build-server healthy → 3 runner 등록 + strict 사전 검증 → 5 build × chunked upload (round 0 의미 B baseline + round 1 의미 C numeric total + round 2 의미 B baseline + 다중 chunk + round 3 의미 C numeric total + 다중 chunk) + strict 모드 `*` total 거부 검증 (round 4) → 5 build lifecycle 대기 + postgres `build_source_chunk` bytea 무결성 검증 → multi-runner buildsClaimed ≥ 3 → compose down -v / `docs/operations/multi-runner-chunked-postgres-2026-07-20.md` — 의도 / 결정 / 회귀 가드 7 단계 / Wire format 변경 없음 / Schema 변경 없음 / 운영 rollout playbook 5 단계 / 사전 결함 + 보강 3건 / 회귀 baseline / follow-up / 관련 문서) + amend 1 file (`docs/PROJECT_PROFILE.md` §3.6 의 TASK-086 postgres backend 회귀 baseline 줄 다음에 "Chunked multi-runner 회귀 가드 (TASK-113)" 신규 항목 + 다음에 읽을 문서에 TASK-113 운영 가이드 reference). SQL / schema / migration / version / git tag 변경 0. 회귀 영향: TS 5 packages clean, vitest 130/130 (frontend 0 변경), build-server vitest 165/165 (변경 0), Go 7+ PASS, vite build:react 동일, postgres migration 0001~0006 적용 정상. 운영 영향 0 (TASK-082 callers) — TASK-082 의 memory/postgres variant 가 그대로 동등 운영; 신규 chunked + strict 변형은 운영자가 release staging 에서 선택적으로 cross-backend 회귀 검증. 사전 결함 + 보강 3건 (STRICT_CONTENT_RANGE unset 일 때 strict false-negative / 5 build 의 chunked 검증 시간이 길어질 위험 / 3 runner 동시 chunked upload 시 race 가능 — TASK-080 / TASK-081-B 가드 정합). 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 130 (+123) / build-server 113 → 165 (+52) / TS 5 packages clean / vite build:react 정상. 31 TASK 연속 봉인 완료 (2026-07-08 ~ 2026-07-20). follow-up: 옵션 Z 외부 object storage / 신규 기능 추가 / Nextcloud Tasks 통합 / 다른 TASK 모두 별도 사용자 결정. workflow meta sync (state rev 142→143, handoff 112→113, work_backlog 106→107, backlog index 76→77 / latest 54→55) 같은 commit 안에 포함.)
- Updated: 2026-07-20 (rev 113→114: TASK-114 (본 세션 종합 RELEASE_NOTES + 운영 가이드 인덱스 봉인) docs only sync (rev 143→144). 본 세션의 단일 작업 흐름에서 TASK-102 + TASK-103 + TASK-104 + TASK-105 + TASK-106 + TASK-107 + TASK-108 + TASK-109 + TASK-110 + TASK-111 + TASK-112 + TASK-113 + TASK-114 까지 **13 TASK 연속 봉인**. TASK-114 결정: 본 세션 12 TASK 종합 리뷰 + 운영자 release staging 운영 가이드 + 결정 항목 인덱스 + follow-up 후보 인덱스 봉인. 신규 1 file (`docs/RELEASE_NOTES-2026-07-20.md` — §1 본 세션 의도 / §2 12 TASK 성과 표 + 운영 가이드 인덱스 + main commit + 누적 회귀 baseline / §3 결정 항목 인덱스 / §4 신규 파일 인벤토리 / §5 운영 가이드 32 종 인덱스 / §6 운영자 release staging 운영 가이드 (5 phase 검증) / §7 회귀 baseline 종합 / §8 follow-up 후보 인덱스 / §9 운영 영향 요약 / §10 다음 세션 가이드). SQL / schema / migration / version / git tag 변경 0 — 운영자 종합 release staging 인덱스 신규만. 회귀 영향: TS 5 packages clean, vitest 130/130 (frontend 0 변경), build-server vitest 165/165 (변경 0), Go 7+ PASS, vite build:react 동일, postgres migration 0001~0006 적용 정상. 운영 영향: 운영자가 본 세션의 12 TASK 를 release staging 에서 종합 검증 가능 (5 phase 운영 가이드). 신규 결정 항목 0. 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 130 (+123) / build-server 113 → 165 (+52) / TS 5 packages clean / vite build:react 정상. 32 TASK 연속 봉인 완료 (2026-07-08 ~ 2026-07-20). follow-up (남은 결정): 옵션 Z 외부 object storage / 신규 기능 추가 / Nextcloud Tasks 통합 / release notes 후속 (옵션 B/C) / CI migration validation / git tag version bump / 운영자 client 정렬 staging checklist 후속 모두 별도 사용자 결정. workflow meta sync (state rev 143→144, handoff 113→114, work_backlog 107→108, backlog index 77→78 / latest 55→56) 같은 commit 안에 포함.)
- Updated: 2026-07-18 (rev 98→99: PR #58 (PROJECT_PROFILE.md React baseline batch 2 / TASK-101 follow-up) main 합류 회수 sync. 본 세션은 2026-07-08 ~ 2026-07-18 (10 일) 의 단일 작업 흐름에서 frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 8-PR 시리즈 (TASK-095~098 + TASK-099 + TASK-100 + TASK-101) + 디자인 토큰 단일화 (TASK-096.5) + PROJECT_PROFILE React baseline batch 1 (PR #57) + batch 2 (PR #58) 까지 18 TASK 연속 봉인. 모든 Task 들이 main 합류. main HEAD `9aa0774` (PR #58 squash). PR #58 결정: 옵션 A (§3.5~§3.11 + §3.12 + §4 + §5 + 다음에 읽을 문서 일괄). branch `docs/task-101-followup-project-profile-react-baseline-2026-07-18` (main `baa7383` base), commit `eac516d` — 2 file / +93 / -8. §3.5~§3.11 (7 섹션) 의 회귀 baseline 일괄 TASK-101 React baseline 동기화. §3.12 trailing context + §4 UI 변경 + §5 TASK-101 baseline 추가 + 다음에 읽을 문서 (본 세션의 5개 운영 가이드 reference) 갱신. 회귀 baseline (변경 없음, docs only): TS 5 packages clean, vitest 130/130 PASS, vite build:react 정상 (gzip js 99.01KB / css 30.62KB), build-server 143/143 PASS, Go 7+ packages 모두 PASS. 운영 영향 0 (docs only). follow-up: 별도 사용자 결정. workflow meta sync (state rev 128→129, handoff 97→98, work_backlog 92→93, backlog index 62→63 / latest 40→41) 같은 sync commit 안에 포함.)
- Updated: 2026-07-18 (rev 97→98: PR #57 (PROJECT_PROFILE.md React baseline 동기화 / TASK-101 follow-up) main 합류 회수 sync. 본 세션은 2026-07-08 ~ 2026-07-18 (10 일) 의 단일 작업 흐름에서 frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 8-PR 시리즈 (TASK-095~098 + TASK-099 + TASK-100 + TASK-101) + 디자인 토큰 단일화 (TASK-096.5) + PROJECT_PROFILE React baseline 동기화 (PR #57) 까지 17 TASK 연속 봉인. 모든 Task 들이 main 합류. main HEAD `642ac3a` (PR #57 squash). PROJECT_PROFILE.md 의 §3 frontend 관련 4 섹션 (§3.2 Admin / §3.3 Build Monitor UI 정합 / §3.4 Admin 가드 / §3.12 React 빌드 mount) 을 Svelte baseline → React baseline 으로 동기화. §3 명령의 TASK-075 reverse proxy 섹션 (`BUILD_MONITOR_DIST_PATH` → `BUILD_MONITOR_REACT_DIST_PATH`) 갱신. 회귀 baseline (TASK-101 baseline 동일, docs only): TS 5 packages clean, vitest 130/130 PASS, vite build:react 정상 (gzip js 99.01KB / css 30.62KB). 운영 영향 0 (docs only). follow-up: 별도 사용자 결정. workflow meta sync (state rev 127→128, handoff 96→97, work_backlog 91→92, backlog index 61→62 / latest 39→40) 같은 sync commit 안에 포함.)
- Updated: 2026-07-18 (rev 96→97: 세션 종합 정리 sync (rev 126→127). 본 세션은 2026-07-08 ~ 2026-07-18 (10 일) 의 단일 작업 흐름에서 frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 8-PR 시리즈 (TASK-095~098 + TASK-099 + TASK-100 + TASK-101) + 디자인 토큰 단일화 (TASK-096.5) 까지 16 TASK 연속 봉인 완료. 모든 Task 들이 main 합류 완료. main HEAD `7693daf` (workflow meta sync 회수). 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 130 (+123, Svelte 135 케이스 일괄 삭제) / build-server 113 → 143 (+30) / TS 5 packages clean. vite build:react 정상 (gzip js 99.01KB / css 30.62KB). 운영 영향 0 (Svelte 측 src/ 가 production 에서 unreachable — TASK-094 + TASK-100 + TASK-101 로 cross-framework dead code 일괄 폐기). follow-up: 별도 사용자 결정 (PROJECT_PROFILE.md React baseline 동기화 / 운영 안정화 / 신규 기능 추가 / Nextcloud Tasks 통합 등). workflow meta sync (state rev 126→127, handoff 95→96, work_backlog 90→91, backlog index 60→61 / latest 38→39) 같은 sync commit 안에 포함.)
- Updated: 2026-07-18 (rev 95→96: PR #56 (TASK-101 Svelte scaffold 일괄 정리) main 합류 회수 sync. 본 세션은 2026-07-08 ~ 2026-07-18 의 단일 작업 흐름에서 frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 Group A~G (TASK-095~101) + 디자인 토큰 단일화 (TASK-096.5 / PR #53) + BuildRequest + ApiConsole React 마이그레이션 (TASK-099 / PR #54) + App.svelte router 단순화 (TASK-100 / PR #55) + Svelte scaffold 일괄 정리 (TASK-101 / PR #56) 까지 16 TASK 연속 봉인. main HEAD `313ae2e` (TASK-101 squash). TASK-101 결정: 옵션 A (src/ 일괄 삭제 + 설정 파일 단순화). apps/build-monitor/src/ 전체 46 file 일괄 삭제 + tsconfig.json 삭제 (tsconfig.react.json 단일화) + 신규 1 file (react/src/test/setup.ts) + 수정 4 file (vite.config.ts / package.json / 2 css). 누적 회귀 baseline (main HEAD `313ae2e`, TASK-088 baseline 대비): vitest 7 → 130 (+123, Svelte 135 케이스 일괄 삭제) / build-server 113 → 143 (+30) / TS 5 packages clean. vite build:react 정상 (gzip js 99.01KB / css 30.62KB — TASK-100 baseline과 거의 동일). 운영 영향 0. M4.5 8-PR 시리즈 (TASK-095~102) 완료 — 모든 Task 들이 main 합류. workflow meta sync (state rev 125→126, handoff 94→95, work_backlog 89→90, backlog index 59→60 / latest 37→38) 같은 sync commit 안에 포함.)
- Updated: 2026-07-18 (rev 94→95: TASK-101 Svelte scaffold 일괄 정리 (M4.5 Group G) 1차 commit sync. 본 세션은 2026-07-08 ~ 2026-07-18 의 단일 작업 흐름에서 frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 Group A~G (TASK-095~101) + 디자인 토큰 단일화 (TASK-096.5) + BuildRequest + ApiConsole React 마이그레이션 (TASK-099) + App.svelte router 단순화 (TASK-100) 까지 16 TASK 연속 봉인. 결정: 옵션 A (src/ 일괄 삭제 + 설정 파일 단순화). branch `grok/task-101-svelte-scaffold-cleanup-2026-07-18` (main `be8c372` base), commit `aae7f31` — 51 file / +32 / -7910. apps/build-monitor/src/ 전체 46 file 삭제 (App.svelte + components 8 + lib 7 + routes 16 + test 2 + main.ts) + tsconfig.json 삭제 (tsconfig.react.json 단일화) + 신규 1 file (react/src/test/setup.ts — TASK-064 의 Svelte 측 setup.ts React 측으로 이식) + 수정 4 file (vite.config.ts / package.json / 2 css @import 경로 React 측 tokens.css 로 교체). 운영 가이드: `docs/operations/svelte-scaffold-cleanup-2026-07-18.md`. 회귀 baseline: TS 5 packages clean, vitest **130/130 PASS** (TASK-100 baseline 265 → 130, Svelte 측 135 케이스 일괄 삭제), vite build:react 정상 — gzip js **99.01KB** / css **30.62KB** (TASK-100 baseline과 거의 동일), svelte-check script 제거 (Svelte 측 일괄 삭제로 불필요). 사전 결함 + 보강 4건: (1) vitest localStorage 부재 → React 측 src/test/setup.ts 신규, (2) @testing-library/jest-dom matcher 부재 → setup.ts 에 import 추가, (3) React 측 component CSS 의 Svelte 측 tokens.css import 깨짐 → 두 CSS @import 경로 React 측 tokens.css 로 교체, (4) useUserId.test.ts 부재 → Login.test.tsx 가 React 측 lib/useUserId.ts 사용 — 회귀 영향 0. M4.5 8-PR 시리즈 (TASK-095~102) 완료 — 모든 Task 들이 main 합류. workflow meta sync (state rev 124→125, handoff 93→94, work_backlog 88→89, backlog index 58→59 / latest 36→37) 같은 sync commit 안에 포함.)
- Updated: 2026-07-18 (rev 93→94: PR #55 (TASK-100 App.svelte router 단순화) main 합류 회수 sync. 본 세션은 2026-07-08 ~ 2026-07-18 의 단일 작업 흐름에서 frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 Group A~F (TASK-095~100) + 디자인 토큰 단일화 (TASK-096.5 / PR #53) + BuildRequest + ApiConsole React 마이그레이션 (TASK-099 / PR #54) + App.svelte router 단순화 (TASK-100 / PR #55) 까지 15 TASK 연속 봉인. main HEAD `9dfbe08` (TASK-100 squash). TASK-100 결정: 옵션 A (Svelte routes 일괄 삭제). 본 TASK 시점 React 측이 primary SPA 이고 Svelte 측 routes 가 unreachable 인 상태 (TASK-094 의 Build Server 가 React dist 만 mount) 가 명확했으나 본 App.svelte 의 9 route 정의가 그대로 남아 dead code 였음. PR #55 self-review amend 1건 봉인 — trailing newline 부재 (운영 가이드 `docs/operations/app-router-simplify-2026-07-18.md`). 누적 회귀 baseline (main HEAD `9dfbe08`): vitest 7 → 265 (+258) / build-server 113 → 143 (+30) / TS 5 packages clean / svelte-check 0/1 / vite build:react gzip js 99.08KB / css 30.62KB / vite build svelte gzip js 21.03KB / css 2.01KB (TASK-099 baseline js 36.90KB → -15.87KB / css 6.18KB → -4.17KB, Svelte 측 routes 10개 → 1개 단순화 효과 — 빌드 결과물 자체도 약 44% 감소). 운영 영향 0 (Svelte 측 routes unreachable). follow-up: TASK-101 Group G (Svelte scaffold 일괄 정리 — Svelte 측 components / routes / lib / package.json 일괄 삭제 + vite Svelte plugin / tsconfig.json 통합 단일화). M4.5 시리즈 Group A~F (TASK-095~100) main 합류 완료. workflow meta sync (state rev 123→124, handoff 92→93, work_backlog 87→88, backlog index 57→58 / latest 35→36) 같은 sync commit 안에 포함.)
- Updated: 2026-07-18 (rev 92→93: TASK-100 App.svelte router 단순화 (M4.5 Group F) 1차 commit sync. 결정: 옵션 A (Svelte routes 일괄 삭제). React 측이 primary SPA 이고 Svelte 측 routes 가 unreachable 인 상태 (TASK-094 의 Build Server 가 React dist 만 mount) 가 명확했으나 본 App.svelte 의 9 route 정의가 그대로 남아 dead code 였음. branch `grok/task-100-app-router-simplify-2026-07-18` (main `17adad6` base), commit `bce5dcd` — 2 file / +117 / -36. App.svelte amend — 9 route + 9 component import 제거, `*` (NotFound) 만 유지. 운영 가이드: `docs/operations/app-router-simplify-2026-07-18.md`. 회귀 baseline: TS 5 packages clean, vitest **265/265 PASS** (TASK-099 baseline 동일), svelte-check **0/1**, vite build:react 정상 — gzip js **99.08KB** / css **30.62KB** (TASK-099 baseline 동일), vite build svelte 정상 — gzip js **21.03KB** / css **2.01KB** (TASK-099 baseline js 36.90KB → **-15.87KB** / css 6.18KB → **-4.17KB**, Svelte 측 routes 10개 → 1개 단순화 효과 — 빌드 결과물 자체도 약 44% 감소). 운영 영향 0 (Svelte 측 routes unreachable). follow-up: TASK-101 Group G (Svelte scaffold 일괄 정리 — Svelte 측 components / routes / lib / package.json 일괄 삭제 + vite Svelte plugin / tsconfig.json 통합 단일화). M4.5 시리즈 Group A~F (TASK-095~100) 완료. workflow meta sync (state rev 122→123, handoff 91→92, work_backlog 86→87, backlog index 56→57 / latest 34→35) 같은 sync commit 안에 포함.)
- Updated: 2026-07-18 (rev 91→92: PR #53 (TASK-096.5) + PR #54 (TASK-099) main 합류 회수 sync. 본 세션은 2026-07-08 ~ 2026-07-18 의 단일 작업 흐름에서 frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 Group A~D (TASK-095~098) + 디자인 토큰 단일화 (TASK-096.5 / PR #53) + BuildRequest + ApiConsole React 마이그레이션 (TASK-099 / PR #54) 까지 14 TASK 연속 봉인. main HEAD `e46f2f5` (TASK-099 squash). TASK-096.5 결정: 옵션 A' (Svelte tokens.css 단일 source-of-truth + Astryx Theme 컴포넌트 보호용 layer 분리). PR #53 self-review amend 5건 봉인 — trailing newline 부재 (globals.css / tokens.css / theme.css / BuildsList.css / Login.css). TASK-099 결정: 옵션 A (단일 PR, TASK-098 Admin 4종 패턴 동일). cherry-pick 으로 main HEAD `73c5081` (TASK-096.5 squash) 에 정렬 후 PR #54 오픈. PR #54 self-review amend 3건 봉인 — (C-1) React 19 type 정합 (`useRef<HTMLInputElement>(null)` → `RefObject<HTMLInputElement | null>` 명시), (C-2) unused `act` import 제거, (I-3) trailing newline 부재 (BuildRequest.tsx / .test.tsx / ApiConsole.tsx / .test.tsx). 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 265 (+258) / build-server 113 → 143 (+30) / TS 5 packages clean / svelte-check 0/1 / vite build:react gzip js 99.08KB / css 30.62KB / vite build svelte 정상. follow-up: TASK-100 Group F (App.svelte router 단순화) / TASK-101 Group G (Svelte scaffold 일괄 정리 — admin / build-request / api-console Svelte pages + components/routes 일괄 삭제 + svelte / svelte-spa-router package 정리). M4.5 시리즈 Group A~E (TASK-095~099) main 합류 완료. workflow meta sync (state rev 121→122, handoff 90→91, work_backlog 85→86, backlog index 55→56 / latest 33→34) 같은 sync commit 안에 포함.)
- Updated: 2026-07-18 (rev 88→89: TASK-096.5 디자인 토큰 단일화 (M4.6) 1차 commit sync.
- Updated: 2026-07-18 (rev 87→88: 세션 종합 정리 sync (rev 118→119). 본 세션은 2026-07-08 ~ 2026-07-18 의 단일 작업 흐름에서 Svelte → React frontend rewrite 7-PR 시리즈 (TASK-088~094) 종료 + M4.5 Group A~D (TASK-095~098) main 합류까지 11 TASK 연속 봉인. main HEAD `3403c9e` (TASK-098). 누적 회귀 baseline (TASK-088 baseline 대비): vitest 7 → 244 (+237) / build-server 113 → 143 (+30). 다음: TASK-099 Group E (BuildRequest + ApiConsole) 또는 디자인 토큰 단일화 (TASK-096.5 / M4.6) — 사용자 결정 대기. workflow meta sync (state rev 118→119, handoff 87→88, work_backlog 82→83, backlog index 52→53 / latest 30→31) 같은 sync commit 안에 포함.)
- Updated: 2026-07-08 (rev 86→87: TASK-098 (M4.5 Group D — Admin 페이지 4종 React 마이그레이션) main 합류 회수 sync. PR 본질: frontend rewrite 시리즈 M4.5 4단계. branch `grok/task-098-admin-pages-react-2026-07-08` (main `7829c92` base). Svelte 측 admin pages 4종 (AdminBuilds / AdminUsers / AdminAdmins / AdminRunners) 의 React 측 신규 추가. App.tsx 의 admin routes 4종이 React 측 pages 로 교체. Svelte 측 admin pages 는 그대로 유지 (TASK-101 Group G 에서 일괄 정리). 신규 10종 (4 admin pages + RegisterRunnerModal + 4 css) + 수정 2종 (App.tsx + api.ts). 결정: 옵션 A (React 측 admin pages 4종 신규 + App.tsx routes 교체). 회귀 baseline: TS 5 packages clean, build-monitor vitest **244/244 PASS** (page level 통합 test 는 다음 TASK 에서 일괄), svelte-check 0/1, build-server tests 동일, vite build:react 정상 (gzip js 95.14KB / css 29.44KB, TASK-097 baseline 91.04KB → +4.10KB). 다음: TASK-099 Group E (BuildRequest + ApiConsole) 진입 (사용자 결정 대기). workflow meta sync (state rev 117→118, handoff 86→87, work_backlog 81→82, backlog index 51→52 / latest 29→30) 같은 sync commit 안에 포함.)
- Updated: 2026-07-08 (rev 85→86: TASK-097 (M4.5 Group C — Admin 진입점 React 마이그레이션) main 합류 회수 sync. PR 본질: frontend rewrite 시리즈 M4.5 3단계. branch `grok/task-097-admin-entry-react-2026-07-08` (main `6f05c37` base). 신규 8종 (AdminTabs.tsx + .css / AdminAccessDenied.tsx + .css / admin-guard.ts + 3 test) + 수정 0. App.tsx 변경 없음 — admin routes 의 페이지 본체는 Svelte 측 유지. 결정: 옵션 A (cross-framework 공존). 회귀 baseline: TS 5 packages clean, build-monitor vitest **227 → 244 PASS** (신규 17: AdminTabs 6 + AdminAccessDenied 7 + admin-guard 4), svelte-check 0/1, build-server tests 동일, vite build:react 정상 (gzip js 91.04KB / css 28.10KB). 다음: TASK-098 Group D (Admin 페이지 4종) 진입 (사용자 결정 대기). workflow meta sync (state rev 116→117, handoff 85→86, work_backlog 80→81, backlog index 50→51 / latest 28→29) 같은 sync commit 안에 포함.)
- Updated: 2026-07-08 (rev 84→85: TASK-096 (M4.5 Group B — StatusPill 디자인 토큰 baseline 정합) main 합류 회수 sync. PR 본질: frontend rewrite 시리즈 M4.5 2단계. branch `grok/task-096-statuspill-design-tokens-2026-07-08` (main `4dcd2aa` base). TASK-090 self-review 의 디자인 강화분 (padding 6px / size-sm / alpha 20%) 을 Svelte baseline (padding 4px / size-xs / alpha 15%) 으로 통일. 결정: 옵션 A. 신규 2종 + 수정 1종. 디자인 토큰 시스템 단일화는 후속 TASK. 회귀 baseline: TS 5 packages clean, build-monitor vitest **204 → 227 PASS** (신규 23), svelte-check 0/1, build-server tests 동일, vite build:react 정상 (gzip js 91.04KB / css 28.10KB). 다음: TASK-097 Group C 또는 디자인 토큰 단일화 TASK-096.5 (사용자 결정 대기). workflow meta sync (state rev 115→116, handoff 84→85, work_backlog 79→80, backlog index 49→50 / latest 27→28) 같은 sync commit 안에 포함.)
- Updated: 2026-07-08 (rev 83→84: TASK-095 (M4.5 Group A — Header / ThemeToggle / FilterChips React 마이그레이션) main 합류 회수 sync. PR 본질: frontend rewrite 7-PR 시리즈 후속 M4.5 의 1단계. branch `grok/task-095-header-theme-react-2026-07-08` (main `1ab566d` base). 신규 8종 (Header.tsx / Header.css / ThemeToggle.tsx / FilterChips.tsx / adminAllowListStore.ts + 4 test) + 수정 2종 (App.tsx 모든 라우트가 Header 공유 / api.ts adminAllowList helper). Svelte 측 컴포넌트는 cross-framework 공존 유지 — TASK-096+ 에서 일괄 정리. 결정: 옵션 A 채택. 사전 결함 + 보강: ThemeToggle matchMedia jsdom 부재 try/catch fallback; adminAllowListStore mock 호환성 → Zustand setState 직접 set; admin /admin/admins path generated 부재 → apiGet/apiSend 캐스팅. 회귀 baseline: TS 5 packages clean, build-monitor vitest **173 → 204 PASS** (신규 31), svelte-check 0/1, build-server tests 동일 (영향 0), vite build:react 정상 (gzip js 91.03KB / css 28.10KB, TASK-094 baseline 89.96KB → +1.07KB), vite build svelte 정상. 다음: TASK-096 Group B (StatusPill) 또는 TASK-097 Group C (Admin 진입점) 진입 (사용자 결정 대기). workflow meta sync (state rev 114→115, handoff 83→84, work_backlog 78→79, backlog index 48→49 / latest 26→27) 같은 sync commit 안에 포함.)
- Updated: 2026-07-08 (rev 82→83: TASK-094 (Svelte 코드 정리 — frontend rewrite 7-PR 시리즈 final) main 합류 회수 sync. PR 본질: TASK-088~093 의 frontend rewrite 시리즈 final 단계. branch `grok/task-094-svelte-cleanup-2026-07-08` (main `8395702` base). TASK-093 의 Svelte legacy mount + env + SPA fallback 분기 모두 폐기. 삭제 4종 (BuildDetail.svelte 308 lines / PhaseTimeline.svelte / LogStream.svelte / PhaseTimeline.test.ts) — 모두 React 마이그레이션 완료. 신규 1종 (BuildDetailRedirect.svelte). Build Server `mountBuildMonitorDist` — Svelte 분기 + helper + env + SPA fallback 모두 삭제, React `@fastify/static` 만 mount + raw `fs.createReadStream` SPA fallback. 유지 (의도적 scope): admin / build-request / api-console Svelte routes — 후속 시리즈 React 마이그레이션. 결정: 옵션 A 채택. 사전 결함 + 보강: `/builds/<id>` 가 Build Server wildcard GET route 매치 → UUID validation 500 (정직한 동작, 운영자 UX 는 React SPA 의 `<Link>` 클릭 사용). 회귀 baseline: TS 5 packages clean, build-server node:test **143 → 142 PASS** (Svelte legacy 5건 폐기 + 신규 1건), build-monitor vitest **178 → 173 PASS** (PhaseTimeline.test.ts 5건 제거), svelte-check 0/1 (TASK-077 baseline 무해), vite build:react 정상 (gzip js 89.96KB / css 27.81KB), vite build svelte 정상 (운영 중 admin / build-request pages 정합 유지). frontend rewrite 7-PR 시리즈 종료. 다음: M4.5 admin / build-request / api-console React 마이그레이션 또는 다른 TASK (사용자 결정 대기). workflow meta sync (state rev 113→114, handoff 82→83, work_backlog 77→78, backlog index 47→48 / latest 25→26) 같은 sync commit 안에 포함.)
- Updated: 2026-07-08 (rev 81→82: TASK-093 (Build Server dist swap — React 빌드 mount) main 합류 회수 sync. PR 본질: Svelte → React frontend rewrite 7-PR 시리즈 6단계. branch `grok/task-093-build-server-react-dist-2026-07-08` (main `03806f6` base), commit `e1ca2a5`. TASK-075 의 단일 포트 reverse proxy 위에서 Svelte 빌드 → React 빌드 swap. React 가 primary SPA, Svelte 는 legacy deep link 호환용으로 보존. 신규 `BUILD_MONITOR_REACT_DIST_PATH` env (default `apps/build-monitor/dist-react`). `mountBuildMonitorDist` — React `@fastify/static` (decorateReply: true) + Svelte raw fastify route + `fs.createReadStream` + `mountSvelteIndexHtml` helper. SPA fallback 우선순위: `/svelte/*` deep link → Svelte index.html, 그 외 → React index.html. 결정: 옵션 A 즉시 swap / B ✅ 단계적 swap (TASK-094 에서 일괄 정리). 신규 회귀 가드 12건. 회귀 baseline: TS 5 packages clean, build-server node:test **131 → 143 PASS**, build-monitor vitest 178/178 동일, svelte-check 0/1, vite build:react 정상. 다음: TASK-094 Svelte 코드 정리 진입 (사용자 결정 대기). workflow meta sync (state rev 112→113, handoff 81→82, work_backlog 76→77, backlog index 46→47 / latest 24→25) 같은 sync commit 안에 포함.)
- Updated: 2026-07-08 (rev 80→81: TASK-092 (lib layer — Zustand store 분리) main 합류 회수 sync. PR 본질: Svelte → React frontend rewrite 7-PR 시리즈 5단계. branch `grok/task-092-lib-layer-2026-07-08` (main `b630bb9` base), commit `f87bd78`. BuildsList / BuildDetail 의 useState 4개 + useEffect fetch lifecycle 을 Zustand 5.x store 로 통합. 본 PR 은 빌드 동작 변경 없이 stateful 코드만 store 로 격리 — visual 회귀 영향 0. 신규 `zustand@^5.0.2` (resolved 5.0.14) React 19 정합. 신규 store 2종 (buildsListStore / buildDetailStore) + store unit test 12 신규. self-review amend 2 area 봉인 (App.test.tsx store.loading 단언 + AbortSignal 케이스 정정). 회귀 baseline: TS 4 packages clean, build-monitor vitest **166 → 178 PASS** (기존 166 + store unit 12 신규), svelte-check 0/1 (TASK-077 baseline 무해), tsc -p tsconfig.react.json clean, vite build:react gzip js **89.96KB** / css **27.81KB** (TASK-091 baseline 89.53KB → +0.43KB). workflow meta sync (state rev 111→112, handoff 80→81, work_backlog 75→76, backlog index 45→46 / latest 23→24) 같은 sync commit 안에 포함. 다음: TASK-093 Build Server dist swap (Build Server 의 mountBuildMonitorDist 가 React 빌드를 mount) 또는 TASK-094 Svelte 코드 정리 진입 (사용자 결정 대기). 회귀 영향 0 — 빌드 동작 변경 없음.)
- Updated: 2026-07-08 (rev 79→80: TASK-091 (BuildDetail 페이지 React 마이그레이션) main 합류 회수 sync. PR 본질: Svelte → React frontend rewrite 7-PR 시리즈 4단계. branch `grok/task-091-build-detail-2026-07-08` (main `be72de0` base), commit `2910a7c`. Svelte `routes/BuildDetail.svelte` (308 lines) → React `routes/BuildDetail.tsx` 1:1 정합 + PhaseTimeline + LogStream React 컴포넌트 신규 + api.ts getBuild/getBuildLogs 추가 + App.tsx placeholder → BuildDetail 교체. self-review amend 2 area 봉인 (페이지 상단 Back link + PhaseTimeline 수직 연결선 CSS rule). 회귀 baseline: TS 4 packages clean, build-monitor vitest **158 → 166 PASS** (BuildDetail page 8 신규), svelte-check 0/1 (TASK-077 baseline 무해), tsc -p tsconfig.react.json clean, vite build:react gzip js **89.53KB** / css **27.76KB** (TASK-090 baseline 87.27KB → +2.26KB), Build Server `mountBuildMonitorDist` 영향 0. workflow meta sync (state rev 110→111, handoff 79→80, work_backlog 74→75, backlog index 44→45 / latest 22→23) 같은 sync commit 안에 포함. 다음: TASK-092 lib layer (Zustand store 분리 / openapi-fetch 정합 / visual diff baseline) 또는 TASK-093 Build Server dist swap 진입 (사용자 결정 대기). 회귀 영향 0 — Svelte build-monitor 운영 baseline 모두 그대로 유지.)
- Updated: 2026-07-08 (rev 78→79: TASK-089 (Login 1 페이지 React 마이그레이션) + TASK-090 (BuildsList 페이지 React 마이그레이션) main 합류 회수 sync. PR 본질: frontend rewrite 7-PR 시리즈의 2~3단계 — TASK-088 PoC 위에서 react-router-dom v7 + Login 페이지 1개 + BuildsList 페이지 1개 마이그레이션. commit 5개 (`a312123` Login 본체 → `8dab9f6` Login self-review amend → `8c5eb92` BuildsList 본체 → `af41c8d` BuildsList self-review UI polish → `db87d04` BuildsList self-review follow-up). TASK-089 amend 4 area 봉인: `apps/build-monitor/public/favicon.svg` 신규 (404 favicon 회피) + React ErrorBoundary 컴포넌트로 전체 앱 wrap (runtime error UI 노출) + `localStorage` cross-tab `storage` 이벤트로 userIdStore sync (다른 탭 로그아웃 즉시 반영) + `data-testid` 보강. TASK-090 amend 6 area 봉인: 1차 light theme 전환 (`data-theme="light"`) + chip wrapper Svelte FilterChips 정합 + chip 비활성 contrast + StatusPill sizing, 2차 table row hover (4px indigo accent + surface-elevated) + 마지막 row border 처리 + appName ellipsis. 회귀 baseline: TS 4 packages clean, build-monitor vitest **141 → 158 PASS** (Login 8 + BuildsList 18 신규; Svelte 140 baseline 유지), svelte-check 0/1 (TASK-077 baseline 무해), tsc -p tsconfig.react.json clean, vite build:react gzip js **87.27KB** / css **27.29KB**, Build Server memory mode e2e: seed build `task-090-demo-app` QUEUED → `/api/builds` → BuildsList 노출 정상, 5176 e2e light theme PASS, CI (docker-build) ✅ pass 1m 6s, Build Server `mountBuildMonitorDist` (dist/ Svelte) 영향 0. workflow meta sync (state rev 109→110, handoff 78→79, work_backlog 73→74, backlog index 43→44 / latest 21→22) 같은 sync commit 안에 포함. 다음: TASK-091 BuildDetail 페이지 React 마이그레이션 진입 (사용자 결정 대기). 회귀 영향 0 — Svelte build-monitor 운영 baseline 모두 그대로 유지.)
- Updated: 2026-07-08 (rev 77→78: TASK-088 React + Astryx 부트스트랩 PoC — branch `codex/task-088-astryx-bootstrap-2026-07-08` (main `e30c896` base) 작업 완료. PR 본질: Svelte 5 build-monitor 와 격리된 React 19 + @astryxdesign/core v0.1.4 (Meta, MIT, 10일 된 베타) 부트스트랩. Svelte 빌드 (apps/build-monitor/dist/, Build Server 가 mount) 와 React 빌드 (apps/build-monitor/dist-react/) 가 같은 vite workspace 에서 공존. 신규 6 file (tsconfig.react.json / vite.react.config.ts / react/index.html / src/react/{main.tsx, App.tsx, globals.css, App.test.tsx}). 수정 4 file (package.json / vite.config.ts / tsconfig.json / .gitignore). 회귀 baseline: svelte-check 0 errors / 1 warning (TASK-077 baseline 무해), vitest 141/141 PASS (기존 140 + Astryx 1), vite build Svelte 정상 (gzip js 39.37KB / css 6.94KB), vite build --config vite.react.config.ts 정상 (gzip js 81.44KB / css 25.57KB, dist-react/), tsc -p tsconfig.react.json clean. Build Server mountBuildMonitorDist 영향 0. 다음: PR #43 (TASK-088) self-review → squash merge. 후속 TASK-089 react-router-dom + Login 페이지 1개 마이그레이션, TASK-090 핵심 컴포넌트 마이그레이션 (StatusPill → Badge, Header → TopNav, ThemeToggle), TASK-091 8 routes, TASK-092 lib layer (openapi-fetch + Zustand + chipFilter), TASK-093 Build Server dist 전환 (TASK-075 follow-up), TASK-094 기존 Svelte 코드 정리.)
- Updated: 2026-07-06 (rev 76→77: TASK-082 (skill 측 build request UI + API Console + Header nav 보완) PR #29 squash merge main 합류 (`074a80c`, 2026-07-06T07:30:00Z, by ykylee). branch `codex/task-079-build-request-ui-2026-07-06` (main `661925a` base) → squash merge → `--delete-branch` 자동 삭제 완료. 9 file / +1779 insertions / -3 deletions. 신규 5 file: `apps/build-monitor/src/routes/BuildRequest.svelte` (713 lines, POST /builds payload 직접 작성 — 3 preset + random appName + form validation + 202/409 분기 결과 패널 + Build Detail 이동), `apps/build-monitor/src/routes/BuildRequest.test.ts` (366 lines, 15 tests), `apps/build-monitor/src/routes/ApiConsole.svelte` (242 lines, Swagger UI iframe 임베드 — `/docs/` in iframe, Refresh + Raw OpenAPI JSON + Go to Build Request 액션), `apps/build-monitor/src/routes/ApiConsole.test.ts` (74 lines, 6 tests), `apps/build-monitor/src/lib/api.test.ts` (114 lines, parseApiError unit 7 tests). amend 4 file: BuildRequest.svelte (StatusPill + resetForm + field validation + Reset 버튼 + lifecycleStatus mock), BuildRequest.test.ts (+7 tests), ApiConsole.svelte (description 명확화), lib/api.ts (parseApiError helper — zod field error → field-level banner via brace-count JSON parser). Header nav 보완: API → API Console (in-SPA) + OpenAPI (raw JSON, target=_blank) + Docs (Swagger UI, target=_blank) + New Build (userId set 시). self-review amend 두 차례 봉인 — 1차 (`110ff25`): 신규 5 file + App routing + Header nav + lib/api.ts submitBuildRequest helper. 2차 (`d7baea7`): amend 보완 7건 — (C-1) BuildSummary mock 에 lifecycleStatus 추가, (C-2) parseApiError helper (zod field error → field-level banner), (I-1) StatusPill 컴포넌트 사용 (14 status 전체 매핑), (I-2) 'Reset form' + 'View Builds list' 두 개로 분리, (I-3) previewTtlMinutes/dockerfilePath client-side validation, (D-4) previewTtlMinutes default 60 (backend 정합), (D-5) ApiConsole description 'iframe 안의 Swagger UI' 명시. 회귀 baseline: TS 4 packages clean, build-monitor vitest **114/114 PASS** (TASK-077 baseline 102 → +12: BuildRequest 5 + parseApiError 7), build-server 123/123 PASS, Go 7 packages PASS, svelte-check 0 errors / 0 warnings, vite build OK (gzip js 37.27KB / css 6.31KB), e2e-single-port PASS. 신규 build-monitor dist: index-CJNIxP8D.js 110KB / index-B_TZirpv.css 46KB. 본 TASK 봉인으로 TASK-017/035/036/043/051~079 모든 후속 TASK main 합류. 다음: 사용자 다른 지시 대기 (TASK-079 follow-up / 별도 TASK 결정 대기). workflow meta sync (state rev 91→92, handoff 70→71, work_backlog 64→65, backlog index 39→40 / latest 12→13) 같은 sync commit 안에 포함.) - Updated: 2026-07-06 (rev 69→70: TASK-078 (container self-dogfood — Dockerfile + compose + CI workflow + amend 10건 봉인) PR #28 squash merge main 합류 (`661925a`, 2026-07-06T05:30:00Z, by ykylee). branch `codex/task-078-container-self-dogfood-2026-07-06` (main `13bf191` base) → squash merge → `--delete-branch` 자동 삭제 완료. 8 file / 927 insertions. 신규 5 file: Dockerfile (Build Server multi-stage 4-stage — builder → prod-deps → runtime, USER app@1500 non-root, ADMIN_IDS default 부재, HEALTHCHECK start_period 15s), apps/runner/Dockerfile (Go multi-stage alpine 3.20 + docker-cli, USER runner@1500 + docker group supplementary, EXPOSE 3000 제거), compose.dev.yaml (build-server + runner + profile postgres, ${ADMIN_IDS:?...} + ${DOCKER_SOCKET_GID:?...} strict 강제, runner on-failure restart, mem_limit 512m), .dockerignore (Dockerfile/compose 라인 제거), .github/workflows/docker-build.yml (PR/main trigger, image build + size 200 MB threshold + USER non-root 검증 + /health + smoke). amend 6 file: Dockerfile + apps/runner/Dockerfile (USER + git 제거 + ADMIN_IDS default 부재 + start_period), compose.dev.yaml (strict mode + mem_limit + restart on-failure), .dockerignore 정리, apps/runner/internal/worker/worker.go (claimBackoff exponential + log throttle 5s + TestWorker_ClaimBackoff_ExponentialWithCap), docs/operations/container-self-dogfood.md (Quick Start + strict mode + 비-root + size 169 MB + runner backoff + CI 가이드). self-review amend 두 차례 봉인 — 1차 (`81263cc`): Docker + Runner Dockerfile + compose + .dockerignore + docs + 백로그 5 file, 2차 (`2c15e9a`): amend 보완 10건 (C-1 USER / C-2 ADMIN_IDS / C-3 DOCKER_SOCKET_GID / C-4 git / C-5 start_period / I-1 prod-deps / I-2 .dockerignore / I-3 CI / I-4 backoff / I-5 EXPOSE). 회귀 baseline: TS 4 packages clean, build-monitor vitest 80/80 PASS (TASK-077 baseline 유지), build-server 123/123 PASS (TASK-077 baseline 유지), Go 7 packages 모두 PASS (신규 backoff test 포함), svelte-check 0 errors / 0 warnings, vite build OK (gzip js 32.77KB / css 5.15KB), e2e-single-port PASS. container image size 검증: dibs/build-server:dev 169 MB (was 309 MB, -45%, prod-deps stage 분리 효과), dibs/runner:dev 41 MB (was 42.7 MB). CI workflow 가 PR / main push 시 자동 검증 — image build + size 200 MB threshold + USER non-root 검증 + /health + smoke scenario. 시뮬레이션 7 단계로 self-dogfood 시나리오 실 검증 완료 (PHASE 1 부팅 + USER 검증, 2 OpenAPI/Admin 가드, 3 build lifecycle, 4 compose up + Runner join, 5 claim lifecycle, 6 Runner backoff, 7 amend 보완 통합). 본 PR 합류로 TASK-017/035/036/043/051~078 모든 후속 TASK main 합류. 다음: 사용자 다른 지시 대기 (TASK-079 alpine → distroless 검토 / TASK-080 runner DinD·rootless / TASK-081 CI 기반 OpenAPI 동기화 모두 보류). workflow meta sync (state rev 90→91, handoff 69→70, work_backlog 63→64, backlog index 38→39 / latest 11→12) 같은 sync commit 안에 포함.) - Updated: 2026-07-06 (rev 68→69: TASK-076/077 (admin 진입점 + 메뉴 통합) PR #27 squash merge main 합류 (`0eb0ad7`). `gh pr merge --squash --delete-branch` 으로 main 에 합류 — branch `codex/task-077-admin-tabs-consolidation-2026-07-06` 자동 삭제 완료. PR 본체 (`49dac8c`) + 1차 amend (`85a8ab5`) + 2차 amend (`aab8282`) 가 squash 단일 commit 으로 main 에 통합됨. 19 file / 554 insertions / 393 deletions. 본 TASK 묶음은 TASK-068 (M5 deploy) + TASK-070 + TASK-072 (M4 follow-up) 의 admin UX 후속 정리 — admin 권한 흐름을 `userId` 로 단일화 (TASK-076: `adminIdStore` / `ADMIN_ID_KEY` 제거 + `AdminLogin.svelte` 183 lines 삭제 + Header 별도 AdminLogin / Admin Logout 버튼 제거) + Header admin 메뉴 단일 진입점 + 페이지 상단 `<AdminTabs />` 도입 (TASK-077: 4 탭 + svelte-spa-router `$location` 구독 active 하이라이트 + 라우트 URL 보존). 부수: 발견된 mock 인프라 결함 동시 봉인 — `Header.test.ts` 의 `setAdminAllowList` 가 mock `__set` 을 optional chaining 으로 호출했으나 mock 의 `__set` 이 inner writable 에만 붙어 silent no-op 이었던 것을, mock 반환 객체에 `__set` 을 직접 노출 (회귀 안전성 회복). self-review follow-up amend 두 차례 봉인 — 1차 (trailing newline 4건 + raw rgba → `--shadow-glow` + doc 코멘트 정합), 2차 (AdminBuilds 비대칭 `$effect` 일관성 정리 + AdminTabs `.active` class 회귀 테스트 2건). 회귀 baseline: TS 4 packages clean, build-monitor vitest **80/80 PASS** (TASK-075 baseline 71 → +11: AdminTabs 신규 4 + AdminTabs self-review `.active` / `.admin-tab` class 신규 2 + Header 신규 TASK-077 회귀 가드 1 + admin 페이지 4종 tab 노출 가드 4; AdminLogin 2건 TASK-076 에서 파일 삭제; Header 9건 동일 — 신규 TASK-076 회귀 가드 3건이 기존 admin login/logout 관련 3건을 대체), svelte-check 0 errors / 0 warnings, vite build OK (gzip js 32.77KB / css 5.15KB), build-server tests **123/123 PASS** (TASK-075 baseline 유지), Go 76/76 동일, e2e-single-port PASS. 본 PR 합류로 TASK-017/035/036/043/051~077 모든 후속 TASK main 합류 — 사용자 요청 'admin 기능을 정비' 의 연속 TASK 묶음 봉인. 다음: 사용자 다른 지시 대기 (TASK-073 private registry auth / TASK-074 다른 deploy target 모두 보류). workflow meta sync (state rev 89→90, handoff 68→69, work_backlog 62→63, backlog index 37→38 / latest 10→11) 같은 sync commit 안에 포함.)  - Updated: 2026-07-06 (rev 67→68: TASK-076/077 (admin 진입점 + 메뉴 통합) PR #27 open (`aab8282` post-amend (AdminBuilds `$effect` 일관성 + AdminTabs `.active` class 회귀 테스트 2건), self-review 봉인 완료, squash merge 대기). branch `codex/task-077-admin-tabs-consolidation-2026-07-06` (main `809f1da` base, head `49dac8c` → amend `85a8ab5` → amend `aab8282` (AdminBuilds $effect 일관성 + AdminTabs `.active` class 회귀 테스트 2건 추가)). 19 file / 554 insertions / 393 deletions. 사용자 요청 'admin 기능을 정비' 의 연속 TASK 묶음: (TASK-076) `apps/build-monitor/src/routes/AdminLogin.svelte` (183 lines) + `AdminLogin.test.ts` (2 tests) 파일 삭제 + `App.svelte` `/admin/login` 라우트 제거 + `lib/session.ts` `adminIdStore` / `ADMIN_ID_KEY` 제거 (writable store 하나로 `userId` / admin id 통합). `Header.svelte` `adminIdStore` 의존 제거 + 별도 AdminLogin 링크 / Admin Logout 버튼 제거 — 일반 Logout 한 번에 `userId` 와 admin 메뉴가 함께 사라진다. `Admin{Builds,Users,Admins,Runners}.svelte` `localStorage.getItem('adminId')` 체크 → `userIdStore` 직접 구독으로 교체. redirect target `/admin/login` → `/` (Login 페이지와 admin 진입점 동일). (TASK-077) 신규 `apps/build-monitor/src/components/AdminTabs.svelte` (79 lines): 4 탭 (Builds / Users / Admins / Runners) + svelte-spa-router `use:link` + `$location` store 구독으로 active tab 하이라이트. 라우트 URL 그대로 유지 (`/admin/builds` 등) — deep link / bookmark 정상 동작. 신규 `AdminTabs.test.ts` 6 tests. `Header.svelte` 의 4 nav 링크 (Admin · Builds/Users/Admins/Runners) → 단일 'Admin' 진입점 (`/admin/builds`). 4개 admin 페이지 상단에 `<AdminTabs />` 추가 + `<h1>` 페이지 특화 텍스트로 단축 (예: `Admin · Admins` → `Admins`). 부수: 발견된 mock 인프라 결함 동시 봉인 — `Header.test.ts` 의 `setAdminAllowList` 가 mock `__set` 을 optional chaining 으로 호출했으나 mock 의 `__set` 이 inner writable 에만 붙어 silent no-op 이었던 것을, mock 반환 객체에 `__set` 을 직접 노출해서 helper 가 항상 inner store 까지 함께 set 하도록 수정 (회귀 안전성 회복). self-review follow-up amend 6건 — `App.svelte` / `Header.svelte` / `AdminTabs.svelte` / `AdminBuilds.svelte` trailing newline 복구 + `AdminTabs.svelte` raw `rgba(99, 102, 241, 0.4)` → `var(--shadow-glow)` 디자인 토큰 정렬 + doc 코멘트 (underline 언급) 실제 fill 스타일과 정합. 회귀 baseline: TS 4 packages clean, build-monitor vitest **80/80 PASS** (TASK-075 baseline 71 → +11: AdminTabs 신규 4 + AdminTabs self-review `.active` / `.admin-tab` class 신규 2 + Header 신규 TASK-077 회귀 가드 1 + admin 페이지 4종 tab 노출 가드 4; AdminLogin 2건 TASK-076 에서 파일 삭제; Header 9건 동일 — 신규 TASK-076 회귀 가드 3건이 기존 admin login/logout 관련 3건을 대체), svelte-check 0 errors / 0 warnings, vite build OK (gzip js 32.77KB / css 5.15KB), build-server tests **123/123 PASS** (TASK-075 baseline 유지), e2e-single-port PASS. 다음: PR #27 squash merge 대기 → 사용자 다른 지시 대기 (TASK-073 private registry auth / TASK-074 다른 deploy target 모두 보류).) - Updated: 2026-07-06 (rev 66→67: TASK-075 (단일 포트 reverse proxy — 사용자가 TASK-073/074 후속을 미루고 우선 요청) PR #26 squash merge main 합류 (`809f1da`). branch `codex/task-075-single-port-reverse-proxy-2026-07-06` (main `0edb5c8` base) → squash merge → `--delete-branch` 자동 삭제. 6 file / 525 insertions / 2 deletions. (1) `apps/build-server/package.json` `@fastify/static` ^9.0.0 dep 추가 (lock 9.1.3). (2) `apps/build-server/src/app/create-app.ts` `mountBuildMonitorDist(app)` helper 신규 — `BUILD_MONITOR_DIST_PATH` env 기반 runtime cwd-relative mount + `@fastify/static` register (decorateReply: true, serveDotFiles: false) + SPA fallback setNotFoundHandler (registered `/builds` / `/admin/*` prefix 만 307 transparent redirect, 미등록 `/api/*` + `/openapi|docs|health` prefix JSON 404). (3) 신규 e2e script `apps/build-server/scripts/e2e-single-port.sh` — Build Server 만 띄워서 한 port 에서 HTML + API 둘 다 접근 검증 (4 단계 + 보너스 2 모두 PASS). (4) `docs/PROJECT_PROFILE.md` §3 갱신 — `run_local` / `run_local_postgres` 명령 의도 명시 + `단일 포트 reverse proxy (TASK-075)` 블록 신규. (5) 신규 test 10건 (`apps/build-server/tests/static-serve.test.ts`: dist mock + SPA fallback + assets + Build Server API + /api/* 307 redirect + JSON 404 + POST JSON 404 + /admin/* deep link fallback). 회귀 baseline: build-server tests **123/123 PASS** (기존 113 + 신규 10), ts 4 packages clean, vitest build-monitor 71/71 동일, Go 76/76 동일, build-server 117/117 동일, Python skill_mcp 226/226 동일. 사용자가 `다음 테스크는 미뤄두고 다른 작업을 할거야. 우선 프록시를 우리 시스템에 포함시키고 포트 하나로 프론트, 백 모두 접근가능하도록` 라고 요청하여 TASK-073/074 (옵션 i/ii) 외 작업의 최우선으로 TASK-075 진입 후 봉인. 다음: 사용자 다른 지시 대기.) - Updated: 2026-07-06 (rev 65→66: TASK-072 (AdminRunners status pill → canonical StatusPill — M4 follow-up 옵션 (c) 봉인) PR #25 squash merge main 합류 (`f500ada`). branch `codex/task-072-admin-runner-status-pill-2026-07-06` (main `712f461` base) → squash merge → `--delete-branch` 자동 삭제. 7 file / 99 insertions / 65 deletions. (1) `apps/build-monitor/src/components/StatusPill.svelte` colorFor 매핑에 RunnerStatus 2건 추가 — `ACTIVE` → `--color-accent-success` / `DISABLED` → `--color-accent-danger`. BuildSummary 의 success / failed 와 같은 색상 의미론으로 운영자가 BuildsList / AdminRunners 를 번갈아 봐도 직관. aria-label `Build status:` → `Status:` 일반화. (2) `apps/build-monitor/src/routes/AdminRunners.svelte` 의 inline `<span class="pill" class:active class:off>` 마크업을 `<StatusPill status={r.status} />` 단일 라인으로 교체 + 미사용 `.pill` / `.pill.active` / `.pill.off` CSS 21줄 제거. (3) 회귀 가드: StatusPill.test.ts 신규 2건 (ACTIVE / DISABLED 매핑) + 1건 (lifecycleStatus precedence) / AdminRunners.test.ts 기존 disjoint test 를 canonical StatusPill 기반 회귀 가드로 교체 + inline pill.raw 디자인 미사용 검증 / caller 측 test 4건 (BuildRow 2 + AdminUsers 1 + BuildsList 1) 의 `Build status:` → `Status:` 일반화. 회귀 baseline: vitest 71/71 PASS (TASK-071a 67 + TASK-072 신규 4), svelte-check 0/0, vite build OK (raw rgb 디자인 제거로 css gzip 5.30 → 5.23KB / 0.07KB 감소). **M4 follow-up 옵션 (c) 봉인 완료** — TASK-060 / 061 / 062 / 070 / 072 의 5 TASK 가 모두 main 합류되어 M4 의 모든 TASK 묶음 + 디자인 토큰 정렬 follow-up 닫힘. 다음: 후속 TASK 결정 — 옵션 (i) TASK-073 `RUNNER_REGISTRY_CONFIG_DIR` env 도입으로 private Docker Hub / ECR / GCR 인증, 옵션 (ii) TASK-074 다른 deploy target axis 확장.) - Updated: 2026-07-06 (rev 64→65: TASK-071a (Runner deploy adapter robustness — M5 milestone 종료 봉인) PR #24 squash merge main 합류 (`ca2754e`). branch `codex/task-071-deploy-adapter-robustness-2026-07-05` (main `9dc1f25` base) → squash merge → `--delete-branch` 자동 삭제. 3 file / 99 insertions / 23 deletions. (1) `apps/runner/internal/deploy/client.go` `runWithTimeout` helper 도입 — tag / push / future steps 동일 pushTimeout budget 으로 강제 종료. v1 (TASK-068) 의 `runPush` 만 timeout 이었던 asymmetry 해소. 외부 interface (`PushTimeout()` / `RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS` env) 그대로 유지. (2) `apps/runner/scripts/e2e-deploy-push.sh` [4/8] scenario selection 분기 — busybox 가용성에 따라 full e2e (build=cli, run=cli, deploy=cli) ↔ deploy-only (build=cli, run=skeleton, deploy=cli) 자동 전환. (3) `apps/runner/internal/deploy/client_test.go` `TestDeploy_CLIMode_TagTimeout_PropagatesContextDeadline` 신규 (deploy 10 → 11 case). 회귀: Go 8 packages 모두 PASS (76/76 / 75→76, deploy 11 신규), vitest 67/67 동일, TS 4 packages clean. **M5 (Deployment Capability) milestone 종료 봉인** — TASK-059 (skeleton adapter v1) + TASK-064 (smoke / migration / visual QA baseline) + TASK-068 (real DOCKER_REGISTRY push mode) + TASK-071a (deploy adapter robustness) 가 모두 main 합류되어 docs/sdlc/15-refactoring-roadmap-and-milestones.md §5 완료 기준 5 항목 (최소 1개 external deployment adapter / polling 기본 경로 / deploy success/failure Build Server status query 반영 / 운영자 end-to-end smoke 문서+명령 / 운영 메타와 smoke 명령) 모두 충족. 다음: 후속 TASK 결정 — 옵션 (i) TASK-072 `RUNNER_REGISTRY_CONFIG_DIR` env 로 private Docker Hub / ECR / GCR 인증 (TASK-068 follow-up #2), (ii) 옵션 (a) 다른 deploy target axis 확장 (compose / k8s / GitHub Pages), (iii) 옵션 (c) AdminRunners status pill canonical `<StatusPill>` 컴포넌트 승격 (TASK-070 디자인 토큰 정렬 follow-up).) - Updated: 2026-07-05 (rev 63→64: TASK-070 (M4 Consumer Refactor follow-up 봉인) PR #23 squash merge main 합류 (`9dc1f25`). branch `codex/task-070-admin-users-build-row-2026-07-05` (main `c879228` base) → squash merge → `--delete-branch` 자동 삭제. 5 file / 204 insertions / 81 deletions. AdminUsers.svelte 의 inline `<ul class="build-list">` 마크업을 canonical BuildRow 컴포넌트 + `<table>` 구조로 교체 (BuildsList / AdminBuilds 와 동일 UI 정합). owner cell 은 selectedUser inline expansion 이라 시각 노이즈라 destructure 로 omit. 외부 link `target="_blank"` 도 제거하여 svelte-spa-router `use:link` 같은 탭 라우팅 통일. BuildRow prop 타입을 `BuildSummary & { requestedBy?: string }` structural super-set 으로 통일. AdminRunners.svelte raw rgb(34,197,94) / rgb(244,63,94) / rgba(244,63,94,...) 를 canonical 디자인 토큰 `--color-accent-success` / `--color-accent-danger` 기반 `color-mix(in srgb, var(--color-...) N%, transparent)` 로 정렬. tokens.css light / dark 모드별 톤 자동 follow. 신규 test 3건 (AdminUsers 2 + AdminRunners 1). 회귀: vitest 67/67 PASS (TASK-070 신규 3 / 64→67), svelte-check 0/0, vite build OK (gzip js 33KB / css 5KB). M4 (Consumer Refactor) 후속 정합 봉인 완료. 다음: M5 (Deployment Capability) 또는 다른 deploy target 결정.) (rev 62→63: TASK-068 (Runner real deploy adapter, DOCKER_REGISTRY push mode) PR #22 squash merge main 합류 (`c89b1d4`). branch `codex/task-068-real-deploy-adapter-2026-07-05` (main `beb49f0` base) → squash merge → `--delete-branch` 자동 삭제. 신규 `apps/runner/internal/deploy/client.go` `DeployOptions{SourceImage}` + `DeployMode` env + cli mode (`docker tag` + `docker push` with timeout) + `ErrDeploySourceImageMissing` sentinel + 3 test seam + BuildService.ProcessClaim 통합 + 신규 env 3종 + `apps/runner/scripts/e2e-deploy-push.sh` + 테스트 10 신규. self-review amend 2건 봉인 (defaultTagImageCmd/defaultPushImageCmd stderr io.MultiWriter + client.go trailing newline). 회귀: TS 4 packages clean, Go 75/75 PASS (deploy 10 신규), build-server 117/117, build-monitor 64/64, Python 226/226 동일. M3 마지막 축 wire-up 완료. 다음: 후속 TASK 결정.) (rev 61→62: TASK-068 Runner real deploy adapter (DOCKER_REGISTRY push mode) 1차 PR 작성. branch `codex/task-068-real-deploy-adapter-2026-07-05` (main `beb49f0` base). 신규 `apps/runner/internal/deploy/client.go` `DeployOptions{SourceImage}` + `DeployMode` env (default `skeleton` / `cli`) + cli mode (`docker tag` + `docker push` with timeout) + BuildService.ProcessClaim 통합 + 신규 env 3종 (`RUNNER_DEPLOY_MODE` / `RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS` / `RUNNER_DOCKER_BIN`) + `apps/runner/scripts/e2e-deploy-push.sh` + 테스트 10 신규. 회귀: TS 4 packages clean, Go 75/75 PASS (deploy 10 신규 / 65 → 75), build-server 117/117 동일, build-monitor 64/64 동일, Python 226/226 동일. 다음: PR self-review → squash merge.) (rev 60→61: TASK-069 runner registry v1 + admin menu main 합류 회수 (`beb49f0`). 23 신규 build-server test + 4 build-monitor test + 5 Go canonical test 모두 PASS. drift checker 13 sync group (TS↔Python↔Go) RUNNER_STATUSES 신규 추가 포함 missing=0 extra=0. 다음: TASK-068 real deploy adapter 진입.) (rev 54→55: TASK-061 self-review amend 4건 봉인 후 sync. PR #17 에 fix commit (single source-of-truth 보강 + dead branch 정리) 추가. 회귀 221/221 PASS 유지. 다음: PR #17 squash merge. rev 56→57: TASK-062 Go canonical contract mirror PR #18 진입. 회귀 Python 226/226 + Go 6 packages 모두 PASS. 다음: PR #18 self-review 후 squash merge.) [**rev 57→58: TASK-064 smoke / migration / visual QA baseline 진입. branch `codex/task-064-ops-baseline-2026-07-04` 에 5 축 — (1) vitest localStorage 환경 보강 (vite.config.ts `environmentOptions.jsdom.url` + setup.ts JSDOM fallback + jsdom.d.ts) + chipFilter 단일 source-of-truth + success-exclusion 보강 (40 failed → 0, vitest 60/60); (2) `packages/db/src/migrate.ts` + 8 tests (schema_migrations 테이블 + 한 transaction 씩 idempotent + --dry-run/--to flag) + `apps/build-server/src/app/create-app.ts` postgres boot 시 자동 통합 + `apps/build-server/scripts/migrate.ts` standalone CLI; (3) `scripts/smoke.sh` 5 단계 (memory backend PASS); (4) `apps/build-monitor/tests/visual/diff.py` Pillow 기반 per-channel histogram diff + 5 unit test + README 재작성; (5) `docs/operations/smoke-and-migration.md` 8 섹션 신설. 회귀: TS 4 packages clean, packages/db migrate 8/8, apps/build-server focused 27/27, apps/runner go 17 packages, apps/skill_mcp 226/226, apps/build-monitor vitest 60/60, scripts/smoke.sh memory PASS. drift 54 pre-existing (TASK-064 변경 전후 동일, canonical §4~§8 잔재, follow-up). 다음: PR #19 self-review 후 squash merge. **rev 58→59: TASK-066 Runner source archive fetch + real docker build PR #20 squash merge main 합류 (`3930f12`). 5 commit 구조 (`47b83a9` → `bc60458` → `4189677` e2e+meta → `1f86b46` self-review fix 3건 → `ac41866` 보완 5 area) — Build Server `build_source` memory/postgres `bytea` + POST/GET/DELETE `/builds/:buildId/source` 3 endpoint + octet-stream content parser 256 MiB + checksum/size 재계산 + SourceArchiveUploadResponse schema + DELETE RETURNING. Runner `internal/source/fetcher.go` (BuildControlClient.DownloadSource + tar.gz extract + validateTarEntryName absolute/`..`/NUL/control/backslash reject + transport-error 1 retry + cleanup) + `docker.BuildImage(ctx, buildID, sourceDir, dockerfileRelPath)` signature (scratch Dockerfile 제거) + BuildService.ProcessClaim fetcher wire-up. 보완: validateTarEntryName unit 16 case + DELETE route 5 case + memory e2e 7/7 + postgres e2e 5/5 (신규 `e2e-source-archive-postgres.sh` bytea round-trip 직접 verify) + PROJECT_PROFILE docs. rebase: TASK-064 (`5265844`) 가 main 에 머지된 후 state.json + work_backlog.md 충돌 2건 해결 (TASK-064 컨텍스트 + TASK-066 merge entry 모두 보존). 회귀 baseline: TS 4 packages clean, build-server 94/94 PASS (TASK-066 11 신규 = POST/GET 6 + DELETE 5), Go 7 packages 모두 PASS (fetcher 5 + validateTarEntryName 16 unit), packages/db migrate 11/11, Python skill_mcp 동일, e2e memory 7/7 + e2e postgres 5/5. 다음: TASK-067 (container run + healthcheck) 또는 TASK-068 (real deploy adapter) — branch 생성 대기. **rev 59→60: TASK-067 Runner container run + healthcheck 1차 PR 작성. branch `codex/task-067-container-run-healthcheck-2026-07-05` (main `957da99` base). 신규 `docker.Client.RunContainer/WaitForHealth/StopContainer` + `ContainerStatus` / `ContainerRunOptions` + RunContainer skeleton mode (mock 정합 38124) + cli mode (real `docker run -d --name -p` + `docker inspect` host port auto-assign + OS ephemeral port fallback via `pickFreePort` + `net.Dial` TCP probe + HTTP 2xx probe + consecutive-3 stability polling + `ErrContainerHealthcheckTimeout` sentinel) + BuildService.ProcessClaim 통합 (queueTestDeployment 후 RunContainer + WaitForHealth + ReportPreviewReady 에 ContainerStatus 그대로 전달, RUNNER_STOP_CONTAINER_ON_DONE=true 시 defer StopContainer) + 신규 env (RUNNER_DOCKER_RUN_MODE / RUNNER_HEALTHCHECK_PATH / RUNNER_HEALTHCHECK_TIMEOUT_SECONDS) + `apps/runner/scripts/e2e-container-run.sh` (Build Server memory backend 부팅 + busybox/scratch Dockerfile + source archive upload + Runner cli mode + docker ps lifecycle 확인 + Build Server status readback + cleanup) + 테스트 8 신규 (docker 6 + build_service 2). 회귀 baseline: TS 4 packages clean, Go 7 packages 모두 PASS, build-server 94/94 동일, Python skill_mcp 226/226 동일. 다음: PR 오픈 → self-review → squash merge → 후속 TASK-068 (real deploy adapter).**])
- Related docs: [Project Profile](../../docs/PROJECT_PROFILE.md), [Work Backlog](./work_backlog.md)

## Session wrap-up note
- 본 세션은 사용자 요청 ('codewhale 용 배포를 docker-image-builder-system 에 하자') 으로 시작. 상위 standard_ai_workflow 가 v0.11.22 (cf0060d) 에서 추가한 CodeWhale 하네스를 본 저장소에 적용. `render_codewhale_skill()` 직접 호출 (full bootstrap 의 메모리 파일 overwrite 회피) 로 `.codewhale/skills/codewhale-workflow/SKILL.md` 단일 파일 emit. memory sync (state rev 61→62, handoff 34→35, work_backlog 35→36) 와 함께 단일 commit. 신규 code 없음, 회귀 영향 없음. 다음 PR #13 (TASK-017 stdio + TASK-037 sweeper + admin owner block-delete) 및 TASK-051 postgres phase_history column 진행 가능.
- 사용자 후속 요청으로 PR #13 (`codex/task-056-pr-prep-2026-07-03` → `main`, 87 files / +4546 / −4197, TASK-051~059 + TASK-063 묶음) 을 오픈한 뒤 self-review 를 진행. PR #13 에 self-review follow-up 보완 7건을 amend commit (`dc45b60`) 으로 묶어 머지 차단 이슈를 0건으로 닫고, gh pr merge --squash 로 main 에 합류 (`56727d3`). 본 sync commit 으로 workflow 메타 (state rev 66→67, handoff 45→46, work_backlog 38→39, backlog index 20→21 / latest 24→25) 를 main 에 동기화.
- 이후 TASK-060 (Build Monitor status/UI refactor, M4 진입) 1차 PR (`codex/task-060-build-monitor-ui-refactor-2026-07-03`) 으로 `BuildDetail.svelte` canonical 4 block (lifecycle / container test / deployment / result delivery) 노출 + `StatusPill.svelte` `lifecycleStatus` prop + `BuildRow.svelte` `lifecycleStatus` forwarding + legacy preview section `deprecated` badge 분리. self-review follow-up 보완 5건 (success 색상 통일 / .kv breakpoint / section 이름 차별화 / 안내문 명확화 / BuildRow lifecycleStatus) amend commit (`457856c`) 으로 봉인. rebase (CodeWhale overlay `5e597c3` 이후) + squash merge.

## Latest wrap-up note (2026-07-05 / 2026-07-07)

- TASK-068 (Runner real deploy adapter, DOCKER_REGISTRY push mode) PR #22 squash merge main 합류 (`c89b1d4`). branch `codex/task-068-real-deploy-adapter-2026-07-05` (main `beb49f0` base) → squash merge → `--delete-branch` 자동 삭제. 신규 `apps/runner/internal/deploy/client.go` `DeployOptions{SourceImage}` + `DeployMode` env (default `skeleton` / `cli`) + cli mode (`docker tag <SourceImage> <targetRef>:<buildID>` + `docker push <targetRef>:<buildID>` with `pushTimeout` context) + `ErrDeploySourceImageMissing` sentinel + `SetTagImageCmdForTest` / `SetPushImageCmdForTest` / `SetNowForTest` 3 test seam + cli mode 성공 후에도 `deploy-result.json` workspace emit 보존. `BuildService.ProcessClaim` 가 `containerStatus.ImageTag` 를 `deploy.DeployOptions.SourceImage` 로 전달 — cli mode 일 때 registry push, skeleton mode 일 때 SourceImage 무시 (기존 동작 보존). 신규 env 3종 — `RUNNER_DEPLOY_MODE` / `RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS` (default 120s, `push context.WithTimeout` 으로 강제) / `RUNNER_DOCKER_BIN`. `apps/runner/scripts/e2e-deploy-push.sh` (Build Server memory backend + local `registry:2` 5000 부팅 + busybox/scratch Dockerfile + source archive upload + Runner cli + deploy cli mode + Build Server `/builds/:id` 에서 DEPLOYMENT_COMPLETED 확인 + `/v2/<repo>/tags/list` registry tag 검증 + cleanup, `docker info` / `registry:2` pull 실패 시 graceful skip).
- self-review amend 2건 봉인 — (1) `defaultTagImageCmd` / `defaultPushImageCmd` 의 stderr 를 `io.MultiWriter(os.Stderr, &bytes.Buffer{})` 로 부모 process + 캡쳐 동시 흘림. docker push 가 진행률을 stderr 로 출력하기 때문에 (moby #35407) 운영자가 live smoke 시 실시간 push 진행률을 볼 수 있도록. non-zero exit 시 underlying stderr 는 그대로 wrap 되어 caller (BuildService) 의 errorMessage 에 노출. TASK-067 `defaultRunContainerCmd` 패턴과 정합 회복. (2) `apps/runner/internal/deploy/client.go` trailing newline 복구 (POSIX convention). 테스트 10 case 모두 amend 후에도 PASS (동일 결과 — IO 멀티플라이어 wrap 은 push 성공/실패 모두 동일하게 처리).
- 회귀 baseline: TS 4 packages clean (shared-contract / build-server / build-monitor / packages/db direct `tsc --noEmit` OK), Go **75/75 PASS** (deploy 10 신규 / 65 → 75), build-server 117/117 동일, build-monitor 64/64 동일, Python skill_mcp 226/226 동일. M3 (Runner Realignment) 의 마지막 축 wire-up 완료. Build Server (source archive) → Runner (claim + fetch + build + container + healthcheck + registry state + deploy) → Test Deployment → Deploy 의 end-to-end slice 가 모두 active.
- 메타 sync (state rev 83→84, handoff 62→63, work_backlog 56→57, backlog 2026-07-05 §5 → completed + §6 신규) 같은 sync commit 안에 포함. 다음: 후속 TASK 결정 — 옵션 (a) compose / k8s / GitHub Pages 등 다른 deploy target, (b) M4 (Consumer Refactor) 진입, (c) M5 (Deployment Capability) 진입.

- TASK-070 (AdminUsers recent builds → BuildRow 정렬 + AdminRunners pill 디자인 토큰 — M4 Consumer Refactor follow-up 봉인) PR #23 squash merge main 합류 (`9dc1f25`). branch `codex/task-070-admin-users-build-row-2026-07-05` (main `c879228` base) → squash merge → `--delete-branch` 자동 삭제. 신규 5 file / 204 insertions / 81 deletions. (1) `apps/build-monitor/src/routes/AdminUsers.svelte` 의 inline `<ul class="build-list">` 마크업을 canonical BuildRow 컴포넌트 + `<table>` 구조로 교체 (BuildsList / AdminBuilds 와 동일 UI 정합). owner cell 은 selectedUser 의 inline expansion 이라 시각 노이즈가 되어 의도적으로 omit (각 build 의 requestedBy destructure 로 제거) + BuildRow `{#if build.requestedBy}` 가드. 외부 link `target="_blank"` 도 제거하여 svelte-spa-router `use:link` 와 같은 탭 라우팅 통일. 미사용 CSS (`.build-list`, `.build-list li`, `.project`, `.small`) 정리. (2) `apps/build-monitor/src/components/BuildRow.svelte` prop 타입을 local `BuildRowData` subset 에서 `BuildSummary & { requestedBy?: string }` (canonical structural super-set) 으로 통일. (3) `apps/build-monitor/src/routes/AdminRunners.svelte` `.pill.active` raw `rgb(34, 197, 94)` / `.pill.off` raw `rgb(244, 63, 94)` / `.btn-danger` raw `rgba(244, 63, 94, ...)` 를 canonical 디자인 토큰 `--color-accent-success` / `--color-accent-danger` 기반 `color-mix(in srgb, var(--color-...) N%, transparent)` 로 정렬. tokens.css light / dark 모드별 톤 자동 follow (light 성공 #059669 / danger #dc2626). (4) 신규 test 3건 (AdminUsers 2: BuildRow `data-testid="build-row"` 검증 + canonical lifecycleStatus 표시 + owner cell 미렌더 단언 + Close 버튼 unmount / AdminRunners 1: `.pill.active` / `.pill.off` disjoint 회귀 가드).
- 회귀 baseline: vitest 67/67 PASS (TASK-070 신규 3 추가 / 64→67), svelte-check 0 errors / 0 warnings, vite build OK (gzip js 33KB / css 5KB).
- 메타 sync (state rev 84→85, handoff 63→64, work_backlog 57→58, backlog index 32→33 / latest 5→6) 같은 sync commit 안에 포함. 다음: 후속 TASK 결정 — 옵션 (a) compose / k8s / GitHub Pages 등 다른 deploy target, (b) M5 (Deployment Capability) 진입, (c) AdminRunners status pill canonical StatusPill 승격 후속 (M4 정합).


- TASK-071a (Runner deploy adapter robustness — M5 (Deployment Capability) milestone 종료 봉인) PR #24 squash merge main 합류 (`ca2754e`). branch `codex/task-071-deploy-adapter-robustness-2026-07-05` (main `9dc1f25` base) → squash merge → `--delete-branch` 자동 삭제. 3 file / 99 insertions / 23 deletions. (1) `apps/runner/internal/deploy/client.go` `runWithTimeout` helper 신규 도입 — `context.WithTimeout(parentCtx, c.pushTimeout)` + `cancel()` + fn 호출. `runTag` 가 helper 위임으로 변경되어 registry 가 죽었을 때 docker tag 가 pushTimeout (default 120s, `RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS` override) 안에서 끊김. v1 (TASK-068) 의 `runPush` 만 timeout 이었던 asymmetry 해소 — tag / push / future steps 동일 budget. 외부 interface (`PushTimeout()` / `SetNowForTest` / `RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS` env) 변경 없음, 의미만 deploy 단계 전체 timeout 으로 일반화. (2) `apps/runner/scripts/e2e-deploy-push.sh` [4/8] scenario selection 분기 — busybox 있음 → `BUILD_MODE=cli RUN_MODE=cli` (full e2e, 기존 동작) / busybox 없음 → `BUILD_MODE=cli RUN_MODE=skeleton` + 안내 메시지 (deploy-only 시나리오, offline 환경에서 deploy adapter 의 lifetime 검증 가능). [6/8] Runner 기동 env 를 `RUNNER_DOCKER_RUN_MODE=${RUN_MODE}` + `RUNNER_DOCKER_BUILD_MODE=${BUILD_MODE}` 동적 적용. deploy 는 항상 cli mode. (3) 신규 test `TestDeploy_CLIMode_TagTimeout_PropagatesContextDeadline` (deploy 10 → 11 case) — pushTimeout 1s + tagImageCmd 5s block → tag 단계에서 context deadline 으로 끊기며 push 는 호출되지 않음 검증.
- 회귀 baseline: Go `apps/runner` 8 packages 모두 PASS (deploy 11 case), build-monitor vitest 67/67 동일, TS 4 packages clean, build-server 117/117 동일, Python skill_mcp 226/226 동일.
- **M5 (Deployment Capability) milestone 종료** — TASK-059 (skeleton adapter v1) + TASK-064 (smoke / migration / visual QA baseline) + TASK-068 (real DOCKER_REGISTRY push mode) + TASK-071a (deploy adapter robustness — tag-timeout + busybox deploy-only) 가 main 에 모두 합류되어 docs/sdlc/15 §5 완료 기준 5 항목 모두 충족. Build Server (source archive) → Runner (claim + fetch + build + container + healthcheck + registry state + deploy) → Test Deployment → Deploy 의 end-to-end slice 가 모두 active. 다음: 후속 TASK 결정 — 옵션 (i) TASK-072 `RUNNER_REGISTRY_CONFIG_DIR` env 로 private Docker Hub / ECR / GCR 인증 (TASK-068 follow-up #2), (ii) 옵션 (a) 다른 deploy target (compose / k8s / GitHub Pages), (iii) 옵션 (c) AdminRunners status pill canonical `<StatusPill>` 컴포넌트 승격 (TASK-070 디자인 토큰 정렬 follow-up).


- TASK-072 (M4 follow-up 옵션 (c) 봉인 — AdminRunners status pill → canonical StatusPill) PR #25 squash merge main 합류 (`f500ada`). branch `codex/task-072-admin-runner-status-pill-2026-07-06` (main `712f461` base) → squash merge → `--delete-branch` 자동 삭제. 7 file / 99 insertions / 65 deletions. (1) `apps/build-monitor/src/components/StatusPill.svelte` colorFor 매핑에 RunnerStatus 2건 추가 — `ACTIVE` → `var(--color-accent-success)` / `DISABLED` → `var(--color-accent-danger)`. BuildSummary 의 success / failed 와 같은 색상 의미론 유지. aria-label `Build status:` → `Status:` 일반화 (BuildSummary / RunnerStatus / 미래 kind 모두 자연스러운 label). (2) `apps/build-monitor/src/routes/AdminRunners.svelte` 의 inline `<span class="pill" class:active class:off>` 3줄 마크업을 `<StatusPill status={r.status} />` 단일 라인으로 교체. 미사용 `.pill` / `.pill.active` / `.pill.off` CSS 21줄 제거.
- 회귀 baseline: vitest build-monitor 71/71 PASS (TASK-071a 67 + TASK-072 신규 4: StatusPill ACTIVE/DISABLED 매핑 + lifecycleStatus precedence + AdminRunners canonical StatusPill 정합 + inline pill.active/pill.off 미사용 검증), svelte-check 0/0, vite build OK (gzip css 5.30 → 5.23KB / 0.07KB 감소, js 33KB 동일), TS 4 packages clean, Go 76/76 PASS 동일, build-server 117/117 동일, Python skill_mcp 226/226 동일.
- **M4 follow-up 옵션 (c) 봉인 완료** — TASK-060 / 061 / 062 / 070 / 072 의 5 TASK 가 모두 main 합류되어 M4 의 모든 TASK 묶음 + 디자인 토큰 정렬 follow-up 닫힘. **M1 + M2 + M3 + M4 + M5 의 5 milestone 전체 TASK 묶음 종료 + follow-up robustness 정합 완료**. docs/sdlc/15-refactoring-roadmap-and-milestones.md §6 의 TASK 묶음 (`TASK-051` ~ `TASK-070` 모두 `[x]` done) 이 닫혔으며, TASK-071a/072 등 follow-up 도 메인 milestone 축으로 통합 완료. 다음: 후속 TASK 결정 — 옵션 (i) TASK-073 `RUNNER_REGISTRY_CONFIG_DIR` env 도입으로 private Docker Hub / ECR / GCR 인증, 옵션 (ii) TASK-074 다른 deploy target axis 확장 (compose / k8s / GitHub Pages).


- TASK-075 (단일 포트 reverse proxy) PR #26 squash merge main 합류 (`809f1da`). branch `codex/task-075-single-port-reverse-proxy-2026-07-06` (main `0edb5c8` base) → squash merge → `--delete-branch` 자동 삭제. 6 file / 525 insertions / 2 deletions. (1) `apps/build-server/package.json` `@fastify/static` ^9.0.0 dep 추가. (2) `apps/build-server/src/app/create-app.ts` `mountBuildMonitorDist` helper — `BUILD_MONITOR_DIST_PATH` env (runtime cwd-relative) 가 가리키는 `apps/build-monitor/dist` 를 `@fastify/static` 으로 mount (env 미설정 시 skip). SPA fallback setNotFoundHandler — Build Server 자체 route (`/builds`, `/admin/*`) 가 catch 못 한 GET 은 모두 `index.html` 로 SPA fallback. Build Monitor 의 `baseUrl: '/api'` fetch 가 `/api/*` 로 보내면 registered route prefix (`/builds`, `/admin/`) 일 때 `/api` 떼고 307 transparent redirect. 미등록 `/api/*` 와 `/openapi|docs|health` prefix 는 JSON 404 (probe / monitoring 클라이언트가 SPA HTML 로 잘못된 success 인식 방지). POST/PATCH/DELETE 도 SPA fallback 회피. (3) 신규 e2e script `apps/build-server/scripts/e2e-single-port.sh` — Build Server 만 띄워서 한 port 에서 4 단계 (tsc compile, boot + /health, GET / HTML, GET /admin/login SPA fallback) + API (307 → /builds) 검증. (4) `docs/PROJECT_PROFILE.md` §3 갱신 — `run_local` / `run_local_postgres` 명령 의도 (Build Server API 만) 명시 + `단일 포트 reverse proxy (TASK-075)` 블록 신규.
- 회귀 baseline: build-server tests **123/123 PASS** (기존 113 + 신규 10 static-serve.test.ts: dist mock + SPA fallback + assets + Build Server API + /api/* 307 redirect + JSON 404 + POST JSON 404 + /admin/* deep link fallback), ts 4 packages clean, vitest build-monitor 71/71 동일, Go 76/76 동일, build-server 117/117 동일, Python skill_mcp 226/226 동일, e2e-single-port PASS.
- 사용자가 `다음 테스크는 미뤄두고 다른 작업을 할거야. 우선 프록시를 우리 시스템에 포함시키고 포트 하나로 프론트, 백 모두 접근가능하도록` 라고 요청하여 TASK-073/074 (옵션 i/ii 후속) 외 작업의 최우선으로 TASK-075 진입 후 봉인. 다음: 사용자 다른 지시 대기 (TASK-073 registry auth, TASK-074 다른 deploy target, 그 외 새로운 요청).
- (2026-07-07 추가) TASK-087 Nextcloud CalDAV helper script 봉인 + e2e CRUD smoke 검증. 사용자 NAS 의 Nextcloud Hub 10 (v34.0.1.2, https://nextcloud.ddn777.synology.me/) 가 살아있음을 확인 — Tasks + Calendar 앱 enable, principal `x-user-id: yklee`, DAV feature `calendar-access / calendar-search / calendar-auto-schedule / nc-calendar-trashbin / nextcloud-checksum-update / nc-enable-birthday-calendar` 모두 활성. Task REST API (`/ocs/v2.php/apps/tasks/api/v1/tasks`) 와 Calendar REST API 는 404 (앱 파일 부재 — Synology 패키지 기반 calendar/tasks 의 REST 라우트가 없음) 이지만 CalDAV (RFC 4791) VTODO CRUD 는 정상. user-level helper 봉인: `~/.mavis/credentials/nextcloud/nextcloud-auth.sh` (Keychain credential read, perl alarm 8s 로 비대화형 GUI prompt hang 회피, base64 Basic auth header 생성, public function 4종 — `nextcloud_auth_header` / `nextcloud_auth_header_inline` / `nextcloud_basic_creds` / `nextcloud_auth_sanity`) + `~/.mavis/credentials/nextcloud/nextcloud-caldav.sh` (CRUD wrapper, subcommand 9종 — principal / calendars / list / show / create / update / delete / smoke / -h, VTODO body RFC 5545 CRLF 강제, update 는 If-Match 없이 PUT — Nextcloud 34.x Sabre\DAV If-Match etag false-negative 412 known-issue 회피, last-write-wins) + `~/.mavis/credentials/nextcloud/README.md` (setup 가이드 + 회전 절차 + subcommand reference + known-issues + example). Keychain layout: `service=nextcloud` / `account=ddn777@hotmail.com` / password = Nextcloud App Password. 사용자 측 한 줄 셋업: `security add-generic-password -s nextcloud -a 'ddn777@hotmail.com' -w '<APP-PASSWORD>' -U -A` (`-A` always allow 가 비대화형 환경 정합 핵심). 회전 절차 동일 — Nextcloud UI revoke → 새 app password 발급 → keychain update (`-U` 가 덮어쓰기). e2e smoke 검증 (nextcloud-caldav.sh smoke): [1/6] auth sanity OK / [2/6] list 2 existing → snapshot / [3/6] create UID=`2ce09256-ffaf-45cf-bf51-efbaeab823a1` HTTP 201 / [4/6] update NEEDS-ACTION→IN-PROCESS HTTP 204 / [5/6] update IN-PROCESS→COMPLETED HTTP 204 / [6/6] delete HTTP 204. 잔여 정리 — 직전 실패 단계의 test task `dd9c67aa-2ecf-42cd-861e-70b54938575f` 별도 delete. 최종 사용자 원본 task `d6fd79b5-9069-4cc1-b44f-1396bfedcce5` (SUMMARY=`minimax 사용 테스트`, STATUS=`NEEDS-ACTION`) 정합 보존. 사전 결함 + 보강 2건: (1) **macOS `security` 비대화형 환경 한계** — Mavis 의 bash tool 환경 (non-interactive zsh) 에서 `security add-generic-password` 호출 시 entry 가 등록된 듯한 rc=0 이지만 실제로는 entry 미등록. 사용자가 interactive zsh 에서 `-A` (always allow) 옵션으로 직접 추가해야 동작. 비대화형 read 도 keychain 이 unlocked 상태일 때만 동작 (perl alarm timeout 내 read). (2) **`python3 - <<HEREDOC` pipe stdin hijack** — `_caldav__report_vtodos | _caldav__todos_to_json` 호출 시 `python3 - <<'PY'` 가 stdin 을 heredoc 로 고정하여 pipe 의 XML data 가 python 에 안 들어감 (`ET.fromstring('')` ParseError). fix: `python3 - "$xml" <<'PYEOF'` (data 를 argv 로 전달) 패턴 — heredoc 는 code, argv 가 data. 회귀 영향 0 — helper 자체는 user-level (`~/.mavis/credentials/nextcloud/`, git 추적 X), 본 TASK 의 commit 대상은 workflow meta 4종 (state.json / session_handoff.md / work_backlog.md / backlog/2026-07-07.md) 만. 다음: 사용자 결정 대기 (옵션 a) TASK-088 build-monitor `Tasks` 페이지 (tsdav + App Password 입력 폼 본격 통합), 옵션 b) `ai-workflow/memory/active/work_backlog.md` ↔ Nextcloud Tasks 양방향 sync layer, 옵션 c) 다른 TASK 우선).

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

## 2026-07-06 운영 검증 메모

- `docs/operations/dogfood-e2e-2026-07-06.md` 신규 추가. 다음 세션은 이 문서를 먼저 읽으면 된다.
- 실제 성공 build 1건 확인:
  - `bab5995f-7741-4ffc-80ba-95d53684263d`
  - preview `http://127.0.0.1:32770/health`
  - build detail 에서 `Container test=SUCCESS`, `Deployment=SUCCESS`, `Result delivery=SUCCESS`
- queue 검증:
  - 러너 1대(`runner-dogfood-hostnet-2`) 기준 build 3건을 먼저 `QUEUED`로 적재한 뒤 순차 완료 확인
  - 순서: `9562dc11-8f0a-46df-9709-026c8642cb12` → `854fda1b-d735-4cd6-9164-f86c798f5fe3` → `12ea7282-906e-40a9-8f71-5cc16ac8c47a`
  - preview: `:32771`, `:32772`, `:32773` 모두 `{"status":"ok"}`
- 재현된 이슈:
  - `POST /builds` 직후 runner 가 먼저 claim 하면 `/builds/:id/source` fetch 가 `404 Source archive not found for build.` 로 실패할 수 있다.
  - 실패 예시 build: `d4b86bb8-bfed-47c6-980c-ea4574796b1c`, `b20f5746-b71a-4c98-b0af-3ab361786660`, `b9d6d047-652a-40f9-93b5-a0c39bc3e3f9`
- UI 메모:
  - admin 화면은 global header 와 page-level admin tabs 가 함께 보여 hierarchy 가 다소 중첩되어 보인다.
  - Build Request / Build Detail 대비 admin 화면의 시각 톤과 밀도 차이가 있어 일관성 점검 후보로 남긴다.

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
- [ ] source upload race 완화 설계 (`POST /builds`와 `/builds/:id/source` 사이 claim 선점 방지 또는 runner fetch retry/backoff 강화)
- [ ] 러너 2대 이상으로 병렬 claim / 동시 처리 검증
- [ ] admin UI navigation hierarchy / visual consistency 정리

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
- self-dogfood 실제 런타임에서 source archive 업로드보다 runner claim 이 먼저 일어나면 build 가 404 source fetch 로 실패할 수 있다. 현재는 runner `DISABLED` → build/source 적재 → `ACTIVE` 순서로 우회 검증했다.
- (rev 73→74: TASK-080 source upload race mitigation PR #30 squash merge main 합류 `2e2d67a` 2026-07-06T14:11:45Z. 옵션 B (memory `sourceArchives.has` + postgres `build_source` INNER JOIN) + 옵션 C (runner fetcher exponential retry 1s/3s/9s). 회귀 baseline: build-server 123→127 PASS, Go 8 packages PASS. amend 3건 (trailing newline + JSDoc 3). 리뷰 문서 `docs/operations/dogfood-e2e-review-and-followup-2026-07-06.md` 동봉. 다음: race 0/10 fail 검증 + TASK-081 multi-runner.)
- (rev 74→75: TASK-081 multi-runner concurrent claim regression guard PR #31 squash merge main 합류 `16f17a0` 2026-07-06T14:24:00Z. 1 file / +200. 신규 회귀 가드 4건 — drains / yields 1+N-1 cycle / advances multi-cycle / yields K+M-K partial. 회귀 baseline: build-server 127→131 PASS, Go 8 packages PASS. 다음: TASK-081-B multi-runner 운영 검증 또는 TASK-082 postgres e2e.)
- (rev 75→76: TASK-081-B multi-runner 운영 검증 PR #32 squash merge main 합류 `ddae46a` 2026-07-06T14:44:05Z. 3 file / +495. 운영 검증 결과: 5 build × 3 runner → buildsClaimed 분산 1+2+2, 중복 claim 0, 5/5 SOURCE_PREPARED 직후 FAILED. compose override + e2e-multi-runner.sh + 운영 문서 봉인. 다음: TASK-082 postgres e2e 또는 TASK-083 admin UI 일관성.)
- (rev 76→77: TASK-082 postgres backend multi-runner 운영 검증 PR #33 squash merge main 합류 `94a220a` 2026-07-06T15:08:00Z. 4 file / 697 insertions. 신규 3 file: `compose.dev.runner-multi-postgres.yaml` (postgres profile + 3 runner override) + `apps/build-server/scripts/e2e-multi-runner-postgres.sh` (8 단계 자동 검증 — postgres cold start wait + 영속 검증 포함, BASE="${BUILD_SERVER_URL:-http://127.0.0.1:3000}" env var override 지원) + `docs/operations/multi-runner-claim-postgres-2026-07-06.md` (운영 가이드). amend `apps/build-server/src/app/create-app.ts` `MIGRATIONS_DIR` 를 `process.cwd()` 기반으로 변경 — postgres backend 부팅 시 `ENOENT` 결함 봉인, memory backend 에서 잠복. TASK-075 `BUILD_MONITOR_DIST_PATH` 와 동일 `import.meta.url` depth 함정 봉인 패턴. self-review amend 3건 — (a) 운영 가이드 §3.1 (b) TASK-081-B e2e-multi-runner.sh 같은 `BASE` + heredoc 결함 명시, (b) 운영 가이드 §3.5 분포 비결정성 명시 (TASK-081-B 1+2+2 / TASK-082 3+0+2 모두 합=5 보장), (c) e2e `BASE` env var `BUILD_SERVER_URL` override 지원. 운영 검증 결과: 3 runner 모두 ACTIVE (postgres runner table 3 row), 5 build 적재 + source upload, 5/5 build terminal phase (FAILED × 5 — size 0 source 의 의도된 dummy), buildsClaimed 분포 (3+0+2) — 총 5, 중복 0, 2+ actively claimed, postgres `build_request` 영속 검증 filtered=5 / distinct appName=5, migrations 자동 적용 0001~0005 모두. 회귀 baseline: TS 4 packages `tsc --noEmit` clean, Go 7 packages `go test ./...` 모두 PASS. 다음: TASK-083 (admin UI visual + nav 정합) 또는 TASK-085 (busybox/scratch + 실제 tar.gz source 운영 검증 보강 — COMPLETED 까지 가는 production semantic 검증) 진입 (사용자 결정 대기).)

- Updated: 2026-07-07 (rev 85→86: TASK-077 (admin-initiated runner registration — admin 메뉴에서 신규 runner 를 pre-registration 할 수 있도록 + Register Runner 버튼 + POST /admin/runners endpoint 신규. 기존 self-register on first claim (TASK-069) 의 한계 — 운영자가 runner 가 boot 되기 전 admin UI 에 미리 알릴 수 없었음 — 봉인) PR #42 squash merge main 합류 (`6847f1e`, 2026-07-07T06:45:00Z, by ykylee). branch `codex/task-077-admin-register-runner-2026-07-07` (main `8aafbdd` base) → squash merge → `--delete-branch` 자동 삭제 완료. 14 file 변경 (신규 2 + 수정 12) / 1162 insertions / 10 deletions. 신규 1 file: `apps/build-monitor/src/components/RegisterRunnerModal.svelte` — runnerId input + Enter/Escape 키보드 / backdrop click → close. 성공시 (201) close + onSuccess, 실패 (400/401/403/409) 시 inline error 표시 + modal 유지. amend 12 file: `packages/shared-contract/src/build/runner-registry.ts` `adminRunnerRegisterRequestSchema` (runnerId 만, strict) + `adminRunnerRegisterResponseSchema` (adminRunnerSchema wrap. empty / extra field / type mismatch → 400) / `apps/build-server/src/routes/admin-routes.ts` POST /admin/runners endpoint 신규 (401/403/400/409/201) / `apps/build-server/src/services/build-service.ts` createAdminRunner method / `apps/build-server/src/repositories/build-repository.ts` createAdminRunner interface / `apps/build-server/src/repositories/{memory,postgres}-build-repository.ts` createAdminRunner (memory: Map.has + postgres: ON CONFLICT DO NOTHING — atomic) / `apps/build-server/src/app/openapi.ts` OpenAPI component + path 등록 / `apps/build-server/tests/admin-runners-routes.test.ts` 8건 회귀 테스트 (401/403/400 empty/400 extra/201 created/409 duplicate/409 self-then-admin/200 list) / `apps/build-monitor/src/lib/api.ts` createAdminRunner helper + AdminRunnerRegisterRequest/Response type re-export / `apps/build-monitor/src/routes/AdminRunners.svelte` page-head 의 `page-head-actions` div 에 "+ Register Runner" 버튼 + RegisterRunnerModal 통합. submit 성공시 refresh() 호출 / `apps/build-monitor/src/routes/AdminRunners.test.ts` 5건 회귀 가드 / `docs/PROJECT_PROFILE.md` §3.11 신규. 사전 결함 + 보강 4건 (운영 가이드 §5): strict schema 의 extra fields 거부 (zod .strict() 가 admin 의 typing 실수를 400 으로 거부. backend 가 새 field 를 받기 전 contract 정합성 보장) / self-register 와의 race condition 방지 (postgres ON CONFLICT DO NOTHING / memory Map.has 가 atomic. 어느 한 쪽이 success, 다른 한 쪽이 409) / admin UI 의 modal close vs error 표기 policy (error 시 modal 닫지 않음 — 재시도 가능. 성공시에만 close + refresh) / runnerId 가 RUNNER_ID env 와 일치해야 함 (modal 의 modal-help 가 명시. 운영자가 mismatch 를 사전에 알 수 있도록). 결정 (옵션 비교) — A runner pre-registration 없음 (현재 — admin 가 첫 claim 까지 가시성 없음) / B ✅ admin-initiated runner registration + Register Runner modal + 4건 결함 봉인 / C token-based variant (후속). 회귀 baseline: TS 4 packages `tsc --noEmit` clean (변경 파일 영향 없음), build-server 131 → 139 PASS (8건 신규), build-monitor vitest 135 → 140 PASS (5건 신규), Go 8 packages 모두 PASS (TASK-076 baseline 유지), svelte-check 0 errors (1 warning — modal backdrop a11y click-without-keyboard 핸들러 권장, 무해), `vite build` OK (gzip js 39.46KB / css 6.93KB — RegisterRunnerModal 추가로 +0.22KB / +0.05KB), GitHub Actions `build + smoke` SUCCESS. workflow meta sync (state rev 106→107, handoff 85→86, work_backlog 79→80, backlog index 50→51 / latest 27→28) 같은 sync commit 안에 포함.)
- Updated: 2026-07-07 (rev 84→85: TASK-076 (insecure-registry only 운영 패턴 검증) PR #41 squash merge main 합류 (`8012942`, 2026-07-07T06:30:00Z, by ykylee). branch `codex/task-076-insecure-registry-only-2026-07-07` (main `a1ba7ef` base) → squash merge → `--delete-branch` 자동 삭제. 10 file 변경 (신규 3 + 수정 1 + 삭제 6). 신규 3 file: (1) `compose.dev.e2e-insecure-registry.yaml` REGISTRY_AUTH env 미설정 (anonymous access) + REGISTRY_STORAGE_DELETE_ENABLED=true + htpasswd 인증 환경 일체 제거, (2) `apps/build-server/scripts/e2e-insecure-registry.sh` 8 단계 + 보너스 (busybox/registry warm-up → HOST_REGISTRY_CONFIG 셋업 / insecure-registries 만, auths 없음 → compose up → registry healthy (`/v2/` 200 — anonymous access) → build-server healthy → runner registered → 5 build 동시 push (per-build unique source archive — build_idx 가 Dockerfile 의 RUN line content 에 반영되어 manifest digest 가 build 별 unique) → image retention 검증 (catalog + tags list 노출 → DELETE API 로 1 tag 삭제 → 다른 4 tag 영향 없음 확인) → [bonus] retention 후 새 build push), (3) `docs/operations/insecure-registry-only-2026-07-07.md` 운영 가이드. amend 1 file: `docs/PROJECT_PROFILE.md` §3.10 신규 + §3.9 supersede 명시. delete 6 file (htpasswd 모델 — git history 에 보존, 운영의 canonical 은 §3.10 의 `e2e-insecure-registry.sh`): `e2e-registry-push.sh` (TASK-074), `e2e-credential-rotation.sh` (TASK-075), `compose.dev.e2e-registry.yaml` (TASK-074), `docs/operations/registry-push-2026-07-07.md` (TASK-073), `docs/operations/registry-push-auth-2026-07-07.md` (TASK-074), `docs/operations/credential-rotation-2026-07-07.md` (TASK-075). 사전 결함 + 보강 3건 (운영 가이드 §5): **동일 Dockerfile 의 5 build 가 manifest digest 가 동일 → 1 tag DELETE = 모든 tag 영향** (TASK-076 의 핵심 발견. 보존해야 할 build 들까지 사라지는 silent failure) — build_idx 를 Dockerfile 의 RUN line 에 주입해 per-build unique source archive 로 해결. **운영 권고**: image 의 `LABEL build_id=$CI_COMMIT_SHA` 또는 build time 의 `RUN echo "Build: $(date +%s)"` 같은 unique content 보장 / `curl -I` (HEAD) 가 Docker-Content-Digest header 를 안 보냄 → `curl -sS -D - -o /dev/null` 패턴 / submit_and_wait 의 per-build source archive 가 mktemp cleanup 으로 source archive 까지 삭제 → `rm -rf ${per_src}` 를 upload / build lifecycle 완료 후로 이동. 결정 (옵션 비교) — A htpasswd 유지 / B ✅ insecure-registry only + TASK-074/075 supersede / C multi-registry 동시 push. 회귀 baseline: TS 4 packages `tsc --noEmit` clean, build-server 131/131 동일 (backend 변경 0), build-monitor vitest 135/135 동일 (frontend 변경 0), Go 8 packages 모두 PASS (TASK-075 baseline 유지), svelte-check 0/0, `e2e-insecure-registry.sh` ALL PASS (~3-4 분 — catalog `{"repositories":["docker-image-builder-system/cli"]}` + tags 5 buildId 다 노출 + DELETE 202 Accepted + retention 후 새 build push 통과), GitHub Actions `build + smoke` SUCCESS. workflow meta sync (state rev 105→106, handoff 84→85, work_backlog 78→79, backlog index 49→50 / latest 26→27) 같은 sync commit 안에 포함.)
- Updated: 2026-07-07 (rev 83→84: TASK-075 (credential rotation e2e) PR #40 squash merge main 합류 (`8e0b228`, 2026-07-07T05:55:00Z, by ykylee). branch `codex/task-075-credential-rotation-2026-07-07` (main `5ca047e` base) → squash merge → `--delete-branch` 자동 삭제. 3 file / 761 insertions. 신규 2 file: (1) `apps/build-server/scripts/e2e-credential-rotation.sh` 9 단계 + 보너스 2 (busybox/registry warm-up → 초기 credential v1 셋업 → compose up → registry healthy → build-server healthy → runner registered → 첫 build (v1) push 통과 → htpasswd v2 + config.json v2 갱신 → SIGHUP+restart fallback → 두 번째 build (v2) push 통과 → 옛 credential 401 → 새 credential catalog 정상 + 두 buildId tags 노출), (2) `docs/operations/credential-rotation-2026-07-07.md` 운영 가이드. amend 1 file: `docs/PROJECT_PROFILE.md` §3.9 신규. 사전 결함 + 보강 4건 (운영 가이드 §5): htpasswd file 0444 read-only 가 갱신 시 Permission denied → update_htpasswd() 가 chmod 0644 후 redirect + chmod 0444 재부착 / submit_and_wait() 함수의 stdout 오염 → log() helper + >&2 redirect / **registry:v2 가 htpasswd file 의 container-runtime 갱신을 즉시 반영 안 함** — SIGHUP 시도 → 안 되면 restart fallback (운영 환경 credential rotation workflow 의 보안 결함 명시화) / v2 credential 갱신 후 옛 credential 의 즉시 무효화 → restart 후엔 즉시 401 보장. 결정 (옵션 비교) — A dummy restart 만 / B SIGHUP 만 / C ✅ SIGHUP+restart fallback + 4건 결함 봉인. 회귀 baseline: TS 4 packages `tsc --noEmit` clean, build-server 131/131 동일 (backend 변경 0), build-monitor vitest 135/135 동일 (frontend 변경 0), Go 8 packages 모두 PASS (TASK-074 baseline 유지), svelte-check 0/0, `e2e-registry-push.sh` (TASK-074) ALL PASS (회귀 baseline 유지), `e2e-credential-rotation.sh` ALL PASS (~3-4 분 — catalog + tags list build_v1+build_v2 둘 다 노출 + bonus 옛 credential 401 + 새 credential 정상), GitHub Actions `build + smoke` SUCCESS. workflow meta sync (state rev 104→105, handoff 83→84, work_backlog 77→78, backlog index 48→49 / latest 25→26) 같은 sync commit 안에 포함.)
- Updated: 2026-07-07 (rev 82→83: TASK-074 (htpasswd 인증 registry push e2e) PR #39 squash merge main 합류 (`d87a17c`, 2026-07-07T05:05:00Z, by ykylee). branch `codex/task-074-registry-htpasswd-2026-07-07` (main `5dc6fb0` base) → squash merge → `--delete-branch` 자동 삭제. 4 file / 373 insertions / 42 deletions. amend 2 file: `compose.dev.e2e-registry.yaml` (REGISTRY_AUTH=htpasswd + REGISTRY_AUTH_HTPASSWD_REALM="Registry Realm" + REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd env 3종 + ${HOST_REGISTRY_AUTH_DIR}:/auth:ro volume mount + healthcheck `nc -z` 단순화) + `apps/build-server/scripts/e2e-registry-push.sh` (HOST_REGISTRY_AUTH_DIR + chmod 0755 + `docker run --rm httpd:alpine htpasswd -nbB` bcrypt + auths entry key localhost:5000 + insecure-registries 둘 다 + bonus-A/B 401 검증 + [8/8] 인증 부착 curl). 신규 1 file: `docs/operations/registry-push-auth-2026-07-07.md` 운영 가이드. amend `docs/PROJECT_PROFILE.md` §3.8 신규. 사전 결함 + 보강 4건 (운영 가이드 §5): config.json auths entry key exact match (localhost:5000 정렬) / host 임시 디렉터리 permission (chmod 0755) / registry:2 의 apr1 비호환 (httpd:alpine htpasswd -nbB 로 bcrypt 통일) / KEEP_PROJECT=1 의 bind mount dangling source (debug 보강). 결정 (옵션 비교) — A htpasswd 만 / B ✅ htpasswd + 추가 보강 / C 외부 registry 운영 smoke. 회귀 baseline: TS 4 packages `tsc --noEmit` clean, build-server 131/131 동일 (backend 변경 0), build-monitor vitest 135/135 동일 (frontend 변경 0), Go 8 packages 모두 PASS (TASK-073 baseline 유지), svelte-check 0/0, `e2e-registry-push.sh` ALL PASS (~3-4 분 — registry catalog `{"repositories":["docker-image-builder-system/cli"]}` + tags list 에 buildId 노출 + bonus 인증 부재/잘못된 credential 모두 401), GitHub Actions `build + smoke` SUCCESS. workflow meta sync (state rev 103→104, handoff 82→83, work_backlog 76→77, backlog index 47→48 / latest 24→25) 같은 sync commit 안에 포함.)
- Updated: 2026-07-07 (rev 81→82: TASK-073 (RUNNER_REGISTRY_CONFIG_DIR + cli mode registry push e2e) PR #38 squash merge main 합류 (`cd01b99`, 2026-07-07T04:30:00Z, by ykylee). branch `codex/task-073-registry-config-dir-2026-07-07` (main `505d62c` base) → squash merge → `--delete-branch` 자동 삭제 완료. 7 file / 852 insertions. 신규 4 file: (1) `apps/runner/internal/config/config_test.go` config package 신규 6건 (default empty / env read / all-fields / PollInterval default / bare-integer seconds / Setenv observability), (2) `compose.dev.e2e-registry.yaml` registry:2 container (HTTP 5000) + runner override (cli mode + RUNNER_DEPLOY_TARGET_REF=localhost:5000/docker-image-builder-system/cli + RUNNER_REGISTRY_CONFIG_DIR=/registry-config), (3) `apps/build-server/scripts/e2e-registry-push.sh` 8 단계 + 보너스 (busybox/registry warm-up → config.json 검증 → compose up → registry healthy → build-server healthy → runner registered → source archive + cli push lifecycle → registry API catalog/tags 검증 → bonus manifest 검증), (4) `docs/operations/registry-push-2026-07-07.md` 운영 가이드. amend 3 file: `apps/runner/internal/config/config.go` Config.RegistryConfigDir 필드 + parseString("RUNNER_REGISTRY_CONFIG_DIR", "") (default empty → docker default 회귀 없음), `apps/runner/cmd/runner/main.go` cfg.RegistryConfigDir != "" 시 os.Setenv("DOCKER_CONFIG", cfg.RegistryConfigDir) 호출, `docs/PROJECT_PROFILE.md` §3.7 신규. 사전 결함 + 보강 4건: (1) runner binary 에 RUNNER_REGISTRY_CONFIG_DIR 가 없었음, (2) compose 검증 시 group_add 중복 오류 (group_add 제거 + Dockerfile 의 addgroup runner docker 의존), (3) RUNNER_DEPLOY_TARGET_REF 가 registry 의 slash split 에서 의도된 repo 가 안 잡힘 (localhost:5000/docker-image-builder-system/cli 정렬), (4) manifest v2 vs v1 schema (bonus 단계). 회귀 baseline: TS 4 packages tsc --noEmit clean, build-server 131/131 동일 (backend 변경 0), build-monitor vitest 135/135 동일 (frontend 변경 0), Go 8 packages 모두 PASS (기존 7 + config package 신규 6/6), svelte-check 0/0, e2e-registry-push.sh ALL PASS (~2-3 분 — registry catalog {"repositories":["docker-image-builder-system/cli"]} + tags list 에 buildId 노출), GitHub Actions build + smoke SUCCESS. workflow meta sync (state rev 102→103, handoff 81→82, work_backlog 75→76, backlog index 46→47 / latest 23→24) 같은 sync commit 안에 포함.)
- Updated: 2026-07-07 (rev 80→81: TASK-086 (e2e-multi-runner.sh BASE + heredoc 결함 봉인) PR #37 main 합류 (`ab0be9e`, 2026-07-07T03:55:00Z, by ykylee, FF merge). branch `codex/task-086-multi-runner-base-heredoc-2026-07-07` (main `cfddcb7` base) → 자동 삭제 완료. 3 file / 92 insertions / 24 deletions. amend 2 file: (1) `apps/build-server/scripts/e2e-multi-runner.sh` (TASK-081-B 본질) — `BASE="${BUILD_SERVER_URL:-http://127.0.0.1:3000}"` (TASK-082 동일) + `[2/6]` runner registry 대기 30s → 90s + `[0/6] compose up` 에 `--build` + project name `$$` suffix + `[5/6]` heredoc 를 `RUNNERS_JSON="${RUNNERS}" python3 <<'PY'` + `os.environ["RUNNERS_JSON"]` 패턴으로 교체, (2) `apps/build-server/scripts/e2e-production-semantic.sh` follow-on — TASK-085 의 동일 stdin hijack 결함 (TASK-085 의 `${LOGS_JSON}` shell expand 우회 의존을 env var 패턴으로 견고화). amend `docs/PROJECT_PROFILE.md` §3.6 신규. 회귀 baseline: TS 4 packages `tsc --noEmit` clean, build-server 131/131 동일 (backend 변경 0), build-monitor vitest 135/135 동일 (frontend 변경 0), Go 7 packages 모두 PASS, svelte-check 0 errors / 0 warnings, `e2e-multi-runner.sh` ALL PASS (~3-4 분, `2/3 runners actively claimed builds` 분산 검증 출력 회복), `e2e-production-semantic.sh` follow-on ALL PASS, GitHub Actions `build + smoke` SUCCESS. workflow meta sync (state rev 101→102, handoff 80→81, work_backlog 74→75, backlog index 45→46 / latest 22→23) 같은 sync commit 안에 포함.)
- Updated: 2026-07-07 (rev 79→80: TASK-085 (production-semantic 운영 검증 보강 — busybox Dockerfile + 실제 tar.gz source archive 로 build 가 COMPLETED 까지 가는 운영 시나리오 자동 검증 e2e 봉인) PR #36 squash merge main 합류 (`c5e3008`, 2026-07-07T03:25:00Z, by ykylee). branch `codex/task-085-production-semantic-2026-07-07` (main `09c1a4a` base) → squash merge → `--delete-branch` 자동 삭제 완료. 6 file / 792 insertions / 10 deletions. 신규 3 file: (1) `apps/build-server/scripts/e2e-production-semantic.sh` 7 단계 자동 검증 (busybox pull warm-up → compose up → build-server health → runner registry → source archive POST → build COMPLETED → 10 phase + preview URL 검증 → container cleanup), (2) `compose.dev.e2e-production.yaml` single runner + cli mode override + network_mode=host + RUNNER_STOP_CONTAINER_ON_DONE=true + skeleton deploy, (3) `docs/operations/production-semantic-2026-07-07.md` 운영 가이드 (검증 결과 / 사용 절차 / 사전 결함 3건 / 한계 / 빠른 재현). amend 3 file: `apps/runner/internal/docker/client.go` RunContainer 의 host port auto-assign path 의 docker inspect 를 최대 5 회 × 200ms retry (docker inspect race (hostPort=0) 결함 봉인), `apps/runner/internal/docker/client_test.go` 신규 회귀 가드 2건 (TestRunContainerCliModeInspectRetriesUntilPortAppears + AllAttemptsEmptyLeavesHostPortZero), `docs/PROJECT_PROFILE.md` §3.5 신규. 사전 결함 + 보강 3건 (운영 가이드 §5): (1) busybox httpd default Basic Auth → e2e Dockerfile 의 `printf 'A:*\n' > /etc/httpd.conf` permissive rule, (2) docker inspect race → retry, (3) compose bridge network 격리 → network_mode=host. 결정 (옵션 비교) — A dummy dogfood 수동 / B e2e shell script 만 / C ✅ e2e script + 운영 가이드 + race 보강 + host network. Backend 변경 0 (build-server 131/131 동일). 회귀 baseline: TS 4 packages `tsc --noEmit` clean, build-server 131/131 동일 (backend 변경 0), build-monitor vitest 121/121 동일 (frontend 변경 0), Go 7 packages 모두 PASS (기존 + 신규 2건), svelte-check 0 errors / 0 warnings, `e2e-production-semantic.sh` ALL PASS (~2 분), GitHub Actions `build + smoke` SUCCESS. workflow meta sync (state rev 100→101, handoff 79→80, work_backlog 73→74, backlog index 44→45 / latest 21→22) 같은 sync commit 안에 포함.)
- Updated: 2026-07-07 (rev 78→79: TASK-084 (admin 가드 deep link UX — 비-admin user 의 `/admin/*` deep link 진입 시 raw 403 envelope 대신 친절한 권한 없음 패널 봉인) PR #35 squash merge main 합류 (`32aebc7`, 2026-07-07T02:25:00Z, by ykylee). branch `codex/task-084-admin-deep-link-ux-2026-07-07` (main `a7007bd` base) → squash merge → `--delete-branch` 자동 삭제 완료. 12 file / 714 insertions / 18 deletions. 신규 3 file: (1) `apps/build-monitor/src/lib/admin-guard.ts` (ensureAdminAccess helper — adminAllowListStore 캐시 + refresh + contains 체크 단일 source, 결과 `{ isAdmin, allowList, reason: NO_USER|FORBIDDEN|NOT_IN_ALLOW_LIST }`, backend 401/403 만 FORBIDDEN, 5xx fallback), (2) `apps/build-monitor/src/lib/admin-guard.test.ts` (9 tests), (3) `apps/build-monitor/src/components/AdminAccessDenied.svelte` (page-head + danger accent h1 + Login.svelte .card 패턴 + 두 액션 Back to Builds / Switch user). amend 9 file: 4 admin 페이지 (AdminBuilds / AdminUsers / AdminAdmins / AdminRunners) — onMount 첫 단계에 frontend 가드 봉인 (`accessDenied` state + ensureAdminAccess 호출 + `!isAdmin` 시 패널 노출, backend 호출은 가드 통과 후) + 4 admin 페이지 test 회귀 가드 1~2건 추가 + `docs/PROJECT_PROFILE.md` §3.4 신규. 결정 (옵션 비교) — A 단순 redirect / B 단순 패널 / C ✅ 양쪽 결합 (reason-aware 패널 + 두 액션). Backend 변경 0 — Build Server 의 X-Admin-Id 401/403 envelope 그대로 유지 (defense in depth). 회귀 baseline: TS 4 packages `tsc --noEmit` clean, build-monitor vitest **135/135 PASS** (TASK-083 baseline 121 → +14 신규), build-server 131/131 동일 (backend 영향 0), svelte-check 0 errors / 0 warnings, vite build OK (gzip js 38.23KB / css 6.44KB, AdminAccessDenied 컴포넌트 추가로 약간 증가), Go 7 packages PASS. workflow meta sync (state rev 99→100, handoff 78→79, work_backlog 72→73, backlog index 43→44 / latest 20→21) 같은 sync commit 안에 포함.)
- Updated: 2026-07-06 (rev 77→78: TASK-083 (admin UI visual + nav 정합) PR #34 squash merge main 합류 (`e28779d`, 2026-07-06T16:30:00Z, by ykylee). 12 file / 370 insertions / 135 deletions. 신규 3 file: `FilterChips.svelte` (82 lines, chip 디자인 단일 source, `--shadow-glow` 디자인 토큰 정렬) + `FilterChips.test.ts` (7 tests, 옵션 6 + source-level 디자인 토큰 회귀 가드 1) + `docs/operations/build-monitor-ui-visual-2026-07-06.md` (운영 문서). amend 9 file: chip 디자인 단일 source (AdminBuilds / AdminRunners / BuildsList) + AdminAdmins 페이지 구조 통일 (.page + page-head + fadeIn + h1 gradient + var(--size-xxl) + .admins-content 인너 컨테이너) + raw rgba 잔재 9건 `var(--shadow-glow)` 정렬 (Header logo + AdminBuilds btn + ApiConsole btn x2 + BuildRequest btn x2 + Login btn). 보류: Header sticky bar `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04)` 디자인 토큰 신설 검토 후속. 회귀 baseline: build-monitor vitest **121/121 PASS** (TASK-079 baseline 114 → +7), build-server **131/131 동일** (TASK-082 baseline 유지), svelte-check 0/0, vite build OK (gzip js 37.25KB / css 6.26KB), GitHub Actions `build + smoke` SUCCESS. workflow meta sync (state rev 98→99, handoff 77→78, work_backlog 71→72, backlog index 42→43 / latest 19→20) 같은 sync commit 안에 포함.
