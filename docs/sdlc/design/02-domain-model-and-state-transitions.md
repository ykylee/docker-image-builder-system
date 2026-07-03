# Step 04 Design 02 - Domain Model And State Transitions

- 문서 목적: Docker Build And Deployment Automation Platform MVP의 핵심 도메인 엔티티와 상태 전이 규칙을 정의한다.
- 범위: 식별자 모델, 엔티티 경계, build 상태, test/deploy 상태, active build 판정, terminal 상태 규칙
- 대상 독자: 설계자, 구현 담당자, 프로젝트 리드, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/design/01-system-context-and-responsibilities.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`, `docs/sdlc/SRS/04-policy-and-constraints.md`, `docs/sdlc/SRS/05-open-issues-and-decisions.md`

## Traceability

- Functional: `MVP-FR-009` ~ `MVP-FR-024`
- Non-Functional: `MVP-NFR-003`, `MVP-NFR-004`, `MVP-NFR-005`, `MVP-NFR-006`, `MVP-NFR-007`, `MVP-NFR-008`
- Policy/Data: `MVP-PR-001`, `MVP-PR-002`, `MVP-PR-003`, `MVP-DR-001`, `MVP-DR-002`, `MVP-DR-003`, `MVP-DR-004`
- Open Issues: `OI-001`, `OI-007`, `OI-010`

## 1. 문서 목표

이 문서는 MVP에서 다뤄야 하는 핵심 도메인 엔티티와 그 상태 모델을 고정하기 위한 설계 문서다.

이 문서가 답해야 하는 질문:

- 어떤 엔티티를 별도로 관리해야 하는가
- 어떤 식별자 조합이 도메인의 기준 축인가
- build 상태와 test/deploy 상태는 어떻게 분리되는가
- active build와 terminal 상태는 무엇인가
- 어떤 상태 전이가 허용되는가

## 2. 도메인 모델 개요

MVP에서 핵심 엔티티는 다음 네 가지다.

```text
BuildRequest
BuildLog
BuildTest
DeploymentAttempt
```

각 엔티티의 역할:

- `BuildRequest`: 사용자의 배포 요청과 build lifecycle의 기준 레코드
- `BuildLog`: build 실행 과정에서 누적되는 시간순 로그
- `BuildTest`: 컨테이너 실행 검증 결과의 기준 레코드
- `DeploymentAttempt`: 외부 시스템 배포 결과의 기준 레코드

## 3. 식별자 모델

### 3.1 기본 식별자

도메인의 중심 식별자:

- `userId`
- `appName`
- `buildId`

### 3.2 의미

- `userId`
  - 요청 소유 주체를 나타내는 상위 파티션 키
  - 현재는 외부 인증 시스템과 매핑 가능한 문자열 식별자라는 임시 가정 사용

- `appName`
  - 사용자가 테스트/배포하려는 앱 단위
  - 사용자 표시 이름과 시스템 정규화 이름을 구분

- `buildId`
  - 개별 build 작업의 전역 고유 식별자
  - 상태 조회, 로그 조회, test/deploy 연결의 기본 참조 키

### 3.3 도메인 규칙

- `userId + appName`은 "같은 앱의 연속 build 여부"를 판정하는 기준이다.
- `buildId`는 개별 작업 단위의 식별자다.
- MVP에서는 별도 `testId`나 `deploymentId`를 외부 API의 대표 식별자로 노출하지 않아도 된다.

## 4. 엔티티 정의

### 4.1 BuildRequest

목적:

- build 요청의 진입점이자 상태 추적의 기준 엔티티

핵심 속성:

- `buildId`
- `userId`
- `appName`
- `status`
- `inputType`
- `sourceRef` 또는 동등 참조
- `dockerfileMode`
- `runtimePort`
- `errorCode`
- `errorMessage`
- `createdAt`
- `queuedAt`
- `startedAt`
- `finishedAt`
- `updatedAt`

책임:

- build lifecycle 상태 보존
- active build 판정 기준 제공
- API 상태 조회의 기준 레코드 역할

### 4.2 BuildLog

목적:

- build 실행 과정에서 발생한 로그 이벤트를 시간순으로 저장

핵심 속성:

- `buildId`
- `seq`
- `phase`
- `stream`
- `message`
- `createdAt`

책임:

- 사용자/운영자용 로그 조회 기반 제공
- 실패 시 어떤 단계에서 문제가 생겼는지 추적 가능하게 함

### 4.3 BuildTest

목적:

- 컨테이너 실행 검증 결과를 build와 별도로 추적

핵심 속성:

- `buildId`
- `status`
- `containerRef`
- `host`
- `hostPort`
- `internalPort`
- `healthCheckPassed`
- `portOpen`
- `stabilityWindowPassed`
- `errorCode`
- `errorMessage`
- `startedAt`
- `finishedAt`

책임:

- 컨테이너 테스트 lifecycle 보존
- build 성공 이후 실제 실행 가능성 여부를 별도로 표현

### 4.4 DeploymentAttempt

목적:

- 외부 시스템 배포 결과를 build와 별도로 추적

핵심 속성:

- `buildId`
- `status`
- `targetType`
- `targetRef`
- `resultRef`
- `errorCode`
- `errorMessage`
- `startedAt`
- `finishedAt`

책임:

- 배포 lifecycle 보존
- 외부 시스템 전달 성공/실패 여부를 추적

## 5. Build 상태 모델

### 5.1 상태 목록

```text
RECEIVED
QUEUED
PREPARING_SOURCE
VALIDATING
BUILDING
BUILD_SUCCESS
TESTING
TEST_SUCCESS
DEPLOYING
DEPLOY_SUCCESS
COMPLETED
FAILED
CANCELLED
```

### 5.2 상태 의미

- `RECEIVED`: 서버가 요청을 수신했지만 queue 등록 전 정리 단계
- `QUEUED`: Worker 실행 대기 상태
- `PREPARING_SOURCE`: Git clone 또는 Zip 해제 단계
- `VALIDATING`: 요청값과 실행 조건 검토 단계
- `BUILDING`: 이미지 빌드 실행 단계
- `BUILD_SUCCESS`: 이미지 생성 성공, 테스트는 아직 미완료
- `TESTING`: 컨테이너 실행 및 최소 동작 테스트 수행 단계
- `TEST_SUCCESS`: 컨테이너 테스트 성공 상태
- `DEPLOYING`: 외부 시스템 배포 진행 단계
- `DEPLOY_SUCCESS`: 외부 시스템 배포 성공 상태
- `COMPLETED`: 전체 작업 종료
- `FAILED`: 실패 종료
- `CANCELLED`: 취소 종료

### 5.3 기본 전이

권장 기본 흐름:

```text
RECEIVED
 -> QUEUED
 -> PREPARING_SOURCE
 -> VALIDATING
 -> BUILDING
 -> BUILD_SUCCESS
 -> TESTING
 -> TEST_SUCCESS
 -> DEPLOYING
 -> DEPLOY_SUCCESS
 -> COMPLETED
```

예외 전이:

- 어느 실행 단계에서도 `FAILED` 가능
- 사용자 취소 시 `CANCELLED` 가능

### 5.4 상태 설계 원칙

- `BUILD_SUCCESS`, `TEST_SUCCESS`, `DEPLOY_SUCCESS`를 분리해 빌드/테스트/배포를 구분한다.
- build 상태는 사용자 가치 변화가 발생하는 지점 기준으로 설계한다.
- `COMPLETED`는 최종 결과 전달까지 닫힌 뒤의 terminal 상태다.

## 6. Test / Deploy 상태 모델

### 6.1 BuildTest 상태 목록

```text
NOT_STARTED
STARTING
RUNNING
SUCCESS
FAILED
EXPIRED
```

### 6.2 DeploymentAttempt 상태 목록

```text
NOT_STARTED
IN_PROGRESS
SUCCESS
FAILED
```

### 6.3 상태 분리 이유

아래 상황을 표현해야 하기 때문이다.

```text
build status = BUILD_SUCCESS
test status = FAILED
deploy status = NOT_STARTED
```

또는

```text
build status = DEPLOYING
test status = SUCCESS
deploy status = IN_PROGRESS
```

즉, 이미지 빌드는 성공했지만 테스트 또는 배포는 실패했을 수 있으므로 분리 표현이 필요하다.

## 7. Active Build 규칙

### 7.1 정의

active build는 동일 `userId + appName`에 대해 새 build 요청을 막아야 하는 build 진행 중 작업이다.

### 7.2 active 상태

```text
RECEIVED
QUEUED
PREPARING_SOURCE
VALIDATING
BUILDING
BUILD_SUCCESS
TESTING
TEST_SUCCESS
DEPLOYING
DEPLOY_SUCCESS
```

### 7.3 terminal 상태

```text
COMPLETED
FAILED
CANCELLED
```

### 7.4 `DEPLOY_SUCCESS`와 `COMPLETED`

`DEPLOY_SUCCESS`는 외부 시스템 전달이 성공했음을 나타내는 success handoff 상태다.

권장 규칙:

- `DEPLOY_SUCCESS`는 짧은 성공 handoff 상태로 사용한다.
- 사용자/외부 시스템에 성공 상태를 노출한 뒤 build는 `COMPLETED`로 닫는다.
- 따라서 `DEPLOY_SUCCESS`는 build queue를 계속 점유하는 active 상태로 유지하지 않는다.

## 8. Aggregate 경계 제안

### 8.1 BuildRequest Aggregate

포함 범위:

- build 상태
- build 메타데이터
- active build 판정 기준 속성

### 8.2 BuildTest Aggregate

포함 범위:

- 컨테이너 실행 상태
- health/port/stability 검증 결과

### 8.3 DeploymentAttempt Aggregate

포함 범위:

- 외부 배포 상태
- target 정보
- 결과 참조 정보

### 8.4 BuildLog

별도 append-only 이벤트 성격으로 취급

## 9. 현재 설계 가정

- `userId`는 문자열 기반 외부 매핑 키다.
- `appName`은 정규화된 시스템 이름을 저장한다고 가정한다.
- `buildId`는 사람이 복사 가능한 문자열 형식을 사용한다.
- 테스트 실행 결과는 `host + port` 기반 URL을 가질 수 있지만, 이것이 최종 성공 기준은 아니다.

## 10. 후속 설계 문서로 넘길 포인트

- API request/response의 상태 필드 구조는 `03-api-contract-design.md`
- 실제 저장 필드와 인덱스는 `04-data-model-design.md`
- Runner 관점의 상태 전이 시퀀스는 `05-build-and-preview-execution-flow.md`

## 11. 현 단계 결론

- 이 플랫폼의 핵심 도메인 포인트는 `BuildRequest`, `BuildTest`, `DeploymentAttempt`를 분리하고, `DEPLOY_SUCCESS` 이후 `COMPLETED`로 닫는 것이다.
- 이 결정이 이후 API, 데이터 모델, 배포 어댑터 정책의 안정성을 좌우한다.
