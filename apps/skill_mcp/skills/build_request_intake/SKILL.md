# Skill: build-request-intake

- 문서 목적: 비개발자 시나리오에서 build 요청 payload 초안을 만들 때, shared contract 의 `BuildRequest` 최소 필드 / enum 정의를 강제로 채워 `POST /builds` 에 그대로 보낼 수 있는 JSON 초안 + 누락 필드 경고를 만든다.
- 범위: `BuildRequest` payload 합성, 필드별 형식 검사, enum 정규화, 누락/오류 경고. 실제 HTTP 호출은 이 skill 의 책임이 아니다 (`apps/build-server` 가 canonical, 호출은 사용자가 직접 또는 `apps/skill_mcp/mcp_servers/latest-build-status` 등 후속 MCP 가 담당).
- 대상 독자: AI agent, 비개발자 build 요청자, Skill/MCP 구현자
- 상태: draft (v0.1.0)
- 최종 수정일: 2026-07-03
- 관련 문서:
  - canonical: [`docs/sdlc/contracts/01-shared-build-contract-baseline.md`](../../../../docs/sdlc/contracts/01-shared-build-contract-baseline.md)
  - 후보 카탈로그: [`docs/sdlc/13-skills-and-mcp-plan.md`](../../../../docs/sdlc/13-skills-and-mcp-plan.md) §3.1
  - 후속 MCP: `apps/skill_mcp/mcp_servers/latest-build-status/` (TBD)

## 1. 입출력 계약

### 1.1 입력 (JSON)

```json
{
  "userId": "<external system identifier>",
  "appName": "<human readable app key>",
  "sourceRef": "<git ref | archive path>",
  "env": { "<KEY>": "<VALUE>" }
}
```

- `userId` / `appName` / `sourceRef` / `env` 는 모두 선택. 미주어지면 경고로 표시하고, 명시적 `null` 또는 빈 문자열은 거부.
- 추가 필드(`dockerfileOverride`, `previewTtlSeconds`, 등) 는 `extra` 키로 통과시키되 shared contract 외 필드는 경고.

### 1.2 출력 (JSON)

```json
{
  "ok": true,
  "payload": { /* BuildRequest 정합 형태 */ },
  "warnings": [
    { "code": "MISSING_FIELD", "field": "userId", "message": "..." }
  ],
  "errors": [
    { "code": "INVALID_ENUM", "field": "env", "message": "..." }
  ],
  "ref": {
    "contract_doc": "docs/sdlc/contracts/01-shared-build-contract-baseline.md",
    "contract_version": "v1"
  }
}
```

- `payload` 는 `BuildRequest` 와 1:1 (canonical shape).
- `warnings` 는 사용자 노출 가능. `errors` 가 비어있지 않으면 `ok=false`.

## 2. 읽기/쓰기 권한 경계

- 읽기: shared contract 문서(`docs/sdlc/contracts/01-shared-build-contract-baseline.md`) — 구현 시 같은 디렉터리에 frozen 스냅샷을 두지 않고, 항상 canonical 경로를 따라간다.
- 쓰기: 없음. 이 skill 은 payload 초안만 만들고 실제 API 호출은 하지 않는다.

## 3. 실행 모드

| 모드 | 진입점 | 사용 |
| --- | --- | --- |
| CLI | `python3 -m apps.skill_mcp.skills.build_request_intake.cli --input <path>` 또는 stdin | AI agent 또는 사용자가 직접 호출 |
| Embed | `from apps.skill_mcp.skills.build_request_intake.core import shape; shape(input_dict)` | 다른 skill/MCP 에서 import |
| Test | `python3 -m unittest apps.skill_mcp.tests.test_build_request_intake` | 단위 테스트 |

## 4. 동작 규칙

- 정규화:
  - `userId` / `appName` / `sourceRef` 는 앞뒤 공백 제거. 빈 문자열이면 경고.
  - `env` 의 key 는 대문자 + 알파벳/숫자/`_` 만 허용. 그 외는 경고 후 그대로 통과(소스 user 가 의도적으로 사용할 수 있음).
  - `appName` 은 `^[a-z0-9][a-z0-9-]{0,62}$` 정규식으로 검증. 위반 시 `INVALID_APP_NAME` 에러.
- 누락/오류:
  - `userId` 누락 → `MISSING_FIELD` 경고 + `errors` 에 동명 코드로도 표기 (payload 생성은 시도하되 `ok=false`).
  - `appName` 누락 → `MISSING_FIELD` 경고 + `ok=false`.
  - `sourceRef` 누락 → `MISSING_FIELD` 경고 + `ok=false`.
  - `env` 가 객체가 아니면 → `INVALID_ENV` 에러.
- 알 수 없는 추가 필드:
- `extra` 키에 모아서 그대로 통과(contract 외 정보 손실 방지). `warnings` 에 `UNKNOWN_FIELD` 1건 추가.
- 서비스 DB 정책: `DATABASE_URL`, `DB_*`, `PG*` 연결 환경변수와 Dockerfile
  `ENV`/`ARG` 선언은 입력으로 받지 않는다. 위반 시
  `SERVICE_DATABASE_POLICY_VIOLATION` 오류를 반환한다. DB 사용은
  `ServiceManifest.database.enabled=true`와 migration command로만 opt-in하며,
  실제 credential은 Build Server가 Kubernetes Secret으로 런타임 주입한다.
- 결정적 출력:
  - 키 순서는 `userId` → `appName` → `sourceRef` → `env` → `extra` 로 고정. `JSON dump` 시 `sort_keys=False, indent=2`.

## 5. 후속 구현 포인트

- `apps/skill_mcp` 골격 결정 시 본 skill 디렉터리를 그대로 살릴 것 (TASK-017).
- shared contract 가 진화하면 canonical 문서 버전(`contract_version`) 을 bump 하고 본 skill 의 `core.py` 가 그 버전을 인지하도록 한다.
- 후속 MCP `latest-build-status` 와 결합 시 `payload.userId + payload.appName` 으로 `GET /builds` 목록 조회 → 동일 active build 가 있으면 payload 사용자에게 경고.
- `OI-008` (Dockerfile 생성 우선순위) 결정 시 `extra.dockerfileOverride` 의미를 그쪽 결정에 맞춰 조정.
- Dockerfile 자동 생성/추천은 `docs/design/dockerfile-generation.md`와
  `apps/skill_mcp/skills/dockerfile_template_suggest/SKILL.md`의 서비스 DB 정책을
  함께 따른다.
