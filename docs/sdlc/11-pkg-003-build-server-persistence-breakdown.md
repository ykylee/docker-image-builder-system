# Docker Build Preview Platform SDLC Step 11 - PKG-003 Build Server Persistence Breakdown

- 문서 목적: `PKG-003 Build Server State And Queue Persistence`를 실제 구현 가능한 세부 태스크로 분해한다.
- 범위: schema, migration, repository contract, queue query, transaction boundary, log/event persistence
- 대상 독자: Build Server 구현자, DB 설계자, Runner 구현자, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/07-implementation-backlog-baseline.md`, `docs/sdlc/09-repository-package-structure-baseline.md`, `docs/sdlc/design/04-data-model-design.md`, `docs/sdlc/contracts/01-shared-build-contract-baseline.md`

## 1. 문서 목표

이 문서는 `PKG-003`을 실제 구현 티켓 수준으로 더 잘게 나누기 위한 기준선이다.

이 문서가 답해야 하는 질문:

- 어떤 persistence 작업부터 시작해야 하는가
- 어느 책임이 `packages/db`와 `apps/build-server/src/repositories`에 들어가는가
- 어디까지를 `PKG-003` 범위로 보고 어디부터를 Runner/Query API로 넘기는가

## 2. `PKG-003` 범위 재확인

목표:

- build queue와 preview service queue의 저장 구조를 정의한다.

핵심 범위:

- `build_request` schema
- `build_log` schema
- `test_deployment` schema
- active build lookup과 queue pickup을 위한 repository contract
- persistence transaction boundary

비범위:

- 실제 Runner loop 실행
- 상태 조회 API 응답 조립
- 사용자 메시지 변환

## 3. 세부 태스크 개요

| 태스크 | 이름 | 주 위치 | 우선순위 |
| --- | --- | --- | --- |
| `PKG-003-A` | Build Request Schema Definition | `packages/db/src/schema` | P0 |
| `PKG-003-B` | Build Log Schema Definition | `packages/db/src/schema` | P0 |
| `PKG-003-C` | Test Deployment Schema Definition | `packages/db/src/schema` | P0 |
| `PKG-003-D` | Migration Baseline | `packages/db/src/migrations` | P0 |
| `PKG-003-E` | Active Build Lookup Repository Contract | `apps/build-server/src/repositories` | P0 |
| `PKG-003-F` | Build Create Repository Contract | `apps/build-server/src/repositories` | P0 |
| `PKG-003-G` | Queue Pickup Query Contract | `packages/db`, `apps/runner/src/repositories` | P0 |
| `PKG-003-H` | Log/Event Persistence Contract | `apps/build-server/src/repositories`, `apps/runner/src/repositories` | P1 |
| `PKG-003-I` | Transaction Boundary Policy | `packages/db`, `apps/build-server/src/services` | P0 |

## 4. 태스크 상세

### PKG-003-A Build Request Schema Definition

- 목표: `build_request` 테이블 shape를 코드 스키마 수준으로 고정한다.
- 범위:
  - business key와 internal PK 구분
  - request metadata 필드
  - status/current_phase/error/result 필드
  - timestamp 필드
- Refs: `MVP-FR-008`, `MVP-FR-011`, `MVP-DR-001`, `MVP-DR-002`
- Depends on: `PKG-001`, `docs/sdlc/design/04-data-model-design.md`
- Done when:
  - 필수 컬럼 목록이 schema file 단위로 닫힌다
  - unique/index 요구사항이 함께 정리된다

### PKG-003-B Build Log Schema Definition

- 목표: `build_log` append-only 구조를 코드 스키마 수준으로 고정한다.
- 범위:
  - `build_id`, `seq`, `phase`, `stream`, `message`
  - unique `(build_id, seq)`
  - timestamp/index
- Refs: `MVP-FR-016`, `MVP-DR-003`
- Depends on: `PKG-001`, `docs/sdlc/design/04-data-model-design.md`
- Done when:
  - 로그 저장 필드와 uniqueness 기준이 정리된다
  - Runner phase/event 저장이 가능한 최소 shape가 고정된다

### PKG-003-C Test Deployment Schema Definition

- 목표: `test_deployment` preview lifecycle 저장 구조를 코드 스키마 수준으로 고정한다.
- 범위:
  - ownership/build linkage
  - preview status/URL/host/port
  - health/TTL/cleanup 필드
  - queue status 조회용 필드
- Refs: `MVP-FR-018`, `MVP-DR-002`, `MVP-DR-004`, `BD-004`, `BD-005`
- Depends on: `PKG-001`, `docs/sdlc/design/04-data-model-design.md`
- Done when:
  - preview queue와 cleanup 정책을 지탱하는 컬럼이 닫힌다
  - unique `build_id`와 상태 조회 인덱스가 정리된다

### PKG-003-D Migration Baseline

- 목표: 세 테이블과 핵심 인덱스를 만드는 migration baseline을 정의한다.
- 범위:
  - 테이블 생성 순서
  - unique/index 추가 순서
  - 초기 enum/string 정책
- Refs: `MVP-NFR-003`, `MVP-NFR-007`
- Depends on: `PKG-003-A`, `PKG-003-B`, `PKG-003-C`
- Done when:
  - 한 번에 올릴 baseline migration 범위가 정리된다
  - schema와 migration 사이 naming drift가 없도록 규칙이 정리된다

### PKG-003-E Active Build Lookup Repository Contract

- 목표: `PKG-002`가 소비할 active build lookup repository contract를 persistence 관점에서 고정한다.
- 범위:
  - lookup input/output shape
  - active status set 참조
  - read model 최소 필드
- Refs: `MVP-FR-009`, `MVP-DR-002`
- Depends on: `PKG-003-A`, `docs/sdlc/10-pkg-002-build-server-request-intake-breakdown.md`
- Done when:
  - `findActiveBuildByUserAndApp` 성격의 contract가 persistence 기준으로 닫힌다
  - status 조건과 정렬 기준이 정리된다

### PKG-003-F Build Create Repository Contract

- 목표: 신규 build request를 저장하는 create contract를 정의한다.
- 범위:
  - create input shape
  - default status/timestamp
  - 반환 필드
- Refs: `MVP-FR-008`, `MVP-FR-010`, `MVP-DR-001`
- Depends on: `PKG-003-A`, `PKG-002-C`
- Done when:
  - intake service가 persistence에 넘길 최소 payload가 정리된다
  - accepted response에 필요한 반환 필드가 닫힌다

### PKG-003-G Queue Pickup Query Contract

- 목표: build queue와 preview service queue 선점 쿼리 contract를 정의한다.
- 범위:
  - `build_request` queue claim query
  - `test_deployment` queue claim query
  - oldest-first / `SKIP LOCKED` 기준
- Refs: `MVP-FR-014`, `MVP-FR-017`, `MVP-NFR-004`, `MVP-NFR-005`
- Depends on: `PKG-003-A`, `PKG-003-C`, `docs/sdlc/design/04-data-model-design.md`
- Done when:
  - Runner가 소비할 queue query shape가 닫힌다
  - build queue와 preview queue가 분리된다는 점이 contract로 고정된다

### PKG-003-H Log/Event Persistence Contract

- 목표: build phase와 실행 로그를 어떤 저장 경계로 남길지 정리한다.
- 범위:
  - append-only log insert
  - phase update와 log insert의 관계
  - error_code/error_message 반영 시점
- Refs: `MVP-FR-016`, `MVP-FR-019`, `MVP-NFR-008`
- Depends on: `PKG-003-A`, `PKG-003-B`
- Done when:
  - Runner가 phase와 log를 어떤 순서로 저장할지 contract가 정리된다
  - Query API가 조회할 수 있는 최소 persistence shape가 닫힌다

### PKG-003-I Transaction Boundary Policy

- 목표: intake 저장, 상태 전이, queue 등록의 transaction boundary를 정의한다.
- 범위:
  - request intake create transaction
  - queue claim transaction
  - phase update + log insert 결합 여부
- Refs: `MVP-NFR-003`, `MVP-NFR-004`, `MVP-NFR-007`
- Depends on: `PKG-003-E`, `PKG-003-F`, `PKG-003-G`, `PKG-003-H`
- Done when:
  - 어디까지를 한 transaction으로 묶을지 정리된다
  - Build Server와 Runner의 쓰기 경계가 충돌 없이 분리된다

## 5. `PKG-003`와 주변 패키지 경계

`PKG-003`가 여기까지 책임진다:

- schema와 migration baseline
- repository contract
- queue query contract
- transaction boundary

`PKG-004`로 넘기는 항목:

- 조회 응답 조립
- preview 상태/URL 노출 형식
- 로그 조회 API payload

`PKG-005` 이후로 넘기는 항목:

- 실제 queue poll loop
- Docker build 실행
- readiness / cleanup 실행

## 6. 구현 순서 권장

1. `PKG-003-A`, `PKG-003-B`, `PKG-003-C`
2. `PKG-003-D`
3. `PKG-003-E`, `PKG-003-F`
4. `PKG-003-G`
5. `PKG-003-H`
6. `PKG-003-I`

이 순서를 권장하는 이유:

- schema가 먼저 닫혀야 migration과 repository contract가 흔들리지 않는다.
- create/read contract가 먼저 있어야 `PKG-002`와 `PKG-004`가 안정적으로 붙는다.
- transaction boundary는 개별 contract가 나온 뒤 닫는 것이 안전하다.

## 7. 코드 스캐폴드 진입 판단

현재 기준 권장:

- 문서 단계에서는 `PKG-003` 세분화를 먼저 닫는다.
- 그 다음 바로 `packages/shared-contract`, `packages/shared-config`, `packages/db` 순으로 코드 스캐폴드에 들어간다.

이유:

- persistence가 닫히지 않으면 `apps/build-server` 스캐폴드가 금방 재작업된다.
- 반대로 `PKG-003`까지 닫히면 최소한 shared package 계층은 안전하게 생성할 수 있다.

## 8. 다음 액션 권장

- `packages/shared-contract`, `packages/shared-config`, `packages/db` 코드 스캐폴드 착수
- 또는 `PKG-004` Query API 세분화 문서 추가

## 9. 현 단계 결론

- `PKG-003`은 이제 schema, migration, repository, queue query, transaction boundary 수준의 실제 구현 태스크로 분해되었다.
- 다음 단계는 shared package 스캐폴드에 들어가거나, 조회 계층인 `PKG-004`까지 문서로 닫는 것 중 하나를 선택하면 된다.
