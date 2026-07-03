# Skill: failure-summary-shaper

- 문서 목적: 빌드 / 테스트 / 배포 중 실패 응답과 (선택) 관련 로그 라인을 받아, `docs/sdlc/design/06-user-messaging-and-failure-handling.md` §6 의 4-구조 (결과 요약 / 원인 범주 / 다음 조치 / buildId) 로 한국어 사용자 메시지를 합성한다. `build-status-explainer` (P0) 의 `error_summary` + `next_action` 결과를 입력으로 받으면 일관된 톤을 보장한다.
- 범위: 4-구조 합성 / 한국어 1~4 줄 / `next_action` canonical enum (`OPEN_DEPLOYMENT` 포함) 보존. **읽기 전용** — Build Server / Runner 호출 없음. P0 skill `build-status-explainer` 와 P0 MCP `latest-build-status` 의 출력 consumer.
- **canonical contract v2** (TASK-061 contract rename): 입력 stage 는 `BUILD` / `TEST` / `DEPLOY` / `DELIVERY` 4종. errorCode 는 canonical 8종 (`apps/skill_mcp/contract/canonical.py` `ERROR_CODES` 와 동기). legacy `source: build/preview` 와 `OPEN_PREVIEW` 는 forward-compat 으로 받지만 출력은 canonical `stage` + `OPEN_DEPLOYMENT` 만 사용.
- 대상 독자: AI agent, 사용자, Build Server / Runner 구현자
- 상태: stable (v2.0.0)
- 최종 수정일: 2026-07-03 (TASK-061 contract rename)
- 관련 문서:
  - 메시지 4-구조: [`docs/sdlc/design/06-user-messaging-and-failure-handling.md`](../../../../docs/sdlc/design/06-user-messaging-and-failure-handling.md) §6
  - 입력 source: [`apps/skill_mcp/skills/build_status_explainer/`](../../../../apps/skill_mcp/skills/build_status_explainer/) §1 (error_summary / next_action)
  - canonical enum: [`docs/sdlc/contracts/01-shared-build-contract-baseline.md`](../../../../docs/sdlc/contracts/01-shared-build-contract-baseline.md) §7/§8 + [`apps/skill_mcp/contract/canonical.py`](../../contract/canonical.py)
  - 후보 카탈로그: [`docs/sdlc/13-skills-and-mcp-plan.md`](../../../../docs/sdlc/13-skills-and-mcp-plan.md) §3.3
  - 미결: `OI-009` (실패 요약 생성 책임)

## 1. 입출력 계약

### 1.1 입력 (JSON)

```json
{
  "buildId": "b-1",
  "failure": {
    "source": "build",
    "errorCode": "DOCKER_BUILD_FAILED",
    "errorSummary": "이미지 빌드 단계에서 문제가 발생했습니다.",
    "nextAction": "FIX_DOCKERFILE"
  },
  "previewFailure": {
    "source": "preview",
    "errorCode": "PREVIEW_CONTAINER_START_FAILED",
    "errorSummary": "컨테이너가 시작되지 않았습니다.",
    "nextAction": "RETRY"
  },
  "logs": {
    "tail": ["line1", "line2"]
  },
  "locale": "ko-KR"
}
```

- `buildId` optional. 주어지면 4-구조 끝에 `buildId` 라인 추가 (선택).
- `failure` / `previewFailure` 둘 다 optional. 둘 다 없으면 `INVALID_INPUT`. 둘 다 있으면 **build failure 우선** (06 §4.1 "사용자 입장에서 더 가까운 단계" 원칙 + 일반적으로 build 실패가 preview 실패보다 상위 원인).
- 각 failure 객체:
  - `source` optional. `"build"` / `"preview"` / 그 외 → `"unknown"`.
  - `errorCode` optional. canonical `ErrorCode` 중 하나 또는 미지의 enum.
  - `errorSummary` optional. 없거나 빈 문자열이면 내부 default 메시지로 채움.
  - `nextAction` optional. canonical `next_action` enum 중 하나.
- `logs.tail` optional. 첫 줄 + 마지막 줄을 발췌해 `logs_excerpt` 로 첨부 (각 60자 제한, 둘 다 없으면 생략).
- `locale` optional. 기본 `"ko-KR"`. 본 단계는 한국어 1종만 지원.

### 1.2 출력 (JSON)

```json
{
  "ok": true,
  "summary": "배포가 완료되지 않았습니다.",
  "cause": "앱을 이미지로 만드는 단계에서 문제가 발생했습니다.",
  "next_step": "Dockerfile과 실행 포트 설정을 먼저 확인한 뒤 다시 요청해 주세요.",
  "buildId": "b-1",
  "logs_excerpt": "line1 ... line2",
  "next_action": "FIX_DOCKERFILE",
  "ref": {
    "design_doc": "docs/sdlc/design/06-user-messaging-and-failure-handling.md",
    "skill_version": "v1"
  }
}
```

- 4-구조: `summary` (1줄) / `cause` (1줄) / `next_step` (1줄) / `buildId` (선택).
- `next_action`: `WAIT` / `OPEN_PREVIEW` / `RETRY` / `FIX_DOCKERFILE` / `FIX_PORT` / `CHECK_SOURCE` / `CONTACT_OPERATOR` / `NONE`.
- `ok`: 입력이 유효하면 `true`, invalid 면 `false`.
- `logs_excerpt`: `tail` 의 첫 줄 + `...` + 마지막 줄 형태로 1줄 합성. `tail` 길이 1 이하면 그대로.

## 2. 동작 규칙

- **failure 선택**:
  - `failure` 만 있으면 그것 사용.
  - `previewFailure` 만 있으면 그것 사용.
  - 둘 다 있으면 `failure` 우선. 단 출력에 "preview 단계에서 추가 실패가 있었어요." 같은 부가 라인 1줄은 `cause` 끝에 ` · ` 로 합성.
- **errorCode → cause 매핑** (canonical `ErrorCode`):
  - `INVALID_REQUEST` → "요청에 잘못된 필드가 있어요. userId/appName/sourceArchiveRef 를 확인해 주세요."
  - `SOURCE_ARCHIVE_NOT_FOUND` → "소스 아카이브를 찾을 수 없어요. 업로드가 끝났는지 확인해 주세요."
  - `DOCKERFILE_NOT_FOUND` → "Dockerfile 을 찾을 수 없어요. 경로와 이름을 확인해 주세요."
  - `INVALID_RUNTIME_PORT` → "앱이 알려준 실행 포트가 비어있거나 잘못됐어요. runtimePort 값을 확인해 주세요."
  - `INVALID_BUILD_INPUT` → "빌드 입력이 정책과 맞지 않아요. dockerfileMode / detectedAppType 등을 확인해 주세요."
  - `DOCKER_BUILD_FAILED` → "앱을 이미지로 만드는 단계에서 문제가 발생했어요. Dockerfile 과 의존성 설정을 확인해 주세요."
  - `PREVIEW_PORT_UNAVAILABLE` → "선택한 미리보기 포트를 지금 쓸 수 없어요. 다른 포트로 다시 시도해 주세요."
  - `PREVIEW_CONTAINER_START_FAILED` → "미리보기 컨테이너가 시작되지 않았어요. 앱이 해당 포트에서 정말 듣는지 확인해 주세요."
  - `PREVIEW_HEALTHCHECK_FAILED` → "미리보기 컨테이너가 응답하지 않아요. 앱의 health endpoint 또는 startup 시간을 확인해 주세요."
  - `INTERNAL_ERROR` → "내부 오류가 발생했어요. 잠시 후 다시 시도하거나 운영자에게 문의해 주세요."
  - 미지의 enum → "원인을 정확히 분류하지 못했어요. (코드: <code>)"
- **nextAction → next_step 매핑**:
  - `WAIT` → "잠시 기다린 뒤 다시 확인해 주세요."
  - `OPEN_PREVIEW` → "테스트용 미리보기 주소를 확인해 주세요." (단, 실패 상황에서는 보통 안 나옴; 입력에 따라 다름)
  - `RETRY` → "잠시 후 같은 설정으로 다시 요청해 주세요."
  - `FIX_DOCKERFILE` → "Dockerfile 과 의존성 설정을 먼저 확인한 뒤 다시 요청해 주세요."
  - `FIX_PORT` → "앱의 실행 포트 설정을 먼저 확인한 뒤 다시 요청해 주세요."
  - `CHECK_SOURCE` → "소스 아카이브와 업로드 상태를 먼저 확인해 주세요."
  - `CONTACT_OPERATOR` → "운영자에게 문의해 주세요. (buildId 를 함께 전달해 주세요.)"
  - `NONE` / 미지 → "원인을 확인한 뒤 다시 시도해 주세요."
- **summary 한 줄 (default)**:
  - source=build → "배포가 완료되지 않았습니다."
  - source=preview → "미리보기 환경이 준비되지 않았습니다."
  - source=unknown → "빌드/미리보기 진행이 끝나지 않았습니다."
- **errorSummary 가 있으면** `cause` 의 기본 매핑 대신 그 줄을 우선 사용하되, 너무 길면 100자에서 자르고 `…` 로 끝맺음. 단 canonical enum 매핑 줄은 더 권위 있음 → errorCode 가 canonical 이면 매핑 우선.

## 3. 읽기/쓰기 권한 경계

- 읽기: 입력 dict + canonical enum snapshot.
- 쓰기: 없음. 본 skill 은 합성만. 실제 build/preview 조치는 `next_step` 메시지로 사용자에게 안내.

## 4. 에러 코드

- `MISSING_FIELD` — `failure` / `previewFailure` 둘 다 없음.
- `INVALID_INPUT` — 입력이 dict 가 아니거나 `logs.tail` 이 list 가 아님.
- `UNKNOWN_ENUM` — `nextAction` 또는 `errorCode` 가 canonical 외 (warnings, ok=true 유지).

## 5. OI-009 결정과의 관계

- 본 skill 은 "AI agent 가 사용자 메시지를 조립" 한다는 가정 (06 §10.3). 책임 위치 결정 (`OI-009`) 후 Build Server 로 책임이 넘어가면 본 skill 은 deprecated 될 수 있음.
- 결정 전 프로토타입 용도. 결정 시 `state.json` / `work_backlog.md` 에 `failure-summary-shaper` 의 P1 → P0/P2 재평가를 기록.

## 6. 후속 구현 포인트

- P1 MCP `failure-summary` 가 본 skill 의 `shape()` 을 감싸는 thin wrapper.
- 다음 액션 메시지 다국어 (en-US 등) 는 후속.
- `logs_excerpt` 가 너무 길면 라인 단위 트림 + max 라인 수 정책.
