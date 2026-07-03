# SRS 04 - Policy And Constraints

- 문서 목적: 정책 요구사항과 현재 제약 조건을 한 곳에 정리한다.
- 범위: 실행 결과 노출 정책, naming 정책, 데이터/상태 요구사항, 제약 조건
- 대상 독자: 기획자, 설계자, 운영자
- 상태: draft
- 최종 수정일: 2026-07-03

## 1. 정책 요구사항

- `PR-001` 테스트 실행 결과는 우선 `host + port` 방식으로 제공할 수 있어야 한다.
- `PR-002` 실행 결과 URL 데이터 모델은 미래 URL 전략 변경에 중립적이어야 한다.
- `PR-003` 기본 테스트 실행 TTL은 권장값을 기준선으로 둘 수 있어야 한다.
- `PR-004` 사용자 입력 이름과 시스템 정규화 이름은 구분되어야 한다.
- `PR-005` build queue와 service queue는 분리 운영할 수 있어야 한다.
- `PR-006` 외부 배포 프로토콜은 단일 MVP adapter부터 시작하고 후속 확장을 허용해야 한다.

## 2. 데이터 및 상태 요구사항

- `DR-001` 시스템은 최소 `build_request`, `build_log`, `build_test`, `deployment_attempt` 수준의 데이터 모델을 가져야 한다.
- `DR-002` build 상태 모델은 `RECEIVED`부터 `COMPLETED/FAILED/CANCELLED`까지 추적 가능해야 한다.
- `DR-003` test 상태 모델과 deploy 상태 모델은 별도 추적 가능해야 한다.
- `DR-004` `DEPLOY_SUCCESS`는 build 성공 handoff 상태이며 build queue 점유 상태로 유지하지 않아야 한다.

## 3. 현재 제약 조건

- 실제 인증 시스템, object storage, registry, reverse proxy는 아직 확정되지 않았다.
- 보안/격리 정책은 문서 선행 합의가 필요하다.
- Git 입력을 Build Server가 직접 받을지, 전처리 계층이 source reference로 바꿀지는 아직 닫히지 않았다.

## 4. 설계 영향 메모

- `PR-001`과 `PR-002`는 API 응답 스키마와 test 결과 데이터 모델 설계에 직접 영향을 준다.
- `PR-005`는 queue 처리와 운영 자원 제어 설계에 직접 연결된다.
- `PR-006`은 Runner 배포 adapter 범위와 MVP 구현량에 직접 영향을 준다.
- `DR-004`는 active build 중복 방지 로직과 build/test/deploy lifecycle 분리의 핵심 정책이다.
