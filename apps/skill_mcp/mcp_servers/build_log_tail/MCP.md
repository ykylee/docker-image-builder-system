# MCP: build-log-tail

- 문서 목적: `GET /builds/{buildId}/logs` 의 마지막 N 줄 또는 since-token 기반 incremental tail 을 반환한다. 비개발자 / AI agent 가 "최근에 뭐가 찍혔어?" 라고 물을 때 사용.
- 범위: buildId + tail/since 입력 → Build Server logs endpoint 호출 → 라인 배열 정규화 + next_since 합성. live/dry-run 모두 지원. NDJSON / JSON 두 응답 형식 모두 처리.
- 대상 독자: AI agent, Build Server caller, Skill/MCP 구현자
- 상태: draft (v0.1.0)
- 최종 수정일: 2026-07-03
- 관련 문서:
  - canonical: [`docs/sdlc/contracts/01-shared-build-contract-baseline.md`](../../../../docs/sdlc/contracts/01-shared-build-contract-baseline.md) §9
  - query API: [`docs/sdlc/12-pkg-004-build-server-query-api-breakdown.md`](../../../../docs/sdlc/12-pkg-004-build-server-query-api-breakdown.md) (PKG-004 로그 endpoint)
  - 후보 카탈로그: [`docs/sdlc/13-skills-and-mcp-plan.md`](../../../../docs/sdlc/13-skills-and-mcp-plan.md) §4.2
  - 후속: `apps/skill_mcp/skills/failure_summary_shaper/` (TBD)

## 1. Transport 상태

- 현 단계(`transport_ready=false`): stdio 기반 MCP transport 미구현. 본 MCP 의 core.py + cli.py 가 동일 입력/출력 계약의 **수동 절차** 또는 **dry-run** 으로 운영.
- 후속 TASK: TASK-017 의 `apps/skill_mcp` 골격 결정 시 stdio 엔트리포인트가 본 core.py 의 `tail()` 을 호출.

## 2. 입출력 계약

### 2.1 입력 (JSON)

```json
{
  "buildId": "b-1",
  "tail": 200,
  "since": "opaque-token-or-null",
  "buildServerUrl": "https://build.example.com"
}
```

- `buildId` 필수. 없으면 `MISSING_FIELD` 에러.
- `tail` optional. 기본 200. 정수. 0 ≤ tail ≤ 5000. 음수 / 5000 초과 / 비정수 → `INVALID_INPUT`.
- `since` optional. 빌드 서버가 부여한 opaque cursor. 본 MCP 는 형식을 강제하지 않고 그대로 query string 에 포함. 빈 문자열은 무시.
- `buildServerUrl` 또는 `LATEST_BUILD_STATUS_DEFAULT_BASE_URL` 환경 변수 중 하나는 필수 (dryRun=false 인 경우). 없으면 `MISSING_FIELD`.
- `dryRun=true` + `fixture` 가 list/str 중 하나여야 함.

### 2.2 출력 (JSON)

```json
{
  "ok": true,
  "lines": ["line 1", "line 2", "..."],
  "next_since": "opaque-cursor-or-null",
  "truncated": false,
  "total_returned": 200,
  "ref": {
    "contract_doc": "docs/sdlc/contracts/01-shared-build-contract-baseline.md",
    "mcp_version": "v1"
  }
}
```

- `next_since`: Build Server 가 응답에 포함하면 그대로, 없으면 마지막 라인의 hex digest + offset 으로 합성.
- `truncated`: 응답 라인 수가 `tail` 보다 작거나 같으면 false, 크면 true. Build Server 가 `truncated` 필드를 명시하면 그 값을 우선.
- `total_returned`: `lines` 배열 길이.

## 3. 동작 규칙

- HTTP:
  - `urllib.request` 만 사용 (외부 의존성 0).
  - endpoint: `GET {baseUrl}/builds/{buildId}/logs?tail={tail}&since={since}`.
  - timeout 기본 5초. `timeoutSeconds` 입력으로 override 가능.
  - status code 404 → `BUILD_NOT_FOUND` 에러 + `ok=false`.
  - 5xx 또는 네트워크 오류 → `BUILD_SERVER_ERROR` / `BUILD_SERVER_UNREACHABLE`.
- 응답 형식:
  - JSON: `{ "lines": [...], "next_since"?: "...", "truncated"?: bool }` 또는 top-level array.
  - NDJSON: 한 줄에 한 record. 빈 줄 무시. JSON record 가 아니면 그대로 string line 으로 취급.
- since 토큰 처리:
  - `since` 가 주어지면 `GET /builds/{buildId}/logs?since=<since>&tail=<tail>` 호출.
  - Build Server 가 `next_since` 를 응답에 포함하면 그대로 사용. 없으면 마지막 라인의 sha1 prefix 8자 + `:` + offset 으로 합성 (예: `a1b2c3d4:200`).
- fixture (dry-run):
  - `fixture` 가 list 면 `lines` 로 간주. `next_since` / `truncated` 미포함 시 MCP 가 자체 합성.
  - `fixture` 가 string 이고 줄바꿈이 있으면 NDJSON 으로 파싱.
  - `fixture` 가 dict 면 `{ "lines": [...], "next_since"?: "...", "truncated"?: bool }` 로 간주.
  - 그 외 타입 → `INVALID_INPUT`.

## 4. 읽기/쓰기 권한 경계

- 읽기: Build Server `GET /builds/{buildId}/logs` endpoint.
- 쓰기: 없음.
- dry-run / fixture 모드는 테스트/CI 에서만 사용. 운영 호출은 dryRun=false.

## 5. 후속 구현 포인트

- TASK-017 의 `apps/skill_mcp/mcp_servers/` stdio 엔트리포인트가 본 core.py 의 `tail()` 을 호출하는 형태로 묶는다.
- `failure-summary-shaper` skill 과 결합 시 본 MCP 의 `lines` 를 `error_summary` 의 입력으로 그대로 전달.
- log streaming (SSE / WebSocket) 은 후속 TASK 에서 별도 MCP 로 분리.
