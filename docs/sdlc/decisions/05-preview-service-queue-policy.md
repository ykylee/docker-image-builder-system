# Baseline Decision 05 - Preview Service Queue Policy

- 문서 목적: `OI-010`에 대한 Step 05 baseline decision을 정의한다.
- 범위: concurrency limit, queue admission, slot release, user guidance baseline
- 대상 독자: 프로젝트 리드, Runner 설계자, 플랫폼 운영자
- 상태: baseline
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/design/05-build-and-preview-execution-flow.md`, `docs/sdlc/design/04-data-model-design.md`, `docs/sdlc/SRS/05-open-issues-and-decisions.md`

## 1. 결정 ID

- `BD-005`
- source issue: `OI-010`

## 2. 배경

`TEST_READY` 이후 build를 `COMPLETED`로 닫으면 build queue는 해제되지만, preview 서비스가 무제한으로 증가할 위험이 있다.

따라서 build queue와 별도 preview service queue 정책이 반드시 필요하다.

## 3. 선택지

### Option A

- preview는 build 성공 시 무조건 즉시 실행, 별도 상한 없음

### Option B

- 운영 상한을 두고, 상한 도달 시 preview service queue에서 FIFO 대기

### Option C

- 앱별 우선순위나 사용자 등급 기반 가중치 queue

## 4. 이번 단계 채택안

Option B를 채택한다.

## 5. 채택 이유

- Option A는 현재 문제의식을 해결하지 못한다.
- Option C는 MVP 기준으로 정책 복잡도가 과도하다.
- Option B는 단순하고 구현 가능하며 운영 제어 포인트를 분명하게 만든다.

## 6. baseline rule

### 6.1 동시 실행 상한

- 동시에 실행 가능한 preview service 수는 운영 설정값으로 제한한다.
- 초기 baseline은 “작은 고정 상한값”을 사용한다.
- 구체 수치는 구현 직전 운영 환경 용량에 맞춰 확정한다.

### 6.2 queue admission

- build가 `IMAGE_BUILT`에 도달하면 preview service 실행 가능 여부를 확인한다.
- 상한 미도달이면 바로 `RESERVED` 단계로 진행한다.
- 상한 도달이면 `test_deployment.status = QUEUED`로 기록하고 service queue에 넣는다.

### 6.3 queue order

- MVP 기본 queue order는 FIFO를 사용한다.

### 6.4 slot release

- slot은 아래 경우 해제된다.
  - preview TTL 만료 cleanup 완료
  - 같은 앱의 더 최신 preview가 `READY`가 되어 이전 preview cleanup 완료
  - preview 실패 후 cleanup 완료

### 6.5 user guidance baseline

- queue 대기 상태는 실패가 아니라 정상 대기 상태로 안내한다.
- 권장 메시지 방향:
  - `빌드는 완료되었고 테스트용 미리보기 실행 자리를 기다리고 있습니다.`

## 7. 영향 문서

- `docs/sdlc/SRS/02-functional-requirements.md`
- `docs/sdlc/SRS/03-non-functional-requirements.md`
- `docs/sdlc/SRS/04-policy-and-constraints.md`
- `docs/sdlc/design/01-system-context-and-responsibilities.md`
- `docs/sdlc/design/04-data-model-design.md`
- `docs/sdlc/design/05-build-and-preview-execution-flow.md`
- `docs/sdlc/design/06-user-messaging-and-failure-handling.md`

## 8. 후속 보류 항목

- 우선순위 queue나 사용자 등급 정책은 MVP 이후 검토한다.
- 구체 상한값은 운영 환경 용량을 본 뒤 확정한다.
