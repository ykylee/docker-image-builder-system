# Proxy Artifact Factory 설계

## 1. 설계 결정

Artifact Factory는 사용자 source를 대신 빌드하는 서비스가 아니라, Docker build가
사용할 base image와 package dependency를 내부 endpoint로 제공하는 thin dependency
proxy/pull-through cache로 둔다. cache miss는 factory가 allow-listed upstream에서
가져와 검증·저장한 뒤 같은 요청에 반환한다.

MVP에서는 registry/package proxy 자체를 새로 구현하지 않고 검증된 proxy 제품 또는
registry mirror를 우선 배치한다. 지원 ecosystem은 **Python, npm, Go, Rust**로 고정한다.
Build Server/Runner는 profile, digest, 오류 계약과 fallback orchestration만 소유한다.
BuildRequest의 선택적 `artifactProfile`은 Build Server가 JSONB로 보존하고 claim 응답으로
Runner에 전달한다. profile이 없는 기존 요청은 기존 경로를 그대로 사용한다.

## 2. 논리 구성

```text
Runner ── Docker daemon/build worker ──┬── registry mirror (base image)
                                      └── package proxy adapters (Python/npm/Go/Rust)
                                              │
                                              ├─ cache
                                              └─ allow-listed upstream

Build Server ── artifact profile/manifest policy
Operator ───── upstream allow-list, credentials, retention, audit
```

- **Runner**: 내부 endpoint profile을 build context에 적용하고 build 결과의 artifact
  참조·오류·provenance를 보고한다.
- **Factory proxy**: 요청 인증, cache lookup, upstream fetch, integrity check, immutable
  저장, eviction을 담당한다.
- **Policy/metadata**: artifact coordinate, digest, lockfile/base digest, recipe,
  provenance를 기록한다. 이 메타데이터는 proxy binary와 분리된 저장소에 둘 수 있다.
- **Upstream**: 명시된 host/path allow-list에 포함된 원천만 허용한다.

## 3. 요청 흐름

### 3.1 Base image

1. Docker daemon의 registry mirror를 내부 endpoint로 설정한다.
2. `FROM image@sha256:<digest>`를 우선 사용한다.
3. mirror cache hit면 외부 호출 없이 반환한다.
4. miss면 mirror가 allow-listed upstream에서 pull하고 digest를 확인한 뒤 캐시한다.

### 3.2 Package dependency (Python/npm/Go/Rust)

1. build profile이 ecosystem별 내부 package proxy URL을 지정한다.
2. package manager가 metadata/archive/module을 proxy에 요청한다.
3. cache miss는 proxy가 upstream에서 가져와 lockfile integrity와 대조한다.
4. Docker build는 동일 요청 결과를 받아 계속 진행한다.

Dockerfile을 임의로 수정하지 않는다. 지원 profile은 표준 registry 설정, trusted base
image, 또는 명시적 BuildKit secret/config 계약으로만 주입한다. profile을 사용하지 않는
임의 Dockerfile은 direct external access를 자동으로 열지 않고 명확히 실패시킨다.

### 3.3 Prefetch/retry

proxy가 요청-응답 중 miss를 처리할 수 없는 ecosystem만 prefetch를 사용한다.

1. 첫 build가 `UPSTREAM_BLOCKED` 또는 `ARTIFACT_UNAVAILABLE`로 실패한다.
2. Runner가 lockfile과 factory profile을 사용해 prefetch를 요청한다.
3. factory가 모든 dependency를 검증·저장하고 manifest를 반환한다.
4. Runner는 동일 build를 **한 번만** 내부 endpoint 기준으로 재시도한다.
5. 재시도에도 실패하면 원래 오류와 prefetch 오류를 모두 기록한다.

## 4. Artifact manifest 계약

```json
{
  "artifactId": "npm:example-lib@1.2.3",
  "coordinate": "npm/example-lib/1.2.3",
  "contentDigest": "sha256:...",
  "lockfileDigest": "sha256:...",
  "baseImageDigest": "sha256:...",
  "recipeDigest": "sha256:...",
  "source": { "kind": "upstream", "host": "registry.npmjs.org" },
  "provenance": { "fetchedAt": "2026-08-20T00:00:00Z", "verified": true }
}
```

필수 검증:

- coordinate와 content digest가 요청과 일치한다.
- lockfile integrity 또는 upstream 서명이 검증된다.
- mutable tag만 있는 artifact는 production profile에서 거부한다.
- 동일 digest artifact는 immutable이며 참조 중 eviction하지 않는다.

## 5. 오류·관측성 계약

| 코드 | 의미 | 재시도 |
|---|---|---|
| `ARTIFACT_UNAVAILABLE` | 내부 cache와 허용 upstream 모두에서 없음 | prefetch profile만 1회 |
| `ARTIFACT_INTEGRITY_FAILED` | checksum/서명/lockfile 불일치 | 자동 재시도 금지 |
| `UPSTREAM_BLOCKED` | allow-list, proxy, 네트워크 정책으로 차단 | 운영자 확인 후 |
| `PREFETCH_FAILED` | prefetch가 일부 dependency를 만들지 못함 | 전체 retry 1회 |
| `FACTORY_AUTH_FAILED` | Runner/profile 인증 실패 | 자동 재시도 금지 |

모든 요청은 `buildId`, `runnerId`, `artifactId`, cache hit/miss, upstream host,
latency를 correlation ID로 연결한다. proxy credential, Authorization header, signed
URL은 로그에 기록하지 않는다.

## 6. 보안 경계

- factory credential은 secret manager 또는 BuildKit secret으로만 주입한다.
- 사용자 Dockerfile의 `ARG HTTP_PROXY`나 `ARG NPM_TOKEN`에 secret을 넣지 않는다.
- upstream host/path는 allow-list이며 arbitrary URL fetch를 허용하지 않는다(SSRF 방지).
- Runner는 factory read/prefetch 권한만 가지며 upstream credential과 eviction 권한은 없다.
- factory는 Runner host Docker socket, Kubernetes cluster-admin, 사용자 source 실행 권한을
  요구하지 않는다.
- artifact는 digest pinning과 필요 시 서명 검증을 거친다.

## 7. MVP 구현 순서

1. Python, npm, Go, Rust profile과 내부 package proxy fixture를 만든다.
2. registry mirror + `FROM` digest fixture를 만든다.
3. ecosystem별 cache hit/miss, upstream deny, integrity failure, factory auth failure를 테스트한다.
4. Runner build profile 주입과 오류 매핑을 구현한다.
5. prefetch/retry는 proxy가 처리하지 못하는 fixture에 한해 추가한다.
6. retention, audit, metrics를 staging에서 확인한다.

현재 구현 상태: shared contract → Build Server memory/Postgres 저장(`0020_artifact_profile`)
→ Runner hostclient/queue claim DTO까지 연결했다. 실제 build executor의 profile 주입과
artifact client 호출은 다음 milestone에서 수행한다.

## 8. 대안과 선택 기준

- **기존 registry/repository proxy 사용**: MVP 권장. 구현량이 작고 표준 호환성이 높다.
- **BuildKit mirror/cache만 사용**: base image 중심이면 가장 단순하지만 npm/pip 등
  package manager별 endpoint 계약이 별도로 필요하다.
- **자체 Artifact Factory 구현**: provenance, prefetch, 정책 통합이 필요할 때 선택하되,
  proxy/cache 핵심을 직접 재구현하지 않는다.

## 9. 검증 게이트

- Python/npm/Go/Rust package proxy와 registry mirror를 사용하는 Docker build에서 cache hit가 성공한다.
- cache miss가 허용 upstream fetch 후 동일 build를 계속 진행한다.
- integrity mismatch와 upstream 차단은 각각 정해진 오류 코드로 종료한다.
- prefetch 경로는 Docker 재시도를 한 번만 수행한다.
- image history, layer, build log, manifest에 credential이 없다.
- 같은 lockfile/base digest를 다시 빌드할 때 cache hit와 동일 artifact digest를 얻는다.
