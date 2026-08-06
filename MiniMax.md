<!-- standard-ai-workflow-kit: v1.0.0-beta -->

# MiniMax.md

- 문서 목적: MiniMax Code(Mavis / 미니맥스 코드) 하네스가 이 저장소에서 먼저 읽어야 할 workflow 진입 규칙을 제공한다.
- 범위: 세션 복원, workflow state docs 참조 순서, 사용자 보고 언어, 기본 실행/검증 명령, 오케스트레이터/워커 운영 원칙
- 대상 독자: MiniMax Code, 저장소 관리자, 멀티 에이전트 운영자
- 상태: stable (TASK-118 정합)
- 최종 수정일: 2026-07-20
- 관련 문서: `ai-workflow/memory/active/state.json`, `ai-workflow/memory/active/session_handoff.md`, `ai-workflow/memory/active/work_backlog.md`, `docs/PROJECT_PROFILE.md`, `AGENTS.md`

## 목적

이 저장소에서는 **Standard AI Workflow**를 기준으로 작업한다. 세션 시작, backlog 갱신, 문서 동기화, 세션 종료는 `ai-workflow/` 아래 문서를 우선 기준으로 삼는다. MiniMax Code는 메인 orchestrator로 동작하고, doc/code/validation worker에 bounded scope 작업을 위임해 컨텍스트를 절약한다.

## 항상 먼저 읽을 문서

- `ai-workflow/memory/active/state.json`
- `ai-workflow/memory/active/session_handoff.md`
- `ai-workflow/memory/active/work_backlog.md`
- `docs/PROJECT_PROFILE.md`
- `AGENTS.md` (워크플로우 규칙 요약)

`ai-workflow/` 는 세션 복원과 workflow 상태 관리용 메타 레이어다. 프로젝트 코드나 프로젝트 문서를 탐색할 때는 이 경로를 기본 탐색 범위에 넣지 말고, workflow 문서 자체를 갱신하거나 현재 세션 상태를 복원할 때만 예외적으로 참조한다.

## 작업 원칙

- 작업을 시작하기 전에 목적, 범위, 영향 문서를 짧게 정리한다.
- 작업 상태는 `planned`, `in_progress`, `blocked`, `done` 중 하나로 관리한다.
- 검증하지 않은 결과는 완료로 확정하지 않는다.
- 세션 종료 전에는 `state.json`, `session_handoff.md`, 최신 backlog 를 갱신한다.
- 가능한 한 메인 orchestrator는 조정과 통합에 집중하고, 도구 호출/탐색/수정은 `.MiniMax/agents/workflow-*.md` 워커에 위임한다.

## 오케스트레이터 / 워커 운영 원칙 (Multi-Agent Topology)

- **Orchestrator (Mavis / 미니맥스 코드 메인 에이전트)**: 사용자 직접 소통, 작업 분해, 워커 호출/통합, `state.json`/`session_handoff`/`work_backlog` 동기화 전담. 도구 호출을 직접 떠안지 않는다.
- **doc-worker**: 문서 링크/메타데이터/카탈로그 정합성 작업. `ai-workflow/skills/doc-sync`, `merge-doc-reconcile`, `workflow-linter` 호출.
- **code-worker**: 코드 수정/리팩토링 작업. `ai-workflow/skills/code-index-update`, `robust-patcher` 호출. 출력 파일 범위는 `output_files` 명시.
- **validation-worker**: 테스트/스모크 실행 및 결과 기록. `ai-workflow/skills/validation-plan`, `ai-workflow/tests/check_*.py` 호출.

워커에 작업을 위임할 때는 `WorkerTask` (worker_id, task_description, input_files, output_files, constraints, context_summary) 형식으로 의도와 책임 경계를 명확히 적는다. 결과는 `WorkerResponse` (status, summary, produced_artifacts, risks_identified, suggested_follow_up) 형식으로 받는다.

## 언어와 컨텍스트 원칙

- 사용자에게 직접 보이는 작업 보고, 상태 요약, 문서 갱신 문안은 기본적으로 한국어로 작성한다.
- 코드, 명령어, 파일 경로, 설정 key, 외부 시스템 고유 명칭은 필요할 때 원문 그대로 유지한다.
- 내부 사고 과정과 임시 분류는 모델이 가장 효율적인 방식으로 처리하되, 사용자에게는 필요한 결론과 다음 행동만 짧게 전달한다.
- 장문의 중간 reasoning, 중복 요약, 불필요한 자기 설명을 피한다.
- handoff 와 backlog 에는 다음 세션에 필요한 핵심 사실만 남겨 불필요한 컨텍스트 누적을 줄인다.

## 프로젝트 실행 기본값 (state.json commands 정합, TASK-118)

- 설치: `pnpm install` (환경에 따라 ERR_PNPM_IGNORED_BUILDS 발생 가능; direct tsc 검증으로 우회 가능)
- 로컬 실행 (memory backend): `./node_modules/.bin/tsc -p packages/shared-contract/tsconfig.json && ./node_modules/.bin/tsc -p packages/shared-config/tsconfig.json && ./node_modules/.bin/tsc -p packages/db/tsconfig.json && ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json && BUILD_REPOSITORY_BACKEND=memory node apps/build-server/dist/apps/build-server/src/index.js`
- 로컬 실행 (postgres backend): `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/docker_image_builder BUILD_REPOSITORY_BACKEND=postgres DB_AUTO_BOOTSTRAP=true node apps/build-server/dist/apps/build-server/src/index.js`
- 빠른 테스트: `./node_modules/.bin/tsc -p packages/shared-contract/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p packages/shared-config/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json --noEmit && (cd apps/runner && go build ./...)`
- 격리 테스트: `curl http://127.0.0.1:3000/health && curl -X POST http://127.0.0.1:3000/builds ... (memory/postgres backend smoke 확인 완료, duplicate 409 포함)`
- 실행 확인: `GET /health, POST /builds, GET /builds/:buildId, GET /builds/:buildId/logs 응답과 docs/PROJECT_PROFILE.md, state.json, session_handoff.md, work_backlog.md 간 current focus 정합성 점검`

> 위 명령은 `ai-workflow/memory/active/state.json` 의 `commands` 필드를 canonical SSOT 로 본다. 명령 박스가 drift 되면 state.json 을 우선 갱신한 뒤 본 MiniMax.md 와 PROJECT_PROFILE §3 을 정합시킨다.

## 문서 작업 기준

- 문서 위키 홈: `README.md`
- 운영 문서 위치: `ai-workflow/memory/active/`
- backlog 위치: `ai-workflow/memory/active/backlog/`
- session handoff 위치: `ai-workflow/memory/active/session_handoff.md`

## MiniMax Code 전용 메모

- MiniMax Code는 `MiniMax.md` 와 `AGENTS.md` 모두를 진입점으로 활용한다. 시스템 정책과 충돌할 경우 MiniMax.md 가 우선하되, 두 문서가 같은 사실을 가리키는 방향으로 동기화한다.
- `MiniMax_config.example.json` 는 사용자 환경 설정(`~/.MiniMax/config.json` 또는 프로젝트 로컬 `.MiniMax/config.json`)에 복사해 사용한다. 서버 토큰 등은 직접 채워 넣는다. (TASK-119 follow-up: `mcp_servers.standard-ai-workflow-readonly.env.PYTHONPATH` 의 `./workflow-source` 는 더 이상 유효하지 않음. 본 프로젝트는 표준 워크플로우 키트를 `./ai-workflow/` 아래에 두므로 `./ai-workflow` 로 정합 권장.)
- 워커 호출 시 위험한 외부 작업(예: 데이터베이스 마이그레이션, 프로덕션 배포, 시크릿 회전)은 사용자 명시적 승인을 먼저 받는다.
- 신규 프로젝트 기준 초안이다. 프로젝트 고유의 실행 명령과 문서 구조가 정확한지 확인해야 한다. (TASK-118 정합: §프로젝트 실행 기본값 박스는 state.json `commands` SSOT 와 정합 완료.)
- 본 MiniMax.md 는 v0.11.21-beta 마커 잔재 (TASK-118 정합으로 v0.15.19-beta). 하네스의 `MiniMax-code` registry 명은 표준 워크플로우 부트스트랩의 `--harness minimax-code` 옵션과 정합.
