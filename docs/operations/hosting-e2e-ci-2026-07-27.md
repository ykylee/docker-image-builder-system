# 호스팅 e2e 의 CI 통합 운영 가이드 (2026-07-27)

- 문서 목적: `apps/runner/scripts/e2e-hosting.sh`(Phase 3 / TASK-170 P3-M5 실 e2e)를
  GitHub Actions `nightly-e2e.yml` 의 `hosting-e2e` 잡으로 돌릴 때의 트리거
  구조, 환경, 신호 강도, 트러블슈팅, 로컬 재현 절차를 한 곳에 정리한다.
- 갱신: TASK-170(P3-M5) / TASK-171(잡 편입) / TASK-176(운영 가이드 보강 — 본 문서)
- 범위: `.github/workflows/nightly-e2e.yml` 의 `hosting-e2e` job,
  `apps/runner/scripts/e2e-hosting.sh`, `apps/build-server/scripts/hosting-e2e-manage.ts`,
  운영 가이드 부재 메우기
- 대상 독자: 개발자, 운영자, AI 에이전트
- 상태: stable
- 최종 수정일: 2026-07-27
- 관련 문서:
  - [e2e + 시각 QA CI 통합](./e2e-visual-ci-2026-07-23.md) (13종 e2e + visual)
  - [호스팅 운영 가이드(Phase 3 종합)](./hosting-2026-07-24.md)
  - [k8s 배포 + webhook](./k8s-deploy-webhook-2026-07-24.md)
  - [Release Notes v0.3.0](../RELEASE_NOTES-2026-07-24.md)

## 1. 왜 이 가이드가 필요한가

Phase 3 호스팅 능력의 **신호는 unit 테스트로는 부족**하다.

| 검증 | 무엇이 약한가 |
|---|---|
| 단위 회귀 가드 | 컨테이너 테스트·build-server `hosted_service` registry CRUD 는 cover |
| **실 e2e**(`e2e-hosting.sh`) | kind 클러스터 + ingress-nginx + k8s manifest apply + scale 0 + delete 까지 **프로덕션 경로 그대로**를 돌며 page/asset load 를 curl 로 실측 |

13종 e2e 스위트(`scripts/run-e2e-suite.sh`)에는 **호스팅 e2e 가 없다**(kind 셋업이 무거워
래퍼가 가볍게 import 하지 못함). 그래서 `nightly-e2e.yml` 의 **별도 잡**
`hosting-e2e` 로 분리했다. 본 가이드는 그 잡을 안전하게 운용하기 위한 운영 문서다.

## 2. 트리거 구조

`nightly-e2e.yml` 의 세 잡:

| 잡 | 트리거 | 신호 |
|---|---|---|
| `e2e` | schedule `0 4 * * *` UTC + main push(경로) + `workflow_dispatch` | 13종 wrapper |
| `visual` | 위 + `run_visual` boolean(default true) | build-monitor 시각 QA |
| **`hosting-e2e`** (본 가이드 대상) | **`schedule` + `workflow_dispatch` 만** — main push 제외 | kind + ingress-nginx 실 라우팅 + 관리 |

```yaml
hosting-e2e:
  if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
  runs-on: ubuntu-latest
  timeout-minutes: 30
```

main push 에서 **제외한 이유**: kind 클러스터 생성 + ingress-nginx apply + 이미지 build +
scale/delete 가 평균 5–10 분 걸려 PR / main push 의 빠른 피드백을 흐린다. **nightly 와
수동 dispatch** 에서만 돌린다.

`paths:` 필터도 잡지 않는다(잡 자체를 if 로 통째로 거른다). 만약 main push 에서도
호스팅 회귀를 빠르게 잡고 싶으면 잡을 추가 분리(`hosting-e2e-fast`, ingress-nginx 없이
`build-server` + `kubectl` 의 dry-run 으로 좁히는 변형)하는 편이 나을 수 있다 — 본
가이드의 스코프는 아니다.

## 3. 잡 내부 단계

`nightly-e2e.yml` 의 `hosting-e2e` job (rev 217–256):

| # | step | 무엇을 하나 |
|---|---|---|
| 1 | `actions/checkout@v4` | 표준 checkout. 호스팅 관련 코드/스크립트만 필요 |
| 2 | `actions/setup-node@v4` (Node 20) | pnpm 동작 |
| 3 | `pnpm/action-setup@v4` (10.15.0) | 의존성 매니페스트 |
| 4 | `actions/setup-go@v5` (1.22) | kind + Go e2e(`go test -tags k8se2e`) 공용 |
| 5 | **Install kind + kubectl** | `go install sigs.k8s.io/kind@v0.24.0` + kubectl v1.31.4. GHA PATH 에 GOPATH/bin 추가. 로컬과 동일 버전(§7). |
| 6 | `pnpm install --frozen-lockfile` | `tsx` 가 build-server devDep 이라 e2e 의 Phase B(hosting-e2e-manage.ts) 가 의존 |
| 7 | `bash apps/runner/scripts/e2e-hosting.sh` | 실 e2e(§4) |

`compose.ci.yaml` 도 **사용하지 않는다** — kind 클러스터가 격리된 컨테이너 환경이라
docker-in-docker 가 아니어도 hostPort 매핑(`extraPortMappings: 80→18080`)으로 충분.
compose e2e 와 자원 경합도 없다.

## 4. `e2e-hosting.sh` 실행 사이클

스크립트(`apps/runner/scripts/e2e-hosting.sh`, 130 lines) 의 사이클:

### 4.1 전제 점검

```bash
for bin in docker kind kubectl go node curl; do
  command -v "$bin" >/dev/null 2>&1 || fail "필수 도구 없음: $bin"
done
```

CI 잡은 step 5 에서 kind + kubectl 을 설치하지만, **docker / go / node / curl 은
GitHub-hosted runner(`ubuntu-latest`)에 기본 포함**돼 있다. 빠뜨리면 즉시 exit 1.

### 4.2 클러스터 생성(없으면)

```bash
kind create cluster --name "${CLUSTER:=dib-hosting-e2e}" --config - <<EOF
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 80
        hostPort: ${HOST_PORT:=18080}    # CI: 18080 (8080 은 다른 잡이 점유)
EOF
```

`CREATED_CLUSTER=1` 이면 trap `cleanup` 에서 **스크립트가 만든 경우에만** 삭제한다.
사용자가 별도 `DIB_HOSTING_E2E_CLUSTER` 로 지정한 클러스터는 건드리지 않는다.

### 4.3 ingress-nginx 설치 + ready 대기(180s)

```bash
kubectl apply -f https://kind.sigs.k8s.io/examples/ingress/deploy-ingress-nginx.yaml
kubectl -n ingress-nginx rollout status deployment/ingress-nginx-controller --timeout=180s
```

**rollout status** 가 핵심 — pod 가 스케줄되기 전 selector wait 는 `no matching resources`
로 즉시 실패하므로(§4.4 의 Phase A 의 ingress wait 와 같은 함정), pod 생성 + ready 를
한꺼번에 기다린다.

### 4.4 Phase A (path-prefix 실 라우팅)

```bash
docker build -q -t "${IMAGE}" "${REPO_ROOT}/examples/hosted-base-path-app"
kind load docker-image "${IMAGE}" --name "${CLUSTER}"
( cd apps/runner && \
  DIB_K8S_E2E_IMAGE=… DIB_K8S_E2E_CONTEXT=… DIB_K8S_E2E_NS=… DIB_K8S_E2E_CONTEXT_PATH=demo \
  DIB_K8S_E2E_PAGE_URL="http://localhost:18080/demo/" \
  DIB_K8S_E2E_KEEP_DEPLOY=1 \
  go test -tags k8se2e -count=1 -run TestK8sE2E_RealDeploy ./internal/deploy/ -v )
```

- `examples/hosted-base-path-app` 은 P3-M4(TASK-169) 에서 만든 sub-path 인지 데모.
  `APP_BASE_PATH` env 를 보고 link/script 경로를 재작성한다.
- `go test -tags k8se2e` — 기본 `go test ./...` 에서는 제외(`//go:build k8se2e` 빌드
  태그). **PR / main push 의 정적 가드에서 무관**.

### 4.5 Phase A2 (subdomain 실 라우팅 — TASK-172)

같은 스크립트 안에서 `nip.io` magic DNS 로 host 기반 라우팅을 한 번 더 돌린다. 앱은
무수정(루트 자산 그대로)이고, Ingress 의 `rewrite-target` 을 빼고 host 로만 분기.

### 4.6 Phase B (관리 — K8sAdmin)

```bash
( cd apps/build-server && \
  HOSTING_KUBE_CONTEXT="${CONTEXT}" \
  node --import tsx scripts/hosting-e2e-manage.ts "${NS}" "dib-${BUILD_ID}" )
```

`hosting-e2e-manage.ts` 가 `kubectl scale --replicas=0` (stop) → `kubectl delete`
(remove) → registry 의 HostedService 가 REMOVED 로 정리되는지 까지 실측.

### 4.7 cleanup

```bash
trap cleanup EXIT  # CREATED_CLUSTER=1 일 때만 kind delete
```

스크립트가 만든 클러스터만 정리. `DIB_HOSTING_E2E_KEEP=1` 을 주면 보존(디버깅용).

## 5. 신호 강도

| 항목 | 강도 | 근거 |
|---|---|---|
| Phase A 페이지 + 자산 로드 | **강** | unit 이 못 잡는 **실 Ingress 의 rewrite-target** 이 path 에 따라 APP_BASE_PATH 가 실제로 주입되는지 curl 200 + body grep |
| Phase A2 subdomain | 강 | host 기반 분기(apps 무수정) 도 실측 |
| Phase B stop/remove | 강 | `kubectl scale 0` → replicas=0, `kubectl delete` → namespace 내 deployment 부재, registry 의 `HostedService.status=REMOVED` |
| 음성 검증 | 약 | cleanup 만 검증. 회귀 가드(개선 전 동작 복원 시 FAIL)는 unit 쪽에 집중돼 있고, **CI 환경에서 음성 검증은 수동** |

unit 만으로 못 잡는 **3종**을 잡는다:
1. Ingress 의 rewrite-target 미적용 / APP_BASE_PATH env 미주입
2. `kubectl scale` / `kubectl delete` 의 호출 자체가 안 됨(컨텍스트 / kubeconfig 오류)
3. HostedService registry 의 status 가 stale 로 남음

## 6. 환경 / 설정

### 6.1 runner env (e2e-hosting.sh 내부)

| env | 기본값 | 의미 |
|---|---|---|
| `DIB_HOSTING_E2E_CLUSTER` | `dib-hosting-e2e` | kind 클러스터 이름 |
| `DIB_HOSTING_E2E_PORT` | `18080` | host port 80 → container 80 매핑 |
| `DIB_HOSTING_E2E_KEEP` | `0` | `1` 이면 스크립트가 만든 클러스터를 보존(디버깅) |

### 6.2 runner Phase A / A2 env (Go e2e 가 받음)

| env | 의미 |
|---|---|
| `DIB_K8S_E2E_IMAGE` | 빌드/load 할 이미지 |
| `DIB_K8S_E2E_CONTEXT` | kubectl context (`kind-dib-hosting-e2e`) |
| `DIB_K8S_E2E_NS` | namespace |
| `DIB_K8S_E2E_CONTEXT_PATH` | URL path prefix (Phase A) 또는 subdomain prefix (Phase A2) |
| `DIB_K8S_E2E_SCHEME` | `path` / `subdomain` (Phase A2 에서만 `subdomain`) |
| `DIB_K8S_E2E_BASE_HOST` | `127.0.0.1.nip.io` (Phase A2) |
| `DIB_K8S_E2E_PAGE_URL` | curl 로 검증할 URL |
| `DIB_K8S_E2E_KEEP_DEPLOY` | Phase B 가 정리할 수 있도록 보존 |

### 6.3 build-server Phase B env

| env | 의미 |
|---|---|
| `HOSTING_KUBE_CONTEXT` | Phase B 가 사용할 kubectl context |

## 7. 로컬 재현 절차

CI 환경을 로컬에서 그대로 재현한다. **kind 가 docker-in-docker 안에서 도는 환경**이
아니라 host docker 가 필요하므로 Linux / macOS 만 해당. Windows 는 WSL2 권장.

```bash
# 0) 전제
command -v docker kind kubectl go node curl || { echo "install first"; exit 1; }

# 1) kind + kubectl 버전 정합(운영 환경과 동일)
go install sigs.k8s.io/kind@v0.24.0
export PATH=$PATH:$(go env GOPATH)/bin
curl -sLo /tmp/kubectl "https://dl.k8s.io/release/v1.31.4/bin/linux/amd64/kubectl"
sudo install -m 0755 /tmp/kubectl /usr/local/bin/kubectl

# 2) 의존성
pnpm install --frozen-lockfile

# 3) e2e 실행(클러스터는 스크립트가 만들고 끝나면 정리)
bash apps/runner/scripts/e2e-hosting.sh
# → "ALL PASS — P3-M5 호스팅 실 e2e (라우팅 + 관리)" 출력

# 4) (옵션) 디버깅 — 클러스터 보존
DIB_HOSTING_E2E_KEEP=1 bash apps/runner/scripts/e2e-hosting.sh
kubectl --context kind-dib-hosting-e2e -n dib-hosted get all,ingress
kind delete cluster --name dib-hosting-e2e   # 나중에 수동 정리
```

### 7.1 실패 시 진단 체크리스트

| 증상 | 점검 |
|---|---|
| `ingress-nginx controller 미기동` | `kubectl -n ingress-nginx get pods` — CrashLoopBackOff 면 kind 의 hostPort 매핑이 충돌한 것. 18080 점유 프로세스 확인. |
| Phase A 의 curl 404 / 502 | `kubectl -n dib-hosted get ingress,svc,pods` — PodNotReady / Endpoints 부재면 이미지가 `kind load` 안 된 것. `kind load docker-image` 의 출력을 다시 확인. |
| Phase A2 (subdomain) 404 | nip.io 해석이 로컬 DNS 에서 막힌 환경(사내망) 가능. CI(외부 DNS) 와 로컬 결과가 갈릴 수 있다. |
| Phase B `hosting-e2e-manage.ts` 가 tsx 못 찾음 | `apps/build-server` cwd 에서 실행되므로 `pnpm install` 이 root 에서 끝났는지 확인. **cwd 가 root 면 tsx 해석 실패**(TASK-128). |
| cleanup 에서 `kind delete` 실패 | `DIB_HOSTING_E2E_KEEP=1` 인지 또는 스크립트 외부의 클러스터. `kind get clusters` 로 확인. |

## 8. 한계와 follow-up

| 한계 | 메모 |
|---|---|
| main push 트리거 없음 | 의도적 분리. 호스팅 회귀는 nightly + 수동에서만 잡는다. |
| 음성 검증 부재 | unit 쪽(`apps/runner/internal/deploy/k8s_test.go` 등) 에 집중. CI 에서 음성 검증은 매트릭스 폭주로 가성비 낮음. |
| 실 k8s e2e nightly 트리거 후 운영 가이드 갱신 외 추가 작업 0 | 본 가이드는 운영 문서 보강만 — workflow 자체는 이미 봉인(TASK-171) |
| Phase A2 의 nip.io 가 사내망에서 실패 가능 | CI(외부 DNS) 가 canonical 환경. 로컬 사내망에서 실패 시 §7.1 참조 |

follow-up 후보:
- `hosting-e2e-fast` 잡 신설(ingress-nginx 없이 registry CRUD + renderK8sManifest
  dry-run 만 — main push 용)
- 호스팅 status 캐시(TASK-174) 가 들어간 뒤 동기 검증 슬라이스 추가
- kind 클러스터 로그를 GHA artifact 로 업로드(현재는 스크립트 stdout 만 남음)

## 9. 결정 / 변경 사항 (본 봉인)

본 TASK-176 은 **운영 가이드 신설**이 메인이며, **workflow 변경 0** / **스크립트
변경 0** 이다. 의도: `hosting-e2e` 잡은 이미 TASK-171 에서 봉인됐고, 본 가이드로
운영자 / AI agent 가 잡의 신호 강도 / 환경 / 트러블슈팅을 한 곳에서 참조하게 한다.

SQL / schema / migration / version / git tag 변경 0.
