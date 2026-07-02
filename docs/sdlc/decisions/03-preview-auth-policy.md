# Baseline Decision 03 - Preview Authentication Policy

- 문서 목적: `OI-005`에 대한 Step 05 baseline decision을 정의한다.
- 범위: preview exposure scope, readiness interpretation, user-facing caution text
- 대상 독자: 프로젝트 리드, 플랫폼 운영자, 사용자 경험 설계자
- 상태: baseline
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/PREVIEW_POLICY.md`, `docs/sdlc/design/06-user-messaging-and-failure-handling.md`, `docs/sdlc/SRS/05-open-issues-and-decisions.md`

## 1. 결정 ID

- `BD-003`
- source issue: `OI-005`

## 2. 배경

preview는 사용자에게 직접 전달되는 URL이므로 인증 정책이 없으면 공개 범위와 사용자 안내 문구가 모호해진다.

MVP에서는 인증 체계 미구현 상태에서도 운영 위험을 낮추는 최소 기준이 필요하다.

## 3. 선택지

### Option A

- 모든 preview를 무인증 공개 URL로 운영

### Option B

- 내부/제한된 검토용 URL로 운영하고, 네트워크/운영 범위 제한을 문서 정책으로 둠

### Option C

- 애플리케이션 레벨 또는 별도 게이트 인증을 필수 적용

## 4. 이번 단계 채택안

Option B를 채택한다.

## 5. 채택 이유

- Option A는 MVP 속도는 빠르지만 공개 범위가 과도하게 넓다.
- Option C는 인증 계층 구현이 선행되지 않으면 바로 개발 범위를 키운다.
- Option B는 현재 설계 복잡도를 유지하면서도 운영 주의선을 명확히 할 수 있다.

## 6. baseline rule

- MVP preview URL은 “내부 검토용 임시 주소”로 정의한다.
- 별도 인증 계층은 MVP 필수 구현 범위에 포함하지 않는다.
- 사용자/에이전트 안내 문구에는 내부 검토용 임시 주소라는 성격을 포함한다.
- readiness success는 인증 성공이 아니라 preview 애플리케이션 접근 가능성 기준으로 판정한다.

## 7. 영향 문서

- `docs/PREVIEW_POLICY.md`
- `docs/sdlc/SRS/04-policy-and-constraints.md`
- `docs/sdlc/design/03-api-contract-design.md`
- `docs/sdlc/design/05-build-and-preview-execution-flow.md`
- `docs/sdlc/design/06-user-messaging-and-failure-handling.md`

## 8. 후속 보류 항목

- 실제 네트워크 제한 방식은 운영 인프라 단계에서 구체화해야 한다.
- private preview auth는 MVP 이후 확장 항목으로 유지한다.
