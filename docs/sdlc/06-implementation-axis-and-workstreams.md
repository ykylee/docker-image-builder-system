# Docker Build And Deployment Automation Platform SDLC Step 06 - Implementation Axis And Workstreams

- 문서 목적: baseline decision 이후 어떤 구현 축부터 열어야 하는지와 초기 workstream 분해 기준을 정의한다.
- 범위: 우선 구현 축, 선행 조건, 컴포넌트별 작업 묶음, 비범위
- 대상 독자: 프로젝트 리드, 구현 담당자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-03

## 1. 결론 요약

- 우선 구현 축은 `Build Server`로 둔다.
- `Runner`는 Build Server의 queue, 상태 전이, 데이터 모델이 고정된 뒤 두 번째 축으로 연다.
- `Skill/MCP`는 세 번째 축으로 둔다.

## 2. 축별 평가

### Build Server

- `POST /builds`, 상태 조회, 로그 조회, polling facade, active build 판정 규칙을 제공한다.
- Runner와 Skill/MCP가 모두 의존하는 계약 기준점이다.

### Runner

- 실제 Docker build, container test, external deploy 실행 책임을 가진다.
- 중요하지만 queue 선점 기준, phase 기록 구조, persistence schema가 먼저 고정되어야 한다.

### Skill/MCP

- 사용자 요청을 build request로 변환하고 안내 문구를 제공한다.
- API contract와 오류 구조가 닫히기 전에는 mock 기반 이상으로 진행하기 어렵다.

## 3. 권장 구현 순서

1. `Shared Contract Baseline`
2. `Build Server Skeleton`
3. `Runner Build Skeleton`
4. `Runner Test / Deploy Policy Binding`
5. `Skill/MCP Request And Messaging Layer`

## 4. Workstream 정의

### WS-001 Shared Contract Baseline

- build request payload 초안
- build status / test status / deploy status enum 정리
- 오류 코드와 phase key 목록 초안

### WS-002 Build Server Skeleton

- build request 수신 API
- active build 판정
- build queue persistence
- build 상태 조회 API
- build 로그 조회 API의 최소 응답 구조
- job polling facade

### WS-003 Runner Build Skeleton

- build queue poll / claim
- 작업 디렉터리 준비
- Docker build phase 기록
- 실패 시 phase/error 저장

### WS-004 Runner Test / Deploy Policy Binding

- container test
- deploy adapter 호출
- cleanup ownership 연결
- concurrency slot 계산

### WS-005 Skill/MCP Request And Messaging Layer

- Git/Zip 입력 정규화
- build request 호출 client
- 상태 polling 또는 조회 orchestration
- 구조화된 오류를 사용자 문구로 매핑

## 5. 비범위

- 다중 Runner 확장
- 외부 registry 최적화
- 테스트/배포 프로토콜 다중 지원
- TTL 연장 self-service UX

## 6. 현 단계 결론

- 현재 저장소 기준 우선 구현 축은 Build Server이며, 공통 계약 고정과 함께 backlog를 분해하는 것이 다음 액션으로 가장 안정적이다.
