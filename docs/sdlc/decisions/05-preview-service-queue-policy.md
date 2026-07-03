# Baseline Decision 05 - Runtime Service Queue Policy

- 문서 목적: 동시 실행 상한과 service queue 정책에 대한 Step 05 baseline decision을 정의한다.
- 범위: concurrency limit, queue admission, slot release, user guidance baseline
- 대상 독자: 프로젝트 리드, Runner 설계자, 플랫폼 운영자
- 상태: baseline
- 최종 수정일: 2026-07-03

## 이번 단계 채택안

운영 상한을 두고, 상한 도달 시 runtime service queue에서 FIFO 대기시키는 정책을 채택한다.

## baseline rule

- 동시에 실행 가능한 테스트 또는 preview service 수는 운영 설정값으로 제한한다.
- 상한 미도달이면 바로 테스트 실행으로 진행한다.
- 상한 도달이면 service queue에 넣는다.
- queue 대기 상태는 실패가 아니라 정상 대기 상태로 안내한다.
