# Docker Build And Deployment Automation Platform SDLC Step 13 - Backend Development Plan

- 문서 목적: 확정된 백엔드 기술스택 기준으로 Build Server와 Runner 개발 착수 순서, 범위, 산출물, 검증 포인트를 하나의 실행 계획으로 정리한다.
- 범위: 개발 목표, 기술 기준, 단계별 일정, 작업 묶음, 산출물, 리스크, 검증 기준
- 대상 독자: 프로젝트 리드, Build Server 구현자, Runner 구현자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/07-implementation-backlog-baseline.md`, `docs/sdlc/08-build-server-tech-stack-baseline.md`, `docs/sdlc/09-repository-package-structure-baseline.md`, `docs/sdlc/10-pkg-002-build-server-request-intake-breakdown.md`, `docs/sdlc/11-pkg-003-build-server-persistence-breakdown.md`, `docs/sdlc/12-pkg-004-build-server-query-api-breakdown.md`

## 1. 계획 목표

이 문서는 문서 중심 SDLC를 실제 백엔드 개발 착수 순서로 변환하기 위한 실행 계획이다.

## 2. 기술 기준

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
- 구현은 intake/query를 P0, source prepare/build/test/deploy를 P1로 나눠 진행한다.

## 4. 단계별 개발 계획

### Phase 1. Shared Foundation

- `packages/shared-contract/`
- `packages/shared-config/`
- `packages/db/`
- build/test/deploy contract enum, phase key, error code, request/response 타입 진입점 생성

### Phase 2. Persistence Baseline

- `build_request` schema
- `build_log` schema
- `build_test` schema
- `deployment_attempt` schema
- baseline migration

### Phase 3. Build Server Skeleton

- `apps/build-server` 생성 (Fastify + Zod)
- `POST /builds`
- `GET /builds/{buildId}`
- `GET /builds/{buildId}/logs`
- `GET /jobs/{jobId}`
- health endpoint

### Phase 4. Build Server P0 Completion

- duplicate build business response 처리
- status query response assembly
- logs query response assembly
- polling facade 정리

### Phase 5. Go Runner Source Prepare + Build

- `apps/runner`에 `go.mod` 생성
- host server claim polling skeleton
- Git clone / Zip extract
- Docker 실행 boundary 생성
- build phase report path skeleton

### Phase 6. Container Test Work

- container start
- health check
- port open check
- stability window
- test result report

### Phase 7. External Deployment Work

- deploy adapter interface
- 최소 1개 프로토콜 구현
- deploy result report
- completion handoff

## 5. 개발 순서 요약

1. `packages/shared-contract`
2. `packages/shared-config`
3. `packages/db`
4. `apps/build-server`
5. Build Server intake/status/log/job polling P0 완성
6. `apps/runner` source prepare + build
7. container test
8. external deployment

## 6. 작업 묶음과 책임

### Build Server Track

- 공통 계약 고정
- intake API
- status API
- logs API
- polling facade
- persistence contract

### Runner Track

- host server claim polling
- source prepare
- Docker build execution
- container test
- deploy adapter 호출
- phase / log / result report

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
- `apps/runner`

### 문서 산출물

- backend development plan
- package/app별 스캐폴드 기준 보완 문서
- contract artifact 공유 방식 메모

### 검증 산출물

- Build Server 실행 확인 명령
- DB migration 적용 명령
- Runner build/test/deploy 실행 명령

## 8. 검증 기준

- 신규 build request를 받아 `QUEUED` 상태 레코드를 생성할 수 있다
- duplicate build를 business response로 반환할 수 있다
- build status / logs 조회가 가능하다
- Runner가 Host Server를 통해 `QUEUED` 작업을 할당받을 수 있다
- Runner가 source prepare, docker build, container test, deploy adapter 호출을 순서대로 실행할 수 있다

## 9. 리스크와 대응

- Go Runner와 TypeScript Build Server 간 contract drift 위험
  - 대응: shared-contract를 canonical source로 유지하고 generated artifact를 도입한다
- 입력 정규화 방식이 늦게 닫혀 Build Server request 모델이 흔들릴 위험
  - 대응: Phase 3 이전에 Git/Zip/source reference 중 canonical input boundary를 결정한다
- deploy adapter 범위가 과도하게 커질 위험
  - 대응: MVP에서는 단일 프로토콜만 먼저 연다

## 10. 다음 액션

- `packages/shared-contract` 스캐폴드 착수
- `packages/shared-config` 스캐폴드 착수
- `packages/db` 스캐폴드 및 migration baseline 착수
- Build Server API skeleton 생성
- Runner source prepare/build/test/deploy 분해 작업 착수

## 11. 현 단계 결론

- 백엔드 개발은 Build Server와 Runner를 동시에 여는 것이 아니라, shared foundation과 Build Server P0를 먼저 완성한 뒤 Runner build-test-deploy 흐름을 붙이는 순서가 가장 안전하다.
- 이번 개발 계획의 핵심은 `TypeScript Build Server`의 빠른 contract-first 구현과 `Go Runner`의 실제 build/test/deploy 실행 계층 분리를 함께 가져가는 것이다.
