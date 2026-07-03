# Docker Build Preview Platform SDLC Step 09 - Repository Package Structure Baseline

- 문서 목적: Build Server baseline 스택에 맞는 저장소 패키지 구조와 각 디렉터리 책임을 정의한다.
- 범위: monorepo 디렉터리 구조, 앱/패키지 책임, 의존 방향, 초기 생성 순서, 비범위
- 대상 독자: 프로젝트 리드, Build Server 구현자, Runner 구현자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/08-build-server-tech-stack-baseline.md`, `docs/sdlc/contracts/01-shared-build-contract-baseline.md`, `docs/sdlc/07-implementation-backlog-baseline.md`

## 1. 문서 목표

이 문서는 Step 08에서 정한 `TypeScript + Fastify + PostgreSQL + Drizzle` 기반 Build Server와 `Go Runner` baseline을 실제 저장소 구조로 내리기 위한 기준선이다.

이 문서가 답해야 하는 질문:

- 어떤 top-level 디렉터리로 시작하는가
- Build Server와 Runner는 어디에 놓는가
- shared contract와 공통 설정은 어디에 두는가
- 의존 방향은 어떻게 제한하는가

## 2. 구조 원칙

- 앱 실행 단위와 재사용 패키지를 분리한다.
- shared contract는 앱보다 아래가 아니라 별도 `packages/`에서 관리한다.
- Runner는 Build Server의 하위 모듈이 아니라 별도 실행 앱으로 둔다.
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

### 4.2 `apps/runner`

역할:

- build queue poll / claim
- Docker build 실행
- preview service queue 등록
- readiness, cleanup 처리

초기 하위 구조 권장:

```text
apps/runner/
  src/
    worker/
    jobs/
    services/
    repositories/
    docker/
    lib/
  test/
  package.json
  tsconfig.json
```

설명:

- `worker/`: loop/bootstrap
- `jobs/`: build job, preview job
- `services/`: queue, phase, cleanup orchestration
- `repositories/`: DB access
- `docker/`: Docker daemon interaction boundary
- `lib/`: runner-local helpers

언어 메모:

- `apps/runner`는 Go 앱 기준으로 해석한다.
- 위 구조는 책임 기준 예시이며 실제 디렉터리명은 Go 관례에 맞춰 `cmd/`, `internal/`, `pkg/` 등으로 조정할 수 있다.
- 중요한 것은 Build Server와 분리된 실행 단위, 그리고 shared contract/DB 경계 준수다.

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
apps/build-server -> packages/shared-contract
apps/build-server -> packages/shared-config
apps/build-server -> packages/db

apps/runner -> packages/shared-contract
apps/runner -> packages/shared-config
apps/runner -> packages/db
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

- app끼리 직접 import하지 않는다.
- 공통 타입/설정/DB schema는 packages 계층에서만 공유한다.
- shared-contract는 Docker SDK나 DB 구현에 의존하지 않는다.

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
| `PKG-001` | `packages/shared-contract/` |
| `PKG-002` | `apps/build-server/src/routes`, `services`, `schemas` |
| `PKG-003` | `packages/db/`, `apps/build-server/src/repositories` |
| `PKG-004` | `apps/build-server/src/routes`, `schemas` |
| `PKG-005` | `apps/runner/src/worker`, `jobs`, `services` |
| `PKG-006` | `apps/runner/src/jobs`, `services` |
| `PKG-007` | `apps/runner/src/services` |
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

- 저장소 기준 baseline package structure는 `apps/build-server`, `apps/runner`, `packages/shared-contract`, `packages/shared-config`, `packages/db` 조합이다.
- 다음 단계는 이 구조를 기준으로 `PKG-002`를 실제 구현 태스크 수준으로 더 잘게 분해하는 것이다.
