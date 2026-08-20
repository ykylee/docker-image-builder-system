# Proxy 환경용 간이 Artifact Factory 검토안

## 배경

현재 Runner의 `docker build` 경로는 `DOCKER_BUILDKIT=1`만 설정하고 proxy build arg,
daemon registry mirror, dependency cache를 전달하지 않는다. 조직망에서 Docker daemon
또는 build container가 proxy를 거쳐야 하는 경우 `FROM` pull이나 package manager
호출이 실패할 수 있다.

## 제안 범위

간이 factory는 사용자 build를 대신 실행하는 별도 플랫폼이 아니라, 신뢰된 네트워크에서
반복적으로 필요한 base/dependency image를 미리 빌드·검증·보관하는 경로로 한정한다.

1. Factory job이 명시된 Dockerfile, lockfile, base image digest를 입력으로 받는다.
2. proxy 설정은 factory 실행 환경 또는 BuildKit secret/profile로 주입하며, 이미지 ARG와
   build log에 proxy credential이 남지 않도록 한다.
3. 결과는 private registry에 immutable digest와 provenance(metadata/SBOM 후보)로 저장한다.
4. Runner는 허용된 digest를 pull해 사용자 build의 `FROM`/dependency source로 사용한다.
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
- artifact 보존·삭제 정책과 registry 접근 권한이 문서화된다.

## 단계적 판단

먼저 현재 Runner에 proxy profile과 `--build-arg` 전달을 직접 추가할지, factory 경로를
도입할지 비교하는 spike를 수행한다. 소수의 base image와 package mirror만 필요하면
BuildKit mirror/cache가 더 단순할 수 있고, 여러 앱이 동일한 사전 산출물을 공유하거나
감사·재현성이 필요할 때 factory를 채택한다.

실제 proxy 주소와 인증 방식은 환경 의존적이므로, 연결 가능한 staging에서 검증하기 전에는
구현 완료나 운영 승인으로 표시하지 않는다.
