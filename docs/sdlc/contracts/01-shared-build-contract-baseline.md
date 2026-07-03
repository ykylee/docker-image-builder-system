# Shared Build Contract Baseline

- 문서 목적: Build Server, Runner, Skill/MCP가 공통으로 소비하는 MVP build contract의 최소 기준을 고정한다.
- 범위: request payload, build status, test/deploy status, phase key, error code, traceability 규칙
- 대상 독자: API 설계자, Runner 구현자, Skill/MCP 구현자, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/07-implementation-backlog-baseline.md`, `docs/sdlc/design/03-api-contract-design.md`, `docs/sdlc/design/04-data-model-design.md`, `docs/sdlc/design/06-user-messaging-and-failure-handling.md`

## 1. 공통 계약 원칙

- Build Server는 system-of-record이므로 외부 계약의 canonical source가 된다.
- Runner는 상태를 새로 정의하지 않고 Build Server 계약의 enum과 key를 그대로 사용한다.
- Skill/MCP는 사용자 문장을 자유롭게 조립할 수 있지만, 입력/출력 key 이름은 공통 계약을 따라야 한다.
- build lifecycle과 test/deploy lifecycle은 분리하되 조회 응답에서는 함께 제공할 수 있다.

## 2. 최소 Build Request Payload

### 필수 필드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `userId` | string | build ownership 기준 사용자 식별자 |
| `appName` | string | 사용자 범위 내 앱 식별 이름 |
| `input` | object | Git URL 또는 Zip 입력 표현 |
| `dockerfile` | object | Dockerfile 제공 방식 |

### 권장 필드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `runtimePort` | integer | 앱의 기대 listening port |
| `healthCheck` | object | 테스트 health check 정보 |
| `deployTarget` | object | 배포 대상 시스템 정보 |
| `metadata` | object | 에이전트가 함께 보내는 부가 정보 |

## 3. Canonical Identifier Rules

- `userId`는 external auth stable key 우선, 부재 시 workspace-scoped fallback을 사용한다.
- `appName`은 사용자 scope 안에서 중복되지 않는 정규화 문자열로 본다.
- canonical ownership key는 `userId + appName`이다.
- `buildId`는 외부 API와 내부 저장을 관통하는 business key다.

## 4. Build Status Enum

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

운영 원칙:

- `DEPLOY_SUCCESS`는 성공 handoff 상태이며 long-running active build로 보지 않는다.
- 최종 결과 전달이 끝나면 build는 `COMPLETED`로 종료된다.

## 5. Test / Deploy Status Enum

### test status

```text
NOT_STARTED
STARTING
RUNNING
SUCCESS
FAILED
EXPIRED
```

### deploy status

```text
NOT_STARTED
IN_PROGRESS
SUCCESS
FAILED
```

## 6. Phase Key Baseline

권장 phase key:

```text
REQUEST_ACCEPTED
SOURCE_PREPARED
INPUT_VALIDATED
DOCKER_BUILD_STARTED
DOCKER_BUILD_COMPLETED
CONTAINER_TEST_STARTED
CONTAINER_TEST_COMPLETED
DEPLOY_STARTED
DEPLOY_COMPLETED
FAILED
```

## 7. Error Code Baseline

```text
INVALID_REQUEST
GIT_CLONE_FAILED
SOURCE_ARCHIVE_NOT_FOUND
DOCKERFILE_NOT_FOUND
INVALID_RUNTIME_PORT
INVALID_BUILD_INPUT
DOCKER_BUILD_FAILED
CONTAINER_START_FAILED
PORT_NOT_OPEN
HEALTHCHECK_FAILED
DEPLOY_TARGET_UNAVAILABLE
DEPLOY_PUSH_FAILED
DEPLOY_REGISTRATION_FAILED
INTERNAL_ERROR
```

## 8. Query Response Contract Keys

상태 조회 응답은 최소 아래 key를 유지한다.

- `buildId`
- `userId`
- `appName`
- `status`
- `currentPhase`
- `createdAt`
- `startedAt`
- `finishedAt`
- `image`
- `test`
- `deploy`
- `error`

## 9. 현 단계 결론

- request key, status enum, test/deploy enum, phase key, error code baseline이 하나의 문서에 고정되었다.
- 다음 구현 단계는 이 문서를 기준으로 Build Server request intake와 state persistence 패키지를 여는 것이다.
