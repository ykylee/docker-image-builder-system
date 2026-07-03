# Skill: build-status-explainer

- 문서 목적: Build Server `GET /builds/{buildId}` 응답과 (선택) `GET /builds/{buildId}/logs` 마지막 N 줄을 받아, 비개발자 사용자가 즉시 읽을 수 있는 한국어 상태 메시지 + `next_action` 으로 변환한다.
- 범위: `BuildStatus` (10종) / `PreviewStatus` (7종) / `Phase` (9종) / `ErrorCode` (10종) 의 canonical enum → 시스템/에이전트/사용자 3-tier 메시지. 실제 API 호출은 이 skill 의 책임이 아니다 (Build Server 가 canonical, 호출은 사용자가 직접 또는 `apps/skill_mcp/mcp_servers/latest-build-status` 후속 MCP).
- 대상 독자: AI agent, 비개발자 build 요청자, Skill/MCP 구현자
- 상태: draft (v0.1.0)
- 최종 수정일: 2026-07-03
- 관련 문서:
  - canonical enum/phase/error: [`docs/sdlc/contracts/01-shared-build-contract-baseline.md`](../../../../docs/sdlc/contracts/01-shared-build-contract-baseline.md) §5/§6/§7/§8/§9
  - 메시지 계층/실패 처리: [`docs/sdlc/design/06-user-messaging-and-failure-handling.md`](../../../../docs/sdlc/design/06-user-messaging-and-failure-handling.md) §2/§3/§4
  - 후보 카탈로그: [`docs/sdlc/13-skills-and-mcp-plan.md`](../../../../docs/sdlc/13-skills-and-mcp-plan.md) §3.2
  - API 응답 shape: [`docs/sdlc/design/03-api-contract-design.md`](../../../../docs/sdlc/design/03-api-contract-design.md)

## 1. 입출력 계약

### 1.1 입력 (JSON)

```json
{
  "buildId": "...",
  "userId": "...",
  "appName": "...",
  "status": "BUILDING",
  "currentPhase": "DOCKER_BUILDING",
  "createdAt": "2026-07-03T01:00:00Z",
  "startedAt": "2026-07-03T01:00:10Z",
  "finishedAt": null,
  "testDeployment": {
    "status": "STARTING",
    "previewUrl": null,
    "host": "preview.example.com",
    "hostPort": 41023,
    "internalPort": 3000,
    "expiresAt": null
  },
  "error": null,
  "logs": {
    "tail": ["line1", "line2"]
  }
}
```

- 모든 top-level key 는 optional. `status` / `currentPhase` / `testDeployment.status` / `error.code` 가 없으면 `INVALID_INPUT` 에러.
- `logs.tail` 은 optional. 주어지면 `error_summary` 의 한 줄로 첫 줄 + 마지막 줄을 발췌 (40자 제한).

### 1.2 출력 (JSON)

```json
{
  "ok": true,
  "explanation": {
    "system": { "status": "BUILDING", "phase": "DOCKER_BUILDING", "preview": "STARTING" },
    "agent": "빌드를 진행 중이고, 미리보기 컨테이너를 띄우는 단계입니다.",
    "user": "지금 이미지를 만들고 있어요. 곧 미리보기 주소를 알려드릴게요.",
    "next_action": "WAIT",
    "is_terminal": false,
    "error_summary": null
  },
  "ref": {
    "contract_doc": "docs/sdlc/contracts/01-shared-build-contract-baseline.md",
    "design_doc": "docs/sdlc/design/06-user-messaging-and-failure-handling.md",
    "contract_version": "v1"
  }
}
```

- `next_action` enum: `WAIT` / `OPEN_PREVIEW` / `RETRY` / `FIX_DOCKERFILE` / `FIX_PORT` / `CHECK_SOURCE` / `CONTACT_OPERATOR` / `NONE`.
- `is_terminal` 은 build status 가 `COMPLETED` / `FAILED` / `CANCELLED` 일 때 true.
- `error_summary` 는 `status=FAILED` 또는 `preview.status=FAILED` 일 때만 채워짐. 그 외는 null.

## 2. 읽기/쓰기 권한 경계

- 읽기: shared contract 문서, design 06. core.py 가 frozen snapshot 을 두지 않고 canonical 경로를 따라간다.
- 쓰기: 없음. 이 skill 은 설명만 만들고 실제 API 호출은 하지 않는다.

## 3. 실행 모드

| 모드 | 진입점 | 사용 |
| --- | --- | --- |
| CLI | `python3 -m apps.skill_mcp.skills.build_status_explainer.cli --input <path>` 또는 stdin | AI agent 또는 사용자가 직접 호출 |
| Embed | `from apps.skill_mcp.skills.build_status_explainer.core import explain; explain(input_dict)` | 다른 skill/MCP 에서 import |
| Test | `python3 -m unittest apps.skill_mcp.tests.test_build_status_explainer` | 단위 테스트 |

## 4. 동작 규칙

- Build status → 사용자 메시지:
  - `QUEUED` / `PREPARING` / `VALIDATING` / `BUILDING` / `IMAGE_BUILT` / `TEST_DEPLOYING` → "WAIT" 계열 짧은 한국어
  - `TEST_READY` / `COMPLETED` → "OPEN_PREVIEW" 계열 + `is_terminal=true` (단 `TEST_READY` 는 active build, `COMPLETED` 만 terminal)
  - `FAILED` → `error.code` 별 `next_action` 매핑 + `error_summary` 한 줄. `is_terminal=true`
  - `CANCELLED` → "사용자에 의해 취소된 빌드입니다." + `NONE`. `is_terminal=true`
- Preview status 정합:
  - build.status == `TEST_READY` 또는 `COMPLETED` 인데 preview.status == `STARTING` / `QUEUED` / `RESERVED` 이면 `user` 메시지에 "주소가 곧 준비됩니다" + `next_action=WAIT` (시스템은 OK 라 표시하지 않음, `is_terminal` 도 false 로 둠)
  - build.status == `COMPLETED` 이고 preview.status == `READY` 면 `next_action=OPEN_PREVIEW`
  - build.status == `COMPLETED` 이고 preview.status == `EXPIRED` / `STOPPED` 면 `next_action=RETRY` ("preview 가 만료/중지됐어요. 다시 빌드를 시작해 주세요")
  - preview.status == `FAILED` 면 `error_summary` 를 preview error code 로 채움 + `next_action` 매핑
- Error code → next_action 매핑:
  - `INVALID_REQUEST` → `FIX_PORT` 또는 `CHECK_SOURCE` (필드 검증)
  - `SOURCE_ARCHIVE_NOT_FOUND` / `DOCKERFILE_NOT_FOUND` → `CHECK_SOURCE`
  - `INVALID_RUNTIME_PORT` / `PREVIEW_PORT_UNAVAILABLE` → `FIX_PORT`
  - `DOCKER_BUILD_FAILED` / `INVALID_BUILD_INPUT` → `FIX_DOCKERFILE`
  - `PREVIEW_CONTAINER_START_FAILED` / `PREVIEW_HEALTHCHECK_FAILED` → `RETRY`
  - `INTERNAL_ERROR` → `CONTACT_OPERATOR`
- 알 수 없는 status / phase / error_code 는 `agent` 메시지에 "(알 수 없는 상태: <value>)" 접미를 붙이고 `next_action=NONE` + `ok=false` + `errors` 에 `UNKNOWN_ENUM` 경고.
- 결정적 출력: JSON dump 시 `sort_keys=False, indent=2, ensure_ascii=False`.

## 5. 후속 구현 포인트

- `apps/skill-mcp/mcp_servers/latest-build-status` 와 결합 시 `buildId` 없이 `userId+appName` 으로 `GET /builds` 를 호출하고, 그 결과를 다시 본 skill 의 `explain()` 에 넣어 사용자 노출용 응답을 만든다.
- `OI-009` (실패 요약 책임) 결정 시 본 skill 의 `error_summary` 가 canonical 인지, `failure-summary-shaper` 가 canonical 인지에 따라 본 skill 의 책임 범위를 좁힌다.
- shared contract 가 bump 되면 `CONTRACT_VERSION` 와 `EXPLANATION_VERSION` 을 함께 올리고 `ref.contract_version` 을 갱신한다.
