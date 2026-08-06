# 서비스별 DB 격리 구현 계획

## Requirements Summary

- PostgreSQL 인스턴스는 호스트에 하나만 유지한다.
- hosted sub-service마다 schema, role, credential을 분리한다.
- 서비스 컨테이너에는 host IP를 노출하지 않고 cluster-local DB gateway만 사용한다.
- platform metadata DB와 service application data DB를 논리적으로 분리한다.
- provisioning, Secret 주입, migration, redeploy, 삭제 보존 정책을 자동화한다.

## Implementation Steps

1. `packages/db/src/schema`와 migration에 platform/service DB metadata, provisioning status, migration revision을 추가한다. **완료**
2. `ServiceManifest`에 database opt-in과 migration command 계약을 추가하고 password/host/schema 직접 입력을 금지한다. **완료**
3. Build Server service/repository에 idempotent schema/role provisioning과 상태 API를 추가한다. **helper/API 완료, persistent status enrichment pending**
4. `dib-db-gateway` Kubernetes manifest, host PostgreSQL allowlist/TLS 설정, hosted namespace NetworkPolicy를 추가한다.
5. `apps/runner/internal/deploy/k8s_kubectl.go`와 Helm/Argo adapters에 Secret reference와 cluster-local `DATABASE_URL` 주입을 추가한다. **완료**
6. 서비스별 migration `initContainer`와 rollout gate를 구현한다. **완료**
7. redeploy/delete/purge lifecycle, audit log, secret rotation을 구현한다.
8. unit/integration/kind e2e/security regression을 추가하고 운영 문서를 갱신한다. **gateway connectivity/schema privilege 및 adapter render 검증 완료, full migration e2e pending**

## Acceptance Criteria

- A/B 서비스 credential 간 schema 접근이 상호 차단된다.
- 서비스 pod 환경에는 host IP가 없고 gateway DNS만 존재한다.
- `/context/api/*` control-plane 라우팅과 DB gateway 라우팅이 서로 분리된다.
- migration 성공 전에는 앱 컨테이너가 시작되지 않는다.
- redeploy 후 데이터가 유지되고 기본 delete는 DB를 보존한다.
- Secret/password가 API, manifest, log, UI에 노출되지 않는다.

## Verification

- PostgreSQL integration: schema/role grants, cross-schema denial, idempotent retry.
- Kubernetes integration: Secret reference, NetworkPolicy, gateway connectivity.
- kind e2e: provision A/B → migrate → write/read → redeploy → read → delete/purge.
- observability: provisioning/migration status와 failure reason을 audit log로 확인.

## ADR

### Decision

호스트 PostgreSQL 단일 인스턴스 안에 서비스별 schema/role을 만들고, hosted pod는
cluster-local Postgres gateway를 통해 접근한다.

### Alternatives considered

- 서비스별 PostgreSQL instance: 격리는 강하지만 현재 “DB는 호스트 한 곳” 제약과
  resource/운영 복잡도가 맞지 않는다.
- 모든 서비스가 공용 schema/role 사용: 구현은 쉽지만 tenant 간 데이터 격리가 없어
  채택하지 않는다.
- hosted app이 host PostgreSQL에 직접 연결: host 격리 요구를 위반하므로 거부한다.

### Consequences

schema isolation으로 비용과 운영 대상은 줄지만 PostgreSQL 인스턴스 장애와 resource
contention은 공유한다. 향후 database-per-service로 승격할 수 있는 provisioning
interface가 필요하다.

### Follow-ups

- gateway 구현체(PgBouncer/TCP proxy) 선택
- host PostgreSQL TLS/firewall 운영 경계 확정
- service migration command/image 정책 확정
- schema purge와 credential rotation 승인 workflow 확정
