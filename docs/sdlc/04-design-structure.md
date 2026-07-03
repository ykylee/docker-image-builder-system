# Docker Build And Deployment Automation Platform SDLC Step 04 - Design Structure

- 문서 목적: Step 03 요구사항 산출물을 입력으로 받아 Step 04 설계 문서 구조를 정의한다.
- 범위: 설계 문서 분해 기준, 문서별 책임, 입력/출력, 선행 결정사항
- 대상 독자: 프로젝트 리드, 설계자, 구현 담당자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/03-requirements-baseline.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`

## 1. Step 04의 목표

Step 04의 목표는 요구사항을 바로 코드로 옮기는 것이 아니라, 구현 전에 필요한 설계 판단을 문서 구조로 분해하는 것이다.

이 단계에서 확보해야 하는 것:

- 시스템 경계와 컴포넌트 상호작용
- 도메인 모델과 상태 전이 구조
- API 계약 초안 구조
- 데이터 저장 구조
- 실행/배포 정책의 설계 반영 지점

## 2. 설계 입력 기준

Step 04는 아래 문서를 직접 입력으로 사용한다.

- `docs/sdlc/SRS/06-mvp-must-requirements.md`
- `docs/sdlc/SRS/02-functional-requirements.md`
- `docs/sdlc/SRS/03-non-functional-requirements.md`
- `docs/sdlc/SRS/04-policy-and-constraints.md`
- `docs/sdlc/SRS/05-open-issues-and-decisions.md`

## 3. 권장 설계 문서 구조

### 4.1 System Context And Responsibilities

- AI 에이전트 / Skill / Build Server / Runner / External Deployment System 간 책임과 경계를 확정

### 4.2 Domain Model And State Transitions

- build, test, deploy, active build, terminal state의 도메인 구조와 상태 전이를 명세

### 4.3 API Contract Design

- `POST /builds`
- `GET /builds/{buildId}`
- `GET /builds/{buildId}/logs`
- `GET /jobs/{jobId}`
- 상태 응답 구조

### 4.4 Data Model Design

- `build_request`
- `build_log`
- `build_test`
- `deployment_attempt`
- 인덱스/조회 기준

### 4.5 Build And Preview Execution Flow

- queue pickup
- source prepare
- docker build
- container test
- external deploy
- failure handling

### 4.6 User Messaging And Failure Handling

- 상태 메시지 변환 규칙
- test/deploy 결과 안내 방식
- 실패 요약 원칙
- 내부 정보와 사용자 정보의 경계

## 4. 설계 문서 작성 순서

1. `System Context And Responsibilities`
2. `Domain Model And State Transitions`
3. `API Contract Design`
4. `Data Model Design`
5. `Build And Preview Execution Flow`
6. `User Messaging And Failure Handling`

## 5. 설계 선행 체크포인트

- `userId` source system
- 테스트용 실행 host 구조
- `Dockerfile`이 없는 경우의 처리 원칙
- deploy target protocol
- 실패 요약 책임의 기본 분담

## 6. Step 04 산출물 제안 경로

```text
docs/sdlc/design/
  01-system-context-and-responsibilities.md
  02-domain-model-and-state-transitions.md
  03-api-contract-design.md
  04-data-model-design.md
  05-build-and-preview-execution-flow.md
  06-user-messaging-and-failure-handling.md
```

## 7. 현 단계 결론

- Step 04는 단일 설계 문서 하나보다, 책임별로 분리된 설계 문서 묶음이 적합하다.
- `SRS 06 - MVP Must Requirements`를 직접 추적하는 구조로 설계 문서를 쪼개야 이후 구현과 검증이 쉬워진다.
