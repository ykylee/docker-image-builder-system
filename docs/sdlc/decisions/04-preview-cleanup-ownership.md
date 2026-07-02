# Baseline Decision 04 - Preview Cleanup Ownership

- 문서 목적: `OI-007`에 대한 Step 05 baseline decision을 정의한다.
- 범위: cleanup owner, trigger rule, failure handling boundary
- 대상 독자: 플랫폼 운영자, Runner 구현자, 프로젝트 리드
- 상태: baseline
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/PREVIEW_POLICY.md`, `docs/sdlc/design/05-build-and-preview-execution-flow.md`, `docs/sdlc/SRS/05-open-issues-and-decisions.md`

## 1. 결정 ID

- `BD-004`
- source issue: `OI-007`

## 2. 배경

preview는 TTL, 교체, 실패 cleanup이 닫혀야 운영 상한 안에서 유지된다.

cleanup ownership이 모호하면 preview service queue 상한 정책도 실제로 지키기 어렵다.

## 3. 선택지

### Option A

- Build Server가 cleanup을 직접 수행

### Option B

- preview service worker 또는 같은 실행 worker가 cleanup 책임을 가짐

### Option C

- 완전히 별도 cleanup job이 책임짐

## 4. 이번 단계 채택안

Option B를 채택한다.

## 5. 채택 이유

- Build Server는 system-of-record로 유지하고 실행 책임은 worker에 두는 현재 구조와 가장 잘 맞는다.
- Option C는 장기적으로 적절할 수 있지만 MVP에서는 컴포넌트가 과해진다.
- worker가 preview lifecycle을 가장 잘 알고 있으므로 TTL 만료/교체 cleanup도 같은 축에서 다루는 편이 자연스럽다.

## 6. baseline rule

- preview cleanup의 1차 책임은 preview service worker에 둔다.
- trigger는 두 가지다.
  - TTL 만료
  - 동일 `userId + appName`의 새 preview가 `READY`가 되어 이전 preview를 교체하는 경우
- cleanup 실패는 운영 로그와 상태 필드에 남기고, 즉시 사용자 책임으로 전가하지 않는다.

## 7. 영향 문서

- `docs/PREVIEW_POLICY.md`
- `docs/sdlc/SRS/04-policy-and-constraints.md`
- `docs/sdlc/design/02-domain-model-and-state-transitions.md`
- `docs/sdlc/design/05-build-and-preview-execution-flow.md`
- `docs/sdlc/design/06-user-messaging-and-failure-handling.md`

## 8. 후속 보류 항목

- 별도 cleanup scheduler 분리는 MVP 이후 운영 규모를 보고 판단한다.
- TTL 연장 요청 처리는 `OI-006`에서 별도 정리한다.
