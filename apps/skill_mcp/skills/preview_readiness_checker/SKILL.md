# Skill: preview-readiness-checker

- 문서 목적: canonical `BuildStatusResponse` 의 test / lifecycle / image / deploy 블록 + (선택) container health probe + (선택) TTL 정보를 받아, 사용자가 "결과가 준비됐어?" 라고 물을 때 즉시 읽을 수 있는 readiness 카드와 `next_action` 을 만든다. P0 skill `build-status-explainer` 의 `next_action` 결과를 입력으로 받으면 일관된 톤을 보장.
- 범위: `readiness_state` (7종) 분류 + 카드 4-필드 합성 + `next_action` canonical 매핑 (`OPEN_DEPLOYMENT` 사용). **읽기 전용** — Build Server / Runner 호출 없음. 실제 조회는 caller 가 `buildId` / status 응답을 채워서 넘기는 형태.
- **canonical contract v2** (TASK-061 contract rename): canonical 입력 = `test.status` ∈ `executionStatuses` (5종). legacy `testDeployment` 키도 forward-compat 으로 받아서 canonical execution status 로 forward-map (READY→SUCCESS, QUEUED→NOT_STARTED, PROVISIONING→IN_PROGRESS, ...). 디렉터리 이름 (`preview_readiness_checker`) 은 import path 안정성을 위해 유지.
- 대상 독자: AI agent, 사용자, Build Server / Runner 구현자
- 상태: stable (v2.0.0)
- 최종 수정일: 2026-07-03 (TASK-061 contract rename)
- 관련 문서:
  - canonical enum: [`docs/sdlc/contracts/01-shared-build-contract-baseline.md`](../../../../docs/sdlc/contracts/01-shared-build-contract-baseline.md) §5/§6/§9
  - PKG-006: [`docs/sdlc/07-implementation-backlog-baseline.md`](../../../../docs/sdlc/07-implementation-backlog-baseline.md) (preview readiness 흐름)
  - 메시지 4-구조: [`docs/sdlc/design/06-user-messaging-and-failure-handling.md`](../../../../docs/sdlc/design/06-user-messaging-and-failure-handling.md) §5
  - 후보 카탈로그: [`docs/sdlc/13-skills-and-mcp-plan.md`](../../../../docs/sdlc/13-skills-and-mcp-plan.md) §3.4
  - 미결: `OI-005` (preview 인증) / `OI-006` (TTL) / `OI-010` (concurrency limit)

## 1. 입출력 계약

### 1.1 입력 (JSON)

```json
{
  "buildId": "b-1",
  "build": {
    "buildId": "b-1",
    "userId": "user001",
    "appName": "todo-app",
    "status": "COMPLETED",
    "currentPhase": "PREVIEW_READY",
    "createdAt": "2026-07-03T01:00:00Z",
    "startedAt": "2026-07-03T01:00:10Z",
    "finishedAt": "2026-07-03T01:03:00Z"
  },
  "testDeployment": {
    "status": "READY",
    "previewUrl": "http://preview.example.com:38124",
    "host": "preview.example.com",
    "hostPort": 38124,
    "internalPort": 3000,
    "expiresAt": "2026-07-03T02:03:00Z"
  },
  "healthProbe": {
    "status": "healthy",
    "checkedAt": "2026-07-03T01:05:00Z"
  },
  "ttl": {
    "ttl_remaining_seconds": 3300
  }
}
```

- `buildId` optional. `build.buildId` 가 있으면 그것 우선.
- `build` optional. 없으면 `INVALID_INPUT`. `build.status` 가 없으면 `INVALID_INPUT`.
- `testDeployment` optional. 없거나 `testDeployment.status` 가 없으면 `readiness_state` 분류에 build.status 만 사용.
- `healthProbe` optional. 있으면 `readiness_state` 분류에 반영 (READY + unhealthy → DEGRADED).
- `ttl` optional. `expiresAt` 또는 `ttl_remaining_seconds` 중 하나가 있으면 카드에 남은 시간 표시.

### 1.2 출력 (JSON)

```json
{
  "ok": true,
  "readiness_state": "READY",
  "card": {
    "title": "테스트용 미리보기 주소가 준비되었습니다.",
    "subtitle": "http://preview.example.com:38124",
    "body": "이 주소로 현재 앱 동작을 확인할 수 있습니다. 미리보기는 임시 환경이며 새 배포가 준비되면 교체될 수 있습니다.",
    "ttl_remaining_seconds": 3300,
    "next_action": "OPEN_PREVIEW"
  },
  "buildId": "b-1",
  "ref": {
    "contract_doc": "docs/sdlc/contracts/01-shared-build-contract-baseline.md",
    "design_doc": "docs/sdlc/design/06-user-messaging-and-failure-handling.md",
    "skill_version": "v1"
  }
}
```

- `readiness_state` enum: `READY` / `PREPARING` / `WAITING_FOR_SLOT` / `STARTING` / `DEGRADED` / `EXPIRED` / `UNKNOWN`.
- `card` 4-필드: `title` (한 줄) / `subtitle` (URL 또는 빈 문자열) / `body` (1~3 줄) / `next_action` enum.
- `card.ttl_remaining_seconds` optional. expiresAt 또는 ttl 입력으로 계산.
- `next_action` enum: `WAIT` / `OPEN_PREVIEW` / `RETRY` / `FIX_DOCKERFILE` / `FIX_PORT` / `CHECK_SOURCE` / `CONTACT_OPERATOR` / `NONE`.

## 2. 동작 규칙

- **readiness_state 분류**:
  - `build.status` ∈ {`QUEUED`, `CLAIMED`} → `PREPARING`
  - `build.status` ∈ {`BUILDING`} 또는 `currentPhase` ∈ {`REQUEST_ACCEPTED`, `QUEUE_CLAIMED`, `SOURCE_PREPARED`, `DOCKER_BUILD_STARTED`, `DOCKER_BUILD_COMPLETED`} → `PREPARING`
  - `build.status` = `TEST_READY` 또는 `currentPhase` ∈ {`PREVIEW_QUEUED`} → `WAITING_FOR_SLOT` (또는 `STARTING`; testDeployment.status 가 있으면 그쪽 우선)
  - `testDeployment.status` = `QUEUED` → `WAITING_FOR_SLOT`
  - `testDeployment.status` = `RESERVED` / `PROVISIONING` → `STARTING`
  - `testDeployment.status` = `READY` + `healthProbe.status` = `healthy` (또는 healthProbe 없음) → `READY`
  - `testDeployment.status` = `READY` + `healthProbe.status` = `unhealthy` → `DEGRADED`
  - `testDeployment.status` = `FAILED` 또는 `build.status` = `FAILED` → `DEGRADED`
  - `testDeployment.status` = `EXPIRED` / `STOPPED` → `EXPIRED`
  - `build.status` = `COMPLETED` + `testDeployment` 없음 → `READY` (preview 가 없는 build 라면 OPEN_PREVIEW 가 아닌 `NONE`)
  - 그 외 → `UNKNOWN`
- **card.title**:
  - `READY` → "테스트용 미리보기 주소가 준비되었습니다."
  - `WAITING_FOR_SLOT` → "테스트용 미리보기 실행 자리를 기다리고 있습니다."
  - `STARTING` → "테스트용 미리보기를 실행하는 중입니다."
  - `PREPARING` → "앱을 실행 가능한 이미지로 만드는 중입니다."
  - `DEGRADED` → "테스트용 미리보기에 문제가 있어요. 잠시 후 다시 시도해 주세요."
  - `EXPIRED` → "미리보기 환경이 만료됐어요. 새 배포를 시작해 주세요."
  - `UNKNOWN` → "미리보기 상태를 확인하지 못했어요."
- **card.subtitle**:
  - `READY` + `previewUrl` 있으면 그 URL 그대로.
  - 그 외 → 빈 문자열.
- **card.body**:
  - `READY` → "이 주소로 현재 앱 동작을 확인할 수 있습니다. 미리보기는 임시 환경이며 새 배포가 준비되면 교체될 수 있습니다."
  - `WAITING_FOR_SLOT` → "잠시만 기다려 주세요. preview 실행 자리가 확보되면 자동으로 시작됩니다."
  - `STARTING` → "컨테이너를 띄우는 중이에요. 보통 1~2분 정도 걸립니다."
  - `PREPARING` → "이미지 빌드가 끝나면 미리보기 환경이 시작됩니다."
  - `DEGRADED` → "컨테이너가 시작은 됐지만 정상 응답이 없어요. 로그를 확인하거나 잠시 후 다시 시도해 주세요."
  - `EXPIRED` → "TTL 이 만료됐거나 preview 가 중지됐어요. 새 빌드를 요청해 주세요."
  - `UNKNOWN` → "상태를 가져오지 못했어요. 잠시 후 다시 시도해 주세요."
- **next_action**:
  - `READY` → `OPEN_PREVIEW`
  - `PREPARING` / `WAITING_FOR_SLOT` / `STARTING` → `WAIT`
  - `DEGRADED` → `RETRY`
  - `EXPIRED` → `RETRY`
  - `UNKNOWN` → `NONE`
- **ttl_remaining_seconds**:
  - `expiresAt` 가 있으면 `now = 2026-07-03T01:05:00Z` 가정 없이 절대 차감 — 입력에 `now` 가 없으면 `expiresAt` 그대로 두고 `ttl_remaining_seconds` 는 None. caller 가 명시적으로 `ttl.ttl_remaining_seconds` 를 줄 때만 표시.
  - `ttl.ttl_remaining_seconds` 가 주어지면 그대로 표시.

## 3. 읽기/쓰기 권한 경계

- 읽기: 입력 dict + canonical enum snapshot.
- 쓰기: 없음. readiness 분류 / 카드 합성만.

## 4. 에러 코드

- `MISSING_FIELD` — `build` 가 없거나 `build.status` 가 없음.
- `INVALID_INPUT` — 입력이 dict 가 아니거나 `build.status` 가 string 이 아님.

## 5. 후속 구현 포인트

- P1 MCP `preview-ttl` (OI-006 결정 후) 와 결합 시 ttl 연장 권장 메시지 카드에 추가.
- container health probe 의 source 는 다양 (Runner 직접 호출 / Build Server / 외부 모니터링). 본 단계는 입력으로 받기만 함.
- P2 MCP `preview-ttl` 후속.
