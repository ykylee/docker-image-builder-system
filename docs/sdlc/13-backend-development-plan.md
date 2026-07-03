# Docker Build Preview Platform SDLC Step 13 - Backend Development Plan

- 문서 목적: 확정된 백엔드 기술스택 기준으로 Build Server와 Runner 개발 착수 순서, 범위, 산출물, 검증 포인트를 하나의 실행 계획으로 정리한다.
- 범위: 개발 목표, 기술 기준, 단계별 일정, 작업 묶음, 산출물, 리스크, 검증 기준
- 대상 독자: 프로젝트 리드, Build Server 구현자, Runner 구현자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-03 (rev 1: Phase 1~7 단계별 개발 계획)
- 최종 수정일: 2026-07-03 (rev 2: 리뷰 반영, Phase 2/3 순서를 Persistence Baseline → Build Server Skeleton 으로 교체, §3/§9/§10 의 `먼저` 원칙과 정합)
- 관련 문서: `docs/sdlc/07-implementation-backlog-baseline.md`, `docs/sdlc/08-build-server-tech-stack-baseline.md`, `docs/sdlc/09-repository-package-structure-baseline.md`, `docs/sdlc/10-pkg-002-build-server-request-intake-breakdown.md`, `docs/sdlc/11-pkg-003-build-server-persistence-breakdown.md`, `docs/sdlc/12-pkg-004-build-server-query-api-breakdown.md`

## 1. 계획 목표

이 문서는 문서 중심 SDLC를 실제 백엔드 개발 착수 순서로 변환하기 위한 실행 계획이다.

이번 계획이 답해야 하는 질문:

- 무엇부터 구현해야 재작업이 가장 적은가
- Build Server와 Runner는 어떤 순서와 경계로 개발해야 하는가
- 어느 시점에 어떤 산출물이 나와야 하는가
- 초기 검증은 무엇을 기준으로 통과시킬 것인가

## 2. 기술 기준

이번 개발 계획의 기준 스택은 아래와 같다.

| 영역 | 결정 |
| --- | --- |
| Build Server Language | TypeScript |
| Build Server Runtime | Node.js LTS |
| API Framework | Fastify |
| Validation | Zod |
| Database | PostgreSQL |
| Schema / Query Layer | Drizzle ORM |
| Queue Model | Host Server-owned PostgreSQL `FOR UPDATE SKIP LOCKED` |
| Runner Language | Go |
| Runner Runtime | Go native binary |
| 저장소 구조 | monorepo with `apps/` and `packages/` |

핵심 원칙:

- Build Server가 canonical contract, PostgreSQL, queue ownership, system-of-record를 가진다.
- Runner는 Go로 분리하지만 상태 enum, phase key, error code를 새로 정의하지 않는다.
- Runner는 Host Server API만 바라보고 PostgreSQL에 직접 접근하지 않는다.
- 공통 계약은 `packages/shared-contract`와 generated artifact 기준으로 공유한다.

## 3. 개발 원칙

- Build Server를 먼저 연다.
- shared contract와 persistence 경계를 먼저 고정한다.
- Runner는 Build Server의 API/상태 모델이 닫힌 뒤 붙인다.
- 구현은 `PKG-001`~`PKG-004`를 P0, `PKG-005`~`PKG-007`을 P1로 나눠 진행한다.
- 초기 단계에서는 실행 가능한 최소 skeleton을 우선 만들고, 고도화는 후속 단계로 미룬다.

## 4. 단계별 개발 계획

### Phase 1. Shared Foundation

목표:

- Build Server와 Runner가 공통으로 소비할 계약과 설정 기준을 코드 구조로 고정한다.

주요 작업:

- `packages/shared-contract/`
- `packages/shared-config/`
- `packages/db/`
- contract enum, phase key, error code, request/response 타입 진입점 생성
- Go Runner가 소비할 contract artifact export 방식 결정

연결 패키지:

- `PKG-001`
- `PKG-003` 일부 선행 항목

완료 기준:

- shared contract package entrypoint가 존재한다
- shared config package entrypoint가 존재한다
- db package에 schema/migration 진입 구조가 존재한다
- Build Server와 Runner가 참조할 canonical key가 코드 구조로 고정된다

### Phase 2. Persistence Baseline

목표:

- Build Server 단독 소유의 상태 저장 구조를 PostgreSQL 기준으로 먼저 고정한다.
- `Build Server skeleton 만 먼저` 라는 표현을 회피하고, persistence contract 가 닫힌 뒤 Phase 3 에서 Build Server 골격을 연다.

주요 작업:

- `build_request` schema
- `build_log` schema
- `test_deployment` schema
- baseline migration
- active build lookup contract
- build create contract
- status/log read contract

연결 패키지:

- `PKG-003`

완료 기준:

- schema와 migration baseline이 생성된다
- Build Server repository contract가 persistence와 연결된다
- queue claim에 필요한 필드와 인덱스 기준이 닫힌다

### Phase 3. Build Server Skeleton

목표:

- Phase 2 의 persistence contract 와 Phase 1 의 shared contract 가 닫힌 위에서 Build Server 의 최소 API 골격을 연다.

주요 작업:

- `apps/build-server` 생성 (Fastify + Zod)
- Phase 2 의 repository contract 를 실제 repository 구현으로 연결
- `POST /builds` intake → `build_request` row 생성 → `QUEUED` 응답
- `GET /builds/{buildId}` → persistence contract 기반 status assembly
- `GET /builds/{buildId}/logs` → persistence contract 기반 logs assembly
- health endpoint

연결 패키지:

- `PKG-002`
- `PKG-004`
- (Phase 2 의 `PKG-003` 결과를 사용)

완료 기준:

- API 엔트리포인트가 실행 가능한 구조로 존재한다
- repository contract 가 persistence 와 end-to-end 로 연결된다
- accepted / duplicate / status / logs 응답 골격이 코드에 반영된다
- Phase 1 의 shared contract 와의 drift 가 발생하지 않는다

### Phase 4. Build Server P0 Completion

목표:

- Build Server 단독으로 request intake, 상태 조회, 로그 조회의 최소 기능을 제공한다.

주요 작업:

- `POST /builds` intake flow 완성
- duplicate build business response 처리
- status query response assembly
- logs query response assembly
- 오류/404 policy 반영

연결 패키지:

- `PKG-002`
- `PKG-004`

완료 기준:

- Build Server P0 범위가 문서가 아닌 코드 기준으로 동작한다
- Skill/MCP가 향후 붙을 수 있는 최소 API contract가 준비된다

### Phase 5. Go Runner Skeleton

목표:

- Go Runner가 Host Server API contract를 소비하는 최소 실행 골격을 만든다.

주요 작업:

- `apps/runner`에 `go.mod` 생성
- host server claim polling skeleton
- build phase update/report contract 연결
- Docker 실행 boundary 생성
- failure/status/log report path skeleton

권장 구조 예시:

```text
apps/runner/
  cmd/runner/
  internal/queue/
  internal/build/
  internal/docker/
  internal/hostclient/
  internal/contracts/
```

연결 패키지:

- `PKG-005`

완료 기준:

- Go Runner 진입 바이너리가 생성된다
- host server claim과 상태 업데이트/report 흐름의 최소 골격이 존재한다
- Build Server contract를 Go에서 참조하는 경로가 정리된다

### Phase 6. Preview Runner Work

목표:

- preview queue와 readiness, cleanup 흐름을 Runner에 연결한다.

주요 작업:

- preview service queue claim
- readiness check
- `TEST_READY` -> `COMPLETED` handoff 기록
- cleanup trigger baseline

연결 패키지:

- `PKG-006`
- `PKG-007`

완료 기준:

- preview queue와 readiness 흐름이 코드 기준으로 연결된다
- cleanup ownership과 최소 실행 포인트가 정리된다

## 5. 개발 순서 요약

1. `packages/shared-contract`
2. `packages/shared-config`
3. `packages/db`
4. `apps/build-server`
5. Build Server intake/status/log P0 완성
6. `apps/runner` Go skeleton
7. preview readiness / cleanup

## 6. 작업 묶음과 책임

### Build Server Track

- 공통 계약 고정
- intake API
- status API
- logs API
- persistence contract

### Runner Track

- host server claim polling
- Docker build execution
- phase / log report
- preview readiness report
- readiness / cleanup

### Cross-cutting Track

- generated contract artifact
- migration 규칙
- error code 일관성
- 운영 기본 명령 정리

## 7. 예상 산출물

### 코드 산출물

- `packages/shared-contract`
- `packages/shared-config`
- `packages/db`
- `apps/build-server`
- `apps/runner` Go skeleton

### 문서 산출물

- backend development plan
- package/app별 스캐폴드 기준 보완 문서
- contract artifact 공유 방식 메모

### 검증 산출물

- Build Server 실행 확인 명령
- DB migration 적용 명령
- Runner skeleton 실행 명령

## 8. 검증 기준

### 문서 단계 검증

- Step 08~12 문서와 실제 개발 순서가 충돌하지 않아야 한다
- Build Server와 Runner의 책임 경계가 유지되어야 한다

### 코드 단계 초기 검증

- TypeScript workspace가 빌드된다
- Build Server bootstrap이 실행된다
- migration baseline이 적용된다
- Go Runner binary가 빌드된다

### 기능 단계 초기 검증

- 신규 build request를 받아 `QUEUED` 상태 레코드를 생성할 수 있다
- duplicate build를 business response로 반환할 수 있다
- build status / logs 조회가 가능하다
- Runner가 Host Server를 통해 `QUEUED` 작업을 할당받을 수 있다

## 9. 리스크와 대응

- Go Runner와 TypeScript Build Server 간 contract drift 위험
  - 대응: shared-contract를 canonical source로 유지하고 generated artifact를 도입한다
- Build Server를 열기 전에 DB 구조가 흔들릴 위험
  - 대응: schema/migration baseline을 Phase 2 에서 먼저 고정하고, Phase 3 의 Build Server skeleton 은 그 위에서만 연다
- Runner를 너무 늦게 열어 preview 정책 구현이 밀릴 위험
  - 대응: Build Server P0 직후 Go Runner skeleton을 바로 연다
- monorepo 안에서 Node와 Go toolchain이 혼재해 운영 기준이 흐려질 위험
  - 대응: 초기 스캐폴드 시점에 `run`, `build`, `test` 명령을 분리 정의한다

## 10. 다음 액션

- `packages/shared-contract` 스캐폴드 착수
- `packages/shared-config` 스캐폴드 착수
- `packages/db` 스캐폴드 및 migration baseline 착수 (Phase 2)
- Build Server API skeleton 생성 (Phase 3, persistence contract 와 shared contract 가 닫힌 뒤)

## 11. 현 단계 결론

- 백엔드 개발은 Build Server와 Runner를 동시에 여는 것이 아니라, shared foundation과 Build Server P0를 먼저 완성한 뒤 Go Runner를 붙이는 순서가 가장 안전하다.
- 이번 개발 계획의 핵심은 `TypeScript Build Server`의 빠른 contract-first 구현과 `Go Runner`의 안정적인 실행 계층 분리를 함께 가져가는 것이다.
