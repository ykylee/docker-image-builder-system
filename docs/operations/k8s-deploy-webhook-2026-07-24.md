# P2-M5 운영 가이드 — k8s 외부 배포 + webhook 결과 전달 (2026-07-24)

- 문서 목적: Phase 2 마지막 마일스톤 P2-M5(배포 능력)의 운영 방법 — k8s 배포
  adapter 와 webhook 결과 전달의 설정/실행/검증.
- 대상 독자: 운영자, 개발자, AI 에이전트
- 상태: stable (TASK-165 봉인)
- 최종 수정일: 2026-07-24

## 1. 무엇이 추가됐나

제품 목적의 4단계(`build → container test → deploy → result delivery`)가 모두
1급 phase 로 존재하고 실인프라 e2e 로 검증된다.

- **외부 배포 adapter 1호 = k8s** (`kubectl` shell-out). runner 가 컨테이너
  테스트 통과 후 빌드 이미지를 k8s 클러스터에 배포한다.
- **결과 전달 1호 = webhook** (NOTIFICATION). build-server 가 build 의 terminal
  (COMPLETED/FAILED) 도달 시 canonical `BuildStatusResponse` 를 설정된 URL 로
  POST 한다.

## 2. k8s 배포 (runner)

### 2.1 설정 (env)

| env | 의미 | 기본값 |
|---|---|---|
| `RUNNER_K8S_MODE` | `k8s`=kubectl 실배포 / `noop`·`skeleton`=noop / `""`=비활성 | `""` |
| `RUNNER_K8S_CLUSTER` | kubeconfig context (예: `kind-dib`) | `""`(현재 context) |
| `RUNNER_K8S_NAMESPACE` | 배포 namespace | `dib-builds` |
| `RUNNER_K8S_MANIFEST` | (Apply 경로용) manifest 파일 | `""` |
| `RUNNER_KUBECTL_BIN` | kubectl 실행 파일 | `kubectl` |
| `RUNNER_K8S_CONTAINER_PORT` | 컨테이너 포트 | `8080` |
| `RUNNER_K8S_ROLLOUT_TIMEOUT_SECONDS` | rollout 대기 timeout | `120` |

`RUNNER_K8S_MODE` 미설정이면 k8s 분기는 완전히 skip 되고 기존 docker registry
배포만 동작한다(하위 호환).

### 2.2 동작

`RUNNER_K8S_MODE=k8s` 일 때 runner 는 배포 단계에서:

1. 빌드 이미지로부터 `Namespace + Deployment + Service` 3-doc manifest 를 렌더.
   `imagePullPolicy: IfNotPresent` 라 **클러스터 노드에 이미지가 이미 있어야 한다**
   (kind 는 `kind load docker-image`, 실클러스터는 registry push 선행).
2. `kubectl apply -f -` 로 적용, `kubectl rollout status` 로 배포 완료 대기.
3. 결과를 docker registry 배포 결과와 합쳐 `ReportDeployment(TargetType=...,K8S)`
   로 build-server 에 단일 보고. `resultRef=deployment/<name>`.

Deployment 이름은 buildID 를 DNS-1123 label 로 정제한 `dib-<buildID>`.

### 2.3 주의

- **client-go 아님** — 기존 `deploy.Client` 의 docker CLI shell-out 패턴과
  일관되게 `kubectl` 을 shell-out 한다. runner 실행 환경에 `kubectl` 과 유효한
  kubeconfig 가 있어야 한다.
- 배포 실패(kubectl 에러/rollout timeout)는 `DEPLOYMENT_FAILED` 로 보고되고
  빌드가 FAILED 로 닫힌다(P2-M3 실패 경로).

## 3. webhook 결과 전달 (build-server)

### 3.1 설정 (env)

| env | 의미 |
|---|---|
| `RESULT_WEBHOOK_URL` | 설정 시 terminal 도달마다 canonical `BuildStatusResponse` 를 이 URL 로 POST |

미설정이면 결과 전달은 기존 `POLLING`(소비자가 `GET /builds/:id` 조회) 유지.

### 3.2 동작

build 가 `COMPLETED`/`FAILED` 에 도달하면 build-server 가:

1. phase history 에 `RESULT_DELIVERY_STARTED` append(idempotent — 이미 있으면
   재전송 skip).
2. `RESULT_WEBHOOK_URL` 로 canonical `BuildStatusResponse` 를 POST(5s timeout).
3. 성공 시 `RESULT_DELIVERED` append → `resultDelivery` 블록이 phase history 에서
   `{mode: NOTIFICATION, status: SUCCESS, deliveredAt}` 로 파생.
4. 실패해도 **best-effort** — phase 보고(빌드 흐름)를 깨지 않고, `resultDelivery`
   는 `{mode: NOTIFICATION, status: FAILED}` 로 파생.

별도 DB 컬럼/마이그레이션 없이 phase history 를 단일 출처로 쓴다(memory/postgres
동일 semantics).

### 3.3 payload

수신 측은 표준 `BuildStatusResponse`(`build`/`test`/`deploy`/`lastError`/
`resultDelivery`/`phaseHistory`/`currentPhase`)를 그대로 받는다. `build.runtimeUrl`
로 배포된 앱 위치를, `deploy` 로 배포 결과를, `lastError` 로 실패 이유를 본다.

## 4. e2e 검증

`apps/runner/scripts/e2e-k8s-deploy.sh` (전제: docker/kind/kubectl/go/python3):

```bash
# kind + kubectl 이 있는 환경에서
bash apps/runner/scripts/e2e-k8s-deploy.sh
```

- **Phase A(k8s)**: busybox httpd 이미지 빌드 → `kind load` → 실제 kind 클러스터에
  kubectlDeployer 로 배포 → `availableReplicas=1` 실측 → 정리.
- **Phase B(webhook)**: build-server(memory)를 `RESULT_WEBHOOK_URL` 로 띄우고 HTTP
  로 build 를 terminal 까지 몰아 stub 수신서가 payload 를 받는지 + `resultDelivery`
  = NOTIFICATION/SUCCESS 를 실측.

2026-07-24 로컬 검증(kind v0.24.0 + kubectl v1.31.4): **ALL PASS**.

Go e2e 테스트(`k8s_e2e_test.go`)는 `//go:build k8se2e` 태그라 기본 `go test ./...`
에서 제외된다. kind 미가용 CI 편입은 별도 follow-up.

## 5. follow-up

- kind 기반 e2e 의 nightly CI 편입(현재 수동 실행).
- k8s adapter 확장: Helm/ArgoCD, per-build namespace 정리 정책, Ingress/실 URL 회수.
- webhook 확장: Slack/Nextcloud 어댑터(webhook 위에), 재시도/서명.
