# MCP: latest-build-status

- 문서 목적: 동일 `userId + appName` 의 최신 build 상태를 Build Server 에서 한 번에 조회해, 비개발자 한국어 메시지 + `next_action` 까지 합쳐 반환한다. 내부적으로는 `GET /builds/{buildId}` 또는 `GET /builds?userId=...&appName=...` 후 `build-status-explainer.explain()` 위임이다.
- 범위: Build Server query API (`PKG-002` + `PKG-004`) 호출, `build-status-explainer` 호출 또는 fixture 주입, 결정적 JSON 응답. 실제 Build Server 가 없으면 dry-run 모드 + fixture 로 동작한다.
- 대상 독자: AI agent, Build Server caller, Skill/MCP 구현자
- 상태: draft (v0.1.0)
- 최종 수정일: 2026-07-03
- 관련 문서:
  - canonical: [`docs/sdlc/contracts/01-shared-build-contract-baseline.md`](../../../../docs/sdlc/contracts/01-shared-build-contract-baseline.md) §9
  - API 응답 shape: [`docs/sdlc/design/03-api-contract-design.md`](../../../../docs/sdlc/design/03-api-contract-design.md)
  - 메시지 변환: [`apps/skill_mcp/skills/build_status_explainer/`](../../skills/build_status_explainer/SKILL.md)
  - 후보 카탈로그: [`docs/sdlc/13-skills-and-mcp-plan.md`](../../../../docs/sdlc/13-skills-and-mcp-plan.md) §4.1
  - PKG-002/004: `docs/sdlc/07-implementation-backlog-baseline.md`

## 1. Transport 상태

- 현 단계(`transport_ready=false`): stdio 기반 MCP transport 는 미구현. 본 MCP 의 core.py 와 cli.py 가 동일 입력/출력 계약의 **수동 절차** 또는 **dry-run** 으로 운영된다.
- 후속 TASK: TASK-017 의 `apps/skill_mcp` 골격 결정 시 `mcp_servers/` 디렉터리와 stdio 엔트리포인트를 본 core.py 에 묶는다.

## 2. 입출력 계약

### 2.1 입력 (JSON)

```json
{
  "userId": "u-1",
  "appName": "demo-app",
  "buildId": "b-1",
  "buildServerUrl": "https://build.example.com"
}
```

- `userId` + `appName` 또는 `buildId` 중 하나는 필수. 둘 다 주어지면 `buildId` 우선.
- `buildServerUrl` 이 없으면 `LATEST_BUILD_STATUS_DEFAULT_BASE_URL` 환경 변수 → `--build-server-url` CLI 옵션 순으로 fallback. 없으면 `INVALID_INPUT` 에러.
- (선택) `dryRun`: true 면 실제 호출을 하지 않고 `fixture` 또는 mocked `GET /builds` 응답을 사용.

### 2.2 출력 (JSON)

```json
{
  "ok": true,
  "build": {
    "buildId": "b-1",
    "userId": "u-1",
    "appName": "demo-app",
    "status": "BUILDING",
    "currentPhase": "DOCKER_BUILDING",
    "testDeployment": {"status": "STARTING"},
    "error": null
  },
  "explanation": {
    "system": { "status": "BUILDING", "phase": "DOCKER_BUILDING", "preview": "STARTING" },
    "agent": "...",
    "user": "...",
    "next_action": "WAIT",
    "is_terminal": false,
    "error_summary": null
  },
  "ref": {
    "contract_doc": "docs/sdlc/contracts/01-shared-build-contract-baseline.md",
    "design_doc": "docs/sdlc/design/06-user-messaging-and-failure-handling.md",
    "mcp_version": "v1"
  }
}
```

- `build` 가 Build Server 응답 (정규화 후). `explanation` 은 `build-status-explainer.explain()` 의 결과.
- `explanation.user` 가 비개발자 노출용 1차 메시지.

## 3. 동작 규칙

- 우선순위:
  1. `buildId` 가 주어지면 `GET {baseUrl}/builds/{buildId}` 호출.
  2. `userId + appName` 만 주어지면 `GET {baseUrl}/builds?userId=...&appName=...` 호출. 응답에서 `active` build (status ∈ {QUEUED, PREPARING, VALIDATING, BUILDING, IMAGE_BUILT, TEST_DEPLOYING, TEST_READY}) 중 가장 최근을 선택. 모두 terminal 이면 가장 최근 terminal build 를 반환.
- HTTP:
  - `urllib.request` 만 사용 (외부 의존성 0).
  - timeout: 기본 5초. `timeoutSeconds` 입력으로 override 가능.
  - status code 404 → `BUILD_NOT_FOUND` 에러 + `ok=false`.
  - status code 5xx 또는 네트워크 오류 → `BUILD_SERVER_UNREACHABLE` 에러 + `ok=false`.
- fixture / dry-run:
  - `dryRun=true` + `fixture` 가 dict 면 그 dict 를 Build Server 응답으로 사용.
  - `dryRun=true` + `fixture` 없으면 `INVALID_INPUT` (테스트/CI 환경에서 명시 요구).
- explain 위임:
  - HTTP 응답을 `build` 로 정규화 (Build Server 응답이 `data` / `result` 등으로 wrap 되어 있으면 unwrap).
  - 정규화된 dict 를 `build_status_explainer.explain()` 에 그대로 전달.

## 4. 읽기/쓰기 권한 경계

- 읽기: Build Server `GET /builds/*` endpoint. 자격증명은 MVP 단계에서 미사용 (Build Server 가 single-tenant).
- 쓰기: 없음. 본 MCP 는 조회만 한다.
- fixture / dry-run 모드는 테스트/CI 에서만 사용. 운영 호출은 dryRun=false.

## 5. 후속 구현 포인트

- TASK-017 의 `apps/skill_mcp/mcp_servers/` stdio 엔트리포인트가 본 core.py 의 `fetch_latest` 를 호출하는 형태로 묶는다.
- `buildId` 와 `userId+appName` 의 priority 분기는 `PKG-004` 의 query API 가 `GET /builds?userId=...&appName=...` 목록을 응답하는 형태로 확정될 때 더 엄격하게 좁힌다.
- `auth` 헤더 / `userId` 정규화는 `OI-001` 결정 후 본 MCP 에 주입한다.
