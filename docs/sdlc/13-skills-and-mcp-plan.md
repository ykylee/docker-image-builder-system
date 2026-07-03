# SDLC Step 13 - 우리 시스템 전용 Skill / MCP 개발 계획

- 문서 목적: 표준 AI 워크플로우 키트(`ai-workflow/`)와 별개로, **Docker Image Builder System 도메인**(Build Server / Runner / container test / external deployment) 에 직접 묶인 우리만의 skill 과 MCP 후보를 정의한다.
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
| 대상 | 워크플로우 운영(세션/백로그/문서) | Build Server / Runner / build-test-deploy 운영 |
| 저장 위치 | `ai-workflow/skills/`, `ai-workflow/mcp_servers/` | `apps/skill_mcp/skills/`, `apps/skill_mcp/mcp_servers/` (TASK-017 의 `apps/skill_mcp` 골격에서 결정) |
| Active 결정 문서 | `docs/PROJECT_PROFILE.md` §3.1 | 본 문서 + `docs/PROJECT_PROFILE.md` §3.2 |
| Transport | `transport_ready=false` (프로토타입 단계) | MCP transport 는 TASK-017 이후 구현. stdio 우선, jsonrpc-bridge 는 후속. |
| 공통 참조 | workflow memory 문서 | `packages/shared-contract` |

원칙:

- 표준 키트의 `session-start` / `backlog-update` / `doc-sync` 와 우리 도메인 skill은 **서로 다른 계층**이다. 표준 키트는 워크플로우 운영을, 우리 도메인 skill은 build/test/deploy 라이프사이클을 보조한다.
- 두 계층의 결과물은 handoff/백로그/공통 계약 baseline 으로 수렴한다.

## 3. Skill 후보 (5종)

각 skill 은 `apps/skill_mcp/skills/<name>/SKILL.md` + (선택) 실행 스크립트 형태로 둔다. 표준 키트의 prototype 과 동일한 `SKILL.md` 헤더(목적/입력/출력/읽기·쓰기 권한 경계/후속 구현 포인트) 를 따른다.

### 3.1 `build-request-intake`

- 역할: 사용자가 비개발자 시나리오에서 build 요청 payload 를 만들 때, shared contract 의 `BuildRequest` 최소 필드(`userId`, `appName`, `sourceRef`, `env`) 와 enum 을 강제로 채워 draft payload 를 생성한다.
- 입력: 사용자 의도 문장(자연어) + `docs/sdlc/contracts/01-shared-build-contract-baseline.md` 의 `BuildRequest` 정의.
- 출력: `POST /builds` 에 그대로 보낼 수 있는 JSON payload 초안 + 누락된 필드 경고.
- 읽기/쓰기: 읽기. 실제 API 호출은 `apps/build-server` 의 HTTP 클라이언트 또는 사용자가 직접 수행.
- 수동 대체: shared contract 의 입력 표를 보며 직접 JSON 을 작성.
- 우선순위: P0 — `PKG-002` 와 1:1.
- Active 시점: `PKG-001` (shared-contract) 코드 산출물이 생긴 뒤. 그 전에는 동일 입력/출력 계약을 따라 수동 절차로 운영.

### 3.2 `build-status-explainer`

- 역할: `GET /builds/{buildId}` / `GET /builds/{buildId}/logs` 응답을 받아, 비개발자 사용자가 이해할 수 있는 한국어 상태 메시지와 다음 행동으로 변환한다.
- 입력: Build Server 응답 JSON + (선택) 최근 N 줄의 build log.
- 출력: 사용자 노출용 짧은 문장 + 구조화된 부가 정보(`next_action` enum).
- 읽기/쓰기: 읽기. 응답 변환만 수행.
- 수동 대체: 응답을 그대로 사용자에게 보여주거나 사람이 번역.
- 우선순위: P0 — `PKG-004` 와 1:1.
- Active 시점: `PKG-004` (Build Server Query API) 가 최소 `GET /builds/{buildId}` 를 응답한 뒤.

### 3.3 `failure-summary-shaper`

- 역할: `FAILED` 상태 또는 테스트/배포 서브상태 실패 응답과 관련 로그 라인을 받아, `docs/sdlc/design/06-user-messaging-and-failure-handling.md` 의 사용자 메시지 규칙과 `OI-009` (실패 요약 책임) 결정을 따라 요약과 권장 다음 행동을 만든다.
- 입력: 실패 응답 + 관련 로그 라인 + `OI-009` 결정 문서(또는 본 문서의 임시 정책).
- 출력: 한국어 2~4줄 요약 + 1줄 권장 행동.
- 읽기/쓰기: 읽기.
- 수동 대체: 실패 응답 + 로그를 사람이 보고 문장 작성.
- 우선순위: P1 — `PKG-009` 와 1:1. `OI-009` 결정 후 우선순위 재평가.
- Active 시점: `PKG-004` 와 테스트/배포 상태 조회 응답이 모두 나온 뒤.

### 3.4 `runtime-readiness-checker`

- 역할: 컨테이너 테스트 단계에서 사용자가 "지금 실행 가능한 상태인가" 를 자주 묻는 시나리오를 위해, status 응답 + (선택) health probe 결과를 받아 사람이 즉시 읽을 수 있는 readiness 카드를 만든다.
- 입력: build/test status 응답 + (선택) runtime health 응답.
- 출력: 짧은 readiness 카드 (`status`, `container`, `health`, `port`, `runtime_expires_at?`, `next_action`).
- 읽기/쓰기: 읽기.
- 수동 대체: status 응답을 그대로 사용자에게 보여줌.
- 우선순위: P1 — `PKG-006` 와 1:1.
- Active 시점: `PKG-006` 가 readiness 응답을 제공한 뒤.

### 3.5 `contract-drift-checker`

- 역할: `packages/shared-contract` 의 주요 schema 와 `docs/sdlc/contracts/01-shared-build-contract-baseline.md` 의 표/정의가 어긋나지 않는지 검사한다.
- 입력: `packages/shared-contract` 코드 + shared contract 문서.
- 출력: drift 리포트(필드명/타입/enum 차이).
- 읽기/쓰기: 읽기.
- 수동 대체: 코드와 문서를 나란히 두고 사람이 diff.
- 우선순위: P0 (build server 구현 직전) → P2 (현 단계).
- Active 시점: `packages/shared-contract` 코드 첫 commit 직후.

## 4. MCP 후보 (5종)

각 MCP 는 `apps/skill_mcp/mcp_servers/<name>/MCP.md` + (선택) Python/TypeScript 구현체로 둔다. 표준 키트 prototype 의 `MCP.md` 헤더를 따른다. 현 단계(`transport_ready=false`) 에서는 동일 계약의 수동 절차로 운영한다.

### 4.1 `latest-build-status`

- 역할: 가장 최근 동일 `userId + appName` 의 build 상태를 Build Server 조회 API 로 가져와, 한 번의 호출로 현재 build / test / deploy 상태를 합쳐 반환한다.
- 입력: `userId`, `appName` (필수). `buildId` (선택, 주어지면 단건 조회).
- 출력: `{ buildId, build, test, deploy }` 형태의 JSON.
- 예시:

```json
{
  "buildId": "bld_123",
  "build": { "status": "BUILD_SUCCESS", "phase": "BUILDING" },
  "test": { "status": "TESTING", "health": "pending" },
  "deploy": { "status": "NOT_STARTED" }
}
```

- 우선순위: P0 — `PKG-002` + `PKG-004` 와 1:1.
- Active 시점: `PKG-002` 와 `PKG-004` 가 응답한 뒤.

### 4.2 `build-log-tail`

- 역할: `GET /builds/{buildId}/logs` 의 마지막 N 줄 또는 since-token 기반 incremental tail 을 반환한다.
- 입력: `buildId`, `tail` (기본 200줄), `since` (선택).
- 출력: `{ lines: [...], next_since?: string }`.
- 우선순위: P0 — `PKG-004` 와 1:1.
- Active 시점: `PKG-004` 로그 endpoint 가 응답한 뒤.

### 4.3 `failure-summary`

- 역할: 실패한 build/test/deploy 상태를 받아, 관련 로그와 contract 의 `ErrorCode` 매핑으로 사용자 노출용 짧은 요약을 만들어 반환한다.
- 입력: `buildId`.
- 출력: `{ summary: string, error_code: string, next_action: enum }`.
- 우선순위: P1 — `PKG-009` 와 1:1.
- Active 시점: `failure-summary-shaper` skill 이 정의된 뒤, 그 skill 을 감싸는 thin MCP.

### 4.4 `runtime-lease`

- 역할: 테스트 runtime 의 만료 시각 조회 또는 제한적 연장 요청을 다룬다. 임시 runtime 이 없는 배포 대상에서는 no-op 또는 not-applicable 응답을 반환한다.
- 입력: `buildId` (필수), `extend_seconds` (선택).
- 출력: `{ runtime_expires_at, ttl_remaining_seconds, extended: boolean, applicable: boolean }`.
- 우선순위: P2 — runtime lease 정책 결정 후 우선순위 재평가.
- Active 시점: `PKG-007` (runtime cleanup) 응답 후.

### 4.5 `dockerfile-template-suggest`

- 역할: source repository 의 stack 신호와 Dockerfile 생성 정책을 받아, 기본 Dockerfile 템플릿 후보를 추천한다.
- 입력: `sourceRef`, (선택) detected stack 정보.
- 출력: `{ template_name, rationale, placeholders }`.
- 우선순위: P2 — Dockerfile 자동 생성 정책 결정 후 우선순위 재평가.
- Active 시점: Runner 가 Dockerfile 기반 build 를 실제 수행한 뒤.

## 5. 우선순위 / 선후관계 요약

```text
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
[skill] runtime-readiness-checker (P1)

PKG-005/006/007 (Runner / test runtime / cleanup)
   ↓
[MCP]  runtime-lease (P2)
[MCP]  dockerfile-template-suggest (P2)
```

## 6. Active 결정 / 노출 시점

- `apps/skill_mcp/` 디렉터리 골격과 skill/MCP 디렉터리 컨벤션은 TASK-017 의 `apps/skill_mcp` 결정에서 함께 확정한다.
- 본 문서에서 P0 으로 분류된 후보는 TASK-017 종료 시점에 한 번 더 active/deferred 재평가한다. `transport_ready=false` 인 동안 동일 입력/출력 계약의 수동 절차로 운영한다.
- `PKG-008` 의 구현 분해 시 본 문서의 skill 5종을 1:1 매핑으로 다루고, `PKG-009` 의 분해 시 MCP 5종을 같은 방식으로 다룬다.

## 7. transport / 보안 메모

- 모든 MCP 는 MVP 단계에서 stdio 기반 단일 tenant 만 가정한다. multi-tenant / OAuth 확장은 보류.
- build log, 테스트 runtime 정보, 외부 배포 결과 같은 출력은 사용자 의도 확인 후 노출한다.
- 임시 runtime URL 이 존재하더라도 기본 가정은 "검토용 제한 자원"이며, 항상 제공된다고 가정하지 않는다.
- 계약 외부 입력(`userId`, `appName`) 은 canonical source 의 신뢰에 의존한다. 식별자 정규화 규칙은 별도 decision 에서 닫는다.

## 8. 다음 액션

- [ ] TASK-017 에서 `apps/skill_mcp/` 골격 + `SKILL.md` / `MCP.md` 헤더 컨벤션 확정
- [ ] 본 문서를 기준으로 `docs/PROJECT_PROFILE.md` §3.2 "우리 도메인 active skill/MCP" 정합성 재점검
- [ ] `PKG-008` / `PKG-009` 의 구현 분해를 본 문서 표와 1:1 로 정렬
- [ ] runtime lease / Dockerfile 생성 / 실패 요약 책임 결정 후 해당 후보의 우선순위와 책임 위치 재평가
- [ ] `transport_ready=true` 전환 시점에 본 문서 §6 의 active 목록을 한 번 더 좁힘

## 9. 현 단계 결론

- 우리 시스템은 Build Server + Runner + container test + external deployment 라는 명확한 도메인 경계를 가지고 있어, 표준 워크플로우 키트와 별도의 skill/MCP 카탈로그가 필요하다.
- 본 문서에서 정의한 skill 5종 / MCP 5종은 `PKG-008` / `PKG-009` 의 분해 기준이 되며, TASK-017 종료 시점에 active/deferred 가 한 번 더 결정된다.
- 모든 후보는 `transport_ready=false` 인 동안 동일 입력/출력 계약의 수동 절차로 운영된다.

## 10. TASK-061 contract rename (canonical v2)

- **2026-07-03 (TASK-061)**: SKILL §3.2 (`build-status-explainer`) / §3.3 (`failure-summary-shaper`) / §3.4 (현재 디렉터리명 `preview-readiness_checker`, 내부 도메인은 `container-test-readiness-checker`) / §3.5 (`contract-drift-checker`) + MCP §4.1 (`latest-build-status`) / §4.3 (`failure-summary`) 5종 모두 canonical contract v2 로 정렬.
  - 도입: `apps/skill_mcp/contract/canonical.py` — Python skill/MCP 측 canonical enum 단일 source-of-truth (TS `packages/shared-contract` 와 동기).
  - 정렬 표면: canonical 12 `BuildStatus` / 5 `ExecutionStatus` / 11 `BuildPhase` / 8 `ErrorCode` / 8 `NextAction` / 7 `ReadinessState`. (legacy `OPEN_PREVIEW`, `source: build/preview` 는 forward-compat shim 으로만 consume.)
  - `contract-drift-checker` 가 이제 TS↔canonical.md + Python↔TS 양쪽을 cross-check (drift 0 보장).
  - 디렉터리명 `preview-readiness_checker` 는 import path 호환성 + CI smoke script 호환성을 위해 그대로 둠 (내부 도메인 이름만 container-test-readiness 로 정렬).
- 회귀: 221 tests OK (전 TASK 누적 215 → +6). v1 → v2 contract_version / explanation_version / skill_version / mcp_version 동시 bump.
