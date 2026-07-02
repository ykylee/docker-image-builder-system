# Docker Build Preview Platform SDLC Step 12 - PKG-004 Build Server Query API Breakdown

- 문서 목적: `PKG-004 Build Server Query API`를 실제 구현 가능한 세부 태스크로 분해한다.
- 범위: status query endpoint, log query endpoint, response assembly, preview exposure, error/404 policy
- 대상 독자: Build Server 구현자, API 설계자, Skill/MCP 구현자, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/07-implementation-backlog-baseline.md`, `docs/sdlc/design/03-api-contract-design.md`, `docs/sdlc/design/06-user-messaging-and-failure-handling.md`, `docs/sdlc/11-pkg-003-build-server-persistence-breakdown.md`

## 1. 문서 목표

이 문서는 `PKG-004`를 실제 작업 티켓 수준으로 더 잘게 나누기 위한 기준선이다.

이 문서가 답해야 하는 질문:

- `GET /builds/{buildId}`와 `GET /builds/{buildId}/logs`는 어떤 책임으로 나눠 구현하는가
- 어떤 필드를 상태 조회 응답에 반드시 포함해야 하는가
- preview 상태/URL은 어떤 조건에서 어떻게 노출하는가
- Skill/MCP가 polling과 사용자 메시지 변환에 소비할 최소 응답 shape는 무엇인가

## 2. `PKG-004` 범위 재확인

목표:

- build 상태, 로그, preview 정보를 조회하는 최소 API 기준을 정한다.

핵심 범위:

- `GET /builds/{buildId}`
- `GET /builds/{buildId}/logs`
- 상태 조회 응답 조립
- 로그 조회 응답 조립
- preview 상태/URL 노출 규칙

비범위:

- build request 생성
- queue claim / 실행
- 최종 사용자 문장 생성

## 3. 세부 태스크 개요

| 태스크 | 이름 | 주 위치 | 우선순위 |
| --- | --- | --- | --- |
| `PKG-004-A` | Build Status Route Registration | `apps/build-server/src/routes` | P0 |
| `PKG-004-B` | Build Status Query Schema | `apps/build-server/src/schemas` | P0 |
| `PKG-004-C` | Build Status Response Assembly | `apps/build-server/src/services` | P0 |
| `PKG-004-D` | Build Status Repository Contract | `apps/build-server/src/repositories` | P0 |
| `PKG-004-E` | Preview Exposure Policy | `apps/build-server/src/services` | P0 |
| `PKG-004-F` | Build Log Route Registration | `apps/build-server/src/routes` | P0 |
| `PKG-004-G` | Build Log Query Schema | `apps/build-server/src/schemas` | P0 |
| `PKG-004-H` | Build Log Repository Contract | `apps/build-server/src/repositories` | P0 |
| `PKG-004-I` | Not Found / Error Policy | `apps/build-server/src/services`, `schemas` | P0 |

## 4. 태스크 상세

### PKG-004-A Build Status Route Registration

- 목표: `GET /builds/{buildId}` endpoint를 Fastify route로 등록한다.
- 범위:
  - route path 확정
  - param binding
  - schema/service 연결
- Refs: `MVP-FR-012`, `MVP-NFR-003`
- Depends on: `PKG-001`, `docs/sdlc/09-repository-package-structure-baseline.md`
- Done when:
  - route 진입 함수와 param schema 연결 순서가 정리된다

### PKG-004-B Build Status Query Schema

- 목표: build status 조회 요청/응답 schema를 고정한다.
- 범위:
  - `buildId` path param
  - 기본 status response
  - failure response
  - preview attached response
- Refs: `MVP-FR-012`, `MVP-FR-017`, `MVP-FR-018`, `MVP-FR-019`
- Depends on: `PKG-001`, `docs/sdlc/design/03-api-contract-design.md`
- Done when:
  - 상태 조회 응답의 최소 key 집합이 schema로 고정된다
  - preview attached / not attached 케이스가 nullable 규칙으로 정리된다

### PKG-004-C Build Status Response Assembly

- 목표: persistence에서 읽은 build/testDeployment 정보를 status response로 조립하는 service 흐름을 정의한다.
- 범위:
  - build row 매핑
  - image/result field 매핑
  - `testDeployment` 병합
  - `error` 병합
- Refs: `MVP-FR-012`, `MVP-FR-018`, `MVP-FR-019`, `MVP-NFR-001`
- Depends on: `PKG-004-B`, `PKG-004-D`, `PKG-003`
- Done when:
  - build-only / build+preview / failed build 응답 조립 규칙이 닫힌다
  - Skill/MCP polling에 필요한 key가 모두 포함된다

### PKG-004-D Build Status Repository Contract

- 목표: build status 조회용 repository contract를 persistence 관점에서 정의한다.
- 범위:
  - build row 조회
  - optional `test_deployment` join 또는 별도 조회
  - not found 결과 shape
- Refs: `MVP-FR-012`, `MVP-DR-001`, `MVP-DR-002`
- Depends on: `PKG-003-A`, `PKG-003-C`
- Done when:
  - repository가 반환할 read model shape가 정리된다
  - join 여부와 service 책임 경계가 정리된다

### PKG-004-E Preview Exposure Policy

- 목표: preview 상태와 URL을 언제 어떤 필드로 노출할지 규칙을 고정한다.
- 범위:
  - `testDeployment.status`
  - `previewUrl`, `host`, `hostPort`, `internalPort`, `expiresAt`
  - `QUEUED` / `READY` / `FAILED` / `EXPIRED` 노출 규칙
- Refs: `MVP-FR-017`, `MVP-FR-018`, `MVP-NFR-001`, `MVP-PR-005`
- Depends on: `PKG-004-C`, `docs/sdlc/design/03-api-contract-design.md`, `docs/sdlc/design/06-user-messaging-and-failure-handling.md`
- Done when:
  - preview 미준비 상태와 준비 완료 상태의 field visibility가 정리된다
  - user-facing message layer가 소비할 최소 신호가 닫힌다

### PKG-004-F Build Log Route Registration

- 목표: `GET /builds/{buildId}/logs` endpoint를 Fastify route로 등록한다.
- 범위:
  - route path 확정
  - path/query param binding
  - schema/service 연결
- Refs: `MVP-FR-013`, `MVP-NFR-003`
- Depends on: `PKG-001`, `docs/sdlc/09-repository-package-structure-baseline.md`
- Done when:
  - 로그 조회 route 위치와 handler 진입 순서가 정리된다

### PKG-004-G Build Log Query Schema

- 목표: 로그 조회 요청/응답 schema를 고정한다.
- 범위:
  - `buildId` path param
  - log row shape
  - optional pagination/limit 정책 여부
- Refs: `MVP-FR-013`, `MVP-FR-016`
- Depends on: `PKG-001`, `docs/sdlc/design/03-api-contract-design.md`
- Done when:
  - logs 응답 배열 shape와 최소 필드가 정리된다
  - 초기 MVP에서 pagination을 둘지 defer할지 결정된다

### PKG-004-H Build Log Repository Contract

- 목표: build 로그 조회 contract를 persistence 관점에서 정의한다.
- 범위:
  - `build_id` 기준 ordered fetch
  - last log / full log 정책
  - `seq`, `phase`, `stream`, `message`, `createdAt` 반환
- Refs: `MVP-FR-013`, `MVP-FR-016`, `MVP-DR-003`
- Depends on: `PKG-003-B`
- Done when:
  - ordered fetch 기준과 반환 row shape가 정리된다
  - `PKG-004-G` schema와 대응 관계가 닫힌다

### PKG-004-I Not Found / Error Policy

- 목표: status/log 조회에서의 `404`와 내부 오류 처리 기준을 정리한다.
- 범위:
  - unknown `buildId`
  - empty logs
  - persistence error
  - error response shape
- Refs: `MVP-FR-012`, `MVP-FR-013`, `MVP-NFR-008`
- Depends on: `PKG-004-B`, `PKG-004-G`, `docs/sdlc/design/03-api-contract-design.md`
- Done when:
  - `404 Not Found`와 `200 empty logs`의 경계가 정리된다
  - Skill/MCP가 retry/abort 판단할 수 있는 최소 error code가 닫힌다

## 5. `PKG-004`와 주변 패키지 경계

`PKG-004`가 여기까지 책임진다:

- 조회 endpoint
- 응답 schema
- 응답 조립
- preview 상태/URL 노출 규칙
- logs 응답 형식

`PKG-003`이 먼저 책임지는 항목:

- build/testDeployment/buildLog persistence shape
- repository read contract의 기반 데이터 구조

`PKG-009`로 넘기는 항목:

- polling orchestration
- 사용자 메시지 문구화
- 다음 행동 제안

## 6. 구현 순서 권장

1. `PKG-004-B`, `PKG-004-G`
2. `PKG-004-D`, `PKG-004-H`
3. `PKG-004-C`, `PKG-004-E`
4. `PKG-004-I`
5. `PKG-004-A`, `PKG-004-F`

이 순서를 권장하는 이유:

- schema와 repository contract가 먼저 닫혀야 response assembly가 흔들리지 않는다.
- preview 노출 정책은 status assembly 위에서 정리하는 것이 가장 안정적이다.
- route binding은 마지막에 붙여도 contract drift가 적다.

## 7. 다음 액션 권장

- `packages/shared-contract`, `packages/shared-config`, `packages/db` 코드 스캐폴드 착수
- 또는 `apps/build-server` API 스캐폴드 진입 여부 결정

## 8. 현 단계 결론

- `PKG-004`는 이제 status query, log query, response assembly, preview exposure, error policy 수준의 실제 구현 태스크로 분해되었다.
- 다음 단계는 문서 기준선이 충분히 닫혔으므로 shared package와 API 스캐폴드로 넘어가도 안정적이다.
