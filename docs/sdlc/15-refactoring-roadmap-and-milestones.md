# Docker Build And Deployment Automation Platform SDLC Step 15 - Refactoring Roadmap And Milestones

- 문서 목적: 문서 기준선 변경 이후 구현 코드의 리팩토링 backlog, 개발 로드맵, 마일스톤, 진척 관리 규칙을 하나의 운영 기준으로 정의한다.
- 범위: refactor 목표, workstream, milestone, backlog grouping, progress tracking, 운영 규칙
- 대상 독자: 프로젝트 리드, Build Server 구현자, Runner 구현자, Frontend 구현자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/07-implementation-backlog-baseline.md`, `docs/sdlc/13-backend-development-plan.md`, `docs/sdlc/contracts/01-shared-build-contract-baseline.md`, `docs/sdlc/design/`

## 1. 문서 목표

이 문서는 현재 구현된 preview-era 코드베이스를 문서 기준의 build -> container test -> external deployment -> result delivery 모델로 재정렬하기 위한 실행 로드맵이다.

이 문서가 답해야 하는 질문:

- 어떤 순서로 refactor 해야 리스크가 가장 낮은가
- 어떤 기능은 refactor와 함께 개발하고 어떤 기능은 뒤로 미뤄야 하는가
- milestone 을 어디서 끊고 진척은 어떤 기준으로 판단할 것인가
- backlog 와 day-by-day 작업 기록을 어떻게 연결할 것인가

## 2. 현재 코드 기준 문제 정의

현재 코드베이스는 다음 특성을 가진다.

- `shared-contract`, `build-server`, `runner`, `build-monitor`, `skill_mcp`가 모두 동작 중이다.
- 하지만 핵심 계약과 API 모델은 여전히 `previewStatus`, `previewUrl`, `TestDeployment`, `TEST_READY` 같은 preview-era 개념을 중심으로 설계되어 있다.
- 문서 canonical source 는 이미 build/test/deploy/result-delivery 모델로 이동했다.

따라서 다음 refactor 목표가 필요하다.

1. contract 와 DB 모델을 문서 기준으로 재정렬
2. Build Server API 와 repository/service 계층을 새 상태 모델에 맞게 분해
3. Runner 실행 순서를 source prepare -> build -> test -> deploy 순서로 명확히 재구성
4. Build Monitor 와 Skill/MCP 를 새 API 계약에 맞춰 재연결

## 3. 운영 원칙

- refactor 는 UI부터 시작하지 않는다. `shared-contract`와 persistence 가 항상 선행한다.
- 한 milestone 안에서는 schema, API, runtime, UI를 모두 건드리더라도 변경 source-of-truth 는 contract 문서와 OpenAPI 다.
- build/test/deploy 상태 모델 변경은 반드시 memory repository 와 postgres repository 양쪽에 같은 semantics 로 반영한다.
- 기능 추가와 리팩토링을 분리하되, 새 기능이 기존 preview-era 구조 위에 쌓이지 않도록 먼저 기반 refactor 를 연다.
- 각 milestone 은 “문서 정합성”이 아니라 “코드와 런타임 계약”이 닫혔는지로 완료 판정한다.

## 4. 리팩토링 Workstream

### WS-1 Contract And Schema

- 대상: `packages/shared-contract`, `packages/db`
- 목표: build/test/deploy/result-delivery 기준의 canonical contract 와 DB schema 정렬
- 핵심 이슈:
  - `BuildStatus`, `BuildPhase`, 하위 status 모델 재정의
  - `previewStatus`, `previewUrl`, `previewTtlMinutes` 축소 또는 하위 runtime exposure 모델로 이동
  - `build_test`, `deployment_attempt` 저장 모델 분리

### WS-2 Build Server Domain/API

- 대상: `apps/build-server`
- 목표: repository/service/routes/openapi 를 새 도메인 모델로 재구성
- 핵심 이슈:
  - `queueTestDeployment`, `reportPreviewStatus`, `getTestDeployment` 재명명/재구조화
  - `/builds/:id/preview` 계열 endpoint 재설계
  - polling 응답에서 build/test/deploy/result 를 분리 조립

### WS-3 Runner Execution

- 대상: `apps/runner`
- 목표: claim -> source prepare -> build -> container test -> external deploy -> finalize 순서 명문화
- 핵심 이슈:
  - preview ready 가 아니라 test success 와 deploy success 를 first-class 로 보고
  - docker no-op 구간 제거
  - 임시 runtime URL 은 optional artifact 로만 유지

### WS-4 Frontend And Skill/MCP

- 대상: `apps/build-monitor`, `apps/skill_mcp`
- 목표: UI 와 skill/MCP 가 새 응답 계약을 소비하도록 정렬
- 핵심 이슈:
  - preview 중심 copy, status pill, detail card 제거/재구성
  - `preview-readiness-checker` 등 legacy naming 정리
  - generated OpenAPI client 중심으로 hand-typed drift 제거

### WS-5 Delivery And Operations

- 대상: migration, smoke, docs, backlog, 운영 스크립트
- 목표: migration, smoke test, progress tracking, 운영자 액션을 milestone 완료 기준에 포함
- 핵심 이슈:
  - postgres migration 운영 절차
  - visual QA / OpenAPI regen / smoke test / admin workflow 동기화

## 5. 마일스톤 정의

### M1. Contract Reset

- 목표: preview-era contract 를 build/test/deploy 중심 계약으로 재정렬
- 포함 범위:
  - `packages/shared-contract`
  - `packages/db` schema 초안과 migration 방향
  - OpenAPI component name 기준 정리
- 완료 기준:
  - 새 상태/phase/response 모델이 TypeScript 컴파일 통과
  - memory/postgres repository 가 컴파일 가능한 수준으로 적응 지점이 정의됨
  - deprecated alias 또는 migration shim 유지 범위가 명시됨

### M2. Build Server Refactor

- 목표: Build Server 의 저장/조회/API 계층을 새 계약으로 동작시킴
- 포함 범위:
  - repository/service/routes/openapi
  - `GET /builds`, `GET /builds/{id}`, `GET /builds/{id}/logs`
  - test/deploy status query
- 완료 기준:
  - memory/postgres backend smoke 통과
  - OpenAPI regenerated
  - preview-era endpoint 의 대체 endpoint 가 동작

### M3. Runner Realignment

- 목표: Runner 가 새 단계 모델로 실제 build/test/deploy 순서를 보고
- 포함 범위:
  - `apps/runner`
  - claim loop
  - docker build / container test / deploy adapter skeleton
- 완료 기준:
  - 최소 happy path smoke 통과
  - failed path 에서 phase/error report 일관성 확보
  - double queue / preview ready 임시 로직 제거

### M4. Consumer Refactor

- 목표: Build Monitor 와 Skill/MCP 가 새 계약을 소비
- 포함 범위:
  - `apps/build-monitor`
  - `apps/skill_mcp`
  - generated client 정렬
- 완료 기준:
  - build list/detail/admin UI 가 새 상태 모델로 표시
  - skill/MCP naming 과 payload 가 새 계약과 일치
  - frontend/unit test 와 Python test 통과

### M5. Deployment Capability

- 목표: 외부 배포 adapter 와 결과 전달 흐름을 MVP 수준으로 닫음
- 포함 범위:
  - 최소 1개 external deployment adapter
  - polling 또는 notification 기본 경로
  - 운영 메타와 smoke 명령 정리
- 완료 기준:
  - deploy success / deploy failure 가 Build Server status query 에 반영
  - 운영자가 end-to-end 확인 가능한 smoke 문서와 명령이 존재

## 6. TASK Backlog 묶음

### Refactor Core

- `TASK-051` postgres phase history persistence 보강
- `TASK-052` shared-contract status/response refactor
- `TASK-053` DB schema split: `build_test`, `deployment_attempt`, legacy preview 필드 축소
- `TASK-054` Build Server repository/service/API refactor
- `TASK-055` OpenAPI regeneration and query contract stabilization

### Runtime

- `TASK-056` Runner phase model refactor
- `TASK-057` docker build no-op 제거 및 source prepare/build/test skeleton 고도화
- `TASK-058` container test result reporting
- `TASK-059` external deployment adapter v1

### Consumer

- `TASK-060` Build Monitor status model/UI refactor
- `TASK-061` Skill/MCP contract rename and payload refactor
- `TASK-062` stdio transport 정리 및 generated contract 재동기화

### Operations And Tracking

- `TASK-063` roadmap/progress 운영 규칙 도입
- `TASK-064` smoke / migration / visual QA baseline 정리

## 7. 개발 순서 권장

1. `M1`: `TASK-051`, `TASK-052`, `TASK-053`
2. `M2`: `TASK-054`, `TASK-055`
3. `M3`: `TASK-056`, `TASK-057`, `TASK-058`
4. `M4`: `TASK-060`, `TASK-061`, `TASK-062`
5. `M5`: `TASK-059`, `TASK-064`

운영 규칙상 `TASK-063`은 지금 즉시 시작해도 된다. 이는 기능 구현보다 관리 체계를 여는 작업이다.

## 8. 진척 관리 규칙

### 8.1 관리 단위

- milestone
- task
- PR

각 단위의 의미:

- milestone: 여러 task 를 묶는 기능/구조 완료 지점
- task: backlog 에서 추적하는 실행 단위
- PR: 실제 코드 반영과 회귀 검증 단위

### 8.2 상태 정의

- `planned`
- `in_progress`
- `blocked`
- `done`

규칙:

- milestone 은 동시에 하나만 `in_progress`
- task 는 최대 3개까지만 동시에 `in_progress`
- `blocked` 는 이유와 unblock 조건을 반드시 적는다

### 8.3 진척 측정 기준

- 문서 진척: source-of-truth 변경과 관련 링크/메타 반영 완료
- 코드 진척: compile/test/smoke 를 통과한 PR-ready 상태
- milestone 진척: 포함 task 의 80%가 아니라, “exit criteria 충족 여부”로만 판단

### 8.4 주간/세션 단위 운영

- 세션 시작:
  - `work_backlog.md`
  - 최신 backlog
  - 이 문서의 active milestone 확인
- 세션 종료:
  - task 상태 갱신
  - 완료/보류/리스크 기록
  - 다음 세션 시작 포인트 명시

## 9. 기능 개발 관리 규칙

- 새 기능 요청은 먼저 어느 milestone 에 속하는지 분류한다.
- `M1~M3`가 닫히기 전에는 preview-era 구조 위에 새 consumer feature 를 추가하지 않는다.
- 기능 요청이 refactor blocker 를 드러내면, 기능을 바로 구현하지 말고 blocker task 를 먼저 backlog 에 등록한다.
- admin, visual QA, docs 같은 보조 기능도 canonical contract 변경을 무시한 채 독자적으로 진화시키지 않는다.

## 10. 추천 운영 뷰

### View A. Milestone Dashboard

| Milestone | 상태 | Exit Criteria | Owner |
| --- | --- | --- | --- |
| `M1 Contract Reset` | planned | contract/schema reset | backend/shared |
| `M2 Build Server Refactor` | planned | API + repo smoke | backend |
| `M3 Runner Realignment` | planned | runner happy path | runner |
| `M4 Consumer Refactor` | planned | UI + MCP sync | frontend/skill |
| `M5 Deployment Capability` | planned | deploy adapter + result delivery | cross |

### View B. Active Task Queue

현재 권장 active queue:

1. `TASK-063` roadmap/progress 운영 규칙 도입
2. `TASK-051` postgres phase history persistence 보강
3. `TASK-052` shared-contract status/response refactor

## 11. 현 단계 결론

- 이제부터의 개발은 “기능 추가”보다 “코드 구조를 새 문서 모델로 재정렬하는 refactor”가 선행돼야 한다.
- 전체 로드맵은 `M1 Contract Reset -> M2 Build Server Refactor -> M3 Runner Realignment -> M4 Consumer Refactor -> M5 Deployment Capability` 순서가 가장 안전하다.
- backlog, roadmap, progress tracking 을 같은 기준으로 운영하면 이후 기능 개발도 문서/코드 드리프트 없이 관리할 수 있다.
