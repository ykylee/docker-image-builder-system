# 실서비스 진입 계획 및 로드맵

- 작성일: 2026-08-05 (2026-08-20 상태 리뷰 갱신)
- 목표: 현재 self-dogfood/MVP를 제한적 private beta를 거쳐 실서비스 수준으로 전환
- 현재 판정: 내부 self-dogfood 가능, 외부 다중 사용자 실서비스 불가
- 기준 문서: `docs/operations/current-state-and-readiness-2026-08-05.md`

## 0. 2026-08-20 상태 리뷰

### 현재 판정

내부 self-dogfood은 계속 가능하지만, private beta 진입은 보류한다. Phase 1의
provider-neutral session/OIDC 기반과 tenant owner/admin policy, `AUTH_MODE=required`
signed Runner token 경로가 구현되었고, TASK-180 stale build lease recovery도 반영됐다.
다만 실제 Keycloak audience/role mapper smoke, Runner credential 발급·lease token,
rootless build 격리와 namespace-scoped RBAC는 아직 운영 검증되지 않았다.

### 검증된 기준선

- Build Server 관련 TypeScript `tsc --noEmit` 4개 패키지 PASS
- Runner `go test ./...` PASS
- fake OIDC issuer 기반 principal/session 및 negative claim 회귀 PASS
- required-auth Compose/Kubernetes manifest 정적 YAML 검증 PASS

### 잔여 차단 게이트

1. **Identity 외부 연동** — Keycloak 연결 가능 환경에서 access-token audience와
   `realm_access.roles`/`OIDC_ADMIN_ROLE`을 실 token으로 검증한다.
2. **Runner 권한 경계** — required token은 fail-fast와 bearer 검증까지 제공하지만,
   per-runner credential 발급·claim lease token·runner 간 phase mutation 차단은 남아 있다.
3. **실행 격리** — 현재 Kubernetes Runner 예시는 `/var/run/docker.sock` hostPath를
   사용한다. rootless BuildKit, 최소 RBAC, NetworkPolicy, malicious Dockerfile 회귀가
   완료되기 전에는 untrusted build를 허용하지 않는다.
4. **복구·운영성** — stale lease recovery는 구현됐지만 dead-letter/retry 상한,
   control-plane restart persistence/backup-restore, DB provisioning 보상·재시도,
   artifact retention과 alert/soak 기준은 남아 있다.

### 우선순위 조정

| 순위 | 다음 작업 | 완료 게이트 |
|---:|---|---|
| 1 | Runner API least-privilege 설계 및 rootless worker spike | socket 없는 build + RBAC deny 회귀 |
| 2 | Keycloak 실환경 smoke 및 OIDC 운영 체크리스트 | audience/role/expiry/rotation 실측 |
| 3 | runner-bound lease token과 phase ownership | 다른 Runner의 claim/phase 변경 401/403 |
| 4 | control-plane Postgres/backup 및 DB retry 보강 | restart·restore·provision retry PASS |
| 5 | retention, quota, metrics/alerts, private beta rehearsal | 24시간 soak + rollback rehearsal |

## 1. 목표와 비목표

### 목표

- 인증된 사용자만 자신의 build/service 데이터를 조회한다.
- 인증된 관리자만 운영·DB·Runner 관리 API를 호출한다.
- 인증된 Runner만 claim과 phase/deployment 보고를 수행한다.
- 비신뢰 build를 플랫폼 권한과 분리한다.
- control-plane, queue, DB lifecycle이 재시작과 부분 실패를 견딘다.
- 운영자가 장애·비용·용량·데이터 보존을 관찰하고 복구할 수 있다.

### 비목표

- HTTPS 도입: 현재 사용자 결정에 따라 이번 계획의 기본 전제에서 제외한다.
- database-per-service 인스턴스 분리: 1차는 host PostgreSQL + schema/role 격리를 유지한다.
- 무제한 public hosting: private beta 이후 별도 승인 항목으로 둔다.

## 2. 진입 기준

다음 조건을 모두 만족하기 전에는 private beta를 시작하지 않는다.

- CRITICAL 보안 이슈 0건
- HIGH 운영 이슈 0건 또는 명시된 완화책과 owner 존재
- 사용자/관리자/Runner 인증 통합 테스트 통과
- cross-tenant 접근 테스트 전부 거부
- Runner 장애 후 build 자동 복구 테스트 통과
- control-plane 재시작 후 build/service 데이터 보존
- DB provisioning 실패 후 재시도 및 Secret rotation 통과
- 24시간 soak test에서 queue stuck, memory leak, disk growth 임계치 이내
- backup/restore rehearsal 완료
- rollback 절차를 실제 staging에서 1회 이상 수행

제안 SLO는 제품 확정 전의 초기값이다.

| 지표 | 초기 목표 |
|---|---:|
| API read p95 | 500ms 이하 |
| API error rate | 5xx 1% 이하 |
| queue claim latency p95 | 10초 이하 |
| stuck build | 15분 이상 0건 |
| service DB provisioning success | 99% 이상 |
| control-plane availability | 월 99.5% 이상 |
| RPO | 15분 이하 |
| RTO | 60분 이하 |

## 3. 단계별 로드맵

### Phase 0 — 운영 경계 봉인

목표: hardening 전까지의 위험한 노출을 차단하고 기준 환경을 고정한다.

작업:

- main/build-server, control-plane, hosted ingress의 역할과 canonical DB를 문서화
- `3000`, `18080`, Postgres port의 접근 네트워크를 private allow-list로 제한
- `ADMIN_IDS`와 DB credential을 env 파일/secret manager 경로로 분리
- 현재 image digest, migration revision, K8s manifest를 release artifact로 기록
- 임시 운영 점검표와 rollback 절차를 staging에서 리허설

대상:

- `compose.dev.yaml`
- `examples/k8s-control-plane.yaml`
- `docs/operations/release-checklist-2026-07-20.md`

완료 조건:

- 인터넷에서 관리/API/DB 포트가 접근되지 않음
- 동일 commit/image digest로 main과 control-plane을 재현 가능
- 운영자가 30분 안에 이전 image로 rollback 가능

### Phase 1 — Identity와 테넌트 권한

목표: 사용자 ID 문자열을 실제 인증 주체로 교체한다.

작업:

- 인증 방식 결정: 기존 사내 IdP/OIDC 우선, 없으면 signed session/JWT
- `X-User-Id`/`X-Admin-Id`를 신뢰하지 않고 request principal에서 subject/role 추출
- `/builds`, detail, logs, source, services에 owner policy 적용
- admin API에 role/permission policy 적용
- browser storage에는 token 대신 짧은 수명의 secure httpOnly session 사용. 현재 React의 `accessToken` storage bridge는 IdP/OIDC adapter가 정해지기 전 개발·검증용 임시 호환 경로로만 허용한다.
- CSRF 보호와 CORS origin allow-list 적용

대상:

- `apps/build-server/src/routes/build-routes.ts`
- `apps/build-server/src/routes/admin-routes.ts`
- `apps/build-monitor/react/src/lib/useUserId.ts`
- `apps/build-monitor/react/src/lib/api.ts`
- `apps/build-server/src/app/openapi.ts`

완료 조건:

- 인증 없는 요청은 401
- 다른 사용자의 build/service/detail/log/source 요청은 403 또는 404
- admin role 없는 사용자의 admin API는 403
- 인증 토큰/세션 위조·만료·로그아웃 테스트 통과
- OpenAPI에 security scheme과 route별 권한이 표시됨

### Phase 2 — Runner 인증과 실행 격리

목표: build 실행 주체와 플랫폼 권한을 분리한다.

작업:

- Runner registration 시 per-runner credential 발급
- claim/phase/container-test/deployment API에 signed token 적용 (현재 required mode의
  공통 `AUTH_SECRET` bearer까지 구현; per-runner credential은 후속)
- claim 응답에 lease token과 expiry 추가
- Runner별 K8s RBAC 최소 권한
- build sandbox를 host Docker socket 공유에서 분리
- rootless BuildKit 또는 전용 build worker 도입
- build network, CPU, memory, process, timeout 제한
- 사용자 build와 platform control-plane image를 실행 node/namespace로 분리

대상:

- `apps/runner/internal/hostclient/build_control_client.go`
- `apps/runner/internal/services/build_service.go`
- `apps/runner/internal/docker/client.go`
- `apps/runner/internal/deploy/k8s_kubectl.go`
- `compose.dev.yaml`

완료 조건:

- credential 없는 Runner API 호출은 401/403
- 다른 Runner가 claim한 build의 phase를 변경할 수 없음
- sandbox build에서 Docker socket/Kubernetes API 접근 불가
- resource/timeout 초과 build가 정리되고 FAILED로 종료
- 악성 Dockerfile fixture와 네트워크 escape 테스트 통과

### Phase 3 — 영속 Control Plane과 queue recovery

목표: control-plane 재시작과 Runner 장애에도 데이터와 queue가 복구된다.

작업:

- control-plane을 Postgres backend로 전환
- main/control-plane의 registry SSOT와 migration ownership 확정
- `claimedAt`, `leaseExpiresAt`, `runnerId`, retry count 추가
- heartbeat와 stale lease reaper 구현
- 재시도 초과 build용 dead-letter 상태 추가
- control-plane replica/readiness/rollout/backup 구성
- migration은 startup 자동 적용과 별도 운영 migration 중 하나로 정책 고정

대상:

- `apps/build-server/src/repositories/postgres-build-repository.ts`
- `apps/build-server/src/services/build-service.ts`
- `apps/build-server/src/app/create-app.ts`
- `apps/build-server/migrations/`
- `examples/k8s-control-plane.yaml`

완료 조건:

- control-plane pod 재시작 후 build/service 데이터 보존
- Runner 강제 종료 후 lease timeout 이내 자동 재queue 또는 terminal 처리
- 2개 이상 Runner가 중복 claim하지 않음
- queue claim p95가 10초 이하
- backup restore 후 RPO/RTO 목표 충족

### Phase 4 — 서비스 DB lifecycle 완성

목표: 서비스 DB provisioning을 부분 실패에도 복구 가능한 상태 machine으로 만든다.

작업:

- `PROVISIONING`, `READY`, `FAILED`, `ROTATING`, `PURGING` 상태 전이 명시
- Secret write 실패 시 `FAILED`와 원인 기록
- 기존 `PROVISIONING` row의 안전한 retry 지원
- schema/role/Secret 보상 정리와 orphan detector 추가
- migration command timeout/resource 제한
- migration revision 기록과 실패 시 rollout 차단
- default privileges와 role 권한 정기 검증
- purge는 grace period와 명시적 confirmation을 유지

대상:

- `apps/build-server/src/services/service-database-provisioner.ts`
- `apps/build-server/src/routes/admin-routes.ts`
- `apps/build-server/src/services/k8s-secret-writer.ts`
- `apps/build-server/migrations/0017_service_database.sql`
- `apps/build-server/migrations/0018_service_database_id_default.sql`
- `examples/k8s-db-gateway.yaml`

완료 조건:

- provision/Secret 실패 후 retry가 성공
- rotation 실패 시 기존 credential과 상태가 안전하게 보존됨
- 서비스 A credential로 B schema 접근 실패
- Pod 재배포 후 데이터와 migration revision 보존
- orphan schema/role/Secret 탐지 결과 0건

### Phase 5 — 운영성, 비용, 관측성

목표: 장애를 발견하고 원인을 추적하며 비용과 용량을 통제한다.

작업:

- structured log에 request/build/runner/service correlation ID 추가
- metrics: request latency, queue depth, claim age, phase duration, pod replicas, DB provisioning, disk/image usage
- alert: stuck build, runner offline, DB gateway failure, quota exhaustion, high 5xx
- workspace/image/source retention job 구현
- API rate limit과 upload quota 적용
- audit log: admin mutation, manifest revision, DB purge/rotation, hosting lifecycle
- 운영 dashboard와 on-call runbook 작성

대상:

- `apps/build-server/src/`
- `apps/runner/internal/`
- `docs/operations/`
- `.github/workflows/`

완료 조건:

- 24시간 soak에서 디스크/메모리 증가가 정한 threshold 이내
- 장애 주입 후 alert가 5분 이내 발생
- audit log로 admin mutation을 재구성 가능
- retention job이 dry-run과 apply 모드를 모두 제공

### Phase 6 — 제한적 private beta

목표: 내부가 아닌 소수의 신뢰된 사용자에게 제한적으로 개방한다.

작업:

- allow-list 기반 tenant onboarding
- 사용자별 quota와 hosted service 수 제한
- beta support channel과 incident response 정의
- 기능 flag로 DB-enabled hosting과 외부 deployment를 분리
- 매 release 전 full e2e와 rollback 실행

완료 조건:

- 3개 이상 독립 tenant fixture에서 cross-tenant 테스트 통과
- 7일간 운영 지표와 incident review 완료
- rollback 및 data restore rehearsal 완료
- Critical/High 보안·복구 이슈 0건

## 4. RALPLAN-DR 요약

### 원칙

1. 인증 경계는 UI가 아니라 서버에서 강제한다.
2. 사용자 build는 플랫폼 권한과 격리한다.
3. 모든 비동기 작업은 lease·retry·복구 모델을 가진다.
4. 데이터 삭제와 credential rotation은 명시적이고 감사 가능해야 한다.
5. 기능 green과 운영 승인 green을 별도 판정한다.

### 의사결정 기준

1. 비신뢰 코드 실행의 blast radius
2. 재시작·부분 실패·데이터 복구 가능성
3. 현재 코드와 운영 환경으로의 도입 난이도

### 선택지

| 선택지 | 장점 | 단점 | 판정 |
|---|---|---|---|
| 기존 헤더/host Docker socket을 유지하고 네트워크만 제한 | 빠른 beta 가능 | 인증 위조와 sandbox escape가 남음 | 임시 내부용만 |
| OIDC/session + signed Runner + 기존 K8s 구조 보강 | 도입 비용과 보안 균형 | 인증·lease·RBAC 작업 필요 | 1차 권장 |
| 완전 분리된 build cluster와 managed DB로 즉시 전환 | 격리와 운영성이 가장 좋음 | 비용·구조 변경이 크고 현재 코드 재작업 범위가 큼 | 2차 확장 |

## 5. Pre-mortem

### 실패 시나리오 1: 사용자 데이터가 다른 tenant에 노출됨

- 조기 신호: 동일 API에서 `X-User-Id` 변경만으로 응답 데이터가 달라짐
- 예방: principal 기반 owner policy와 cross-tenant matrix 테스트
- 대응: tenant 접근 차단, audit 조사, credential/session 전체 회전

### 실패 시나리오 2: 악성 build가 Runner 권한으로 클러스터를 탈출함

- 조기 신호: build pod의 비정상 egress, Docker socket 접근, K8s API 요청
- 예방: rootless BuildKit/전용 worker/RBAC/NetworkPolicy
- 대응: 해당 worker 격리, token revoke, namespace/image cleanup

### 실패 시나리오 3: Runner 장애로 queue가 멈추고 서비스 배포가 누적됨

- 조기 신호: `PREPARING_SOURCE` 또는 `BUILDING` age 증가, queue depth 증가
- 예방: lease/heartbeat/reaper와 dead-letter 상태
- 대응: 자동 requeue, stuck build alert, 수동 replay runbook

## 6. 테스트 계획

### Unit

- auth principal/role/tenant policy
- lease transition/reaper
- DB provisioning state machine 및 retry
- cleanup/retention 계산
- Docker/K8s manifest security assertions

### Integration

- Postgres migration 및 backup/restore
- control-plane restart persistence
- Runner credential 검증
- gateway/schema/role 권한 경계
- Secret rotation과 pod rollout

### E2E

- tenant A/B 독립 build/service 흐름
- Runner kill/restart 후 자동 recovery
- 악성 Dockerfile 및 resource limit
- hosted path/API/docs asset loading
- private beta onboarding/quota/audit flow

### Observability

- 24시간 soak
- queue/phase p95 및 stuck age
- pod restart와 DB gateway 장애 주입
- disk/image/source retention 확인
- alert가 5분 이내 발생하는지 검증

## 7. ADR

### Decision

현재 구조는 내부 self-dogfood 기준선으로 유지하고, private beta 전에는
인증·Runner 격리·queue recovery·control-plane persistence를 필수 gate로 둔다.

### Drivers

- 현재 구현의 가장 큰 위험은 기능 부족보다 신원 위조와 비신뢰 코드의 권한 범위다.
- host PostgreSQL + schema/role 모델은 당장 유지할 수 있으므로 1차 hardening에서
  재사용한다.
- HTTPS는 현재 정책상 제외하지만 private network boundary는 필수다.

### Alternatives considered

- 현재 헤더 인증을 유지한 내부 beta
- OIDC/session과 signed Runner를 먼저 도입하는 점진적 hardening
- 완전 분리 cluster/managed DB로 전환

### Why chosen

두 번째 선택지가 현재 코드와 운영 환경을 가장 많이 재사용하면서도 Critical 위험을
제거할 수 있다. 세 번째 선택지는 장기적으로 유효하지만 1차 진입 계획으로는 비용과
변경 범위가 과도하다.

### Consequences

- private beta 전 구현 기간이 늘어난다.
- API 계약에 security scheme, principal, lease 필드가 추가될 수 있다.
- 기존 self-dogfood용 단순 login과 header 호출은 migration 기간에 호환 계층이 필요하다.

### Follow-ups

- 인증 방식과 IdP를 확정한다.
- 목표 tenant 수, RPO/RTO, 비용 상한을 제품 운영자가 확정한다.
- Phase 1 완료 후 private beta go/no-go review를 진행한다.
