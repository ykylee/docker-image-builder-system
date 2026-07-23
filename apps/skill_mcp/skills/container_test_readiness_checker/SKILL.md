# Skill: container-test-readiness-checker

- 문서 목적: canonical `BuildStatusResponse` 의 `build` / `test` 블록 + (선택) container health probe + (선택) TTL 정보를 받아, 사용자가 "결과가 준비됐어?" 라고 물을 때 즉시 읽을 수 있는 readiness 카드와 `next_action` 을 만든다. P0 skill `build-status-explainer` 의 `next_action` 결과를 입력으로 받으면 일관된 톤을 보장.
- 범위: `readiness_state` (7종) 분류 + 카드 4-필드 합성 + `next_action` canonical 매핑. **읽기 전용** — Build Server / Runner 호출 없음. 실제 조회는 caller 가 status 응답을 채워 넘기는 형태.
- 대상 독자: AI agent, 사용자, Build Server / Runner 구현자
- 상태: stable (v3.0.0)
- 최종 수정일: 2026-07-23 (TASK-163 / P2-M4 — preview-era 입력 제거 + 스킬 개명)
- 관련 문서:
  - canonical enum: [`docs/sdlc/contracts/01-shared-build-contract-baseline.md`](../../../../docs/sdlc/contracts/01-shared-build-contract-baseline.md) §5/§6/§9
  - 메시지 4-구조: [`docs/sdlc/design/06-user-messaging-and-failure-handling.md`](../../../../docs/sdlc/design/06-user-messaging-and-failure-handling.md) §5
  - 컨테이너 테스트 엔드포인트: [`docs/operations/container-test-endpoints-2026-07-23.md`](../../../../docs/operations/container-test-endpoints-2026-07-23.md)
  - 실패 보고 경로: [`docs/operations/build-failure-reporting-2026-07-23.md`](../../../../docs/operations/build-failure-reporting-2026-07-23.md)

## 0. v3 에서 달라진 것 (TASK-163 / P2-M4)

| 항목 | v2 | v3 |
|---|---|---|
| 스킬/디렉터리 이름 | `preview_readiness_checker` | **`container_test_readiness_checker`** |
| 컨테이너 테스트 입력 | canonical `test` + legacy `testDeployment` (forward-map) | **canonical `test` 만** |
| 상태 어휘 | ExecutionStatus + preview 어휘(READY/PROVISIONING/QUEUED/EXPIRED/STOPPED/RESERVED/NOT_REQUESTED) | **ExecutionStatus 5종만** |
| 카드 subtitle 출처 | `test.containerRef` (legacy 매핑이 previewUrl 을 여기 넣어줬다) | **`build.runtimeUrl` 우선**, 없으면 `test.containerRef` |

**왜 지금**: preview-era payload 를 만들어내는 쪽이 P2-M1~M3 을 거치며 전부 사라졌다 — 계약에서 `previewStatuses` 와 `TestDeployment` DTO 가 빠졌고(P2-M1/M2), 엔드포인트가 `/container-test/*` 로 재설계됐고(P2-M2), runner 는 canonical `ExecutionStatus` 만 보낸다(P2-M3). 받아줄 대상이 없는 shim 이었다.

**subtitle 출처 변경이 중요한 이유**: v2 의 subtitle 은 `test.containerRef` 를 읽었는데, 거기에 URL 이 들어오는 것은 **legacy 매핑이 `previewUrl` 을 containerRef 자리에 넣어주었기 때문**이었다. 그 매핑을 제거하면 URL 을 영영 못 보게 되는 구조였으므로, canonical `build.runtimeUrl`(TASK-161 개명) 을 1순위로 세웠다.

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
    "currentPhase": "CONTAINER_TEST_PASSED",
    "runtimeUrl": "http://127.0.0.1:38124/",
    "createdAt": "2026-07-23T01:00:00Z",
    "startedAt": "2026-07-23T01:00:10Z",
    "finishedAt": "2026-07-23T01:03:00Z"
  },
  "test": {
    "status": "SUCCESS",
    "containerRunning": true,
    "healthCheckPassed": true,
    "portOpen": true,
    "stabilityWindowPassed": true,
    "containerRef": "container-b-1"
  },
  "healthProbe": {
    "status": "healthy",
    "checkedAt": "2026-07-23T01:05:00Z"
  },
  "ttl": {
    "ttl_remaining_seconds": 3300
  }
}
```

- `buildId` optional. `build.buildId` 가 있으면 그것 우선.
- `build` 필수. 없거나 `build.status` 가 없으면 `MISSING_FIELD`.
  - `build` 대신 top-level 에 `status` / `currentPhase` 등을 평평하게 준 형태(envelope 이전 shape)도 받는다.
- `test` optional. 없으면 `readiness_state` 분류에 `build.status` 만 사용. dict 가 아니면 `INVALID_INPUT` 경고 후 무시.
- `healthProbe` optional. 있으면 분류에 반영 (`SUCCESS` + unhealthy → `DEGRADED`).
- `ttl` optional. **`ttl.ttl_remaining_seconds` 를 caller 가 명시할 때만** 카드에 남은 시간이 표시된다 — canonical `test` 블록에는 만료 개념이 없다(§2 참조).

### 1.2 출력 (JSON)

```json
{
  "ok": true,
  "readiness_state": "READY",
  "card": {
    "title": "테스트 컨테이너가 준비되었습니다.",
    "subtitle": "http://127.0.0.1:38124/",
    "body": "이 결과로 현재 앱 동작을 확인할 수 있습니다. 외부 배포는 다음 단계에서 진행됩니다.",
    "ttl_remaining_seconds": 3300,
    "next_action": "OPEN_DEPLOYMENT"
  },
  "buildId": "b-1",
  "ref": {
    "contract_doc": "docs/sdlc/contracts/01-shared-build-contract-baseline.md",
    "design_doc": "docs/sdlc/design/06-user-messaging-and-failure-handling.md",
    "skill_version": "v3"
  }
}
```

- `readiness_state` enum: `READY` / `PREPARING` / `WAITING_FOR_SLOT` / `STARTING` / `DEGRADED` / `EXPIRED` / `UNKNOWN`.
- `card` 4-필드: `title` (한 줄) / `subtitle` (URL 또는 빈 문자열) / `body` (1~3 줄) / `next_action` enum.
- `next_action` enum: `WAIT` / `OPEN_DEPLOYMENT` / `RETRY` / `FIX_DOCKERFILE` / `FIX_PORT` / `CHECK_SOURCE` / `CONTACT_OPERATOR` / `NONE`.

## 2. 동작 규칙

**분류 우선순위**: canonical `test.status` → `build.status` / `currentPhase`.

| `test.status` (ExecutionStatus) | `readiness_state` |
|---|---|
| `SUCCESS` + healthProbe 없음/healthy | `READY` |
| `SUCCESS` + healthProbe `unhealthy` | `DEGRADED` |
| `IN_PROGRESS` | `STARTING` |
| `NOT_STARTED` | `WAITING_FOR_SLOT` |
| `FAILED` | `DEGRADED` |
| `SKIPPED` | `EXPIRED` |
| 그 외(계약 밖 값) | build 쪽 분류로 fallthrough |

`test` 가 없거나 위에서 결정되지 않으면 build 쪽으로:

| `build.status` / `currentPhase` | `readiness_state` |
|---|---|
| `RECEIVED` / `QUEUED` / `PREPARING_SOURCE` / `BUILDING` / `BUILD_SUCCESS` | `PREPARING` |
| `currentPhase` ∈ {REQUEST_ACCEPTED, QUEUE_CLAIMED, SOURCE_PREPARED, DOCKER_BUILD_STARTED, DOCKER_BUILD_COMPLETED} | `PREPARING` |
| `TESTING` / `TEST_SUCCESS` | `STARTING` |
| `COMPLETED` | `UNKNOWN` (build 는 끝났는데 test 결과가 없음) |
| `FAILED` | `DEGRADED` |
| `CANCELLED` | `EXPIRED` |
| 그 외 | `UNKNOWN` |

- **card.title / body / next_action**: `readiness_state` 별 고정 문구 테이블(`CARD_BY_STATE`)에서 온다. 코드가 단일 출처다.
- **card.subtitle**: `READY` 일 때 `build.runtimeUrl` → (없으면) `test.containerRef`. 그 외 상태는 빈 문자열.
- **ttl_remaining_seconds**: `ttl.ttl_remaining_seconds` 를 caller 가 준 경우에만 표시한다. canonical `test` 블록에는 `expiresAt` / TTL 필드가 **없다** — 테스트 컨테이너의 수명은 runner 가 결과 보고 시점에 정리하지 TTL 로 만료시키지 않는다(TASK-161 에서 `previewTtlMinutes` 제거).

## 3. 읽기/쓰기 권한 경계

- 읽기: 입력 dict + canonical enum snapshot.
- 쓰기: 없음. readiness 분류 / 카드 합성만.

## 4. 에러 코드

- `MISSING_FIELD` — `build` 가 없거나 `build.status` 가 없음.
- `INVALID_INPUT` — 입력이 dict 가 아님. (`test` 가 dict 가 아니면 hard error 가 아니라 **경고** 후 무시.)

## 5. 후속 구현 포인트

- container health probe 의 source 는 다양하다(Runner 직접 호출 / Build Server / 외부 모니터링). 본 스킬은 입력으로 받기만 한다.
- 컨테이너 수명 정책이 다시 도입되면(현재 없음) `ttl` 입력 대신 canonical 필드를 읽도록 §2 를 갱신할 것.
