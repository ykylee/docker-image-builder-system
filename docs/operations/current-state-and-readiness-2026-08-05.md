# 현재 구현 현황 및 실사용 준비도

- 작성일: 2026-08-05 (2026-08-20 상태 리뷰 갱신)
- 상태: 현재 구현 기준선
- 범위: Build Server, React Build Monitor, Runner, K8s hosted service, 서비스별 DB
- 판정: 신뢰된 내부 self-dogfood/MVP에는 사용 가능. 인증·격리·복구 게이트가 남아 외부 다중 사용자 실서비스와 private beta에는 미준비.

## 1.1 2026-08-20 갱신 요약

- `AUTH_MODE=oidc` provider-neutral session runtime, OIDC role/audience 설정과 fake issuer
  negative 회귀가 추가됐다. 실제 Keycloak issuer 연결은 환경 제약으로 미검증이다.
- `AUTH_MODE=required`에서 signed Runner bearer token을 검증하고, `RUNNER_AUTH_REQUIRED=true`
  및 token 누락 시 Runner가 fail-fast한다. 기본 legacy/disabled 경로는 내부 호환용으로 남아 있다.
- TASK-180 stale build lease recovery가 다음 claim 시 active build를 queue로 되돌린다.
- Kubernetes required-auth 예시는 Postgres control-plane과 Secret 주입을 제공하지만,
  Runner는 여전히 host Docker socket을 사용한다. 따라서 untrusted build 운영에는 사용할 수 없다.

## 1. 한눈에 보는 결론

현재 시스템은 다음 폐루프를 실제로 수행할 수 있다.

```text
사용자 build 요청
  → source archive 업로드
  → Dockerfile 확인/자동 생성
  → Docker build
  → 컨테이너 health/stability test
  → Kubernetes Deployment/Service/Ingress 배포
  → 서비스 URL·상태·replica 조회
  → 서비스별 Postgres schema/role 연결(옵트인)
```

다만 현재의 사용자 식별은 인증이 아니라 `localStorage userId`와
`X-User-Id`/`X-Admin-Id` 헤더 값에 의존한다. 따라서 이 버전은 내부 검토망과
신뢰된 운영자만 사용하는 self-dogfood 환경으로 제한해야 한다.

## 2. 현재 구현된 범위

### 2.1 Build Server

- Build request 수신 및 상태/phase history 저장
- Memory/Postgres repository backend
- source archive 단일 업로드와 chunked 업로드
- SHA-256 및 선언 크기 검증
- runner claim, phase, container-test, deployment report API
- admin build/user/runner/hosted-service 조회 및 관리 API
- OpenAPI JSON 및 Scalar API Docs
- React SPA 단일 포트 서빙
- `/api/*` → canonical API route rewrite
- `/services` 사용자 서비스 목록 API
- Postgres migration 자동 적용

주요 코드:

- `apps/build-server/src/routes/build-routes.ts`
- `apps/build-server/src/routes/admin-routes.ts`
- `apps/build-server/src/app/create-app.ts`
- `apps/build-server/src/app/openapi.ts`
- `apps/build-server/src/repositories/postgres-build-repository.ts`

### 2.2 React Build Monitor

- Login, Builds, Build Detail, Build Request, API Docs
- 사용자 Services 탭
- Admin Builds, Users, Runners, Services, Database 관리 화면
- status filter 및 hosted service 상태/replica 표시
- path-hosted context에서 asset/API/docs 경로 처리
- Scalar API Console viewport 확장

주의: Login은 인증 화면이 아니라 사용자 ID를 localStorage에 기록하는 MVP 입력
화면이다.

### 2.3 Runner

- source archive fetch 및 checksum 검증
- required/auto Dockerfile 처리
- 실제 Docker CLI build/run 모드
- HTTP health check, TCP port probe, stability window
- K8s kubectl adapter
- Helm/ArgoCD adapter
- Deployment/Service/Ingress/ResourceQuota 생성
- service DB Secret 및 migration initContainer 주입
- 실패 phase와 canonical error code 보고

### 2.4 Hosting

- path-prefix hosting
- optional subdomain hosting 설계 및 adapter
- `APP_BASE_PATH`, `stripPrefix`, runtime URL 조립
- hosted service registry
- start/stop/remove 및 live replica status cache
- host service IP를 container에 직접 주입하지 않는 cluster-local API 경로

현재 self-dogfood 기본 URL:

- 메인 서비스: `http://100.119.181.116:3000`
- API Docs: `http://100.119.181.116:3000/api-console`
- hosted ingress: `http://100.119.181.116:18080/<contextPath>/`

HTTPS는 현재 정책상 사용하지 않는다. 따라서 외부 공개가 아니라 사설망/VPN
범위에서만 운영해야 한다.

### 2.5 서비스별 DB

서비스 manifest가 `database.enabled=true`이면 플랫폼이 다음을 생성한다.

- host PostgreSQL의 schema
- 서비스 전용 login role
- 랜덤 password
- Kubernetes Secret의 `DATABASE_URL`
- 서비스 pod의 `BUILD_REPOSITORY_BACKEND=postgres`
- 선택적 migration initContainer

서비스 pod는 host IP가 아니라 cluster-local `dib-db-gateway`만 바라본다.
schema와 role 이름은 서비스 이름에서 결정론적으로 생성되며 SQL identifier는
인용 처리한다.

관련 문서: [`service-database-isolation.md`](../design/service-database-isolation.md)

## 3. 현재 검증 기준선

2026-08-05 현재 다음 검증이 통과했다.

| 영역 | 결과 |
|---|---:|
| Build Server node:test | 243/243 |
| React Vitest | 289/289 |
| Runner Go test | `go test ./...` PASS |
| Skill/MCP Python test | 227 PASS |
| Build Server TypeScript check | PASS |
| React TypeScript check | PASS |
| Main `/health` | HTTP 200 |
| Main `/docs` | HTTP 200 |
| Main `/api/services` | rewrite 후 서비스 목록 JSON |
| Main API Console | Scalar endpoint list 및 확장 레이아웃 확인 |
| self-hosted K8s service | Deployment/replica/DB persistence 확인 |

이 기준선은 기능 회귀 기준이지 보안 승인이나 운영 승인 기준은 아니다.

## 4. 알려진 제한과 실서비스 차단 사유

### CRITICAL: 인증·테넌트 권한 부재

`X-Admin-Id`는 인증 토큰이 아니라 allow-list 문자열 비교다. `X-User-Id`와
localStorage 사용자 ID도 요청자가 임의로 바꿀 수 있다.

영향:

- 다른 사용자 ID로 서비스/빌드 조회 가능
- build detail/log/source의 소유권 경계 부족
- admin ID를 아는 요청자가 admin API 호출 가능
- public network에 노출하면 사용자·관리자 API가 보호되지 않음

### CRITICAL: Runner 인증은 보호 모드에서만 활성

`AUTH_MODE=required`와 `RUNNER_AUTH_REQUIRED=true`를 함께 사용하면 signed bearer token을
검증하고 token 누락 Runner는 시작 단계에서 종료한다. 그러나 기본 Compose 호환 경로는
legacy/disabled이며, per-runner credential 발급·claim lease token·runner별 phase ownership은
아직 없다. 외부 운영은 required mode를 강제하고 남은 runner-bound 권한 게이트를 완료해야 한다.

### CRITICAL: 비신뢰 build 격리 부족

현재 Kubernetes Runner 예시와 Compose 실행 경로는 host Docker socket을 mount한다.
Kubernetes 배포 권한도 namespace-scoped RBAC로 확정되지 않았다. 비신뢰 Dockerfile을
실행하는 다중 테넌트 운영에는 rootless worker, 최소 권한, network egress 제한이 필요하다.

### HIGH: Control Plane 영속성 분리

현재 kind control-plane 예시는 memory backend 단일 replica다. self-hosted 앱의
`/<context>/api` 요청은 별도 control-plane으로 전달되므로 main Postgres와
build/service registry가 분리된다. control-plane 재시작 시 데이터가 사라질 수
있다.

### HIGH: Claim ownership/복구 확장 미완료

TASK-180으로 기본 stale lease recovery는 구현되어 다음 claim 시 heartbeat가 끊긴
active build를 재queue한다. 다만 runner-bound lease token, retry 상한/dead-letter,
중복 phase mutation 방지와 장애 주입 e2e는 남아 있다.

### HIGH: DB provisioning 실패 재시도 결함

schema/role 생성 뒤 Secret write가 실패하면 metadata가 `PROVISIONING`으로 남는다.
같은 provision 요청은 password 없이 기존 row를 반환해 Secret을 자동 재생성하지
못한다. 실패 상태 기록과 보상/재시도 흐름이 필요하다.

### MEDIUM: 자원·artifact lifecycle 부족

- 성공 build의 workspace/image retention 정책이 불명확하다.
- source upload는 큰 body와 Postgres bytea를 사용하므로 rate limit과 storage quota가 필요하다.
- 단일 runner 및 단일 control-plane은 장애 시 처리량과 복구성이 낮다.
- CORS와 plain HTTP는 사설망 전제를 벗어나면 위험하다.

## 5. 운영 범위 판정

| 사용 시나리오 | 판정 | 조건 |
|---|---|---|
| 개발자 개인 self-dogfood | 가능 | 로컬/사설망, admin 1명 |
| 내부 팀 검증 | 조건부 가능 | VPN 또는 방화벽, 신뢰된 source, 수동 cleanup |
| 제한적 private beta | 불가 | 인증·테넌트 권한·Runner 인증 선행 필요 |
| 외부 다중 사용자 SaaS | 불가 | 현재 보안/격리/복구 모델로는 승인 불가 |

## 6. 운영 전 임시 통제

정식 hardening 전까지는 다음 조건을 지킨다.

1. `3000` 및 `18080`을 인터넷에 공개하지 않는다.
2. VPN/방화벽에서 운영자와 테스트 사용자만 허용한다.
3. 외부 사용자의 임의 Dockerfile을 받지 않는다.
4. `ADMIN_IDS`는 예측 가능한 값 대신 운영 secret에서 주입한다.
5. 주기적으로 Docker image, workspace, Postgres source row를 확인·정리한다.
6. control-plane과 main DB를 동일한 운영 데이터로 간주하지 않는다.
7. 장애 발생 시 active build를 수동 점검하고 필요하면 상태를 복구한다.

## 7. 다음 단계

실서비스 진입 계획은 [`production-readiness-roadmap-2026-08-05.md`](../../.omx/plans/production-readiness-roadmap-2026-08-05.md)를 따른다.
