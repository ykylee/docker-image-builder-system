# Proxy 환경용 간이 Artifact Factory 검토안

## 배경

현재 Runner의 `docker build` 경로는 `DOCKER_BUILDKIT=1`만 설정하고 proxy build arg,
daemon registry mirror, dependency cache를 전달하지 않는다. 조직망에서 Docker daemon
또는 build container가 proxy를 거쳐야 하는 경우 `FROM` pull이나 package manager
호출이 실패할 수 있다.

## 요구사항 요약

### 목표

- Docker build가 외부 package registry에 직접 의존하지 않도록 한다.
- cache hit와 cache miss를 같은 내부 endpoint 계약으로 처리한다.
- 실패 후 prefetch/retry가 필요한 경우에도 dependency와 image의 무결성을 보장한다.
- proxy credential과 upstream 인증 정보를 사용자 build에 노출하지 않는다.

### 비목표

- Artifact Factory가 임의 사용자 Dockerfile 전체를 대신 실행하지 않는다.
- 첫 단계에서 모든 언어·패키지 생태계를 동시에 지원하지 않는다.
- mutable tag를 source of truth로 삼거나 공급망 검증을 생략하지 않는다.

### 행위자와 경계

| 행위자 | 책임 | 신뢰 경계 |
|---|---|---|
| Runner/Docker daemon | 내부 endpoint를 통해 base image와 dependency 요청 | untrusted build 실행 영역 |
| Artifact Factory | cache lookup, allow-listed upstream fetch, checksum/manifest 저장 | trusted platform 영역 |
| Upstream registry/index | factory가 승인한 외부 원천 | 외부 네트워크 |
| Operator | upstream allow-list, credential, retention, digest policy 관리 | 운영자 권한 |

### 기능 요구사항

- **FR-1 기본 경로**: Runner는 지원된 package ecosystem과 base image에 대해 내부
  factory endpoint를 기본 사용해야 한다. 직접 외부 endpoint는 명시적 opt-in 없이는
  사용하지 않는다.
- **FR-2 cache hit**: 동일한 canonical coordinate와 digest가 있으면 upstream 호출 없이
  artifact를 반환한다.
- **FR-3 cache miss**: allow-list된 upstream만 조회하고, 응답 checksum/서명 검증 후
  immutable digest로 저장한 뒤 요청을 완료한다.
- **FR-4 prefetch**: 요청-응답 proxy가 어려운 ecosystem은 lockfile 기반 prefetch API를
  제공하고, 성공 시 Docker build를 한 번만 재시도한다.
- **FR-5 fallback**: local dependency materialization은 지원 ecosystem에서만 명시적으로
  활성화하며, 결과는 동일한 artifact manifest 계약으로 등록한다.
- **FR-6 무결성**: artifact manifest에는 coordinate, content digest, recipe/lockfile
  digest, base image digest, source/provenance를 포함한다.
- **FR-7 실패 분류**: `ARTIFACT_UNAVAILABLE`, `ARTIFACT_INTEGRITY_FAILED`,
  `UPSTREAM_BLOCKED`, `PREFETCH_FAILED`를 구분해 보고한다.
- **FR-8 재현성**: 동일 recipe와 입력 digest에 대해 동일 artifact를 재사용하거나,
  차이가 발생하면 provenance에 원인을 남긴다.

### 비기능 요구사항

- **보안**: proxy/upstream credential은 secret store 또는 BuildKit secret으로만 전달하고
  Dockerfile ARG, image history/layer, build log, artifact metadata에 기록하지 않는다.
- **공급망**: upstream host/경로 allow-list, digest pinning, 서명 검증 정책을 지원한다.
- **격리**: factory credential과 Runner build 권한을 분리하고, factory가 Runner의 host
  Docker socket 또는 cluster-admin 권한을 요구하지 않는다.
- **운영성**: cache hit/miss, upstream fetch, prefetch, integrity failure, eviction을
  correlation ID와 함께 관측한다.
- **보존**: artifact retention/eviction과 감사 로그를 제공하며, immutable artifact는
  참조 중 삭제하지 않는다.

### MVP 범위 제안

1. Docker base image registry pull-through mirror
2. 프로젝트와 동일한 Node 계열을 대상으로 한 npm repository proxy 또는 npm bundle
3. cache hit/miss/upstream 차단/integrity failure를 재현하는 fixture
4. 이후 Python/Maven/Go를 adapter 단위로 추가

Dockerfile을 임의로 변조해 package URL을 바꾸기보다, registry mirror 설정과 지원
ecosystem별 표준 proxy 설정을 명시적으로 주입하는 방식을 우선한다.

## 제안 시나리오

Artifact Factory를 사전 산출물 생성기보다 **내부 dependency proxy/pull-through cache**로
운영한다. Docker와 package manager는 기본적으로 factory endpoint를 바라보고, cache miss가
발생하면 factory가 허용된 upstream에서 패키지를 받아 저장한 뒤 같은 요청에 반환한다.

```text
Docker build
  → 내부 Artifact Factory endpoint
  → cache hit: 즉시 반환
  → cache miss: factory가 allow-listed upstream에서 다운로드·검증·저장 후 반환
  → package install 완료, Docker build 계속
```

factory가 요청-응답 중 miss를 채울 수 없는 package ecosystem이면 다음 보조 흐름을 사용한다.

```text
1. Docker build 시도
   └─ 외부 dependency pull/install 실패
2. Artifact Factory prefetch 요청
   └─ lockfile/recipe에 선언된 누락 dependency를 factory가 다운로드·검증·저장
3. Docker build 재시도
   └─ 내부 Artifact Factory의 immutable artifact 소비
```

host/local build는 기본 경로로 두지 않는다. 정말 필요한 ecosystem에서만 다음 별도
fallback으로 제한한다.

```text
1. Docker build 실패
2. Runner host의 local dependency materialization
3. Artifact Factory 등록
   └─ dependency bundle + lockfile/base digest + checksum/provenance 저장
4. Docker build 재시도
   └─ 외부 registry/package index 대신 내부 artifact 소비
```

이 경로는 Dockerfile 전체를 host에서 실행한다는 뜻이 아니다. local fallback은 npm/pip/
Maven/Go module 등 dependency materialization만 담당하고, 최종 image build와 격리는
계속 Runner의 Docker/build worker가 담당한다.

### 경로 계약

- Docker와 package manager는 내부 factory URL을 기본값으로 사용한다. 첫 Docker 실패는
  factory miss인지, upstream 차단인지, checksum 오류인지 분류한다.
- local build 결과는 `artifactId`, content digest, recipe, lockfile digest, base image
  digest를 포함한 manifest로 등록한다.
- Runner는 manifest를 검증한 뒤 artifact를 build context의 고정 경로에 materialize하고,
  Dockerfile은 그 경로 또는 내부 artifact endpoint만 사용한다.
- artifact가 없거나 digest가 맞지 않으면 외부 네트워크 재시도 대신
  `ARTIFACT_UNAVAILABLE`/`ARTIFACT_INTEGRITY_FAILED`를 보고한다.

## 제안 범위

간이 factory는 사용자 build를 대신 실행하는 별도 플랫폼이 아니라, 신뢰된 네트워크에서
반복적으로 필요한 base/dependency image를 미리 빌드·검증·보관하는 경로로 한정한다.

1. Factory job이 명시된 recipe, lockfile, base image digest를 입력으로 받는다.
2. proxy 설정은 factory 실행 환경 또는 BuildKit secret/profile로 주입하며, 이미지 ARG와
   build log에 proxy credential이 남지 않도록 한다.
3. 결과는 private registry에 immutable digest와 provenance(metadata/SBOM 후보)로 저장한다.
4. Runner는 허용된 digest를 pull하거나 bundle을 materialize해 사용자 build의
   `FROM`/dependency source로 사용한다.
5. direct build fallback은 유지하되, proxy 미지원 환경에서는 명확한 원인과 재시도 경로를
   보고한다.

## 반드시 분리할 것

- proxy credential을 사용자 Dockerfile의 `ARG` 또는 image layer에 직접 주입하지 않는다.
- mutable tag만으로 artifact를 선택하지 않는다. digest allow-list 또는 서명 검증이 필요하다.
- factory registry를 Runner의 Docker socket 권한 또는 Kubernetes cluster-admin과 결합하지 않는다.
- 초기 버전에서 임의 사용자 source를 factory가 자동 실행하지 않는다. trusted artifact
  recipe만 허용한다.

## 1차 수용 기준

- proxy가 필요한 환경에서 base image pull과 package install을 성공시키는 재현 가능한 e2e가 있다.
- proxy credential이 image history, layer, build log, artifact metadata에 노출되지 않는다.
- 동일 recipe/lockfile/base digest가 동일 artifact digest 또는 차이를 설명하는 provenance를 만든다.
- Runner는 registry digest를 사용해 proxy 없이도 build/test를 수행한다.
- registry/cache 장애 시 direct build와 factory artifact 미가용을 서로 다른 실패 코드로 보고한다.
- factory cache hit/miss와 upstream fetch를 포함한 Docker build e2e가 통과한다.
- prefetch가 필요한 ecosystem에서는 Docker 실패 → factory prefetch → Docker 재시도 e2e가 통과한다.
- artifact 보존·삭제 정책과 registry 접근 권한이 문서화된다.

## 단계적 판단

먼저 내부 factory를 기본 endpoint로 강제할 package ecosystem을 정한다. Docker base image는
registry pull-through mirror, npm/pip/Maven/Go는 각 생태계별 repository proxy를 사용한다.
소수의 base image와 package mirror만 필요하면 기존 제품(예: registry mirror/cache)이 더
단순할 수 있고, 여러 앱이 동일한 사전 산출물을 공유하거나 감사·재현성이 필요할 때 자체
factory를 채택한다.

실제 proxy 주소와 인증 방식은 환경 의존적이므로, 연결 가능한 staging에서 검증하기 전에는
구현 완료나 운영 승인으로 표시하지 않는다.
