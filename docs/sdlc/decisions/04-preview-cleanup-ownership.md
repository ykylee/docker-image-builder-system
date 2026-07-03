# Baseline Decision 04 - Runtime Cleanup Ownership

- 문서 목적: 실행 환경 cleanup ownership에 대한 Step 05 baseline decision을 정의한다.
- 범위: cleanup owner, trigger rule, failure handling boundary
- 대상 독자: 플랫폼 운영자, Runner 구현자, 프로젝트 리드
- 상태: baseline
- 최종 수정일: 2026-07-03

## 이번 단계 채택안

실행 환경 cleanup의 1차 책임은 Runner worker에 둔다.

## baseline rule

- cleanup trigger는 두 가지다.
  - TTL 만료
  - 동일 `userId + appName`의 새 실행 결과가 준비되어 이전 실행 환경을 교체하는 경우
- cleanup 실패는 운영 로그와 상태 필드에 남기고, 즉시 사용자 책임으로 전가하지 않는다.
