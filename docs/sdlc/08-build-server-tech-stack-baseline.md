# Docker Build Preview Platform SDLC Step 08 - Build Server Tech Stack Baseline

- 문서 목적: Build Server 우선 구현 축과 Runner 실행 축을 위한 기술 스택 baseline recommendation을 정리한다.
- 범위: 언어, API 프레임워크, DB, queue 처리 방식, 런타임, 저장소 구조 방향
- 대상 독자: 프로젝트 리드, Build Server 구현자, Runner 구현자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/contracts/01-shared-build-contract-baseline.md`, `docs/sdlc/07-implementation-backlog-baseline.md`, `docs/sdlc/design/03-api-contract-design.md`, `docs/sdlc/design/04-data-model-design.md`

## 1. 문서 목표

이 문서는 Build Server 구현을 시작하기 전에 가장 재작업 위험이 낮은 기술 조합을 baseline으로 제안한다.

이 문서가 답해야 하는 질문:

- Build Server는 어떤 언어와 프레임워크로 시작하는 것이 좋은가
- queue와 상태 저장은 어떤 데이터 계층을 기준으로 두는가
- Runner와 Skill/MCP와의 계약 공유를 쉽게 하려면 어떤 조합이 적절한가

## 2. 결론 요약

- Build Server baseline 언어는 `TypeScript`로 둔다.
- API 프레임워크는 `Fastify`를 우선 추천한다.
- 관계형 DB는 `PostgreSQL`을 기준으로 둔다.
- queue는 외부 broker를 바로 도입하지 않고 `PostgreSQL row locking` 기반으로 시작한다.
- Runner는 `Go` 기반 별도 worker 프로세스로 분리하는 방향을 baseline으로 둔다.

## 3. 추천 스택

| 영역 | baseline |
| --- | --- |
| Build Server Language | TypeScript |
| Build Server Runtime | Node.js LTS |
| API Framework | Fastify |
| Validation | Zod |
| Database | PostgreSQL |
| Query/Schema Layer | Drizzle ORM |
| Queue Model | PostgreSQL `FOR UPDATE SKIP LOCKED` |
| Runner Language | Go |
| Runner Runtime | Go native binary |
| Packaging Direction | monorepo with `apps/` and `packages/` |

## 4. 왜 TypeScript인가

- Skill/MCP 계층이 앞으로 JavaScript/TypeScript와 자연스럽게 연결될 가능성이 높다.
- shared contract의 request/status/error shape를 Build Server 계층에서 빠르게 고정하기 쉽다.
- API contract, validation, response policy를 문서에서 코드로 옮기는 속도가 빠르다.
- MVP 단계에서 Build Server는 Go보다 구현 속도와 문서-계약-코드 연결성이 더 좋다.

비교 메모:

- Go는 long-running worker와 Docker orchestration에는 강점이 있고, 이 강점은 Runner 축에서 직접 활용할 가치가 높다.
- Python은 빠른 실험에는 유리하지만, 장기적으로 shared contract drift를 제어하는 면에서는 TypeScript 조합이 더 안정적이다.

## 5. 왜 Fastify인가

- API surface가 비교적 작고 schema-first 설계와 잘 맞는다.
- request/response validation과 타입 연결이 가볍다.
- NestJS보다 초기 boilerplate가 적고, Express보다 contract discipline을 세우기 쉽다.

추천 사용 범위:

- `POST /builds`
- `GET /builds/{buildId}`
- `GET /builds/{buildId}/logs`
- health endpoint

## 6. 왜 PostgreSQL인가

- 현재 설계 문서가 active build 판정과 queue pickup에 row locking 가능한 관계형 DB를 전제로 한다.
- `FOR UPDATE SKIP LOCKED` 패턴으로 build queue와 preview service queue를 둘 다 처리할 수 있다.
- build_request / build_log / test_deployment 모델을 가장 자연스럽게 담을 수 있다.

초기 도입 원칙:

- 외부 message broker 없이 시작한다.
- build queue와 preview service queue는 DB 테이블로 분리한다.
- concurrency limit과 active build 판정도 DB 질의를 기준으로 둔다.

## 7. 왜 Drizzle ORM인가

- TypeScript 친화적이며 schema와 query를 코드 레벨에서 비교적 명확하게 유지할 수 있다.
- Prisma보다 migration/SQL 제어가 가볍고, queue 조회 같은 low-level query를 다루기 수월하다.
- 문서 기반 설계에서 실제 테이블 shape로 내려갈 때 중간 추상화 비용이 낮다.

주의:

- ORM이 queue semantics를 숨기지 않도록 queue claim query는 raw SQL 또는 명시적 query builder로 다루는 편이 좋다.

## 8. Runner baseline 방향

- Runner는 Build Server와 분리된 별도 process로 둔다.
- 초기 MVP부터 `Go` 기반 실행 바이너리로 두고, monorepo 안에서 별도 앱으로 관리한다.
- Runner가 책임질 범위:
  - build queue claim
  - source 준비
  - Docker build 실행
  - preview service queue 등록
  - preview readiness / cleanup 처리

이유:

- Build Server는 system-of-record와 API에 집중하고, Runner는 비동기 실행 책임을 분리해야 한다.
- Docker build, process lifecycle, long-running worker 성격은 Go 쪽이 더 안정적으로 다루기 좋다.
- 추후 별도 container/service로 분리해도 Build Server와의 경계를 유지하기 쉽다.
- contract 공유는 언어 공유가 아니라 `shared-contract` 문서/JSON schema/generated artifact 기준으로 묶는다.

Runner 구현 원칙:

- Go Runner는 상태 enum과 phase key를 새로 정의하지 않는다.
- canonical contract source는 여전히 Build Server와 `docs/sdlc/contracts/01-shared-build-contract-baseline.md`다.
- 필요하면 `packages/shared-contract`에서 JSON schema 또는 generated artifact를 만들어 Go Runner가 소비한다.

## 9. 저장소 구조 baseline

권장 방향:

```text
apps/
  build-server/
  runner/
packages/
  shared-contract/
  shared-config/
```

설명:

- `apps/build-server`: Fastify API
- `apps/runner`: Go queue poller + Docker execution worker
- `packages/shared-contract`: request/status/error schema와 타입
- `packages/shared-config`: env schema, 상수, 공통 설정

## 10. 지금 당장 도입하지 않는 것

- Redis, RabbitMQ, Kafka 같은 외부 queue broker
- Kubernetes 기반 job orchestration
- multi-runner autoscaling
- service mesh / reverse proxy routing 최적화
- polyglot runtime

이유:

- 현재 단계의 핵심 리스크는 scale보다 contract drift와 lifecycle 복잡도다.
- 외부 인프라를 너무 빨리 넣으면 문서에서 닫은 queue 모델을 검증하기 어려워진다.

## 11. 기술 스택이 backlog에 미치는 영향

- `PKG-002`와 `PKG-004`는 Fastify + Zod 기준의 API shape로 구체화할 수 있다.
- `PKG-003`, `PKG-005`, `PKG-006`, `PKG-007`은 PostgreSQL queue query를 전제로 세부 태스크를 쪼갤 수 있다.
- `PKG-001` shared contract는 `packages/shared-contract`로 이어질 가능성이 높다.
- Runner 패키지는 Go 기준으로 `apps/runner`에 별도 `go.mod`, queue client, Docker execution boundary를 두는 방향이 자연스럽다.

## 12. 보류 또는 추후 재검토 항목

- object storage 선택
- Docker daemon 연결 방식
- migration 도구 세부 선택
- observability stack

## 13. 현 단계 결론

- 현재 저장소 기준 baseline recommendation은 `TypeScript + Fastify + PostgreSQL + Drizzle` 기반 Build Server와 `Go Runner` 조합이다.
- 이 조합은 Build Server의 빠른 contract-first 구현과 Runner의 안정적인 Docker orchestration을 함께 만족하는 절충안이다.
