# Docker Build Preview Platform SDLC Step 10 - PKG-002 Build Server Request Intake Breakdown

- 문서 목적: `PKG-002 Build Server Request Intake`를 실제 구현 가능한 세부 태스크로 분해한다.
- 범위: route, schema, service, repository, response policy, validation/error policy, 선후관계
- 대상 독자: Build Server 구현자, API 설계자, 프로젝트 리드, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/07-implementation-backlog-baseline.md`, `docs/sdlc/09-repository-package-structure-baseline.md`, `docs/sdlc/contracts/01-shared-build-contract-baseline.md`, `docs/sdlc/design/03-api-contract-design.md`

## 1. 문서 목표

이 문서는 `PKG-002`를 실제 작업 티켓 수준으로 더 잘게 나누기 위한 기준선이다.

이 문서가 답해야 하는 질문:

- `POST /builds`는 어떤 작업 순서로 구현하는가
- 어느 책임이 route / schema / service / repository에 들어가는가
- 어디까지를 `PKG-002` 범위로 보고 어디부터를 `PKG-003`로 넘기는가

## 2. `PKG-002` 범위 재확인

목표:

- Build Server가 build request를 안정적으로 접수하는 최소 골격을 정의한다.

핵심 범위:

- `POST /builds`
- active build 판정
- request validation
- accepted / duplicate 응답 구조

비범위:

- 실제 queue claim
- build 상태 조회
- build 로그 조회
- preview service 생성

## 3. 세부 태스크 개요

| 태스크 | 이름 | 주 위치 | 우선순위 |
| --- | --- | --- | --- |
| `PKG-002-A` | Route Registration | `apps/build-server/src/routes` | P0 |
| `PKG-002-B` | Request/Response Schema | `apps/build-server/src/schemas` | P0 |
| `PKG-002-C` | Intake Service Orchestration | `apps/build-server/src/services` | P0 |
| `PKG-002-D` | Active Build Lookup Repository Contract | `apps/build-server/src/repositories` | P0 |
| `PKG-002-E` | Accepted Response Policy | `apps/build-server/src/services` | P0 |
| `PKG-002-F` | Duplicate Build Response Policy | `apps/build-server/src/services` | P0 |
| `PKG-002-G` | Validation/Error Policy | `apps/build-server/src/schemas`, `services` | P0 |

## 4. 태스크 상세

### PKG-002-A Route Registration

- 목표: `POST /builds` endpoint를 Fastify route로 등록한다.
- 범위:
  - route path 확정
  - handler entrypoint 정의
  - schema binding 위치 정의
- Refs: `MVP-FR-007`, `MVP-NFR-003`
- Depends on: `PKG-001`, `docs/sdlc/09-repository-package-structure-baseline.md`
- Done when:
  - `POST /builds` route 위치와 handler 진입 함수 이름이 정리된다
  - route가 schema와 service를 어떤 순서로 호출하는지 문서화된다

### PKG-002-B Request/Response Schema

- 목표: request payload와 success response schema를 고정한다.
- 범위:
  - request body schema
  - accepted response schema
  - duplicate response schema
  - error response shape 정리
- Refs: `MVP-FR-007`, `MVP-FR-010`, `MVP-DR-001`, `BD-001`
- Depends on: `PKG-001`, `docs/sdlc/contracts/01-shared-build-contract-baseline.md`
- Done when:
  - 필수/권장 필드가 schema로 정리된다
  - accepted=true / accepted=false 응답 형태가 분리 정의된다

### PKG-002-C Intake Service Orchestration

- 목표: request intake의 주 흐름을 service 단위로 정의한다.
- 범위:
  - validation 통과 후 처리 순서
  - active build lookup 호출
  - 신규 build 접수 분기
  - duplicate build 분기
- Refs: `MVP-FR-008`, `MVP-FR-009`, `MVP-FR-010`
- Depends on: `PKG-002-B`, `PKG-002-D`
- Done when:
  - route 바깥에서 처리할 orchestration 단계가 정리된다
  - 분기 순서가 pseudo-flow 수준으로 닫힌다

권장 흐름:

```text
validate request
-> normalize appName
-> lookup active build by userId + appName
-> if exists: return duplicate response
-> else: prepare create payload
-> hand off to persistence package boundary
-> return accepted response
```

### PKG-002-D Active Build Lookup Repository Contract

- 목표: repository가 어떤 입력/출력을 가져야 하는지 contract를 먼저 고정한다.
- 범위:
  - lookup input shape
  - lookup result shape
  - active status set 참조 방식
- Refs: `MVP-FR-009`, `MVP-DR-002`
- Depends on: `PKG-001`, `docs/sdlc/design/04-data-model-design.md`
- Done when:
  - repository method signature 수준 계약이 정리된다
  - service가 repository 세부 구현에 의존하지 않도록 경계가 정의된다

예시 contract:

```text
findActiveBuildByUserAndApp(userId, appName) -> ActiveBuildSummary | null
```

### PKG-002-E Accepted Response Policy

- 목표: 신규 build 접수 시 응답 정책을 문서로 고정한다.
- 범위:
  - `accepted=true`
  - `reason=BUILD_QUEUED`
  - `buildId`, `status`, `statusUrl` 포함 규칙
- Refs: `MVP-FR-007`, `MVP-FR-008`, `MVP-FR-010`
- Depends on: `PKG-002-B`, `docs/sdlc/design/03-api-contract-design.md`
- Done when:
  - accepted response의 최소 필드와 의미가 정리된다
  - HTTP status code 정책이 함께 연결된다

### PKG-002-F Duplicate Build Response Policy

- 목표: active build 존재 시 business response 정책을 고정한다.
- 범위:
  - `accepted=false`
  - `reason=ACTIVE_BUILD_EXISTS`
  - `existingBuild` 최소 필드
  - HTTP 200 유지 원칙
- Refs: `MVP-FR-009`, `MVP-NFR-001`
- Depends on: `PKG-002-D`, `docs/sdlc/design/03-api-contract-design.md`, `docs/sdlc/design/06-user-messaging-and-failure-handling.md`
- Done when:
  - duplicate case를 error가 아닌 business response로 다루는 이유와 shape가 정리된다
  - Skill/MCP가 이어서 상태 조회에 연결할 수 있는 필드가 닫힌다

### PKG-002-G Validation/Error Policy

- 목표: request validation 실패와 내부 예외의 초기 처리 기준을 정의한다.
- 범위:
  - 필수 필드 누락
  - 타입 오류
  - 정규화 실패
  - repository/DB 예외의 상위 error 매핑 기준
- Refs: `MVP-FR-010`, `MVP-NFR-008`
- Depends on: `PKG-002-B`, `docs/sdlc/contracts/01-shared-build-contract-baseline.md`
- Done when:
  - `400 INVALID_REQUEST`와 `500 INTERNAL_ERROR` 경계가 정리된다
  - 사용자 메시지 계층이 소비할 최소 error code가 닫힌다

## 5. `PKG-002`와 `PKG-003`의 경계

`PKG-002`가 여기까지 책임진다:

- intake API entry
- request validation
- active build 확인 호출
- accepted / duplicate 응답 정책

`PKG-003`로 넘기는 항목:

- 실제 build_request 저장 필드 상세
- queue 등록 시점
- DB schema 및 migration
- persistence transaction detail

## 6. 구현 순서 권장

1. `PKG-002-B`
2. `PKG-002-D`
3. `PKG-002-C`
4. `PKG-002-E`
5. `PKG-002-F`
6. `PKG-002-G`
7. `PKG-002-A`

이 순서를 권장하는 이유:

- schema와 repository contract가 먼저 닫혀야 service 분기가 흔들리지 않는다.
- response policy가 정리되어야 route binding을 마지막에 안정적으로 닫을 수 있다.

## 7. 다음 액션 권장

- `PKG-003` persistence 세분화 문서 추가 여부 결정
- `packages/shared-contract` 코드 스캐폴드 착수 여부 결정
- `apps/build-server` 초기 폴더 생성 전 스캐폴드 원칙 정리

## 8. 현 단계 결론

- `PKG-002`는 이제 단일 backlog item이 아니라 route / schema / service / repository / response policy 단위의 실제 구현 태스크로 분해되었다.
- 다음 단계는 이 문서를 기준으로 `PKG-003` 세분화 또는 실제 코드 스캐폴드 진입 중 하나를 선택하는 것이다.
