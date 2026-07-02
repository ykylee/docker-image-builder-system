# Docker Build Preview Platform SDLC Step 04 - Design Structure

- 문서 목적: Step 03 요구사항 산출물을 입력으로 받아 Step 04 설계 문서 구조를 정의한다.
- 범위: 설계 문서 분해 기준, 문서별 책임, 입력/출력, 선행 결정사항
- 대상 독자: 프로젝트 리드, 설계자, 구현 담당자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/03-requirements-baseline.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`

## 1. Step 04의 목표

Step 04의 목표는 요구사항을 바로 코드로 옮기는 것이 아니라, 구현 전에 필요한 설계 판단을 문서 구조로 분해하는 것이다.

이 단계에서 확보해야 하는 것:

- 시스템 경계와 컴포넌트 상호작용
- 도메인 모델과 상태 전이 구조
- API 계약 초안 구조
- 데이터 저장 구조
- 운영/실행 정책의 설계 반영 지점

## 2. 설계 입력 기준

Step 04는 아래 문서를 직접 입력으로 사용한다.

- `docs/sdlc/SRS/06-mvp-must-requirements.md`
- `docs/sdlc/SRS/02-functional-requirements.md`
- `docs/sdlc/SRS/03-non-functional-requirements.md`
- `docs/sdlc/SRS/04-policy-and-constraints.md`
- `docs/sdlc/SRS/05-open-issues-and-decisions.md`

가장 우선되는 입력 기준은 `SRS 06 - MVP Must Requirements`다.

## 3. 권장 설계 문서 구조

Step 04에서는 아래 설계 문서를 순서대로 작성하는 것을 권장한다.

### 4.1 System Context And Responsibilities

문서 목적:

- AI 에이전트 / Skill / Build Server / Runner / Preview 환경 간 책임과 경계를 확정

다뤄야 할 내용:

- 시스템 컨텍스트 다이어그램
- 컴포넌트 책임
- 컴포넌트 간 입력/출력
- 동기/비동기 경계

주요 입력 요구사항:

- `MVP-FR-001` ~ `MVP-FR-022`
- `MVP-NFR-001`, `MVP-NFR-002`

### 4.2 Domain Model And State Transitions

문서 목적:

- build, preview, active build, terminal state의 도메인 구조와 상태 전이를 명세

다뤄야 할 내용:

- 핵심 엔티티
- 식별자 모델
- build 상태 전이
- preview 상태 전이
- active build 판정 규칙

주요 입력 요구사항:

- `MVP-FR-009` ~ `MVP-FR-019`
- `MVP-NFR-003` ~ `MVP-NFR-006`
- `MVP-DR-001` ~ `MVP-DR-004`

### 4.3 API Contract Design

문서 목적:

- Build Server 외부 인터페이스를 API 수준에서 설계

다뤄야 할 내용:

- `POST /builds`
- `GET /builds/{buildId}`
- `GET /builds/{buildId}/logs`
- 상태 응답 구조
- 오류 응답 구조

주요 입력 요구사항:

- `MVP-FR-007` ~ `MVP-FR-013`
- `MVP-FR-021`, `MVP-FR-022`
- `MVP-PR-002`

### 4.4 Data Model Design

문서 목적:

- DB 저장 구조와 필수 필드를 정의

다뤄야 할 내용:

- `build_request`
- `build_log`
- `test_deployment`
- 인덱스/조회 기준
- 상태 기록 필드

주요 입력 요구사항:

- `MVP-FR-008` ~ `MVP-FR-019`
- `MVP-NFR-003` ~ `MVP-NFR-006`
- `MVP-DR-001` ~ `MVP-DR-004`

### 4.5 Build And Preview Execution Flow

문서 목적:

- Runner 중심의 처리 플로우를 단계별로 설계

다뤄야 할 내용:

- queue pickup
- source prepare
- docker build
- preview run
- readiness check
- failure handling

주요 입력 요구사항:

- `MVP-FR-014` ~ `MVP-FR-019`
- `MVP-NFR-004`
- `MVP-PR-001`

### 4.6 User Messaging And Failure Handling

문서 목적:

- 사용자에게 어떤 상태/실패 메시지를 어떤 수준으로 노출할지 설계

다뤄야 할 내용:

- 상태 메시지 변환 규칙
- 실패 요약 원칙
- 내부 정보와 사용자 정보의 경계
- 다음 조치 안내 패턴

주요 입력 요구사항:

- `MVP-FR-020` ~ `MVP-FR-022`
- `MVP-NFR-001`, `MVP-NFR-002`

## 4. 설계 문서 작성 순서

권장 순서:

1. `System Context And Responsibilities`
2. `Domain Model And State Transitions`
3. `API Contract Design`
4. `Data Model Design`
5. `Build And Preview Execution Flow`
6. `User Messaging And Failure Handling`

이 순서를 권장하는 이유:

- 책임 경계가 먼저 닫혀야 도메인과 API가 흔들리지 않는다.
- 도메인/상태가 정리되어야 API와 데이터 모델이 안정된다.
- 실행 플로우와 메시징은 앞선 구조를 소비하는 설계다.

## 5. 설계 선행 체크포인트

Step 04 착수 전에 최소한 아래 항목은 임시 정책 수준으로라도 정리되어야 한다.

- `userId` source system
- preview host 구조
- `Dockerfile`이 없는 경우의 처리 원칙
- 실패 요약 책임의 기본 분담

이 항목이 비어 있으면 설계 문서가 과도하게 가정에 의존하게 된다.

## 6. Step 04 산출물 제안 경로

권장 경로:

```text
docs/sdlc/design/
  01-system-context-and-responsibilities.md
  02-domain-model-and-state-transitions.md
  03-api-contract-design.md
  04-data-model-design.md
  05-build-and-preview-execution-flow.md
  06-user-messaging-and-failure-handling.md
```

현재 작성 완료:

- `docs/sdlc/design/01-system-context-and-responsibilities.md`
- `docs/sdlc/design/02-domain-model-and-state-transitions.md`
- `docs/sdlc/design/03-api-contract-design.md`
- `docs/sdlc/design/04-data-model-design.md`
- `docs/sdlc/design/05-build-and-preview-execution-flow.md`
- `docs/sdlc/design/06-user-messaging-and-failure-handling.md`

## 7. 현 단계 결론

- Step 04는 단일 설계 문서 하나보다, 책임별로 분리된 설계 문서 묶음이 적합하다.
- `SRS 06 - MVP Must Requirements`를 직접 추적하는 구조로 설계 문서를 쪼개야 이후 구현과 검증이 쉬워진다.
- 현재 기준으로 Step 04의 권장 설계 문서 6종 초안은 모두 정리되었고, 다음 단계는 미결정 항목과 traceability 규칙 정리다.
