# Step 04 Design 03 - API Contract Design

- 문서 목적: Docker Build Preview Platform MVP의 외부 API 계약을 정의한다.
- 범위: build 요청, 상태 조회, 로그 조회, 오류 응답, 공통 응답 규칙
- 대상 독자: 설계자, 구현 담당자, AI 에이전트, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/design/01-system-context-and-responsibilities.md`, `docs/sdlc/design/02-domain-model-and-state-transitions.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`, `docs/sdlc/SRS/04-policy-and-constraints.md`

## Traceability

- Functional: `MVP-FR-007` ~ `MVP-FR-013`, `MVP-FR-021` ~ `MVP-FR-024`
- Non-Functional: `MVP-NFR-003`, `MVP-NFR-006`, `MVP-NFR-008`
- Policy/Data: `MVP-PR-002`, `MVP-PR-005`
- Open Issues: `OI-001`, `OI-004`, `OI-005`, `OI-010`

## 1. 문서 목표

이 문서는 Build Server가 외부에 노출하는 MVP API 계약을 고정하기 위한 설계 문서다.

이 문서가 답해야 하는 질문:

- 어떤 endpoint가 필요한가
- 요청/응답의 최소 필드는 무엇인가
- 중복 build는 어떤 응답으로 표현하는가
- 상태/로그/preview 정보는 어떤 구조로 노출하는가

## 2. API 설계 원칙

- API는 Build Server가 system-of-record라는 전제를 따른다.
- 사용자에게 직접 노출되는 세부값보다 AI 에이전트가 해석하기 좋은 구조를 우선한다.
- build 상태와 preview 상태를 분리하되, 상태 조회 응답에서는 함께 제공할 수 있어야 한다.
- URL 전략이 바뀌어도 API 스키마가 크게 흔들리지 않도록 `previewUrl`은 일반 문자열 필드로 둔다.
- build 중복 차단과 preview service 자원 대기는 서로 다른 상태로 표현해야 한다.

## 3. MVP Endpoint 목록

### 3.1 `POST /builds`

목적:

- 신규 build 요청 접수
- active build 중복 판정
- buildId 반환 또는 기존 build 정보 반환

### 3.2 `GET /builds/{buildId}`

목적:

- build 상태 조회
- preview 상태/URL 조회
- 오류 정보 조회

### 3.3 `GET /builds/{buildId}/logs`

목적:

- build 실행 로그 조회

### 3.4 `POST /builds/{buildId}/cancel`

목적:

- 향후 cancel 지원을 위한 예약 endpoint

설계 메모:

- MVP 필수 구현 범위에서는 `POST /builds`, `GET /builds/{buildId}`, `GET /builds/{buildId}/logs`를 우선한다.
- `cancel`은 계약만 정의하고 실제 동작은 후순위 구현으로 둘 수 있다.

## 4. 공통 데이터 타입

### 4.1 식별자 필드

- `userId`: 문자열
- `appName`: 정규화된 시스템 이름 문자열
- `buildId`: 문자열

### 4.2 상태 필드

- `build.status`: build lifecycle 상태
- `testDeployment.status`: preview lifecycle 상태

### 4.3 시간 필드

- 모든 시각 필드는 ISO 8601 문자열 사용

예시:

```json
"2026-07-02T10:18:00+09:00"
```

### 4.4 오류 필드

오류 구조는 공통적으로 아래 형태를 따른다.

```json
{
  "code": "STRING_CODE",
  "message": "사용자 또는 에이전트가 해석 가능한 설명"
}
```

## 5. `POST /builds`

### 5.1 요청 목적

- AI 에이전트가 준비한 build 입력물을 Build Server에 등록한다.

### 5.2 요청 필드

필수 필드:

- `userId`
- `appName`
- `sourceArchiveRef`

권장 필드:

- `dockerfileMode`
- `detectedAppType`
- `runtimePort`
- `metadata`

요청 예시:

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

### 5.3 성공 응답: 신규 build 접수

```json
{
  "accepted": true,
  "reason": "BUILD_QUEUED",
  "message": "빌드 요청이 접수되었습니다.",
  "build": {
    "buildId": "bld-20260702-000124",
    "userId": "user001",
    "appName": "todo-app",
    "status": "QUEUED",
    "createdAt": "2026-07-02T10:18:00+09:00",
    "statusUrl": "/builds/bld-20260702-000124"
  }
}
```

### 5.4 성공 응답: active build 존재

```json
{
  "accepted": false,
  "reason": "ACTIVE_BUILD_EXISTS",
  "message": "같은 앱의 빌드가 이미 진행 중입니다.",
  "existingBuild": {
    "buildId": "bld-20260702-000123",
    "userId": "user001",
    "appName": "todo-app",
    "status": "BUILDING",
    "createdAt": "2026-07-02T10:15:20+09:00",
    "statusUrl": "/builds/bld-20260702-000123"
  }
}
```

### 5.5 계약 원칙

- active build 존재는 HTTP 에러보다 "정상 응답 + accepted=false"로 표현한다.
- 이유: AI 에이전트가 이 상황을 사용자에게 자연스럽게 설명해야 하기 때문이다.

## 6. `GET /builds/{buildId}`

### 6.1 응답 목적

- build 상태와 preview 상태를 한 번에 조회한다.

### 6.2 기본 응답 구조

```json
{
  "buildId": "bld-20260702-000124",
  "userId": "user001",
  "appName": "todo-app",
  "status": "BUILDING",
  "currentPhase": "docker build",
  "createdAt": "2026-07-02T10:18:00+09:00",
  "startedAt": "2026-07-02T10:19:00+09:00",
  "finishedAt": null,
  "image": null,
  "testDeployment": null,
  "error": null
}
```

### 6.3 preview 준비 완료 응답 예시

```json
{
  "buildId": "bld-20260702-000124",
  "userId": "user001",
  "appName": "todo-app",
  "status": "COMPLETED",
  "currentPhase": "preview ready",
  "createdAt": "2026-07-02T10:18:00+09:00",
  "startedAt": "2026-07-02T10:19:00+09:00",
  "finishedAt": "2026-07-02T10:22:10+09:00",
  "image": {
    "name": "preview.example.com/user001/todo-app",
    "tag": "bld-20260702-000124",
    "digest": null
  },
  "testDeployment": {
    "status": "READY",
    "previewUrl": "http://preview-host.example.com:38124",
    "host": "preview-host.example.com",
    "hostPort": 38124,
    "internalPort": 3000,
    "expiresAt": "2026-07-03T10:18:00+09:00"
  },
  "error": null
}
```

### 6.4 preview service 대기 응답 예시

```json
{
  "buildId": "bld-20260702-000124",
  "userId": "user001",
  "appName": "todo-app",
  "status": "TEST_DEPLOYING",
  "currentPhase": "preview service queued",
  "createdAt": "2026-07-02T10:18:00+09:00",
  "startedAt": "2026-07-02T10:19:00+09:00",
  "finishedAt": null,
  "image": {
    "name": "preview.example.com/user001/todo-app",
    "tag": "bld-20260702-000124",
    "digest": null
  },
  "testDeployment": {
    "status": "QUEUED",
    "previewUrl": null,
    "host": null,
    "hostPort": null,
    "internalPort": 3000,
    "expiresAt": null
  },
  "error": null
}
```

### 6.5 실패 응답 예시

```json
{
  "buildId": "bld-20260702-000124",
  "userId": "user001",
  "appName": "todo-app",
  "status": "FAILED",
  "currentPhase": "docker build",
  "createdAt": "2026-07-02T10:18:00+09:00",
  "startedAt": "2026-07-02T10:19:00+09:00",
  "finishedAt": "2026-07-02T10:21:00+09:00",
  "image": null,
  "testDeployment": null,
  "error": {
    "code": "DOCKER_BUILD_FAILED",
    "message": "Docker 이미지 빌드에 실패했습니다."
  }
}
```

### 6.6 상태 조회 계약 원칙

- `status`는 build 상태다.
- preview 실행 정보는 `testDeployment` 아래에 둔다.
- preview URL이 없더라도 `testDeployment.status`는 존재할 수 있다.
- `testDeployment.status = QUEUED`는 build는 진행 중이지만 preview 실행 자원을 기다리는 상태를 뜻한다.
- 실패 시 `error`는 nullable 구조를 유지한다.

## 7. `GET /builds/{buildId}/logs`

### 7.1 응답 구조

```json
{
  "buildId": "bld-20260702-000124",
  "logs": [
    {
      "seq": 1,
      "phase": "BUILDING",
      "stream": "stdout",
      "message": "Step 1/8 : FROM node:22-alpine",
      "createdAt": "2026-07-02T10:19:10+09:00"
    }
  ]
}
```

### 7.2 로그 계약 원칙

- 로그는 append-only sequence로 제공한다.
- phase는 build 상태 모델과 호환되는 문자열을 사용한다.
- 사용자 직접 노출보다 AI 에이전트/운영자 해석을 우선한다.

## 8. `POST /builds/{buildId}/cancel`

### 8.1 목적

- 향후 build 취소 기능을 위한 확장 포인트

### 8.2 현재 단계 정책

- 계약은 예약해두되, MVP 필수 구현 범위에는 포함하지 않는다.
- 실제 지원 전까지는 `NOT_IMPLEMENTED` 응답도 허용 가능하다.

## 9. HTTP 상태 코드 원칙

- `200 OK`: 상태 조회 성공, 기존 active build 응답 포함
- `201 Created` 또는 `200 OK`: 신규 build 접수 성공
- `400 Bad Request`: 필수 필드 누락, 스키마 오류
- `404 Not Found`: `buildId` 없음
- `500 Internal Server Error`: 서버 내부 예외

설계 메모:

- active build 존재는 `409 Conflict` 대신 business response로 처리한다.
- 이유: 사용자 경험상 오류라기보다 "이미 같은 작업이 진행 중"인 상태이기 때문이다.

## 10. 공통 오류 응답 예시

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "필수 요청 필드가 누락되었습니다."
  }
}
```

## 11. API 계약과 도메인 모델 연결

- `build.status`는 `BuildRequest.status`와 직접 연결된다.
- `testDeployment.status`는 `TestDeployment.status`와 직접 연결된다.
- `buildId`, `userId`, `appName`은 모든 주요 응답에서 traceability를 위해 유지한다.

## 12. 후속 설계 문서로 넘길 포인트

- DB 필드 상세와 인덱스는 `04-data-model-design.md`
- Runner 단계별 시퀀스와 phase 기록은 `05-build-and-preview-execution-flow.md`
- 사용자 메시지 변환 규칙은 `06-user-messaging-and-failure-handling.md`

## 13. 현 단계 결론

- MVP API는 작고 명확한 세 개의 핵심 endpoint로 시작하는 것이 적절하다.
- active build 응답, build 상태와 preview 상태 분리, preview URL 일반 문자열화가 이 계약의 핵심 결정이다.
