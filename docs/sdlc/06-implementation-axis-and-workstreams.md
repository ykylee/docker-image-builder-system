# Docker Build Preview Platform SDLC Step 06 - Implementation Axis And Workstreams

- 문서 목적: baseline decision 이후 어떤 구현 축부터 열어야 하는지와 초기 workstream 분해 기준을 정의한다.
- 범위: 우선 구현 축, 선행 조건, 컴포넌트별 작업 묶음, 비범위
- 대상 독자: 프로젝트 리드, 구현 담당자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/05-design-closure-and-step-05-entry.md`, `docs/sdlc/SRS/05-open-issues-and-decisions.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`, `docs/sdlc/design/`

## 1. 문서 목표

이 문서는 Step 05에서 닫은 baseline decision을 실제 구현 backlog로 연결하기 위한 첫 번째 기준 문서다.

이 문서가 답해야 하는 질문:

- Build Server / Runner / Skill-MCP 중 어디부터 구현을 시작해야 하는가
- 어떤 작업은 선행 축이 닫혀야 시작할 수 있는가
- 초기 구현 backlog는 어떤 묶음으로 쪼개는 것이 안전한가

## 2. 결론 요약

- 우선 구현 축은 `Build Server`로 둔다.
- `Runner`는 Build Server의 queue, 상태 전이, 데이터 모델이 고정된 뒤 두 번째 축으로 연다.
- `Skill/MCP`는 사용자 상호작용 품질에 중요하지만, MVP의 system-of-record가 먼저 고정되어야 하므로 세 번째 축으로 둔다.
- 단, 세 축 모두가 소비하는 공통 계약 정의는 Build Server 착수와 함께 병행할 수 있다.

## 3. 우선 구현 축 선정 기준

### 3.1 선정 원칙

- 다른 축의 입력 계약을 제공하는 컴포넌트를 먼저 구현한다.
- 상태 전이와 queue 정책을 기록하는 system-of-record를 먼저 고정한다.
- 문서에서 이미 닫힌 baseline decision을 가장 많이 흡수하는 축을 먼저 선택한다.

### 3.2 축별 평가

#### Build Server

- `POST /builds`, 상태 조회, 로그 조회, active build 판정 규칙을 제공한다.
- `OI-001`, `OI-004`, `OI-005`, `OI-010`의 결과를 가장 직접적으로 반영한다.
- Runner와 Skill/MCP가 모두 의존하는 계약 기준점이다.

#### Runner

- 실제 Docker build, preview 기동, cleanup 실행 책임을 가진다.
- 중요하지만 queue 선점 기준, phase 기록 구조, preview service queue schema가 먼저 고정되어야 한다.
- 단독 선행 구현 시 재작업 위험이 상대적으로 크다.

#### Skill/MCP

- 사용자 요청을 build request로 변환하고 안내 문구를 제공한다.
- API contract와 오류 구조가 닫히기 전에는 mock 기반 이상으로 진행하기 어렵다.
- 사용자 경험 문구는 빠르게 작성할 수 있지만 서버 계약이 바뀌면 연결 비용이 커진다.

## 4. 권장 구현 순서

1. `Shared Contract Baseline`
2. `Build Server Skeleton`
3. `Runner Skeleton`
4. `Preview Service Worker Policy Binding`
5. `Skill/MCP Request And Messaging Layer`

## 5. Workstream 정의

### 5.1 WS-001 Shared Contract Baseline

- 목표: 세 축이 공통으로 사용하는 최소 계약을 고정한다.
- 포함 범위:
  - build request payload 초안
  - build status / preview status enum 정리
  - 오류 코드와 phase key 목록 초안
  - traceability용 `Refs:` 규칙을 backlog task 템플릿에 반영
- 주요 참조:
  - `03-api-contract-design.md`
  - `04-data-model-design.md`
  - `06-user-messaging-and-failure-handling.md`

### 5.2 WS-002 Build Server Skeleton

- 목표: Build Server를 system-of-record로 세우는 최소 골격을 만든다.
- 포함 범위:
  - build request 수신 API
  - active build 판정
  - build queue / preview service queue persistence
  - build 상태 조회 API
  - build 로그 조회 API의 최소 응답 구조
- 선행 조건:
  - `BD-001`, `BD-002`, `BD-003`, `BD-005` baseline 유지

### 5.3 WS-003 Runner Skeleton

- 목표: `QUEUED` build를 선점하고 상태 전이를 기록하는 실행 골격을 만든다.
- 포함 범위:
  - build queue poll / claim
  - 작업 디렉터리 준비
  - Docker build phase 기록
  - 실패 시 phase/error 저장
- 선행 조건:
  - WS-002 완료 또는 최소 API/DB 계약 고정

### 5.4 WS-004 Preview Service Worker Policy Binding

- 목표: preview service queue, 동시 실행 상한, cleanup ownership을 실행 정책으로 연결한다.
- 포함 범위:
  - preview service `QUEUED` 등록
  - concurrency slot 계산
  - readiness 기록
  - TTL 만료 및 replacement cleanup
- 선행 조건:
  - `BD-004`, `BD-005` baseline 유지
  - Runner phase/event 기록 구조 존재

### 5.5 WS-005 Skill/MCP Request And Messaging Layer

- 목표: 사용자 요청을 안전하게 Build Server 계약에 연결하고 상태/실패 안내를 조립한다.
- 포함 범위:
  - source archive 준비
  - build request 호출 client
  - 상태 polling 또는 조회 orchestration
  - 구조화된 오류를 사용자 문구로 매핑
- 선행 조건:
  - WS-001, WS-002의 계약 고정
  - `OI-009`가 아직 미결이어도 서버 오류 코드 구조는 먼저 소비 가능

## 6. 비범위

- 다중 Runner 확장
- 외부 registry 최적화
- preview 인증 강제 계층 추가
- TTL 연장 self-service UX
- branch/environment 다중 namespace

## 7. 다음 문서 작업 권장

- `TASK-006` 구현 backlog 문서 초안 추가
- `OI-008`, `OI-009`, `OI-006`에 대한 medium priority decision 문서화 착수 여부 결정
- Build Server 기준 기술 스택과 저장소 패키지 구조 초안 정리

## 8. 현 단계 결론

- Step 05까지는 설계 closure와 baseline decision 정리에 초점이 있었고, Step 06부터는 구현 순서와 workstream 정의가 중심이 된다.
- 현재 저장소 기준 우선 구현 축은 Build Server이며, 공통 계약 고정과 함께 backlog를 분해하는 것이 다음 액션으로 가장 안정적이다.
