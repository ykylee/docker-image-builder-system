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
에서 제외된다. **v0.8.1 에서 nightly CI 에 `k8s-deploy-e2e` 잡으로 편입
완료** — `.github/workflows/nightly-e2e.yml` 가 `schedule(cron 04:00 UTC)` +
`workflow_dispatch` 에서 kind + kubectl 설치 후 본 스크립트를 실행한다.
호스팅 e2e 와 cluster 가 분리(`dib-e2e` vs `dib-hosting-e2e`)되어 동시
실행 가능.

## 5. follow-up

- ~~kind 기반 e2e 의 nightly CI 편입(현재 수동 실행)~~ — **v0.8.1 에서 해소**.
- k8s adapter 확장: Helm/ArgoCD, per-build namespace 정리 정책, Ingress/실 URL 회수.
- webhook 확장: Slack/Nextcloud 어댑터(webhook 위에), 재시도/서명.

## 6. k8s adapter 확장 (TASK-175, v0.8.0 후보)

기존 1호 adapter `kubectlDeployer` 의 운영 결함 3종을 해소한 v0.8.0 후보 묶음.
**외부 인터페이스(API/스키마/env opt-in) 변경만**, 기본 동작 불변.

### 6.1 per-build namespace (E1)

`RUNNER_K8S_NAMESPACE_PER_BUILD=true` 옵트인 시 buildID 별 namespace 로
격리해 deployment/ingress DNS 충돌 + audit 개선. 기본값(`false`)은 종전
공유 namespace(`RUNNER_K8S_NAMESPACE`, 기본 `dib-builds`) 유지.

```
# 공유 (기본 — 기존 호환)
RUNNER_K8S_NAMESPACE=builds

# 격리 (옵트인)
RUNNER_K8S_NAMESPACE_PER_BUILD=true
# → ns = "dib-<buildID>" (DNS-1123 정제, 최대 53자)
```

### 6.2 Ingress cleanup (E2)

`kubectlDeployer.Cleanup()` 이 `delete deployment,service` 만 하던 것을
`deployment,service,ingress` 3-kind 묶음으로 확장. 동명 재빌드 시 stale
Ingress 가 라우팅을 잡아채는 잠복 결함 해소(기존엔 동명 Deployment 가
새로 만들어져도 stale Ingress 의 `path`/`rewrite-target` 이 우선 → 새
파드로 가지 않음).

`--ignore-not-found` 는 유지되므로 Ingress 가 없는 정상 케이스에서도 안전.

### 6.3 k8s 실패 시 docker registry 결과 보존 (E3)

k8s 분기 진행을 **두 번의 보고** 로 분리:

1. `IN_PROGRESS(K8S)` — k8s Deploy 시작 시점(best-effort).
2. terminal:
   - 성공 → `SUCCESS(K8S)`, payload `{k8s: {...}, deliveryMode: "POLLING"}` (종전).
   - **실패** → `FAILED(K8S)`, payload에 `dockerRegistry` 블록 추가:
     ```
     {
       "k8s": {...},  // (없으면 미포함)
       "dockerRegistry": {
         "targetRef": "localhost:5000/...:b-1",
         "resultRef": "registry/localhost:5000/...:b-1",
         "survivedAt": "2026-07-24T..."
       }
     }
     ```
     `errorMessage` 에 "k8s deploy failed: <원인> (docker registry push survived:
     <ref>)" 포함. docker registry push 는 성공한 채로 k8s 배포가 실패한
     케이스에서 registry 결과가 사라지지 않는다.

### 6.4 설정 (env)

| env | 의미 | 기본 |
|---|---|---|
| `RUNNER_K8S_NAMESPACE_PER_BUILD` | true 면 buildID 별 namespace | `false` |

### 6.5 검증

- `go test ./...` (runner) 8/8 pkg PASS — 단위 테스트 3건 신규(E1 4케이스 / E2 / E3).
- kind/kubectl 실측 — v0.8.1 부터 nightly CI `k8s-deploy-e2e` 잡이 자동 검증(§4 참조).
  로컬 수동 검증 절차는 §6.6 참조.
- API/스키마 변경 0(env opt-in + payload 필드만 추가).

### 6.6 실측 절차 (로컬 / nightly)

E1/E2/E3 가 실제 kind 클러스터에서 의도대로 동작하는지 검증한다.
nightly CI 가 자동화했지만 운영자가 재현하거나 디버깅할 때 쓰는 절차.

**전제**: `docker` / `kind` / `kubectl` / `go` / `python3` 가 PATH 에 있고,
`go install sigs.k8s.io/kind@v0.24.0` 후 `$(go env GOPATH)/bin` 이 PATH 에
포함돼야 한다. `kubectl` 은 `v1.31.4` 권장.

#### E1 per-build namespace 실측

1. `RUNNER_K8S_NAMESPACE_PER_BUILD=true` 로 runner 환경변수 세팅 후
   `bash apps/runner/scripts/e2e-k8s-deploy.sh` 실행.
2. Phase A 직후 `kubectl get ns -l dib-build-id` 로 buildID 라벨 namespace
   가 만들어졌는지 확인. 비활성 시 `dib-builds` 단일 namespace 에
   deployment 가 들어간다(검증 단언은 cleanup trap 의 `kubectl delete
   namespace ${NS}` 가 양쪽 모두 정리하므로 cluster 내부 상태로 판정).
3. `RUNNER_K8S_NAMESPACE_PER_BUILD=false` (기본) 으로 재실행해 같은 build
   가 단일 namespace 에 모이는지 비교.

#### E2 Ingress cleanup 실측

1. 한 build 를 배포 → Ingress 가 함께 만들어졌는지
   `kubectl get ingress -A` 로 확인.
2. `kubectlDeployer.Cleanup()` 시뮬레이션: 같은 buildID 로
   `DIB_K8S_E2E_KEEP=1 bash apps/runner/scripts/e2e-k8s-deploy.sh` 실행 →
   `kubectl delete deployment,service,ingress dib-<buildID> -n <ns>
   --ignore-not-found` 가 3-kind 모두 정리하는지 확인.
3. 동명 재빌드 시나리오: 같은 buildID 로 두 번 배포해 두 번째 배포가
   새 pod 로 라우팅되는지 `curl http://localhost:8080/` 로 확인(stale
   Ingress 가 잡아채지 않음).

#### E3 k8s 실패 시 docker registry 결과 보존 실측

1. k8s Deploy 가 실패하도록 buildID 또는 cluster 를 의도적으로 깨뜨린다
   (예: `RUNNER_K8S_CLUSTER=kind-nonexistent` 로 잘못된 context 주입).
2. `GET /builds/:id` 의 응답 `deploy` 블록이:
   - `status: FAILED`
   - `targetType: K8S`
   - `errorMessage` 에 `k8s deploy failed: <원인> (docker registry push
     survived: <ref>)` 포함
   - `responsePayload.dockerRegistry.targetRef` 와 `resultRef` 가 채워져
     있음
3. 동일 build 의 `responsePayload.k8s` 는 실패 시 미포함(다음 k8s 분기
   부재)이고 성공 시에만 채워진다.

#### 회귀 baseline

E1/E2/E3 모두 PASS 시 nightly `k8s-deploy-e2e` 잡이 자동 종료. 운영
개입 불요. 실패 시 본 섹션 절차로 재현 후 `apps/runner/internal/services/`
또는 `apps/runner/internal/deploy/` 의 단위 테스트로 격리해 회귀 가드를
추가한다.

## 7. Helm adapter (v0.9.0 첫 구현)

`RUNNER_K8S_MODE=helm`을 사용하면 runner가 `helm upgrade --install`로 차트를
배포한다. 차트가 Deployment, Service, Ingress와 sidecar/initContainer 구성을
소유하고 runner는 표준 values contract를 전달한다.

### 7.1 설정과 values contract

| env | 의미 | 기본값 |
|---|---|---|
| `RUNNER_HELM_BIN` | Helm 실행 파일 | `helm` |
| `RUNNER_HELM_CHART` | 기본 chart 경로/아카이브 | 없음(필수) |
| `RUNNER_HELM_RELEASE` | 기본 release 이름 | `dib-build` |
| `RUNNER_HELM_VALUES_FILE` | 공통 values 파일 | 없음 |
| `RUNNER_HELM_SET_VALUES` | 쉼표로 구분한 추가 `--set` 값 | 없음 |
| `RUNNER_HELM_TIMEOUT_SECONDS` | install/upgrade 대기 제한 | `120` |

chart는 `image.repository`, `image.tag`, `service.port`,
`hosting.contextPath`, `hosting.basePath`, `hosting.stripPrefix`,
`hosting.scheme`, `hosting.baseHost`, `build.id`를 소비해야 한다.

예제 chart `examples/helm-hosted-app`는 Deployment/Service/Ingress를 생성한다.
`hosting.stripPrefix=true`이면 nginx rewrite annotation과 regex path를 사용하고,
`false`이면 Prefix path를 upstream에 그대로 전달한다.

### 7.2 lifecycle과 검증

- `Deploy` 결과의 `DeploymentID`와 `ResultRef`는 실제 Helm release 이름을 사용한다.
- cleanup 시 release 이름이 BuildID와 다를 수 있으므로 `HelmRelease`를 명시할
  수 있으며, 생략하면 `BuildID`를 fallback으로 사용한다.
- `Apply`도 같은 release 선택 규칙과 `--wait` timeout을 사용한다.
- Ingress controller 설치와 DNS/host 라우팅은 클러스터 운영 범위다.

```bash
helm lint examples/helm-hosted-app
helm template dib-build examples/helm-hosted-app
bash apps/runner/scripts/e2e-helm-deploy.sh
```

kind e2e는 실제 chart install 후 Deployment 1/1, Service, Ingress, `helm status`
및 release uninstall을 확인한다. ArgoCD Application 생성/동기화는 아직 구현하지
않았으며 별도 작업으로 남긴다.
