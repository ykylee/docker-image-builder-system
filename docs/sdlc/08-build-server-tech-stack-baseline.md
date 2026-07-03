# Docker Build Preview Platform SDLC Step 08 - Build Server Tech Stack Baseline

- 문서 목적: Build Server 우선 구현 축을 위한 기술 스택 baseline recommendation을 정리한다.
- 범위: 언어, API 프레임워크, DB, queue 처리 방식, 런타임, 저장소 구조 방향
- 대상 독자: 프로젝트 리드, Build Server 구현자, Runner 구현자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-03 (rev 2: 리뷰 반영, Build Server=TS / Runner=Go baseline 으로 정렬, polyglot 보류항목 정리)
- 관련 문서: `docs/sdlc/contracts/01-shared-build-contract-baseline.md`, `docs/sdlc/07-implementation-backlog-baseline.md`, `docs/sdlc/09-repository-package-structure-baseline.md`, `docs/sdlc/design/03-api-contract-design.md`, `docs/sdlc/design/04-data-model-design.md`

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
- queue는 외부 broker를 바로 도입하지 않고 `PostgreSQL row locking` 기반으로 Host Server 내부에서 시작한다.
- Runner baseline 언어는 `Go`로 둔다. Build Server와 분리된 별도 process로 두고, Docker orchestration / long-running worker 강점을 활용한다.

## 3. 추천 스택

| 영역 | baseline |
| --- | --- |
| Build Server Language | TypeScript |
| Build Server Runtime | Node.js LTS |
| Runner Language | Go |
| Runner Runtime | Go toolchain (1.22+), 별도 process |
| API Framework | Fastify |
| Validation | Zod |
| Database | PostgreSQL |
| Query/Schema Layer | Drizzle ORM (Build Server 측) |
| Queue Model | Host Server-owned PostgreSQL queue (`FOR UPDATE SKIP LOCKED`) |
| Cross-Language Contract | `packages/shared-contract` (TS) ↔ `apps/runner` (Go) 가 동일한 JSON Schema/스펙 문서를 공유 |
| Packaging Direction | monorepo with `apps/` and `packages/` |

## 4. 왜 Build Server는 TypeScript, Runner는 Go인가

### 4.1 Build Server = TypeScript

- Skill/MCP 계층이 앞으로 JavaScript/TypeScript와 자연스럽게 연결될 가능성이 높다.
- shared contract의 request/status/error shape를 타입으로 재사용하기 쉽다.
- API surface(Fastify + Zod) 와 Drizzle 기반 persistence를 한 언어 안에서 맞출 수 있어 drift를 줄이기 좋다.

### 4.2 Runner = Go

- long-running worker 와 Docker orchestration 은 Go 가 강점을 갖는다.
- Build Server 와 다른 런타임이지만 `packages/shared-contract` 가 단일 source-of-truth 이고, 동일 JSON Schema / contract spec 문서를 두 언어가 함께 참조하므로 cross-language drift 는 통제 가능하다.
- Runner 는 Host Server REST/JSON API 로만 통신한다. PostgreSQL queue 는 Host Server 내부 구현으로만 사용하고 Runner 는 직접 접근하지 않는다.

비교 메모:

- 두 언어를 동시에 쓰는 만큼 contract / schema 의 단일 source-of-truth 와 contract test 가 필수다. 본 baseline 은 `packages/shared-contract` 가 그 역할을 한다.
- Build Server 까지 Go 로 가는 안은 contract 고정 속도와 Skill/MCP 연결성 면에서 본 단계 baseline 으로는 보류한다.

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
- `FOR UPDATE SKIP LOCKED` 패턴으로 build queue와 preview service queue를 둘 다 Host Server 내부에서 처리할 수 있다.
- build_request / build_log / test_deployment 모델을 가장 자연스럽게 담을 수 있다.

초기 도입 원칙:

- 외부 message broker 없이 시작한다.
- build queue와 preview service queue는 DB 테이블로 분리하되 Host Server 만 직접 접근한다.
- concurrency limit과 active build 판정도 Host Server 의 DB 질의를 기준으로 둔다.

## 7. 왜 Drizzle ORM인가

- TypeScript 친화적이며 schema와 query를 코드 레벨에서 비교적 명확하게 유지할 수 있다.
- Prisma보다 migration/SQL 제어가 가볍고, queue 조회 같은 low-level query를 다루기 수월하다.
- 문서 기반 설계에서 실제 테이블 shape로 내려갈 때 중간 추상화 비용이 낮다.

주의:

- ORM이 queue semantics를 숨기지 않도록 Host Server 내부 queue claim query는 raw SQL 또는 명시적 query builder로 다루는 편이 좋다.

## 8. Runner baseline 방향 (Go)

- Runner 는 Build Server 와 분리된 Go process 로 둔다. 같은 monorepo 안의 `apps/runner/` 에 위치하지만 runtime / 언어는 Build Server 와 다르다.
- Runner 와의 통신은 Host Server REST/JSON API 와 shared contract 의 JSON shape 로만 한다. PostgreSQL queue 는 Host Server 내부 구현으로만 두고, Runner 의 직접 DB 접근은 금지한다.
- Runner 가 책임질 범위:
  - Host Server claim API polling
  - source 준비
  - Docker build 실행
  - phase / result report API 호출
  - preview readiness / cleanup 처리

이유:

- Build Server는 system-of-record, PostgreSQL, queue ownership, API를 모두 가진다. Runner는 비동기 실행만 담당해야 한다.
- Runner 를 Go 로 두면 long-running worker / Docker orchestration 안정성을 우선할 수 있다.
- contract 의 단일 source-of-truth 는 `packages/shared-contract` (TypeScript) 이고, Runner 는 동일 spec 문서를 기준으로 동작한다.

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
- `apps/runner`: queue poller + Docker execution worker
- `packages/shared-contract`: request/status/error schema와 타입
- `packages/shared-config`: env schema, 상수, 공통 설정

## 10. 지금 당장 도입하지 않는 것

- Redis, RabbitMQ, Kafka 같은 외부 queue broker
- Kubernetes 기반 job orchestration
- multi-runner autoscaling
- service mesh / reverse proxy routing 최적화
- Build Server 까지 Go/Python 으로 옮기는 안 — contract drift 위험을 본 단계에서는 감수하지 않는다.
- Build Server 안에서 Node worker 를 띄워 queue 까지 같이 처리하는 안 — Runner 와 책임이 겹친다.
- Build Server ↔ Runner 간 gRPC / 강한 in-process 결합 — MVP 단계에서는 Host Server REST/JSON API 로 충분하다.

이유:

- 현재 단계의 핵심 리스크는 scale보다 contract drift와 lifecycle 복잡도다.
- 외부 인프라를 너무 빨리 넣으면 문서에서 닫은 queue 모델을 검증하기 어려워진다.
- Build Server 와 Runner 가 다른 언어여도 `packages/shared-contract` 가 단일 source-of-truth 이므로 cross-language 결합 자체는 보류 영역이 아니다.

## 11. 기술 스택이 backlog에 미치는 영향

- `PKG-002`와 `PKG-004`는 Fastify + Zod 기준의 API shape 로 구체화할 수 있다.
- `PKG-003`은 PostgreSQL + Drizzle 기준의 persistence 로 구체화할 수 있다.
- `PKG-005` `PKG-006` `PKG-007` 은 Go Runner 기준으로 세부 태스크를 쪼갠다. (`apps/runner/cmd`, `internal/queue`, `internal/hostclient`, `internal/docker`)
- `PKG-001` shared contract 는 `packages/shared-contract` (TypeScript) 로 두되, Build Server 와 Runner 가 동일 JSON Schema / spec 문서를 함께 참조한다.

## 12. 보류 또는 추후 재검토 항목

- object storage 선택
- Docker daemon 연결 방식 (DinD vs DooD)
- migration 도구 세부 선택
- observability stack
- Runner 의 Go module 모듈명 / internal package 경계 (예: `apps/runner/cmd/runner`, `internal/queue`, `internal/docker`)

## 13. 현 단계 결론

- 현재 저장소 기준 baseline recommendation 은 `Build Server = TypeScript (Fastify + Drizzle + PostgreSQL)`, `Runner = Go`, 공통 계층 = `packages/shared-contract` (TS, JSON Schema/스펙 단일 source) 다.
- Build Server 와 Runner 는 서로 다른 언어지만 `packages/shared-contract` 와 Host Server API 를 통해 결합하며, Runner 의 직접 DB 접근이나 in-process import 는 두지 않는다.
- 다음 단계는 `packages/shared-contract` 코드 스캐폴드와 `apps/runner` Go module 골격을 함께 닫는 것이다.
