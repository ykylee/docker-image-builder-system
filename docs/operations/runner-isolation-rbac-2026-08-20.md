# Runner 격리 및 Kubernetes RBAC 전환 설계

## 목적

`examples/k8s-runner-required-auth.yaml`은 인증 경계를 재현하기 위한 예시이며, 현재 `hostPath: /var/run/docker.sock`를 Runner에 연결한다. Docker socket은 호스트 Docker daemon 권한으로 이어질 수 있으므로 untrusted build를 수용하는 운영 배포에는 사용할 수 없다. 이 문서는 실제 클러스터 연결 전까지 확정할 격리 경계와 검증 기준을 기록한다.

## 현재 경계와 위험

- Runner는 `RUNNER_AUTH_REQUIRED=true`와 `RUNNER_AUTH_TOKEN`으로 Build Server API를 인증한다.
- Kubernetes 배포 어댑터가 필요로 하는 권한과 빌드 실행 권한은 아직 분리되어 있지 않다.
- host Docker socket, host filesystem, host kubeconfig를 Runner Pod에 제공하지 않는다. 현재 예시는 socket을 제공하므로 trusted/internal build 전용이다.

## 목표 구조

1. 빌드는 rootless BuildKit(worker 또는 별도 build namespace)에서 실행하고 Runner Pod에는 host Docker socket을 mount하지 않는다.
2. Runner와 배포 어댑터를 별도 ServiceAccount로 분리한다. Runner 기본 계정에는 target namespace의 리소스 조회·상태 보고에 필요한 최소 verbs만 허용하고, `cluster-admin`, `nodes`, `secrets` 전체 namespace 권한은 부여하지 않는다.
3. 배포 어댑터는 target namespace에 한정된 Role/RoleBinding을 사용한다. 허용 리소스와 verbs는 실제 `k8s-deploy` 경로를 감사한 뒤 고정하며, 검토 전에는 broad Role 예시를 저장소에 추가하지 않는다.
4. NetworkPolicy로 Runner의 egress를 Build Server, 승인된 registry, DNS 등 필요한 목적지로 제한하고, ResourceQuota/LimitRange로 namespace 자원 상한을 둔다.

## 전환 순서

1. `apps/runner`의 Kubernetes API 호출 목록을 정적 분석하고 리소스·verb 매트릭스를 작성한다.
2. kind 또는 staging cluster에서 namespace-scoped ServiceAccount/RBAC를 적용한다.
3. rootless BuildKit 경로로 build/test를 실행한 뒤 Docker socket 없이도 claim, phase heartbeat, result delivery가 유지되는지 확인한다.
4. 격리된 namespace에서 malicious Dockerfile 회귀를 실행하고 host daemon/API 접근이 차단되는지 확인한다.
5. 위 검증이 통과한 뒤에만 required-auth Runner 예시에서 socket mount를 제거한다.

## 수용 기준

- Pod 안에 `/var/run/docker.sock`, host kubeconfig, hostPath workspace가 없다.
- Runner ServiceAccount로 다른 namespace의 Pod/Secret을 조회·변경할 수 없다.
- 허용하지 않은 registry/metadata endpoint로의 egress가 차단된다.
- `RUNNER_AUTH_REQUIRED=true` 상태에서 인증된 claim/phase 보고와 실패 시 재시도가 정상 동작한다.
- build 컨테이너가 rootless로 실행되며 host daemon 탈출 회귀가 재현되지 않는다.

실제 클러스터가 연결되기 전에는 위 기준을 실행 검증으로 완료 처리하지 않는다.
