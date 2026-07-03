# Baseline Decision 03 - Runtime Access Policy

- 문서 목적: `OI-005`에 대한 Step 05 baseline decision을 정의한다.
- 범위: 테스트 runtime 노출 범위, 접근 해석 기준, 사용자 안내 문구
- 대상 독자: 프로젝트 리드, 플랫폼 운영자, 사용자 경험 설계자
- 상태: baseline
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/SRS/04-policy-and-constraints.md`, `docs/sdlc/design/06-user-messaging-and-failure-handling.md`, `docs/sdlc/SRS/05-open-issues-and-decisions.md`

## 1. 결정 ID

- `BD-003`
- source issue: `OI-005`

## 2. 배경

테스트 runtime 또는 임시 검토 URL은 사용자에게 직접 전달될 수 있으므로, 접근 범위와 안내 문구가 모호하면 운영 위험이 커진다.

MVP에서는 인증 체계가 완전하지 않더라도 build/test/deploy 파이프라인 전체에 적용할 수 있는 최소 접근 기준이 필요하다.

## 3. 선택지

### Option A

- 모든 테스트 runtime 을 무인증 공개 URL로 운영

### Option B

- 내부/제한된 검토용 runtime 으로 운영하고, 네트워크/운영 범위 제한을 문서 정책으로 둠

### Option C

- 애플리케이션 레벨 또는 별도 게이트 인증을 필수 적용

## 4. 이번 단계 채택안

Option B를 채택한다.

## 5. 채택 이유

- Option A는 MVP 속도는 빠르지만 공개 범위가 과도하게 넓다.
- Option C는 인증 계층 구현이 선행되지 않으면 바로 개발 범위를 키운다.
- Option B는 현재 설계 복잡도를 유지하면서도 테스트 runtime 과 배포 결과 노출 범위를 구분해 관리할 수 있다.

## 6. baseline rule

- MVP 테스트 runtime 은 "내부 검토용 임시 실행 자원" 으로 정의한다.
- 별도 인증 계층은 MVP 필수 구현 범위에 포함하지 않는다.
- 사용자/에이전트 안내 문구에는 내부 검토용 임시 실행 자원이라는 성격을 포함한다.
- 테스트 성공은 인증 성공이 아니라 runtime 접근 가능성과 health check 충족 여부 기준으로 판정한다.
- 외부 배포 대상은 테스트 runtime 과 별도로 취급하며, 배포 경로의 인증/권한 모델은 대상 시스템 정책을 따른다.

## 7. 영향 문서

- `docs/sdlc/SRS/04-policy-and-constraints.md`
- `docs/sdlc/SRS/04-policy-and-constraints.md`
- `docs/sdlc/design/03-api-contract-design.md`
- `docs/sdlc/design/05-build-and-preview-execution-flow.md`
- `docs/sdlc/design/06-user-messaging-and-failure-handling.md`

## 8. 후속 보류 항목

- 실제 네트워크 제한 방식은 운영 인프라 단계에서 구체화해야 한다.
- private runtime auth 는 MVP 이후 확장 항목으로 유지한다.
- 외부 배포 시스템 자체의 인증 위임/프록시 모델은 별도 배포 정책 문서에서 닫는다.
