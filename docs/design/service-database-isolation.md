# 서비스별 DB 격리 설계

- 상태: in_progress
- 작성일: 2026-08-05
- 범위: hosted sub-service의 데이터베이스를 호스트 PostgreSQL에서 유지하되 서비스별 schema/role로 격리

## 1. 현재 상태와 문제

현재 hosted app 배포는 `apps/runner/internal/deploy/k8s_kubectl.go`에서
Deployment/Service/Ingress/ResourceQuota만 생성한다. 앱 컨테이너에는
`APP_BASE_PATH`만 주입되며 `DATABASE_URL`, Secret, PVC, DB Service는 없다.

`packages/shared-contract/src/build/manifest.ts`의 `ServiceManifest`도 이미지,
runtime, hosting, deployment 정보만 포함한다. 따라서 현재 서비스는 독립 DB를
갖지 않고, `/context/api/*`를 공용 control-plane에 호출한다.

1차 vertical slice에서 `ServiceManifest.database` opt-in 계약과 platform
`service_database` metadata table/migration을 추가했다. 실제 schema/role 생성,
schema/role provisioning helper까지 추가했다. HTTP endpoint, Kubernetes Secret
주입 API까지 추가했다. `SERVICE_DB_GATEWAY_HOST`가 없는 환경에서는 503으로
중단하며, gateway 연결 전에는 schema/role을 생성하지 않는다. hosted Deployment는
플랫폼 Secret을 optional `DATABASE_URL`로 읽고 gateway/NetworkPolicy manifest는
`examples/k8s-db-gateway.yaml`에 둔다. kubectl/Helm/ArgoCD 배포 경로 모두 같은
Secret reference 계약을 사용한다. kind 환경에서 gateway를 실제 적용해
host PostgreSQL `select 1` 왕복과 서비스 role의 schema 권한 경계를 검증했다.

호스트 Compose의 PostgreSQL(`compose.dev.yaml`)은 Build Server의 build history와
service registry를 저장하는 플랫폼 DB다. hosted app의 데이터를 저장하는 서비스
DB와는 목적과 권한을 분리해야 한다.

## 2. 결정안

PostgreSQL 인스턴스는 호스트에서 하나만 유지한다. 서비스가 생성되거나 처음
배포될 때 다음을 서비스 단위로 생성한다.

- PostgreSQL schema: `svc_<service_id>`
- PostgreSQL login role: `svc_<service_id>`
- 랜덤 credential과 Kubernetes Secret
- schema 전용 `DATABASE_URL`
- 서비스 migration metadata 및 현재 migration revision

서비스 컨테이너는 호스트 IP를 보지 않는다. 클러스터 내부의
`dib-db-gateway` Service만 접속 대상으로 사용한다.

```text
host PostgreSQL
  ├── dibs_platform database       <- Build Server/platform tables
  └── dibs_services database        <- service schemas
       ├── svc_<id_a>
       └── svc_<id_b>

host PostgreSQL <- restricted gateway connection <- dib-db-gateway Service
                                                   <- hosted app
```

`dib-db-gateway`는 SQL을 대신 저장하는 애플리케이션 API가 아니라 TCP/Postgres
proxy로 둔다. 앱은 Postgres protocol을 사용하고, 실제 DB 접근 통제는 gateway의
NetworkPolicy와 PostgreSQL role/schema 권한을 함께 적용한다.

## 3. 데이터 경계

| 영역 | 저장 위치 | 접근 주체 |
|---|---|---|
| build 요청/phase/log/source metadata | `dibs_platform` | Build Server, Runner |
| hosted service registry/manifest | `dibs_platform` | Build Server/admin |
| 서비스 앱 데이터 | `dibs_services.svc_<id>` | 해당 서비스 pod의 role |
| 서비스 migration 상태 | `dibs_services.svc_<id>` 또는 platform migration table | 해당 서비스 migration job + 해당 role |
| DB credential | Kubernetes Secret, 원문은 host secret store 권장 | 해당 서비스 pod, provisioning controller |

서비스 role은 다른 schema에 `USAGE`, `CREATE`, table 권한을 갖지 않는다.
`PUBLIC` 권한과 default privilege도 provisioning 시 회수한다.

## 4. Provisioning lifecycle

1. Build Server가 서비스 식별자를 DNS-safe canonical ID로 확정한다.
2. Provisioning controller가 schema/role/password를 생성한다.
3. `Secret/dib-service-<id>-db`를 대상 namespace에 생성한다.
4. hosted Deployment에 `DATABASE_URL`을 Secret reference로 주입한다.
5. 앱 Pod의 migration `initContainer`를 동일 Secret과 동일 service role로 실행한다.
6. migration `initContainer`가 성공한 뒤에만 앱 컨테이너가 시작된다.
7. 서비스 registry에 `dbProvisioningStatus`, `dbSecretRef`, `schemaName`, `migrationRevision`을 기록한다.

재시도는 service ID 기준 idempotent해야 한다. 이미 존재하는 schema/role은
소유권과 fingerprint를 확인한 뒤 재사용하며, 다른 서비스의 이름을 재사용하지
않는다.

## 5. 네트워크 및 보안

- hosted app의 egress는 `dib-db-gateway` Service의 Postgres port로 제한한다.
- hosted app namespace에서 호스트 IP, Kubernetes API, Build Server admin API로의
  직접 egress는 차단한다.
- gateway만 host PostgreSQL의 허용 source network에서 접속할 수 있게 한다.
- PostgreSQL은 TLS를 사용하고 `sslmode=verify-full`을 서비스 URL 기본값으로 한다.
- Secret은 manifest JSON이나 build log에 절대 출력하지 않는다.
- role에는 `CREATEDB`, `CREATEROLE`, `SUPERUSER`, replication 권한을 주지 않는다.
- schema 이름은 사용자 입력을 그대로 SQL identifier로 사용하지 않고 서버가 생성한
  immutable service ID에서만 만든다.

## 6. 계약 변경 초안

`ServiceManifest`에는 앱이 DB를 요구하는지와 migration 정책만 선언한다. 실제
password, host IP, schema 이름은 manifest에 받지 않는다.

```ts
database: z.object({
  enabled: z.boolean().default(false),
  engine: z.literal("postgres").default("postgres"),
  migrationCommand: z.string().min(1).max(512).optional()
}).strict().default({ enabled: false, engine: "postgres" })
```

`secretName`도 caller 입력으로 받지 않는다. 플랫폼이 서비스 ID에서 생성하고
metadata에 저장한다.

서버가 `secretName`, schema, connection endpoint를 결과 응답에 포함할 때도
password는 제외한다. `DATABASE_URL`은 Kubernetes Secret의 `connectionString`
key로만 제공한다.

## 7. 구현 단계

### Phase A — 플랫폼 DB와 서비스 DB 분리

- `compose.dev.yaml`에서 platform DB 이름을 명시하고 service DB용 database를
  별도로 만든다.
- `packages/db`에 service database provisioning/audit schema를 추가한다.
- Build Server에 `POST /admin/services/:appName/database/provision`과 상태 조회를
  추가한다.

### Phase B — gateway와 Secret

- kind 환경에 `dib-db-gateway` Deployment/Service를 추가한다.
- gateway에서 host PostgreSQL 연결과 TLS/allowlist를 설정한다.
- runner/K8s deployer가 service Secret reference와 `DATABASE_URL` envFrom을
  Deployment에 주입한다.
- NetworkPolicy로 hosted app → gateway만 허용한다.

### Phase C — migration과 lifecycle

- 서비스 source contract에 migration command를 추가한다.
- kubectl/Helm/ArgoCD 배포 시 migration `initContainer`를 실행하고 성공해야 앱
  컨테이너가 시작되도록 한다. 별도 Job을 만들지 않아 hosted namespace의 Pod
  quota를 추가로 소비하지 않는다.
- `initContainer`도 ResourceQuota 계산에 포함되므로 앱과 동일한 CPU/memory
  resource profile을 명시한다.
- redeploy 시 schema는 유지하고, service 삭제 시 기본값은 DB 보존이다.
- 명시적 purge 작업에서만 grace period 후 schema/role/Secret을 회수한다.

## 8. 수용 기준

- 서비스 A와 B가 각각 다른 schema/role을 갖는다.
- A credential로 B schema의 table 조회/생성이 실패한다.
- A 컨테이너에는 host IP가 아닌 `dib-db-gateway` endpoint만 전달된다.
- hosted app에서 Kubernetes API와 Build Server `:3000` 직접 접근이 차단된다.
- 서비스 재배포 후 데이터와 schema migration revision이 유지된다.
- control-plane 재시작과 무관하게 서비스 데이터가 유지된다.
- 서비스 삭제 시 기본 동작은 보존이며, purge 명령 없이는 schema/role이 삭제되지 않는다.
- password가 build log, API response, manifest revision, browser response에 노출되지 않는다.

## 9. 주요 위험

- schema 분리는 PostgreSQL 인스턴스 장애와 resource contention을 공유한다. 운영
  규모가 커지면 database-per-service 또는 별도 instance로 승격할 수 있도록
  `engine`/provisioning abstraction을 둔다.
- gateway가 우회되면 host DB가 노출된다. NetworkPolicy, DB firewall,
  role privilege 검사를 적용한다. 외부 HTTPS와 PostgreSQL TLS는 현재 운영
  범위에 포함하지 않으며, 외부 서비스 URL은 기존 HTTP 계약을 유지한다.
- 서비스 migration이 임의 SQL을 실행한다. timeout, resource limit, migration
  image policy, 실행 role 제한을 둔다.
- 호스트 PostgreSQL이 kind 네트워크에서 접근 불가능한 환경이 있다. gateway
  connectivity smoke를 provisioning 전제조건으로 둔다.

## 10. 운영 상태 조회

관리자는 `GET /admin/hosted-services/:appName/database`로 credential 없이
provisioning status, schema/role/Secret 이름, migration command/revision을 조회할 수 있다.

기본 `DELETE /admin/hosted-services/:appName`는 hosted Kubernetes 리소스와
registry만 제거하고 서비스 DB는 보존한다. DB를 영구 삭제하려면
`POST /admin/hosted-services/:appName/database/purge`에
`{"confirmation":"<appName>"}`를 정확히 전달해야 하며, Secret 삭제 후 schema,
role, metadata를 제거한다.

Secret rotation은 `POST /admin/hosted-services/:appName/database/rotate`에
`{"confirmation":"<appName>"}`를 정확히 전달해 수행한다. 기존 schema와 role은
유지하면서 role password와 Kubernetes Secret을 교체하며, Secret 갱신 실패는
상태를 `FAILED`로 기록한다. 응답과 로그에는 credential을 포함하지 않는다.

gateway egress NetworkPolicy는 기본 gateway 매니페스트와 분리한다.
`examples/k8s-db-gateway-egress.yaml`의 upstream CIDR를 클러스터별 host
PostgreSQL 주소로 교체한 뒤 적용하며, `0.0.0.0/0`으로 넓히지 않는다.
