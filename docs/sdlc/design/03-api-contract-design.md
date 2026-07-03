# Step 04 Design 03 - API Contract Design

- 문서 목적: Docker Build And Deployment Automation Platform MVP의 외부 API 계약을 정의한다.
- 범위: build 요청, 상태 조회, 로그 조회, 오류 응답, 공통 응답 규칙
- 대상 독자: 설계자, 구현 담당자, AI 에이전트, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-03
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
- build/test/deploy 정보는 어떤 구조로 노출하는가

## 2. API 설계 원칙

- API는 Build Server가 system-of-record라는 전제를 따른다.
- 사용자에게 직접 노출되는 세부값보다 AI 에이전트가 해석하기 좋은 구조를 우선한다.
- build 상태, test 상태, deploy 상태를 분리하되 상태 조회 응답에서는 함께 제공할 수 있어야 한다.
- 입력 채널이 달라도 내부 계약은 하나의 build job 표현으로 정규화되어야 한다.
- build 중복 차단, 테스트 실행, 외부 배포 진행 중은 서로 다른 상태로 표현해야 한다.

## 3. MVP Endpoint 목록

### 3.1 `POST /builds`

목적:

- 신규 build 요청 접수
- active build 중복 판정
- buildId 반환 또는 기존 build 정보 반환

### 3.2 `GET /builds/{buildId}`

목적:

- build 상태 조회
- 컨테이너 테스트 상태 조회
- 외부 배포 상태 조회

### 3.3 `GET /builds/{buildId}/logs`

목적:

- build 실행 로그 조회

### 3.4 `GET /jobs/{jobId}`

목적:

- 외부 시스템 또는 사용자 측 polling 상태 조회

설계 메모:

- `jobId`는 `buildId`와 동일한 식별자를 공유해도 된다.
- polling을 기본 전달 모델로 채택하면 `GET /jobs/{jobId}`는 `GET /builds/{buildId}`의 alias 또는 consumer-specific facade가 될 수 있다.

## 4. 공통 데이터 타입

### 4.1 식별자 필드

- `userId`: 문자열
- `appName`: 정규화된 시스템 이름 문자열
- `buildId`: 문자열

### 4.2 상태 필드

- `build.status`: build lifecycle 상태
- `test.status`: container validation lifecycle 상태
- `deploy.status`: external deployment lifecycle 상태

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

- AI 에이전트 또는 외부 사용자가 준비한 build 입력물을 Build Server에 등록한다.

### 5.2 요청 필드

필수 필드:

- `userId`
- `appName`
- `input`
- `dockerfile`

권장 필드:

- `runtimePort`
- `healthCheck`
- `deployTarget`
- `callback`
- `metadata`

요청 예시:

```json
{
  "userId": "user001",
  "appName": "todo-app",
  "input": {
    "type": "git",
    "gitRepositoryUrl": "https://github.com/example/todo-app.git"
  },
  "dockerfile": {
    "mode": "inline",
    "content": "FROM node:22-alpine ..."
  },
  "runtimePort": 3000,
  "healthCheck": {
    "type": "http",
    "path": "/health"
  },
  "deployTarget": {
    "type": "http",
    "endpoint": "https://deploy.example.com/api/images"
  },
  "metadata": {
    "generatedBy": "docker-build-skill",
    "dockerfilePath": "Dockerfile",
    "sourceMode": "git"
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
    "status": "RECEIVED",
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
    "status": "PREPARING_SOURCE",
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

- build 상태, test 상태, deploy 상태를 한 번에 조회한다.

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
  "test": {
    "status": "NOT_STARTED",
    "containerRunning": null,
    "healthCheckPassed": null,
    "portOpen": null,
    "stabilityWindowPassed": null
  },
  "deploy": {
    "status": "NOT_STARTED",
    "targetType": "http",
    "resultRef": null
  },
  "error": null
}
```

### 6.3 테스트 성공 및 배포 완료 응답 예시

```json
{
  "buildId": "bld-20260702-000124",
  "userId": "user001",
  "appName": "todo-app",
  "status": "COMPLETED",
  "currentPhase": "deploy completed",
  "createdAt": "2026-07-02T10:18:00+09:00",
  "startedAt": "2026-07-02T10:19:00+09:00",
  "finishedAt": "2026-07-02T10:22:10+09:00",
  "image": {
    "name": "deploy.example.com/user001/todo-app",
    "tag": "bld-20260702-000124",
    "digest": null
  },
  "test": {
    "status": "SUCCESS",
    "containerRunning": true,
    "healthCheckPassed": true,
    "portOpen": true,
    "stabilityWindowPassed": true
  },
  "deploy": {
    "status": "SUCCESS",
    "targetType": "http",
    "resultRef": "deploy-20260702-001"
  },
  "error": null
}
```

### 6.4 테스트 성공 후 배포 진행 중 응답 예시

```json
{
  "buildId": "bld-20260702-000124",
  "userId": "user001",
  "appName": "todo-app",
  "status": "DEPLOYING",
  "currentPhase": "external deployment",
  "createdAt": "2026-07-02T10:18:00+09:00",
  "startedAt": "2026-07-02T10:19:00+09:00",
  "finishedAt": null,
  "image": {
    "name": "deploy.example.com/user001/todo-app",
    "tag": "bld-20260702-000124",
    "digest": null
  },
  "test": {
    "status": "SUCCESS",
    "containerRunning": true,
    "healthCheckPassed": true,
    "portOpen": true,
    "stabilityWindowPassed": true
  },
  "deploy": {
    "status": "IN_PROGRESS",
    "targetType": "http",
    "resultRef": null
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
  "test": {
    "status": "NOT_STARTED",
    "containerRunning": null,
    "healthCheckPassed": null,
    "portOpen": null,
    "stabilityWindowPassed": null
  },
  "deploy": {
    "status": "NOT_STARTED",
    "targetType": "http",
    "resultRef": null
  },
  "error": {
    "code": "DOCKER_BUILD_FAILED",
    "message": "Docker 이미지 빌드에 실패했습니다."
  }
}
```

### 6.6 상태 조회 계약 원칙

- `status`는 build 상태다.
- 컨테이너 검증 결과는 `test` 아래에 둔다.
- 외부 시스템 배포 결과는 `deploy` 아래에 둔다.
- 테스트가 아직 시작되지 않았더라도 `test.status`는 존재할 수 있다.
- `deploy.status = IN_PROGRESS`는 build와 test는 통과했지만 외부 배포가 아직 끝나지 않은 상태를 뜻한다.
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

## 8. HTTP 상태 코드 원칙

- `200 OK`: 상태 조회 성공, 기존 active build 응답 포함
- `202 Accepted` 또는 `200 OK`: 신규 build 접수 성공
- `400 Bad Request`: 필수 필드 누락, 스키마 오류
- `404 Not Found`: `buildId` 없음
- `500 Internal Server Error`: 서버 내부 예외

설계 메모:

- active build 존재는 `409 Conflict` 대신 business response로 처리한다.
- 이유: 사용자 경험상 오류라기보다 "이미 같은 작업이 진행 중"인 상태이기 때문이다.

## 9. 공통 오류 응답 예시

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "필수 요청 필드가 누락되었습니다."
  }
}
```

## 10. API 계약과 도메인 모델 연결

- `build.status`는 `BuildRequest.status`와 직접 연결된다.
- `test.status`는 `BuildTest.status` 또는 동등 검증 레코드와 직접 연결된다.
- `deploy.status`는 `DeploymentAttempt.status` 또는 동등 배포 레코드와 직접 연결된다.
- `buildId`, `userId`, `appName`은 모든 주요 응답에서 traceability를 위해 유지한다.

## 11. 후속 설계 문서로 넘길 포인트

- DB 필드 상세와 인덱스는 `04-data-model-design.md`
- Runner 단계별 시퀀스와 phase 기록은 `05-build-and-preview-execution-flow.md`
- 사용자 메시지 변환 규칙은 `06-user-messaging-and-failure-handling.md`

## 12. 현 단계 결론

- MVP API는 작고 명확한 build intake + status polling 중심 endpoint로 시작하는 것이 적절하다.
- active build 응답, build/test/deploy 상태 분리, 입력 채널 정규화, 외부 배포 결과 추적이 이 계약의 핵심 결정이다.
