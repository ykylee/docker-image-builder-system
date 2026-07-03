# MCP: failure-summary

- 문서 목적: build/preview failure 응답을 받아 P1 skill `failure-summary-shaper` 의 `shape()` 를 호출해 4-구조 한국어 사용자 메시지로 변환하고, AI agent 가 그대로 노출할 수 있는 `{ ok, summary, cause, next_step, buildId, next_action }` 형태로 반환한다. 사용자가 "왜 실패했어?" 라고 물을 때 사용.
- 범위: `failure` / `previewFailure` 입력 → `failure-summary-shaper` 위임 → 4-구조 출력. live/dry-run 모두 지원. 실제 API 호출은 본 MCP 책임 아님 — caller 가 `failure` 객체를 채워서 넘기는 형태.
- 대상 독자: AI agent, 사용자, Build Server caller
- 상태: draft (v0.1.0)
- 최종 수정일: 2026-07-03
- 관련 문서:
  - canonical: [`docs/sdlc/design/06-user-messaging-and-failure-handling.md`](../../../../docs/sdlc/design/06-user-messaging-and-failure-handling.md) §6
  - 위임 대상: [`apps/skill_mcp/skills/failure_summary_shaper/`](../../../../apps/skill_mcp/skills/failure_summary_shaper/)
  - 후보 카탈로그: [`docs/sdlc/13-skills-and-mcp-plan.md`](../../../../docs/sdlc/13-skills-and-mcp-plan.md) §4.3
  - 미결: `OI-009` (실패 요약 생성 책임)

## 1. Transport 상태

- 현 단계(`transport_ready=false`): stdio 기반 MCP transport 미구현. 본 MCP 의 core.py + cli.py 가 동일 입력/출력 계약의 **수동 절차** 또는 **dry-run** 으로 운영.
- 후속 TASK: TASK-017 의 `apps/skill_mcp/mcp_servers/` stdio 엔트리포인트가 본 core.py 의 `summarize()` 를 호출.

## 2. 입출력 계약

### 2.1 입력 (JSON)

```json
{
  "buildId": "b-1",
  "failure": {
    "source": "build",
    "errorCode": "DOCKER_BUILD_FAILED",
    "errorSummary": "이미지 빌드 실패",
    "nextAction": "FIX_DOCKERFILE"
  },
  "previewFailure": {
    "source": "preview",
    "errorCode": "PREVIEW_CONTAINER_START_FAILED",
    "nextAction": "RETRY"
  },
  "logs": {"tail": ["line1", "line2"]}
}
```

- `failure` 또는 `previewFailure` 중 최소 하나 필수.
- `dryRun=true` + `fixture` 가 dict 이면 fixture 가 본 입력 dict 로 사용됨 (테스트/CI 용).

### 2.2 출력 (JSON)

```json
{
  "ok": true,
  "summary": "배포가 완료되지 않았습니다.",
  "cause": "앱을 이미지로 만드는 단계에서 문제가 발생했어요. ...",
  "next_step": "Dockerfile 과 의존성 설정을 먼저 확인한 뒤 다시 요청해 주세요.",
  "buildId": "b-1",
  "next_action": "FIX_DOCKERFILE",
  "ref": {
    "design_doc": "docs/sdlc/design/06-user-messaging-and-failure-handling.md",
    "skill_doc": "apps/skill_mcp/skills/failure_summary_shaper/SKILL.md",
    "mcp_version": "v1"
  }
}
```

- `failure-summary-shaper` 의 출력 (`summary` / `cause` / `next_step` / `buildId` / `next_action` / `logs_excerpt`) 을 그대로 노출.
- `mcp_version` 만 MCP envelope 에서 추가.

## 3. 동작 규칙

- 입력 dict 를 그대로 `failure-summary-shaper.shape()` 에 위임. shape() 가 canonical ErrorCode → cause 매핑 / next_action → next_step 매핑 / 4-구조 합성 / logs_excerpt / buildId 처리 모두 담당.
- 본 MCP 는 추가 변환 없음. **thin wrapper** 역할.
- dryRun 모드: `fixture` 가 dict 면 그 dict 가 shape() 입력으로 사용. `fixture` 가 list/str/숫자 이면 `INVALID_INPUT` (failure / previewFailure 객체가 dict 여야 하므로).

## 4. 읽기/쓰기 권한 경계

- 읽기: 입력 dict.
- 쓰기: 없음. live API 호출 없음. failure 객체를 caller (Build Server caller 또는 다른 MCP) 가 채워서 넘긴다고 가정.

## 5. 후속 구현 포인트

- TASK-017 stdio 엔트리포인트와 묶일 때 본 MCP 의 `summarize()` 가 호출 진입점이 됨.
- `OI-009` 결정에 따라 책임 위치가 Build Server 로 이전되면 본 MCP 는 deprecated. P1 → P0/P2 재평가.
- live `GET /builds/{buildId}` 와 결합한 end-to-end 호출은 후속.
