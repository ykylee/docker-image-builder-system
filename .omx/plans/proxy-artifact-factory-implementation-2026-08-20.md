# Proxy Artifact Factory 구현 계획

- 상태: planned
- 기준 설계: `docs/design/proxy-artifact-factory-design-2026-08-20.md`
- 대상 backlog: TASK-195 설계 spike → TASK-196 구현 계획

## 1. 요구사항 요약

Docker build와 npm dependency가 외부 proxy에 직접 의존하지 않도록 내부 dependency
proxy/pull-through cache를 기본 경로로 사용한다. cache miss는 allow-listed upstream
fetch와 integrity 검증으로 흡수하고, proxy가 처리하지 못하는 경우에만 prefetch 후
Docker build를 한 번 재시도한다. host local materialization은 MVP 기본 경로에서 제외한다.

## 2. 구현 원칙

1. proxy/cache 핵심은 기존 표준 registry/repository proxy를 우선 사용하고 자체 서버 구현은
   provenance·prefetch·정책 통합에 필요한 최소 범위로 제한한다.
2. Dockerfile을 임의 변조하지 않고 registry mirror와 명시적 Node/npm profile로 주입한다.
3. artifact는 mutable tag가 아니라 content digest와 lockfile/base image digest로 식별한다.
4. proxy credential은 Runner build와 분리하고 image layer/log/manifest에 남기지 않는다.
5. direct external access는 명시적 개발 profile에서만 허용하며 production profile은 내부
   endpoint를 강제한다.

## 3. 단계별 실행 계획

### P0 — 계약 고정

대상: `packages/shared-contract`, `apps/runner/internal/config`, 설계 문서

- Artifact profile(`factory URL`, ecosystem, mode, retry limit) 계약 정의
- manifest 필드와 digest 검증 규칙 정의
- 오류 코드 5종과 Build Server/Runner 매핑 정의
- prefetch 1회·idempotency·correlation ID 계약 정의

완료 게이트: TypeScript/Go 계약 drift 검사와 오류 envelope fixture가 통과한다.

### P1 — Proxy fixture 및 인프라

대상: `compose.dev.*`, `examples/`, `apps/runner/scripts/`

- registry pull-through mirror fixture 구성
- Node/npm proxy fixture와 allow-list upstream 구성
- cache volume, credential secret, health/readiness, retention 설정
- cache hit/miss/upstream deny/integrity mismatch fixture 추가

완료 게이트: 외부 upstream을 차단한 상태에서도 cache hit build가 성공하고, cache miss는
허용 upstream fetch 후 동일 요청을 완료한다.

### P2 — Runner build profile 연동

대상: `apps/runner/internal/config/config.go`, `apps/runner/internal/docker/client.go`,
`apps/runner/internal/services/build_service.go`

- internal registry mirror와 npm profile 전달 경로 추가
- build context에 secret/config를 안전하게 주입하고 cleanup
- BuildImage 오류를 factory 오류 코드로 분류
- prefetch 호출 및 Docker 재시도 최대 1회 구현
- 동일 build의 retry idempotency와 terminal error 보존

완료 게이트: Node/npm Docker fixture가 내부 endpoint만 사용해 성공하고, credential이
history/layer/log에 남지 않는다.

### P3 — 보안·관측성·운영 정책

대상: factory 설정, Runner logs/metrics, `docs/operations/`

- upstream host/path allow-list와 arbitrary URL 차단
- Runner read/prefetch 권한과 operator eviction 권한 분리
- cache hit/miss, upstream fetch, integrity failure, eviction metric 추가
- manifest/provenance 및 retention/audit 절차 문서화

완료 게이트: SSRF/credential leak/digest mismatch 회귀가 차단되고 운영자가 buildId,
runnerId, artifactId로 원인을 추적할 수 있다.

### P4 — 통합·staging 검증

대상: `apps/runner/scripts/`, CI/nightly, staging 문서

- cache hit/miss/upstream blocked/integrity failure/auth failure e2e
- prefetch 후 Docker 단 1회 재시도 e2e
- 동일 lockfile/base digest 반복 build의 artifact digest 재사용 검증
- proxy 장애와 registry 장애의 rollback/direct-build 정책 검증
- staging에서 retention, restore, credential rotation rehearsal

완료 게이트: 설계 문서의 9개 검증 게이트와 회귀 기준을 모두 충족한다.

### P5 — 채택 판정 및 확대

- BuildKit mirror/cache-only와 proxy product 조합의 비용·운영 결과 비교
- Node/npm MVP 운영 승인 또는 보류 결정
- Python/Maven/Go adapter를 별도 TASK로 분리
- private beta 진입 게이트와 연결

## 4. 테스트 계획

| 층위 | 검증 항목 |
|---|---|
| Unit | profile parsing, manifest digest, error mapping, retry cap, secret redaction |
| Integration | proxy cache/upstream/allow-list, registry mirror, npm integrity, Postgres metadata |
| E2E | Docker build cache hit/miss, prefetch+retry, blocked upstream, auth failure |
| Security | SSRF, mutable tag rejection, credential leak scan, cross-role eviction denial |
| Operational | retention/eviction, proxy restart, registry restore, metric/log correlation |

## 5. 위험과 완화

- **기존 proxy 제품의 ecosystem 차이**: Node/npm MVP만 고정하고 adapter 계약으로 확장한다.
- **Dockerfile이 내부 endpoint를 사용하지 않음**: production profile에서 profile 미적용을
  fail-closed하고 direct external access를 열지 않는다.
- **proxy credential 유출**: BuildKit secret/profile만 허용하고 image history/log 회귀를 둔다.
- **upstream 악성/변경 artifact**: allow-list, lockfile integrity, digest pinning, provenance를
  모두 요구한다.
- **cache eviction으로 재현성 상실**: 참조 중 artifact 보호와 retention grace period를 둔다.

## 6. 완료 기준

- Node/npm MVP가 내부 proxy를 기본 사용한다.
- cache hit/miss와 허용 upstream fetch가 성공한다.
- integrity mismatch, upstream blocked, factory auth failure가 서로 다른 오류로 보고된다.
- prefetch 경로의 Docker 재시도는 build당 최대 1회다.
- proxy credential이 image history/layer/log/manifest에 없다.
- 동일 입력 digest가 동일 artifact digest를 재사용한다.
- staging 운영 체크리스트와 rollback/retention 절차가 승인된다.

## 7. ADR

### Decision

MVP는 기존 registry/repository proxy를 기반으로 registry mirror + Node/npm proxy를
구성하고, Runner는 profile·오류·prefetch orchestration만 구현한다.

### Alternatives

- BuildKit registry mirror/cache만 사용: base image에는 단순하지만 package ecosystem별
  endpoint가 남는다.
- 자체 proxy 서버를 처음부터 구현: 정책 통합은 쉽지만 cache/protocol 공급망 위험과 유지비가 크다.
- host local build를 기본 사용: proxy 영향은 줄지만 실행 환경 drift와 credential 경계가 커진다.

### Consequences

MVP는 표준 proxy 운영에 의존하고, package ecosystem 추가는 adapter 작업이 된다. 대신
Runner의 보안 경계와 Docker build 재현성을 유지하면서 점진적으로 확장할 수 있다.
