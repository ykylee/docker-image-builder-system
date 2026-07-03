# Docker Build And Deployment Automation Platform SDLC Step 08 - Build Server Tech Stack Baseline

- 문서 목적: Build Server 우선 구현 축을 위한 기술 스택 baseline recommendation을 정리한다.
- 범위: 언어, API 프레임워크, DB, queue 처리 방식, 런타임, 저장소 구조 방향
- 대상 독자: 프로젝트 리드, Build Server 구현자, Runner 구현자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-03

## 1. 결론 요약

- Build Server baseline 언어는 `TypeScript`
- API 프레임워크는 `Fastify`
- 관계형 DB는 `PostgreSQL`
- queue는 `PostgreSQL row locking`
- Runner baseline 언어는 `Go`

## 2. 추천 스택

| 영역 | baseline |
| --- | --- |
| Build Server Language | TypeScript |
| Build Server Runtime | Node.js LTS |
| Runner Language | Go |
| API Framework | Fastify |
| Validation | Zod |
| Database | PostgreSQL |
| Query/Schema Layer | Drizzle ORM |
| Queue Model | Host Server-owned PostgreSQL queue (`FOR UPDATE SKIP LOCKED`) |
| Cross-Language Contract | `packages/shared-contract` |

## 3. 왜 이 조합인가

- Build Server는 Skill/MCP와 계약을 빠르게 맞추기 위해 TypeScript가 유리하다.
- Runner는 long-running worker, Docker orchestration, 외부 배포 adapter 실행에 Go가 적합하다.
- PostgreSQL은 build queue와 결과 저장을 한 곳에서 다루기 쉽다.

## 4. PostgreSQL 사용 원칙

- `FOR UPDATE SKIP LOCKED` 패턴으로 build queue를 Host Server 내부에서 처리한다.
- `build_request / build_log / build_test / deployment_attempt` 모델을 담는다.
- 초기 도입에서는 외부 broker 없이 시작한다.

## 5. Runner baseline 방향

- Runner는 Host Server REST/JSON API와 shared contract의 JSON shape로만 통신한다.
- Runner가 책임질 범위:
  - Host Server claim API polling
  - source 준비
  - Docker build 실행
  - container test
  - deploy adapter 호출
  - phase / result report API 호출

## 6. 저장소 구조 baseline

```text
apps/
  build-server/
  runner/
packages/
  shared-contract/
  shared-config/
  db/
```

## 7. 지금 당장 도입하지 않는 것

- Redis, RabbitMQ, Kafka 같은 외부 queue broker
- Kubernetes 기반 job orchestration
- multi-runner autoscaling
- 테스트/배포 프로토콜 다중 지원

## 8. 기술 스택이 backlog에 미치는 영향

- `PKG-002`와 `PKG-004`는 Fastify + Zod 기준의 API shape로 구체화한다.
- `PKG-003`은 PostgreSQL + Drizzle 기준의 persistence로 구체화한다.
- `PKG-005` 이후는 Go Runner 기준으로 세부 태스크를 쪼갠다.

## 9. 현 단계 결론

- 현재 저장소 기준 baseline recommendation 은 `Build Server = TypeScript (Fastify + Drizzle + PostgreSQL)`, `Runner = Go`, 공통 계층 = `packages/shared-contract` 다.
