# Shared Build Contract Baseline

- 문서 목적: Build Server, Runner, Skill/MCP가 공통으로 소비하는 MVP build contract의 최소 기준을 고정한다.
- 범위: request payload, build status, preview status, phase key, error code, traceability 규칙
- 대상 독자: API 설계자, Runner 구현자, Skill/MCP 구현자, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/07-implementation-backlog-baseline.md`, `docs/sdlc/design/03-api-contract-design.md`, `docs/sdlc/design/04-data-model-design.md`, `docs/sdlc/design/06-user-messaging-and-failure-handling.md`

## Traceability

- Functional: `MVP-FR-007`, `MVP-FR-012`, `MVP-FR-013`, `MVP-FR-019`
- Policy/Data: `MVP-DR-001`, `MVP-DR-002`, `MVP-DR-003`
- Decisions: `BD-001`, `BD-002`, `BD-003`, `BD-005`
- Backlog: `PKG-001`

## 1. 문서 목표

이 문서는 구현 전 단계에서 세 축이 반드시 공유해야 하는 핵심 key와 enum을 하나의 기준선으로 묶는다.

이 문서가 답해야 하는 질문:

- build 요청은 어떤 필드를 최소로 가져야 하는가
- build 상태와 preview 상태는 어떤 이름으로 고정하는가
- phase와 error code는 어떤 naming rule을 따라야 하는가
- 이후 backlog 문서에서 `Refs:`는 어떻게 적어야 하는가

## 2. 공통 계약 원칙

- Build Server는 system-of-record이므로 외부 계약의 canonical source가 된다.
- Runner는 상태를 새로 정의하지 않고 Build Server 계약의 enum과 key를 그대로 사용한다.
- Skill/MCP는 사용자 문장을 자유롭게 조립할 수 있지만, 입력/출력 key 이름은 공통 계약을 따라야 한다.
- build lifecycle과 preview lifecycle은 분리하되 조회 응답에서는 함께 제공할 수 있다.

## 3. 최소 Build Request Payload

### 3.1 필수 필드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `userId` | string | build ownership 기준 사용자 식별자 |
| `appName` | string | 사용자 범위 내 앱 식별 이름 |
| `sourceArchiveRef` | string | Build Server가 읽을 source archive 참조값 |

### 3.2 권장 필드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `dockerfileMode` | string | `provided` 등 Dockerfile 처리 정책 값 |
| `detectedAppType` | string | 감지된 앱 유형 |
| `runtimePort` | integer | 앱의 기대 listening port |
| `metadata` | object | 에이전트가 함께 보내는 부가 정보 |

### 3.3 payload 예시

```json
{
  "userId": "user001",
  "appName": "todo-app",
  "sourceArchiveRef": "archive-20260702-0001",
  "dockerfileMode": "provided",
  "detectedAppType": "node-vite",
  "runtimePort": 3000,
  "metadata": {
    "generatedBy": "docker-build-skill",
    "dockerfilePath": "Dockerfile"
  }
}
```

## 4. Canonical Identifier Rules

- `userId`는 `BD-001` 기준으로 external auth stable key 우선, 부재 시 workspace-scoped fallback을 사용한다.
- `appName`은 사용자 scope 안에서 중복되지 않는 정규화 문자열로 본다.
- canonical ownership key는 `userId + appName`이다.
- `buildId`는 외부 API와 내부 저장을 관통하는 business key다.

## 5. Build Status Enum

build lifecycle의 canonical enum은 아래 값을 기준으로 한다.

```text
QUEUED
PREPARING
VALIDATING
BUILDING
IMAGE_BUILT
TEST_DEPLOYING
TEST_READY
COMPLETED
FAILED
CANCELLED
```

운영 원칙:

- `TEST_READY`는 성공 handoff 상태이며 long-running active build로 보지 않는다.
- preview 준비가 확인되면 build는 `COMPLETED`로 종료된다.
- active build 판정에는 terminal 상태인 `COMPLETED`, `FAILED`, `CANCELLED`를 포함하지 않는다.

## 6. Preview Status Enum

preview lifecycle의 canonical enum은 아래 값을 기준으로 한다.

```text
QUEUED
RESERVED
STARTING
READY
FAILED
EXPIRED
STOPPED
```

운영 원칙:

- `QUEUED`는 preview service slot을 기다리는 상태다.
- `READY`는 사용자에게 전달 가능한 preview URL이 준비된 상태다.
- `EXPIRED`와 `STOPPED`는 cleanup 결과 상태다.

## 7. Phase Key Baseline

`currentPhase`와 log/event의 `phase`는 아래 naming rule을 따른다.

- 소문자 kebab-case 또는 공백 혼용을 새로 만들지 않는다.
- API 응답용 canonical phase key는 `UPPER_SNAKE_CASE`로 고정한다.
- 사용자 메시지 문구는 phase key에서 직접 노출하지 않는다.

권장 phase key:

```text
REQUEST_ACCEPTED
SOURCE_PREPARING
INPUT_VALIDATING
DOCKER_BUILDING
IMAGE_REGISTERED
PREVIEW_QUEUEING
PREVIEW_STARTING
PREVIEW_READY
FAILED
```

메모:

- 기존 설계 문서의 자연어 phase 설명은 유지할 수 있지만, 구현 계약에서는 위 phase key 집합을 우선 기준으로 사용한다.

## 8. Error Code Baseline

error code는 아래 원칙을 따른다.

- `UPPER_SNAKE_CASE` 사용
- 원인 범주가 드러나야 함
- 사용자 메시지와 1:1 매핑될 필요는 없음

권장 최소 error code:

```text
INVALID_REQUEST
SOURCE_ARCHIVE_NOT_FOUND
DOCKERFILE_NOT_FOUND
INVALID_RUNTIME_PORT
INVALID_BUILD_INPUT
DOCKER_BUILD_FAILED
PREVIEW_PORT_UNAVAILABLE
PREVIEW_CONTAINER_START_FAILED
PREVIEW_HEALTHCHECK_FAILED
INTERNAL_ERROR
```

## 9. Query Response Contract Keys

상태 조회 응답은 최소 아래 key를 유지한다.

| key | 설명 |
| --- | --- |
| `buildId` | build 식별자 |
| `userId` | 사용자 식별자 |
| `appName` | 앱 식별자 |
| `status` | build status |
| `currentPhase` | canonical phase key |
| `createdAt` | 생성 시각 |
| `startedAt` | 시작 시각 |
| `finishedAt` | 종료 시각 |
| `image` | 이미지 결과 정보 |
| `testDeployment` | preview 상태 정보 |
| `error` | 구조화된 오류 객체 |

`testDeployment` 최소 key:

| key | 설명 |
| --- | --- |
| `status` | preview status |
| `previewUrl` | 외부 전달용 URL |
| `host` | preview host |
| `hostPort` | 외부 host port |
| `internalPort` | 앱 내부 port |
| `expiresAt` | 만료 시각 |

## 10. Traceability Rule For Backlog

모든 구현 패키지 또는 태스크는 아래 형식을 따른다.

```text
Refs: MVP-FR-..., MVP-NFR-..., MVP-DR-..., BD-...
Depends on: PKG-..., docs/sdlc/...
```

예시:

```text
PKG-002 Build Server Request Intake
Refs: MVP-FR-007, MVP-FR-008, MVP-FR-009, MVP-FR-010, MVP-NFR-003, BD-001
Depends on: PKG-001, docs/sdlc/design/03-api-contract-design.md
```

## 11. Deferred Items

- `OI-008` Dockerfile 생성 정책의 상세 우선순위
- `OI-009` 실패 요약 생성 책임의 세부 경계
- `OI-006` TTL 연장 요청 처리 정책

위 항목은 공통 계약의 기본 shape를 흔들지는 않지만, 후속 메시지/자동화 정책에는 영향을 줄 수 있다.

## 12. 현 단계 결론

- `PKG-001` 기준으로 request key, status enum, preview enum, phase key, error code baseline이 하나의 문서에 고정되었다.
- 다음 구현 단계는 이 문서를 기준으로 Build Server request intake와 state persistence 패키지를 여는 것이다.
