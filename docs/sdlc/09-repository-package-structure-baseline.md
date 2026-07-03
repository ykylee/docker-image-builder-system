# Docker Build Preview Platform SDLC Step 09 - Repository Package Structure Baseline

- 문서 목적: Build Server baseline 스택에 맞는 저장소 패키지 구조와 각 디렉터리 책임을 정의한다.
- 범위: monorepo 디렉터리 구조, 앱/패키지 책임, 의존 방향, 초기 생성 순서, 비범위
- 대상 독자: 프로젝트 리드, Build Server 구현자, Runner 구현자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-03 (rev 2: 리뷰 반영, apps/runner 을 Go (go.mod/cmd/internal) 예시로 정렬, 의존방향 / PKG-005~007 경로 갱신)
- 관련 문서: `docs/sdlc/08-build-server-tech-stack-baseline.md`, `docs/sdlc/contracts/01-shared-build-contract-baseline.md`, `docs/sdlc/07-implementation-backlog-baseline.md`

## 1. 문서 목표

이 문서는 Step 08에서 정한 `Build Server = TypeScript (Fastify + Drizzle)`, `Runner = Go`, 공통 계층 = `packages/shared-contract` baseline 을 실제 저장소 구조로 내리기 위한 기준선이다.

이 문서가 답해야 하는 질문:

- 어떤 top-level 디렉터리로 시작하는가
- Build Server(TS) 와 Runner(Go) 는 어디에 놓는가
- shared contract 와 공통 설정은 어디에 두는가
- 의존 방향은 어떻게 제한하는가 (TypeScript / Go 양쪽에서 동일하게)

## 2. 구조 원칙

- 앱 실행 단위와 재사용 패키지를 분리한다.
- shared contract 는 앱보다 아래가 아니라 별도 `packages/`에서 관리한다.
- Runner 는 Build Server 의 하위 모듈이 아니라 별도 언어(Go) 의 실행 앱으로 둔다. Build Server 와 Runner 는 runtime-level import 가 없으며, `packages/shared-contract` 의 spec 과 PostgreSQL queue 로만 결합한다.
- 인프라 세부사항은 앱 내부에만 머물지 않고 공통 설정 패키지로 재사용 가능해야 한다.

## 3. 권장 Top-Level Structure

```text
apps/
  build-server/
  runner/
packages/
  shared-contract/
  shared-config/
  db/
docs/
ai-workflow/
```

## 4. 앱 구조

### 4.1 `apps/build-server`

역할:

- Fastify 기반 API 서버
- build request intake
- 상태 조회 API
- 로그 조회 API
- health endpoint

초기 하위 구조 권장:

```text
apps/build-server/
  src/
    app/
    routes/
    schemas/
    services/
    repositories/
    plugins/
    lib/
  test/
  package.json
  tsconfig.json
```

설명:

- `app/`: Fastify app bootstrap
- `routes/`: endpoint registration
- `schemas/`: request/response Zod schema
- `services/`: use case orchestration
- `repositories/`: DB access
- `plugins/`: Fastify plugins
- `lib/`: app-local helpers

### 4.2 `apps/runner` (Go)

역할:

- build queue poll / claim (PostgreSQL `FOR UPDATE SKIP LOCKED`)
- Docker build 실행
- preview service queue 등록
- readiness, cleanup 처리

초기 하위 구조 권장:

```text
apps/runner/
  go.mod
  go.sum
  cmd/
    runner/
      main.go
  internal/
    queue/
    jobs/
    services/
    repositories/
    docker/
    lib/
  test/
  Dockerfile          # (선택, 운영 배포 시)
```

설명:

- `cmd/runner/`: entry point (`main.go`)
- `internal/queue/`: PostgreSQL queue poll/claim
- `internal/jobs/`: build job, preview job
- `internal/services/`: phase, cleanup orchestration
- `internal/repositories/`: DB access (Go 측 Drizzle 대체는 직접 SQL 또는 sqlx)
- `internal/docker/`: Docker daemon interaction boundary (Docker SDK for Go)
- `internal/lib/`: runner-local helpers
- `go.mod` / `go.sum` 은 TypeScript 패키지 매니페스트를 대체한다 (`package.json` / `tsconfig.json` 은 두지 않는다).

## 5. 패키지 구조

### 5.1 `packages/shared-contract`

역할:

- `PKG-001` shared contract code artifact
- request/response schema
- status enum
- preview enum
- error code
- phase key

권장 하위 구조:

```text
packages/shared-contract/
  src/
    build/
      request.ts
      response.ts
      status.ts
      phase.ts
      errors.ts
    index.ts
  package.json
  tsconfig.json
```

### 5.2 `packages/shared-config`

역할:

- 공통 env schema
- 앱 간 공유 상수
- queue polling interval, timeout, feature flag 같은 운영 설정

권장 하위 구조:

```text
packages/shared-config/
  src/
    env.ts
    constants.ts
    runtime.ts
    index.ts
  package.json
  tsconfig.json
```

### 5.3 `packages/db`

역할:

- Drizzle schema
- migration entry
- DB connection factory
- 공통 repository helper

권장 하위 구조:

```text
packages/db/
  src/
    schema/
      build-request.ts
      build-log.ts
      test-deployment.ts
    client.ts
    migrations/
    index.ts
  drizzle.config.ts
  package.json
  tsconfig.json
```

## 6. 의존 방향 규칙

허용 방향:

```text
apps/build-server  (TypeScript) -> packages/shared-contract
apps/build-server  (TypeScript) -> packages/shared-config
apps/build-server  (TypeScript) -> packages/db

apps/runner        (Go)         -> packages/shared-contract (스펙/JSON Schema 참조)
apps/runner        (Go)         -> packages/shared-config (env / 운영 상수 참조, 가능한 범위)
```

금지 방향:

```text
packages/shared-contract -> apps/*
packages/shared-config -> apps/*
packages/db -> apps/*
apps/build-server -> apps/runner
apps/runner -> apps/build-server
```

원칙:

- app끼리 직접 import 하지 않는다 (TypeScript / Go 양쪽 모두).
- Build Server(TS) 와 Runner(Go) 는 서로 다른 언어이므로, runtime-level import 자체가 불가능하다. 두 app 이 공유할 수 있는 것은 `packages/shared-contract` 의 JSON Schema / spec 문서와 `packages/shared-config` 의 env schema 뿐이다.
- Runner(Go) 가 PostgreSQL queue 와 REST/JSON 으로 Build Server 와 통신할 때도 동일 contract 를 단일 source 로 사용한다.
- shared-contract 는 Docker SDK, DB 구현, 특정 런타임에 의존하지 않는다.

## 7. 초기 생성 순서

1. `packages/shared-contract`
2. `packages/shared-config`
3. `packages/db`
4. `apps/build-server`
5. `apps/runner`

이 순서를 권장하는 이유:

- Build Server와 Runner가 shared contract와 config를 먼저 소비할 수 있어야 한다.
- DB schema가 먼저 있어야 request intake와 queue persistence 작업이 흔들리지 않는다.
- Runner를 늦게 생성해도 문서와 contract 기반으로 안정적으로 따라붙을 수 있다.

## 8. `PKG-*`와 구조 연결

| 패키지 | 주 저장 위치 |
| --- | --- |
| `PKG-001` | `packages/shared-contract/` (TypeScript, Build Server 와 Runner 모두 참조) |
| `PKG-002` | `apps/build-server/src/routes`, `services`, `schemas` |
| `PKG-003` | `packages/db/`, `apps/build-server/src/repositories` |
| `PKG-004` | `apps/build-server/src/routes`, `schemas` |
| `PKG-005` | `apps/runner/cmd/runner`, `internal/queue`, `internal/services` |
| `PKG-006` | `apps/runner/internal/jobs`, `internal/services` |
| `PKG-007` | `apps/runner/internal/services`, `internal/docker` |
| `PKG-008` | 후속 Skill/MCP 저장소 또는 별도 패키지 |
| `PKG-009` | 후속 Skill/MCP 저장소 또는 별도 패키지 |

## 9. 지금 당장 만들지 않는 구조

- `packages/ui/`
- `infra/terraform/`
- `apps/preview-gateway/`
- `services/`와 `apps/`를 동시에 두는 이중 구조

이유:

- 현재는 Build Server와 Runner 두 개의 실행 단위를 선명하게 두는 것이 가장 중요하다.
- preview gateway나 infra-as-code는 MVP build lifecycle이 닫힌 뒤 추가해도 늦지 않다.

## 10. 다음 액션 권장

- `packages/shared-contract/` 코드 스캐폴드 여부 결정
- `packages/db/` 테이블 파일 단위 설계 초안 작성
- `PKG-002` Build Server request intake를 route / schema / service / repository 작업으로 세분화

## 11. 현 단계 결론

- 저장소 기준 baseline package structure 는 다음 다섯 단위다.
  - `apps/build-server` (TypeScript / Fastify / Drizzle)
  - `apps/runner` (Go, `cmd/runner` + `internal/...`)
  - `packages/shared-contract` (TypeScript, JSON Schema/스펙 단일 source)
  - `packages/shared-config`
  - `packages/db`
- Build Server(TS) 와 Runner(Go) 는 runtime-level import 가 없고, `packages/shared-contract` 와 PostgreSQL queue, REST/JSON 으로만 결합한다.
- 다음 단계는 `packages/shared-contract` 코드 스캐폴드와 `apps/runner` Go module 골격을 함께 닫고, 그 위에서 `PKG-002` (Build Server request intake) 와 `PKG-005` (Runner queue claim / Docker build) 를 실제 구현 태스크로 분해하는 것이다.
