# 과제 계획안

- 문서 목적: 요구사항-설계 검토 결과를 반영해 구현 착수 전 과제 수행 계획을 정의한다.
- 범위: 정비 작업, 스캐폴드 작업, 구현 1차 범위, 산출물, 리스크
- 대상 독자: 과제 수행자, 지도/검토자, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/review/01-sdlc-review.md`, `docs/sdlc/07-implementation-backlog-baseline.md`, `docs/sdlc/12-pkg-004-build-server-query-api-breakdown.md`

## 1. 과제 목표

- 요구사항-설계 문서를 기준으로 Build Server MVP 구현 착수 가능한 baseline을 만든다.
- 문서 기준선과 workflow 메타 문서의 불일치를 먼저 정리해 source-of-truth를 단일화한다.
- Build Server P0 범위인 `PKG-001`~`PKG-004`를 코드 스캐폴드와 초기 구현 단위로 연결한다.

## 2. 수행 원칙

- 설계와 충돌하는 구현은 보류한다.
- source-of-truth는 `docs/sdlc/` 기준으로 단일화한다.
- shared package를 먼저 열고, API/Runner는 그 위에 쌓는다.
- 구현과 동시에 medium decision을 늘리지 않고 필요한 범위만 닫는다.

## 3. 단계별 계획

### Phase 0. 문서 정합성 정리

목표:

- 리뷰에서 확인된 문서 충돌과 stale 사실을 정리한다.

작업:

- `docs/GLOSSARY_AND_STATE_MODEL.md`, `docs/IDENTITY_MODEL.md`를 SDLC canonical 상태 모델에 정렬
- `docs/sdlc/SRS/04-policy-and-constraints.md`의 stale 제약 문구 정정
- `ai-workflow/memory/active/repository_assessment.md`, `docs/PROJECT_PROFILE.md`의 legacy 문서명 정리

완료 기준:

- active build 정의가 문서 전반에서 하나로 정리된다
- Git/저장소 준비도 관련 stale 사실이 제거된다

### Phase 1. shared package 스캐폴드

목표:

- 공통 계약과 DB 계층을 코드 구조로 연다.

작업:

- `packages/shared-contract/`
- `packages/shared-config/`
- `packages/db/`

연결 문서:

- `docs/sdlc/contracts/01-shared-build-contract-baseline.md`
- `docs/sdlc/11-pkg-003-build-server-persistence-breakdown.md`

완료 기준:

- package 경계와 최소 파일 구조가 생성된다
- 타입, enum, schema 진입점이 마련된다

### Phase 2. Build Server API 스캐폴드

목표:

- `apps/build-server`의 route/schema/service/repository 골격을 연다.

작업:

- `POST /builds` 진입 구조 스캐폴드
- `GET /builds/{buildId}`
- `GET /builds/{buildId}/logs`
- Fastify bootstrap, Zod schema binding

연결 문서:

- `docs/sdlc/10-pkg-002-build-server-request-intake-breakdown.md`
- `docs/sdlc/12-pkg-004-build-server-query-api-breakdown.md`

완료 기준:

- API 진입 구조와 shared package 의존 방향이 실제 코드에 반영된다

### Phase 3. persistence 초기 구현

목표:

- Build Server가 최소 저장/조회 동작을 할 수 있도록 한다.

작업:

- `build_request`, `build_log`, `test_deployment` schema
- baseline migration
- active build lookup / build create / status read / log read repository

완료 기준:

- `PKG-002`와 `PKG-004`가 persistence contract를 실제로 소비할 수 있다

### Phase 4. Runner/후속 결정 진입

목표:

- Build Server P0 이후 Runner P1 또는 medium decision 정리를 선택적으로 연다.

작업 후보:

- `PKG-005` Runner claim skeleton
- `OI-008`, `OI-009`, `OI-006` 정리

완료 기준:

- Build Server 구현만으로 막히는 후속 의존성이 줄어든다

## 4. 우선순위

1. 문서 정합성 정리
2. shared package 스캐폴드
3. Build Server API 스캐폴드
4. persistence 초기 구현
5. Runner 또는 medium decision

## 5. 주요 산출물

- 정합성 정리 패치
- `packages/shared-contract`, `packages/shared-config`, `packages/db` 스캐폴드
- `apps/build-server` 초기 API 스캐폴드
- baseline migration 및 repository contract 구현
- 중간 점검 보고자료 업데이트

## 6. 리스크와 대응

- 문서 canonical source가 다시 흔들릴 수 있다.
  - 대응: `docs/sdlc/` 우선 원칙 유지
- 스캐폴드가 너무 빨리 열리면 구조만 있고 contract가 흐려질 수 있다.
  - 대응: `PKG-001`~`PKG-004` 문서와 1:1로 연결하며 생성
- medium decision을 동시에 많이 열면 일정이 늘어진다.
  - 대응: 구현 차단점이 되는 항목만 선택적으로 정리

## 7. 계획 결론

- 과제의 첫 구현 단계는 Build Server P0를 코드 구조로 여는 것이다.
- 다만 바로 코드부터 쓰기보다, 문서 정합성 보정과 shared package 스캐폴드가 선행되어야 이후 재작업이 줄어든다.
