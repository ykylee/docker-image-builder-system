# SDLC Step 13 - 우리 시스템 전용 Skill / MCP 개발 계획

- 문서 목적: 표준 AI 워크플로우 키트(`ai-workflow/`)와 별개로, **Docker Image Builder System 도메인**(Build Server / Runner / Preview / Docker orchestration) 에 직접 묶인 우리만의 skill 과 MCP 후보를 정의한다. 표준 키트의 prototype skill/MCP 와는 별도 카탈로그로 운영된다.
- 범위: 후보 정의, 우선순위, 입력/출력 계약, 수동 대체 절차, transport / 노출 시점, TASK-017 이후 구현 분해
- 대상 독자: AI agent 설계자, Build Server / Runner / Skill·MCP 구현자, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서:
  - `docs/sdlc/07-implementation-backlog-baseline.md` (PKG-008 / PKG-009)
  - `docs/sdlc/08-build-server-tech-stack-baseline.md`
  - `docs/sdlc/09-repository-package-structure-baseline.md`
  - `docs/sdlc/contracts/01-shared-build-contract-baseline.md`
  - `docs/PROJECT_PROFILE.md` §3.1 (워크플로우 키트 active/deferred 목록)
  - 표준 카탈로그: `ai-workflow/core/workflow_skill_catalog.md`, `ai-workflow/core/workflow_mcp_candidate_catalog.md`

## 1. 문서 목표

이 문서가 답해야 하는 질문:

- 표준 워크플로우 키트에 이미 있는 skill/MCP 와 우리 도메인에 필요한 skill/MCP 의 경계는 어떻게 자르는가
- 우리 도메인에 정말 필요한 skill 후보와 MCP 후보는 무엇인가
- 각 후보의 입력/출력 계약, 우선순위, 수동 대체 절차, transport 상태는 어떻게 둔다
- `PKG-008` (Skill/MCP Request Client) / `PKG-009` (Status Polling And Messaging) 의 분해 기준은 무엇인가

## 2. 표준 키트 vs 우리 도메인 후보

| 구분 | 표준 키트 (`ai-workflow/`) | 우리 도메인 (이 문서) |
| --- | --- | --- |
| 대상 | 워크플로우 운영(세션/백로그/문서) | Build Server / Runner / Preview / Docker 운영 |
| 저장 위치 | `ai-workflow/skills/`, `ai-workflow/mcp_servers/` | `apps/skill-mcp/skills/`, `apps/skill-mcp/mcp_servers/` (TASK-017 의 `apps/skill-mcp` 골격에서 결정) |
| Active 결정 문서 | `docs/PROJECT_PROFILE.md` §3.1 | 본 문서 + `docs/PROJECT_PROFILE.md` §3.2 (신설 예정) |
| Transport | `transport_ready=false` (프로토타입 단계) | MCP transport 는 TASK-017 이후 구현. stdio 우선, jsonrpc-bridge 는 후속. |
| 공통 참조 | `packages/shared-contract` (PKG-001) | `packages/shared-contract` |

원칙:

- 표준 키트의 `session-start` / `backlog-update` / `doc-sync` 와 우리 도메인 skill은 **서로 다른 계층**이다. 표준 키트는 워크플로우 운영을, 우리 도메인 skill은 Build/Preview 라이프사이클을 보조한다.
- 두 계층의 결과물은 handoff/백로그/공통 계약 baseline 으로 수렴한다.

## 3. Skill 후보 (5종)

각 skill 은 `apps/skill-mcp/skills/<name>/SKILL.md` + (선택) 실행 스크립트 형태로 둔다. 표준 키트의 prototype 과 동일한 `SKILL.md` 헤더(목적/입력/출력/읽기·쓰기 권한 경계/후속 구현 포인트) 를 따른다.

### 3.1 `build-request-intake`

- 역할: 사용자가 비개발자 시나리오에서 build 요청 payload 를 만들 때, shared contract 의 `BuildRequest` 최소 필드(`userId`, `appName`, `sourceRef`, `env`) 와 enum(`BuildStatus`, `PreviewStatus`) 을 강제로 채워 draft payload 를 생성한다.
- 입력: 사용자 의도 문장(자연어) + `docs/sdlc/contracts/01-shared-build-contract-baseline.md` 의 `BuildRequest` 정의.
- 출력: `POST /builds` 에 그대로 보낼 수 있는 JSON payload 초안 + 누락된 필드 경고.
- 읽기/쓰기: 읽기. 실제 API 호출은 `apps/build-server` 의 HTTP 클라이언트 또는 사용자가 직접 수행.
- 수동 대체: shared contract 의 §3 표를 보며 직접 JSON 을 작성.
- 우선순위: P0 — `PKG-002` 와 1:1.
- Active 시점: `PKG-001` (shared-contract) 코드 산출물이 생긴 뒤. 그 전에는 동일 입력/출력 계약을 따라 수동 절차로 운영.

### 3.2 `build-status-explainer`

- 역할: `GET /builds/{buildId}` / `GET /builds/{buildId}/logs` 응답을 받아, 비개발자 사용자가 이해할 수 있는 한국어 상태 메시지 + 다음 행동(예: preview URL 확인, 로그 라인 일부 발췌, 실패 요약) 으로 변환한다.
- 입력: Build Server 응답 JSON + (선택) 최근 N 줄의 build log.
- 출력: 사용자 노출용 짧은 문장 + 구조화된 부가 정보(`next_action` enum).
- 읽기/쓰기: 읽기. 응답 변환만 수행.
- 수동 대체: 응답을 그대로 사용자에게 보여주거나 사람이 번역.
- 우선순위: P0 — `PKG-004` 와 1:1.
- Active 시점: `PKG-004` (Build Server Query API) 가 최소 `GET /builds/{buildId}` 를 응답한 뒤.

### 3.3 `failure-summary-shaper`

- 역할: `BuildStatus=FAILED` 또는 `PreviewStatus=DEGRADED` 응답과 관련 로그 라인을 받아, `docs/sdlc/design/06-user-messaging-and-failure-handling.md` 의 사용자 메시지 규칙 + `OI-009` (실패 요약 책임) 결정을 따라 요약과 권장 다음 행동을 만든다. (책임 위치는 미결이지만, 후보 자체는 두 언어 모두 같은 입력으로 동작하도록 정의한다.)
- 입력: 실패 응답 + 관련 로그 라인 + `OI-009` 결정 문서(또는 본 문서가 그 자리에 임시 policy 를 둠).
- 출력: 한국어 2~4줄 요약 + 1줄 권장 행동.
- 읽기/쓰기: 읽기.
- 수동 대체: 실패 응답 + 로그를 사람이 보고 문장 작성.
- 우선순위: P1 — `PKG-009` 와 1:1. `OI-009` 결정 후 우선순위 재평가.
- Active 시점: `PKG-004` 와 `PKG-006` (Preview readiness) 가 모두 응답한 뒤.

### 3.4 `preview-readiness-checker`

- 역할: `PreviewStatus=READY` 가 되기 전/후에 사용자가 "preview 가 준비됐는가" 를 자주 묻는 시나리오를 위해, status 응답 + (선택) container health probe 결과를 받아 사람이 즉시 읽을 수 있는 readiness 카드를 만든다.
- 입력: build/preview status 응답 + (선택) preview URL health 응답.
- 출력: 짧은 readiness 카드 (status, container, url, ttl 남은 시간, 다음 행동).
- 읽기/쓰기: 읽기.
- 수동 대체: status 응답을 그대로 사용자에게 보여줌.
- 우선순위: P1 — `PKG-006` 와 1:1.
- Active 시점: `PKG-006` 가 readiness 응답을 제공한 뒤.

### 3.5 `contract-drift-checker`

- 역할: `packages/shared-contract` (TS) 의 `BuildRequest` / `BuildStatus` / `PreviewStatus` / `ErrorCode` 가 `docs/sdlc/contracts/01-shared-build-contract-baseline.md` 의 표/정의와 어긋나지 않는지 검사한다. Runner(Go) 측은 본 단계에서는 spec 문서 mirror 가정, drift 발생 시 경고.
- 입력: `packages/shared-contract` 코드 + shared contract 문서.
- 출력: drift 리포트(필드명/타입/enum 차이).
- 읽기/쓰기: 읽기.
- 수동 대체: 코드와 문서를 나란히 두고 사람이 diff.
- 우선순위: P0 (build server 구현 직전) → P2 (현 단계).
- Active 시점: `packages/shared-contract` 코드 첫 commit 직후.

## 4. MCP 후보 (5종)

각 MCP 는 `apps/skill-mcp/mcp_servers/<name>/MCP.md` + (선택) Python/TypeScript 구현체로 둔다. 표준 키트 prototype 의 `MCP.md` 헤더를 따른다. **현 단계(`transport_ready=false`) 에서는 동일 계약의 수동 절차로 운영**한다.

### 4.1 `latest-build-status`

- 역할: 가장 최근 동일 `userId + appName` 의 build 상태를 Build Server `GET /builds/{buildId}` 와 (필요 시) `GET /builds` 목록을 통해 조회해, 한 번의 호출로 현재 active build 의 status / phase / preview URL 을 합쳐 반환한다.
- 입력: `userId`, `appName` (필수). `buildId` (선택, 주어지면 단건 조회).
- 출력: `{ buildId, status, phase, preview: { status, url?, ttl? } }` 형태의 JSON.
- 우선순위: P0 — `PKG-002` + `PKG-004` 와 1:1.
- Active 시점: `PKG-002` 와 `PKG-004` 가 응답한 뒤.

### 4.2 `build-log-tail`

- 역할: `GET /builds/{buildId}/logs` 의 마지막 N 줄 또는 since-token 기반 incremental tail 을 반환한다. 사용자가 "최근에 뭐가 찍혔어?" 라고 물을 때 사용.
- 입력: `buildId`, `tail` (기본 200줄), `since` (선택).
- 출력: `{ lines: [...], next_since?: string }`.
- 우선순위: P0 — `PKG-004` 와 1:1.
- Active 시점: `PKG-004` 로그 endpoint 가 응답한 뒤.

### 4.3 `failure-summary`

- 역할: `BuildStatus=FAILED` / `PreviewStatus=DEGRADED` 응답을 받아, 관련 로그와 contract 의 `ErrorCode` 매핑으로 사용자 노출용 짧은 요약을 만들어 반환. `OI-009` 결정 후 책임 위치(Build Server / Skill·MCP) 가 정해지면 그쪽에 구현.
- 입력: `buildId`.
- 출력: `{ summary: string, error_code: string, next_action: enum }`.
- 우선순위: P1 — `PKG-009` 와 1:1.
- Active 시점: `failure-summary-shaper` skill 이 정의된 뒤, 그 skill 을 감싸는 thin MCP.

### 4.4 `preview-ttl`

- 역할: preview 의 TTL(만료 시각) 조회 / 연장 요청. `OI-006` 결정(누가 TTL 연장을 처리하는가) 후 책임 위치 확정.
- 입력: `buildId` (필수), `extend_seconds` (연장 시).
- 출력: `{ ttl_remaining_seconds, expires_at, extended: boolean }`.
- 우선순위: P2 — `OI-006` 결정 후 우선순위 재평가.
- Active 시점: `OI-006` 결정 + `PKG-007` (Preview Cleanup) 응답 후.

### 4.5 `dockerfile-template-suggest`

- 역할: source repository 의 stack(언어/프레임워크) 신호 + `OI-008` (Dockerfile 생성 우선순위) 결정을 받아, 기본 Dockerfile 템플릿 후보를 추천. 자동 생성은 `OI-008` 의 우선순위에 따라 보류/제한.
- 입력: `sourceRef`, (선택) detected stack 정보.
- 출력: `{ template_name, rationale, placeholders }`.
- 우선순위: P2 — `OI-008` 결정 후 우선순위 재평가.
- Active 시점: `OI-008` 결정 + Runner(Go) 가 Dockerfile 을 실제로 빌드하기 시작한 뒤.

## 5. 우선순위 / 선후관계 요약

```
PKG-001 (shared contract)
   ↓
[skill] contract-drift-checker (P0/P2)
[MCP]  latest-build-status (P0)
[MCP]  build-log-tail (P0)
[skill] build-request-intake (P0)
[skill] build-status-explainer (P0)

PKG-002/003/004 (Build Server API)
   ↓
[skill] failure-summary-shaper (P1)
[MCP]  failure-summary (P1)
[skill] preview-readiness-checker (P1)

PKG-005/006/007 (Runner / Preview)
   ↓
[MCP]  preview-ttl (P2, OI-006 후)
[MCP]  dockerfile-template-suggest (P2, OI-008 후)
```

## 6. Active 결정 / 노출 시점

- `apps/skill-mcp/` 디렉터리 골격과 skill/MCP 디렉터리 컨벤션은 TASK-017 의 `apps/skill-mcp` 결정에서 함께 확정한다.
- 본 문서에서 P0 으로 분류된 후보는 TASK-017 종료 시점에 한 번 더 active/deferred 재평가한다. `transport_ready=false` 인 동안 동일 입력/출력 계약의 **수동 절차**로 운영한다.
- `PKG-008` (Skill/MCP Request Client) 의 구현 분해 시 본 문서의 skill 5종을 1:1 매핑으로 다루고, `PKG-009` 의 분해 시 MCP 5종을 같은 방식으로 다룬다.

## 7. transport / 보안 메모

- 모든 MCP 는 MVP 단계에서 stdio 기반 단일 tenant 만 가정한다. multi-tenant / OAuth 확장은 보류.
- preview URL / build log 같은 출력은 사용자 의도 확인 후 노출. 본 단계에서는 `buildId` 를 모르는 제3자가 호출할 수 없다고 가정.
- 계약 외부 입력(`userId`, `appName`) 은 canonical source (외부 인증 시스템) 의 신뢰에 의존한다. `OI-001` 결정 전까지는 식별자 정규화 규칙을 본 문서에 두지 않는다.

## 8. 다음 액션

- [ ] TASK-017 에서 `apps/skill-mcp/` 골격 + `SKILL.md` / `MCP.md` 헤더 컨벤션 확정
- [ ] 본 문서를 기준으로 `docs/PROJECT_PROFILE.md` §3.2 "우리 도메인 active skill/MCP" 신설
- [ ] `PKG-008` / `PKG-009` 의 구현 분해를 본 문서 표와 1:1 로 정렬
- [ ] `OI-006` / `OI-008` / `OI-009` 결정 후 해당 후보의 우선순위 / 책임 위치 재평가
- [ ] `transport_ready=true` 전환 시점(표준 키트 측 transport 구현 + Build Server API 가용) 에 본 문서 §6 의 active 목록을 한 번 더 좁힘

## 9. 현 단계 결론

- 우리 시스템은 Build Server + Runner + Preview 라는 명확한 도메인 경계를 가지고 있어, 표준 워크플로우 키트와 별도의 skill/MCP 카탈로그가 필요하다.
- 본 문서에서 정의한 skill 5종 / MCP 5종은 `PKG-008` / `PKG-009` 의 분해 기준이 되며, TASK-017 종료 시점에 active/deferred 가 한 번 더 결정된다.
- 모든 후보는 `transport_ready=false` 인 동안 동일 입력/출력 계약의 수동 절차로 운영된다.
