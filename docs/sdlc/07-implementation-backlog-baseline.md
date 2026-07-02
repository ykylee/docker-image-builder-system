# Docker Build Preview Platform SDLC Step 07 - Implementation Backlog Baseline

- 문서 목적: Step 06의 구현 축과 workstream을 실제 실행 가능한 backlog 패키지로 분해한다.
- 범위: workstream별 작업 항목, 선후관계, 완료 기준, traceability 규칙
- 대상 독자: 프로젝트 리드, 구현 담당자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/06-implementation-axis-and-workstreams.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`, `docs/sdlc/design/`

## 1. 문서 목표

이 문서는 Step 06에서 정의한 우선 구현 축을 실제 구현 backlog로 연결하기 위한 기준선이다.

이 문서가 답해야 하는 질문:

- 무엇부터 만들고 무엇을 뒤로 미뤄야 하는가
- 각 작업 항목은 어떤 요구사항과 설계 문서를 근거로 하는가
- 각 작업 묶음의 완료 기준은 무엇인가

## 2. 운영 원칙

- 모든 구현 항목은 `TASK` 또는 `PKG` 단위로 식별한다.
- 각 항목은 최소 하나 이상의 `Refs:`를 가진다.
- 각 항목은 `Depends on:`으로 선행 작업 또는 기준 문서를 적는다.
- 각 항목은 코드 구현 전에도 문서/계약/스키마 수준 완료 기준을 가질 수 있어야 한다.

기본 템플릿:

```text
PKG-ID
목표:
범위:
Refs:
Depends on:
Done when:
```

## 3. 구현 패키지 개요

| 패키지 | 이름 | 축 | 우선순위 |
| --- | --- | --- | --- |
| `PKG-001` | Shared Contract Baseline | Shared | P0 |
| `PKG-002` | Build Server Request Intake | Build Server | P0 |
| `PKG-003` | Build Server State And Queue Persistence | Build Server | P0 |
| `PKG-004` | Build Server Query API | Build Server | P0 |
| `PKG-005` | Runner Claim And Build Phase Skeleton | Runner | P1 |
| `PKG-006` | Preview Service Queue And Readiness | Runner | P1 |
| `PKG-007` | Preview Cleanup Policy Binding | Runner | P1 |
| `PKG-008` | Skill/MCP Request Client | Skill/MCP | P2 |
| `PKG-009` | Skill/MCP Status Polling And Messaging | Skill/MCP | P2 |
| `PKG-010` | Medium Priority Decision Closure | Cross-cutting | P2 |

## 4. P0 패키지

### PKG-001 Shared Contract Baseline

- 목표: 공통 request, status, error, phase contract를 고정한다.
- 범위:
  - build request payload 필드 목록
  - build status / preview status enum
  - phase key 및 error code naming 규칙
  - backlog `Refs:` 템플릿
- Refs: `MVP-FR-007`, `MVP-FR-012`, `MVP-FR-013`, `MVP-FR-019`, `MVP-DR-001`, `MVP-DR-002`
- Depends on: `docs/sdlc/design/03-api-contract-design.md`, `docs/sdlc/design/04-data-model-design.md`, `BD-001`, `BD-002`, `BD-003`
- Done when:
  - payload/status/error/phase 초안이 하나의 기준 문서로 정리된다
  - Build Server와 Runner가 공유할 key 이름이 문서에 고정된다
  - 후속 패키지가 참조할 수 있는 `Refs:` 표기 예시가 정의된다

### PKG-002 Build Server Request Intake

- 목표: Build Server가 build request를 안정적으로 접수하는 최소 골격을 정의한다.
- 범위:
  - `POST /builds` 요청/응답 구조
  - active build 판정 규칙
  - idempotency 또는 중복 판정 정책
  - source archive 메타 필드 정의
- Refs: `MVP-FR-007`, `MVP-FR-008`, `MVP-FR-009`, `MVP-FR-010`, `MVP-NFR-003`
- Depends on: `PKG-001`, `docs/sdlc/design/03-api-contract-design.md`, `BD-001`
- Done when:
  - request intake 흐름이 문서 또는 인터페이스 초안으로 고정된다
  - 중복 build 차단 기준이 명시된다
  - 최소 저장 필드와 검증 오류 반환 기준이 정리된다

### PKG-003 Build Server State And Queue Persistence

- 목표: build queue와 preview service queue의 저장 구조를 정의한다.
- 범위:
  - build 레코드 schema
  - preview service 레코드 schema
  - queue claim 대상 필드
  - log/event 저장 기준
- Refs: `MVP-FR-008`, `MVP-FR-011`, `MVP-FR-016`, `MVP-FR-018`, `MVP-DR-001`, `MVP-DR-002`, `MVP-DR-003`
- Depends on: `PKG-001`, `docs/sdlc/design/04-data-model-design.md`, `BD-004`, `BD-005`
- Done when:
  - build와 preview service 저장 모델이 분리 정의된다
  - queue 조회와 claim에 필요한 필드가 닫힌다
  - 상태/로그 저장 시점이 설계 문서와 충돌 없이 연결된다

### PKG-004 Build Server Query API

- 목표: build 상태, 로그, preview 정보를 조회하는 최소 API 기준을 정한다.
- 범위:
  - `GET /builds/{id}`
  - `GET /builds/{id}/logs`
  - preview 상태/URL 노출 필드
  - 사용자 메시지 계층이 소비할 최소 응답 형태
- Refs: `MVP-FR-012`, `MVP-FR-013`, `MVP-FR-017`, `MVP-FR-018`, `MVP-FR-019`, `MVP-NFR-001`
- Depends on: `PKG-001`, `PKG-003`, `docs/sdlc/design/03-api-contract-design.md`, `docs/sdlc/design/06-user-messaging-and-failure-handling.md`
- Done when:
  - 상태 조회와 로그 조회 응답 형태가 정의된다
  - preview URL과 preview 상태 노출 규칙이 문서화된다
  - Skill/MCP가 polling에 사용할 최소 contract가 준비된다

## 5. P1 패키지

### PKG-005 Runner Claim And Build Phase Skeleton

- 목표: Runner가 build queue를 선점하고 build phase를 기록하는 최소 골격을 정의한다.
- 범위:
  - queue poll / claim 순서
  - 작업 디렉터리 준비
  - Docker build phase 기록
  - 실패 시 error/phase 저장
- Refs: `MVP-FR-014`, `MVP-FR-015`, `MVP-FR-016`, `MVP-FR-019`, `MVP-NFR-004`
- Depends on: `PKG-003`, `docs/sdlc/design/05-build-and-preview-execution-flow.md`
- Done when:
  - Runner 선점-실행-기록 순서가 task 단위로 분해된다
  - phase 이름과 실패 기록 위치가 닫힌다

### PKG-006 Preview Service Queue And Readiness

- 목표: preview service queue와 readiness 기록 흐름을 정의한다.
- 범위:
  - preview service `QUEUED`
  - slot 할당 기준
  - readiness check
  - `TEST_READY` handoff와 `COMPLETED` 종료 연결
- Refs: `MVP-FR-017`, `MVP-FR-018`, `MVP-NFR-005`, `MVP-PR-001`, `MVP-PR-005`
- Depends on: `PKG-003`, `PKG-005`, `BD-002`, `BD-005`
- Done when:
  - preview service queue 진입/해제 규칙이 정리된다
  - readiness 성공 이후 build 종료 처리 기준이 명시된다

### PKG-007 Preview Cleanup Policy Binding

- 목표: TTL 만료와 replacement cleanup 흐름을 실행 작업으로 연결한다.
- 범위:
  - cleanup trigger
  - cleanup ownership
  - 실패 시 재시도/운영자 개입 기준
- Refs: `MVP-FR-020`, `MVP-FR-021`, `MVP-NFR-006`, `MVP-PR-004`
- Depends on: `PKG-006`, `BD-004`
- Done when:
  - cleanup 발생 조건과 책임 주체가 작업 패키지 기준으로 닫힌다
  - 운영 개입 포인트가 분리된다

## 6. P2 패키지

### PKG-008 Skill/MCP Request Client

- 목표: Skill/MCP가 Build Server request contract를 소비하는 최소 client 흐름을 정의한다.
- 범위:
  - source archive 준비
  - build request 호출
  - 요청 실패의 재시도 여부
- Refs: `MVP-FR-001`, `MVP-FR-002`, `MVP-FR-007`, `MVP-NFR-001`
- Depends on: `PKG-002`, `PKG-004`
- Done when:
  - Skill/MCP 요청 경계와 서버 호출 책임이 정리된다
  - request 실패 시 사용자 안내의 입력 구조가 정해진다

### PKG-009 Skill/MCP Status Polling And Messaging

- 목표: Skill/MCP가 build 상태를 조회하고 사용자 메시지로 변환하는 흐름을 정의한다.
- 범위:
  - polling or fetch orchestration
  - 상태별 메시지 조립
  - preview 대기/실패/준비 상태 안내
- Refs: `MVP-FR-003`, `MVP-FR-012`, `MVP-FR-013`, `MVP-FR-019`, `MVP-NFR-002`, `MVP-NFR-008`
- Depends on: `PKG-004`, `docs/sdlc/design/06-user-messaging-and-failure-handling.md`
- Done when:
  - 상태 조회 결과를 사용자 문구로 바꾸는 경계가 정리된다
  - 서버 책임과 Skill/MCP 책임이 메시지 레벨에서 분리된다

### PKG-010 Medium Priority Decision Closure

- 목표: 구현 전 또는 구현 병행으로 남은 medium priority decision을 닫는다.
- 범위:
  - `OI-008` Dockerfile 생성 정책
  - `OI-009` 실패 요약 생성 책임
  - `OI-006` TTL 연장 요청 처리
- Refs: `OI-006`, `OI-008`, `OI-009`
- Depends on: `docs/sdlc/SRS/05-open-issues-and-decisions.md`
- Done when:
  - 각 항목에 대해 baseline 또는 defer 결정이 기록된다
  - 영향 문서 목록이 함께 갱신된다

## 7. 선후관계

1. `PKG-001`
2. `PKG-002`, `PKG-003`
3. `PKG-004`, `PKG-005`
4. `PKG-006`
5. `PKG-007`, `PKG-008`
6. `PKG-009`, `PKG-010`

## 8. 다음 액션 권장

- `PKG-001`을 바로 작성 가능한 계약 문서 작업으로 시작
- Build Server 기술 스택 결정 문서를 별도 추가
- 저장소 패키지 구조 초안을 `apps/` 또는 `services/` 기준으로 검토

## 9. 현 단계 결론

- Step 07 기준으로 구현은 더 이상 추상 workstream 수준이 아니라 실제 backlog 패키지 수준으로 내려왔다.
- 다음 단계는 `PKG-001`과 Build Server 기술 스택 결정을 통해 문서 중심 SDLC에서 초기 구현 준비 단계로 전환하는 것이다.
