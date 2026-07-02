# Baseline Decision 01 - User ID Source System

- 문서 목적: `OI-001`에 대한 Step 05 baseline decision을 정의한다.
- 범위: `userId` source rule, fallback rule, canonical ownership key
- 대상 독자: 프로젝트 리드, API 설계자, Build Server 구현자, AI 에이전트
- 상태: baseline
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/SRS/05-open-issues-and-decisions.md`, `docs/sdlc/design/02-domain-model-and-state-transitions.md`, `docs/IDENTITY_MODEL.md`

## 1. 결정 ID

- `BD-001`
- source issue: `OI-001`

## 2. 배경

`userId`는 active build 판정, preview ownership, 최신 preview 교체 정책, 추후 감사 로그의 기준 키다.

이 값의 source system이 닫히지 않으면 API 계약과 데이터 모델이 구현 직전마다 흔들린다.

## 3. 선택지

### Option A

- 외부 인증 시스템의 실제 사용자 식별자를 그대로 사용

### Option B

- AI 에이전트 세션 또는 워크스페이스 단위 식별자를 사용

### Option C

- 외부 인증 식별자를 우선 사용하되, 없는 경우 에이전트가 임시 workspace-scoped fallback 식별자를 생성

## 4. 이번 단계 채택안

Option C를 채택한다.

## 5. 채택 이유

- MVP는 아직 인증 시스템이 확정되지 않았으므로 외부 사용자 키만 전제로 구현을 잠그기 어렵다.
- 동시에 완전 임의 세션 키만 쓰면 동일 사용자/동일 앱의 연속 build 판정이 불안정해진다.
- 따라서 “외부 인증 키 우선, 없으면 workspace-scoped fallback”이 현재 가장 현실적이다.

## 6. baseline rule

### 6.1 우선 규칙

- 외부 인증 시스템이 연결된 경우 `userId`는 그 시스템의 stable user key를 사용한다.

### 6.2 fallback 규칙

- 외부 인증 시스템이 없는 경우 `userId`는 에이전트가 생성한 workspace-scoped stable identifier를 사용한다.

예시:

```text
usr-local-docker-image-builder-system-001
```

### 6.3 canonical ownership key

Build Server의 기본 ownership key는 아래 조합이다.

```text
userId + appName
```

## 7. 영향 문서

- `docs/IDENTITY_MODEL.md`
- `docs/sdlc/SRS/04-policy-and-constraints.md`
- `docs/sdlc/design/02-domain-model-and-state-transitions.md`
- `docs/sdlc/design/03-api-contract-design.md`
- `docs/sdlc/design/04-data-model-design.md`

## 8. 후속 보류 항목

- 실제 외부 인증 시스템이 확정되면 fallback 생성 규칙을 구체화해야 한다.
- 팀/조직 namespace 필요 여부는 `OI-002`에서 후속 검토한다.
