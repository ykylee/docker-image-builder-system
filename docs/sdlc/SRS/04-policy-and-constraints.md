# SRS 04 - Policy And Constraints

- 문서 목적: 정책 요구사항과 현재 제약 조건을 한 곳에 정리한다.
- 범위: preview 정책, naming 정책, 데이터/상태 요구사항, 제약 조건
- 대상 독자: 기획자, 설계자, 운영자
- 상태: draft
- 최종 수정일: 2026-07-02

## 1. 정책 요구사항

- `PR-001` MVP preview URL은 우선 `host + port` 방식으로 제공할 수 있어야 한다.
- `PR-002` preview URL 데이터 모델은 미래 URL 전략 변경에 중립적이어야 한다.
- `PR-003` 기본 preview TTL은 권장값 `24시간`을 기준선으로 둔다.
- `PR-004` 동일 앱의 새 preview가 준비되면 이전 preview는 교체 대상으로 취급해야 한다.
- `PR-005` 사용자 입력 이름과 시스템 정규화 이름은 구분되어야 한다.
- `PR-006` 동시에 실행 가능한 preview service 수는 운영 상한값으로 제한 가능해야 한다.
- `PR-007` build queue와 preview service queue는 분리 운영할 수 있어야 한다.

## 2. 데이터 및 상태 요구사항

- `DR-001` 시스템은 최소 `build_request`, `build_log`, `test_deployment` 수준의 데이터 모델을 가져야 한다.
- `DR-002` build 상태 모델은 `RECEIVED`부터 `COMPLETED/FAILED/CANCELLED`까지 추적 가능해야 한다.
- `DR-003` preview 상태 모델은 `QUEUED`, `RESERVED`, `STARTING`, `READY`, `FAILED`, `STOPPED`, `EXPIRED`를 다룰 수 있어야 한다.
- `DR-004` `TEST_READY`는 build 성공 handoff 상태이며 build queue 점유 상태로 유지하지 않아야 한다.

## 3. 현재 제약 조건

- 현재 저장소는 구현 전 문서 중심 단계다.
- Git 저장소 초기화가 아직 되어 있지 않다.
- 실제 인증 시스템, object storage, registry, reverse proxy는 아직 확정되지 않았다.
- 보안/격리 정책은 문서 선행 합의가 필요하다.

## 4. 설계 영향 메모

- `PR-001`과 `PR-002`는 API 응답 스키마와 preview 데이터 모델 설계에 직접 영향을 준다.
- `PR-003`과 `PR-004`, `PR-006`, `PR-007`은 preview lifecycle과 운영 자원 제어 설계에 직접 연결된다.
- `DR-004`는 active build 중복 방지 로직과 build/preview lifecycle 분리의 핵심 정책이다.
