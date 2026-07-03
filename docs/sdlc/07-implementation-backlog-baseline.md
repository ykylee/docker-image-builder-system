# Docker Build And Deployment Automation Platform SDLC Step 07 - Implementation Backlog Baseline

- 문서 목적: Step 06의 구현 축과 workstream을 실제 실행 가능한 backlog 패키지로 분해한다.
- 범위: workstream별 작업 항목, 선후관계, 완료 기준, traceability 규칙
- 대상 독자: 프로젝트 리드, 구현 담당자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/06-implementation-axis-and-workstreams.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`, `docs/sdlc/design/`
  - 운영 로드맵: `docs/sdlc/15-refactoring-roadmap-and-milestones.md`

## 1. 문서 목표

이 문서는 Step 06에서 정의한 우선 구현 축을 실제 구현 backlog로 연결하기 위한 기준선이다.

## 2. 운영 원칙

- 모든 구현 항목은 `TASK` 또는 `PKG` 단위로 식별한다.
- 각 항목은 최소 하나 이상의 `Refs:`를 가진다.
- 각 항목은 `Depends on:`으로 선행 작업 또는 기준 문서를 적는다.
- 각 항목은 코드 구현 전에도 문서/계약/스키마 수준 완료 기준을 가질 수 있어야 한다.

## 3. 구현 패키지 개요

| 패키지 | 이름 | 축 | 우선순위 |
| --- | --- | --- | --- |
| `PKG-001` | Shared Contract Baseline | Shared | P0 |
| `PKG-002` | Build Server Request Intake | Build Server | P0 |
| `PKG-003` | Build Server State And Queue Persistence | Build Server | P0 |
| `PKG-004` | Build Server Query API | Build Server | P0 |
| `PKG-005` | Runner Source Prepare And Build | Runner | P1 |
| `PKG-006` | Container Test And Runtime Validation | Runner | P1 |
| `PKG-007` | External Deployment Adapter | Runner | P1 |
| `PKG-008` | Status Polling And Notification | Build Server | P1 |
| `PKG-009` | Skill/MCP Request Client | Skill/MCP | P2 |
| `PKG-010` | Medium Priority Decision Closure | Cross-cutting | P2 |

## 4. P0 패키지

### PKG-001 Shared Contract Baseline

- 목표: 공통 request, status, error, phase contract를 고정한다.
- 범위:
  - build request payload 필드 목록
  - build/test/deploy status enum
  - phase key 및 error code naming 규칙
- Refs: `MVP-FR-007`, `MVP-FR-012`, `MVP-FR-013`, `MVP-FR-020`, `MVP-DR-001`, `MVP-DR-002`
- Depends on: `docs/sdlc/design/03-api-contract-design.md`, `docs/sdlc/design/04-data-model-design.md`
- Done when:
  - payload/status/error/phase 초안이 하나의 기준 문서로 정리된다
  - Build Server와 Runner가 공유할 key 이름이 문서에 고정된다

### PKG-002 Build Server Request Intake

- 목표: Build Server가 build request를 안정적으로 접수하는 최소 골격을 정의한다.
- 범위:
  - `POST /builds` 요청/응답 구조
  - active build 판정 규칙
  - 입력 정규화 정책
  - Git/Zip/source reference 메타 필드 정의
- Refs: `MVP-FR-006`, `MVP-FR-007`, `MVP-FR-008`, `MVP-FR-009`, `MVP-FR-010`
- Depends on: `PKG-001`, `docs/sdlc/design/03-api-contract-design.md`
- Done when:
  - request intake 흐름이 문서 또는 인터페이스 초안으로 고정된다
  - 중복 build 차단 기준이 명시된다
  - 최소 저장 필드와 검증 오류 반환 기준이 정리된다

### PKG-003 Build Server State And Queue Persistence

- 목표: build queue, test 결과, deploy 결과의 저장 구조를 정의한다.
- 범위:
  - build 레코드 schema
  - build test 레코드 schema
  - deployment attempt 레코드 schema
  - queue claim 대상 필드
  - log/event 저장 기준
- Refs: `MVP-FR-008`, `MVP-FR-011`, `MVP-FR-016`, `MVP-FR-018`, `MVP-FR-019`, `MVP-DR-001`
- Depends on: `PKG-001`, `docs/sdlc/design/04-data-model-design.md`
- Done when:
  - build/test/deploy 저장 모델이 분리 정의된다
  - queue 조회와 claim에 필요한 필드가 닫힌다
  - 상태/로그 저장 시점이 설계 문서와 충돌 없이 연결된다

### PKG-004 Build Server Query API

- 목표: build 상태, 로그, test/deploy 정보를 조회하는 최소 API 기준을 정한다.
- 범위:
  - `GET /builds/{id}`
  - `GET /builds/{id}/logs`
  - `GET /jobs/{jobId}` facade
  - test/deploy 상태 노출 필드
- Refs: `MVP-FR-012`, `MVP-FR-013`, `MVP-FR-021`, `MVP-FR-022`, `MVP-FR-024`
- Depends on: `PKG-001`, `PKG-003`, `docs/sdlc/design/03-api-contract-design.md`
- Done when:
  - 상태 조회와 로그 조회 응답 형태가 정의된다
  - test/deploy 상태 노출 규칙이 문서화된다
  - polling에 사용할 최소 contract가 준비된다

## 5. P1 패키지

### PKG-005 Runner Source Prepare And Build

- 목표: Runner가 Host Server API를 통해 작업을 할당받고 source prepare + docker build를 수행하는 최소 골격을 정의한다.
- 범위:
  - Host Server claim API poll 순서
  - Git clone / Zip 해제
  - 작업 디렉터리 준비
  - Docker build phase 기록
- Refs: `MVP-FR-014`, `MVP-FR-015`, `MVP-FR-016`, `MVP-FR-020`
- Depends on: `PKG-003`, `docs/sdlc/design/05-build-and-preview-execution-flow.md`
- Done when:
  - Runner 할당-소스준비-빌드-보고 순서가 task 단위로 분해된다
  - phase 이름과 실패 보고 API 기준이 닫힌다

### PKG-006 Container Test And Runtime Validation

- 목표: 컨테이너 실행과 최소 동작 테스트 흐름을 Runner와 Host Server 간 API 경계로 정의한다.
- 범위:
  - container start
  - health check
  - port open 확인
  - stability window
- Refs: `MVP-FR-017`, `MVP-FR-018`, `MVP-NFR-006`
- Depends on: `PKG-003`, `PKG-005`
- Done when:
  - 테스트 결과 보고 API 경계가 정리된다
  - test success / failure 상태가 문서화된다

### PKG-007 External Deployment Adapter

- 목표: 테스트 성공 후 외부 시스템 배포 흐름을 실행 작업으로 연결한다.
- 범위:
  - deploy target adapter
  - 배포 결과 기록
  - 실패 시 재시도/운영자 개입 기준
- Refs: `MVP-FR-019`, `MVP-FR-020`, `MVP-PR-001`, `MVP-PR-005`
- Depends on: `PKG-006`
- Done when:
  - 최소 1개 배포 프로토콜에 대한 adapter 경계가 정의된다
  - 배포 성공/실패 상태 기록 규칙이 문서화된다

### PKG-008 Status Polling And Notification

- 목표: polling 또는 notification 기반 결과 전달 흐름을 Build Server 기준으로 정의한다.
- 범위:
  - `GET /jobs/{jobId}`
  - build/test/deploy 상태 메시지
  - 이벤트 전송 구조
- Refs: `MVP-FR-021`, `MVP-FR-022`, `MVP-FR-023`, `MVP-FR-024`
- Depends on: `PKG-004`, `PKG-007`
- Done when:
  - polling 기본 contract가 정리된다
  - notification이 선택될 경우 이벤트 payload 구조가 정리된다

## 6. P2 패키지

### PKG-009 Skill/MCP Request Client

- 목표: Skill/MCP가 Build Server request contract를 소비하는 최소 client 흐름을 정의한다.
- 범위:
  - source input 준비
  - build request 호출
  - 요청 실패의 재시도 여부
- Refs: `MVP-FR-001`, `MVP-FR-002`, `MVP-FR-006`
- Depends on: `PKG-002`, `PKG-004`

### PKG-010 Medium Priority Decision Closure

- 목표: 구현 전 또는 구현 병행으로 남은 medium priority decision을 닫는다.
- 범위:
  - `OI-008` Dockerfile 생성 정책
  - deploy target protocol
  - notification 채택 여부
- Depends on: `docs/sdlc/SRS/05-open-issues-and-decisions.md`

## 7. 선후관계

1. `PKG-001`
2. `PKG-002`, `PKG-003`
3. `PKG-004`, `PKG-005`
4. `PKG-006`
5. `PKG-007`, `PKG-008`
6. `PKG-009`, `PKG-010`

## 8. 다음 액션 권장

- `PKG-001`을 바로 작성 가능한 계약 문서 작업으로 시작
- `PKG-002`에서 입력 정규화 방식부터 닫기
- `PKG-006`, `PKG-007`을 통해 test/deploy 경계를 우선 문서화

## 9. 리팩토링 기준선

현재 구현 코드가 이미 존재하므로 backlog 운영은 greenfield 구현과 brownfield refactor 를 함께 다뤄야 한다.

우선순위 기준:

1. canonical contract 와 DB schema 를 먼저 바꾸는 작업
2. Build Server API/repository/service 를 그 계약에 맞추는 작업
3. Runner 실행 순서와 phase report 정렬
4. Build Monitor / Skill-MCP consumer 정렬

연결 문서:

- `docs/sdlc/15-refactoring-roadmap-and-milestones.md`

권장 active task:

- `TASK-063` roadmap/progress 운영 규칙 도입
- `TASK-051` postgres phase history persistence 보강
- `TASK-052` shared-contract status/response refactor

## 10. 현 단계 결론

- Step 07 기준으로 구현은 이제 preview 준비 중심 backlog가 아니라 build-test-deploy pipeline backlog 수준으로 내려왔다.
- 다음 단계는 shared contract, intake, persistence를 먼저 정리한 뒤 Runner test/deploy 흐름으로 넘어가는 것이다.
