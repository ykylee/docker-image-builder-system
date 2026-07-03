# Docker Build Preview Platform SDLC Step 14 - Backend Development Target Selection

- 문서 목적: 백엔드 개발 착수 직전, 실제로 먼저 구현할 대상과 뒤로 미룰 대상을 코드 단위로 재정리한다.
- 범위: 1차 착수 대상, 후속 착수 대상, 제외 대상, 선정 기준, 즉시 다음 액션
- 대상 독자: 프로젝트 리드, Build Server 구현자, Runner 구현자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/07-implementation-backlog-baseline.md`, `docs/sdlc/08-build-server-tech-stack-baseline.md`, `docs/sdlc/09-repository-package-structure-baseline.md`, `docs/sdlc/13-backend-development-plan.md`

## 1. 문서 목표

Step 13 개발 계획은 구현 순서를 제시했지만, 실제 코드 착수 관점에서는 여전히 범위가 넓다.

이 문서는 다음 질문에 답하기 위해 작성한다.

- 지금 당장 손대야 할 개발 대상은 무엇인가
- 어떤 항목은 선행 골격 없이 바로 붙이면 재작업 위험이 큰가
- 1차 착수군과 후속 착수군의 경계는 어디인가

## 2. 현재 판단 근거

- 저장소에는 아직 `package.json`, `pnpm-workspace.yaml`, `go.mod`, `tsconfig.json`, `compose.dev.yaml` 같은 실제 실행 골격이 없다.
- 따라서 현재 단계의 핵심은 기능 구현보다 먼저 "실행 가능한 최소 백엔드 뼈대"를 세우는 것이다.
- Build Server는 system-of-record 이고, Runner는 그 뒤를 따르는 비동기 실행 계층이다.
- 공통 계약과 DB 경계가 먼저 닫히지 않으면 TypeScript Build Server와 Go Runner 사이의 drift 위험이 커진다.

## 3. 선정 원칙

- 먼저 만드는 대상은 후속 모든 구현의 canonical source 역할을 해야 한다.
- Build Server P0를 여는 데 직접 기여하지 않는 기능은 1차 착수군에서 뺀다.
- Go Runner는 반드시 열되, preview 운영 로직까지 한 번에 열지는 않는다.
- preview readiness, cleanup, Skill/MCP client는 Build Server P0와 Runner skeleton 이후로 미룬다.

## 4. 1차 착수 대상

### Target A. Workspace And Toolchain Skeleton

목표:

- monorepo 실행 골격을 연다.

포함 범위:

- root workspace manifest
- TypeScript base config
- package manager baseline
- Build Server와 shared packages 빌드 경로

지금 필요한 이유:

- 이후 모든 TS 패키지와 앱의 설치, 빌드, 테스트 명령이 이 골격 위에서만 닫힌다.

### Target B. `packages/shared-contract`

목표:

- Build Server와 Runner가 공통으로 참조할 canonical contract를 코드로 고정한다.

포함 범위:

- build request payload
- build status / preview status
- phase key
- error code
- response envelope 초안

지금 필요한 이유:

- Build Server route/schema와 Go Runner 상태 업데이트 기준이 모두 여기서 출발한다.

### Target C. `packages/shared-config`

목표:

- 런타임 환경값과 공통 상수를 분리한다.

포함 범위:

- env schema
- polling interval
- timeout / retry baseline
- feature flag placeholder

지금 필요한 이유:

- Build Server와 Runner의 운영 파라미터를 초기에 한 곳으로 모아야 이후 drift를 줄일 수 있다.

### Target D. `packages/db`

목표:

- Build Server와 Runner가 공유할 저장 경계를 먼저 고정한다.

포함 범위:

- Drizzle schema baseline
- migration entrypoint
- DB client bootstrap
- `build_request`, `build_log`, `test_deployment` 테이블 초안

지금 필요한 이유:

- `PKG-002`, `PKG-003`, `PKG-004`, `PKG-005` 모두 persistence shape에 직접 의존한다.

### Target E. `apps/build-server`

목표:

- TypeScript/Fastify 기반 Build Server P0의 최소 골격을 연다.

포함 범위:

- Fastify bootstrap
- health endpoint
- `POST /builds`
- `GET /builds/{buildId}`
- `GET /builds/{buildId}/logs`
- route / schema / service / repository 분리

지금 필요한 이유:

- Build Server가 먼저 열려야 system-of-record 경계와 API contract가 실제 코드 기준으로 검증된다.

## 5. 2차 착수 대상

### Target F. `apps/runner` Go Skeleton

목표:

- Go Runner를 실제 실행 단위로 열되, 우선 Host Server claim / report API 소비 골격까지만 닫는다.

포함 범위:

- `go.mod`
- `cmd/runner/main.go`
- host server claim poll skeleton
- build phase update/report skeleton
- Docker execution boundary placeholder

지금은 2차인 이유:

- Runner가 Build Server보다 먼저 열리면 queue/persistence contract가 흔들릴 가능성이 높다.

## 6. 3차 이후 대상

### Deferred 1. Preview Readiness / Cleanup

- `PKG-006`, `PKG-007`
- preview queue, readiness, cleanup는 Runner skeleton 이후에 붙인다.

### Deferred 2. Skill/MCP Client

- `PKG-008`, `PKG-009`
- Build Server API contract가 실제 코드로 닫힌 뒤 소비자 계층을 붙인다.

### Deferred 3. Medium Priority Decisions

- `PKG-010`
- Dockerfile 생성 정책, 실패 요약 책임, TTL 연장 같은 항목은 초기 스캐폴드와 병행하지 않는다.

## 7. 최종 선정 결과

이번 백엔드 개발의 실제 착수 대상은 아래 다섯 개로 좁힌다.

1. root workspace / toolchain skeleton
2. `packages/shared-contract`
3. `packages/shared-config`
4. `packages/db`
5. `apps/build-server`

그 다음 착수 대상은 아래 하나다.

6. `apps/runner` Go skeleton

즉, 이번 단계의 핵심은 "Runner 기능 개발"이 아니라 "Build Server P0를 열 수 있는 공통 기반과 system-of-record 골격"이다.

## 8. 바로 다음 액션

- root workspace manifest와 TypeScript base config를 생성한다
- `packages/shared-contract`를 가장 먼저 스캐폴드한다
- `packages/shared-config`, `packages/db`를 이어서 만든다
- 마지막으로 `apps/build-server` bootstrap과 P0 endpoint 골격을 생성한다

## 9. 현 단계 결론

- 현재 저장소는 문서 설계는 충분하지만 코드 진입점은 아직 없다.
- 따라서 개발 대상 선정의 핵심은 기능 목록 나열이 아니라 "어떤 뼈대부터 열어야 전체 백엔드가 안전하게 자라는가"를 자르는 일이다.
- 그 기준에서 1차 착수군은 `workspace -> shared-contract -> shared-config -> db -> build-server` 이고, `apps/runner`는 바로 뒤따르는 2차 착수군으로 두는 것이 가장 안전하다.
