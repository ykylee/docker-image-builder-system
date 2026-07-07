# 2026-07-07 Insecure-Registry Only E2E Validation (TASK-076)

- 문서 목적: TASK-076 의 insecure-registry only 운영 패턴 검증 결과를 다음 세션이 즉시 재현할 수 있게 남긴다.
- 범위: htpasswd / REGISTRY_AUTH=htpasswd / credential rotation 을 모두 제외하고 `registry:2` 의 anonymous access 모드만 운영. internal network 격리 + upstream access control + image retention cron 의 운영 모델 의 foundation 봉인.
- 대상 독자: AI 에이전트, 운영자, 다음 구현 세션
- 상태: draft (verified PASS 2026-07-07)

## 1. 동기

이전 TASK 들 (TASK-073 / 074 / 075) 은 `REGISTRY_AUTH=htpasswd` 기반 registry 인증을 검증했다. 그 모델은 외부 레지스트리 (Docker Hub / ECR / GCR) 와 유사한 credential rotation workflow 가 필요한 운영 환경에 적합하다.

본 TASK-076 은 다른 운영 모델을 검증한다: **internal-only registry** 로 internal network (VPC / k8s service mesh) 으로 외부 노출을 차단하고, **anonymous access** 만 허용하며, 권한 분리는 **upstream access control** (k8s RBAC / docker daemon ACL / network policy) 에서 처리. 이 모델의 장점:

- **단순함**: credential rotation, htpasswd cache, SIGHUP, GCR token refresh 같은 운영 부담 0
- **높은 throughput**: htpasswd / OAuth 토큰 검증 overhead 없음 — push/pull 이 anonymous 로 동작
- **image lifecycle 단순화**: image retention cron 만 운영 — credential management 없음

운영 환경 예:
- **k8s in-cluster registry**: `registry:2` 가 `ClusterIP:None` 로 expose, k8s RBAC / NetworkPolicy 가 access 제어
- **VPC private registry**: `registry:2` 가 private subnet 의 EC2 instance / EKS node 에서 운영, security group + NACL 이 access 제어
- **CI/CD internal registry**: `registry:2` 가 CI runner 와 같은 VPC 안에서 운영

## 2. 환경

- 작업 경로: `/Users/yklee/repos/docker-image-builder-system`
- 검증 시점: 2026-07-07
- e2e duration: ~3-4 분 (httpd:alpine 안 빌려도 됨, registry:2 cold start 5-10s + build-server healthcheck 30s + 5 build 동시 push ~30-60s + retention 검증 ~5s + cleanup)
- 요구사항:
  - `docker info` reachable
  - busybox:1.36 + registry:2 image pull 가능
  - host 의 docker daemon 에 `insecure-registries` 등록 불필요 (e2e 가 자체 config.json 으로 docker CLI 가이딩)

## 3. 사용 절차

```sh
export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"
export ADMIN_IDS=admin

bash apps/build-server/scripts/e2e-insecure-registry.sh
```

정상 종료 시:

```
==========================================
TASK-076 insecure-registry-only 검증: ALL PASS
==========================================
  5 build 동시 cli mode push 통과 (multi-runner 분산의 server 측 verification)
  catalog + tags list 에 5 buildId 다 노출 (insecure-registry anonymous access)
  DELETE API + 영향 검증 — target tag 만 삭제, 다른 tag 영향 없음
  retention 후 새 build push 통과 (storage 재사용)
  운영 모델: internal network 격리 + upstream access control + image retention cron
```

## 4. e2e 가 검증하는 것

### 4.1 8 단계 + 보너스

| 단계 | 검증 항목 |
|---|---|
| [0/8] | busybox:1.36 image warm-up |
| [1/8] | registry:2 image warm-up |
| [2/8] | HOST_REGISTRY_CONFIG 셋업 (insecure-registries 만, auths 없음) |
| [3/8] | compose up — build-server + runner (cli mode) + registry |
| [4/8] | registry healthy 대기 (`/v2/` 가 200 — anonymous access) |
| [5/8] | build-server healthy 대기 |
| [6/8] | runner registry 등록 대기 |
| [7/8] | **5 build 동시 push** — per-build unique source archive (build_idx 가 Dockerfile 의 RUN line content 에 반영되어 layer content 가 build 별 다름 → manifest digest 가 unique). TASK-076 의 운영 결함 발견: 동일 Dockerfile/동일 base image 면 manifest digest 가 동일 → 1 tag DELETE = 모든 tag 영향. per-build source 로 회피. |
| [8/8] | image retention 검증 — catalog + tags list 노출 → DELETE API 로 1 tag 삭제 → 다른 4 tag 영향 없음 확인 |
| [bonus] | retention 후 새 build push — storage 재사용 검증 |

### 4.2 운영 의미 (insecure-registry only)

본 e2e 가 통과하면 다음 4 가지 운영 가정이 자동 검증된다:

1. **anonymous access 동작** — `registry:2` 가 `REGISTRY_AUTH` env 미설정으로 anonymous access 허용. docker CLI 가 `auths` entry 없는 config.json 으로 anonymous push 성공.
2. **multi-build 동시 push 안정성** — 5 build 가 동시에 cli mode push 해도 registry 가 안정 처리. `multi-runner 분산` 의 server 측 foundation 검증 (TASK-081-B 의 client 측 분산과 정합).
3. **per-build unique manifest digest** — 같은 Dockerfile 이라도 layer content 가 build 별 다르면 manifest digest 가 unique → image tag 별 독립 lifecycle. **운영 결함 발견**: 동일 Dockerfile + 동일 source 의 다중 build 가 manifest digest 동일 → 1 tag DELETE = 다른 tag 영향. **해결**: build 별로 layer content 가 달라야 함 (e.g. image 의 `LABEL version=...` 등). 운영 환경에서는 build ID / commit SHA / timestamp 가 layer content 에 포함되도록 보장.
4. **image retention DELETE API 동작** — registry:2 의 `DELETE /v2/<name>/manifests/<digest>` 가 202 Accepted 응답. tags list 에서 target 만 사라지고 다른 tag 영향 없음.

### 4.3 운영 환경 도입 패턴

```
# 1. registry:2 in k8s:
apiVersion: apps/v1
kind: Deployment
metadata:
  name: registry
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: registry
          image: registry:2
          env:
            - name: REGISTRY_STORAGE_DELETE_ENABLED
              value: "true"
            # REGISTRY_AUTH 미설정 → anonymous access
          ports:
            - containerPort: 5000
          # NetworkPolicy 로 cluster 내부 access 만 허용
---
# 2. NetworkPolicy:
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: registry
spec:
  podSelector: { matchLabels: { app: registry } }
  ingress:
    - from:
        - namespaceSelector: { matchLabels: { name: build-system } }  # runner namespace 만
      ports:
        - port: 5000
---
# 3. Image retention CronJob:
apiVersion: batch/v1
kind: CronJob
metadata:
  name: registry-gc
spec:
  schedule: "0 2 * * *"  # 매일 새벽 2시
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: gc
              image: registry:2
              command: ["/bin/registry", "garbage-collect", "--delete-untagged=true", "/etc/docker/registry/config.yml"]
              volumeMounts:
                - name: config
                  mountPath: /etc/docker/registry
          restartPolicy: OnFailure
```

운영자가 위 패턴으로 registry 를 k8s 에 띄우면:
- 외부 access 차단 (NetworkPolicy)
- build-server / runner 만 push/pull (label selector)
- 권한 분리는 k8s RBAC 으로 (ServiceAccount, Role, RoleBinding)
- image retention 은 K8s CronJob (위의 `registry garbage-collect`)

## 5. 사전 결함 + 보강 (TASK-076 가 발견)

### 5.1 동일 Dockerfile 의 5 build 가 manifest digest 가 동일 → 1 tag DELETE = 모든 tag 영향

초기 e2e 가 5 build 의 Dockerfile 을 모두 동일한 content 로 작성. `printf 'ok\n'` 으로 같은 layer content. 5 build 의 manifest digest 가 모두 동일.

registry:2 의 `DELETE /v2/<name>/manifests/<digest>` 가 digest 기반. 같은 digest 의 manifest 가 5 개 → 1 개 DELETE = 그 digest 의 모든 manifest 가 mark for deletion. 다른 4 build 의 tag 가 모두 사라짐.

**운영 결함**: 운영자가 같은 Dockerfile 의 build 5 개를 registry 에 push 한 뒤 가장 오래된 build 1 개 를 retention 으로 지우면, 가장 최근 build 4 개 까지 모두 영향 — **보존해야 할 build 들까지 사라지는 silent failure**.

**보강**: TASK-076 의 e2e 가 build_idx 를 Dockerfile 의 RUN line 에 주입해 per-build unique source archive 작성. 같은 busybox base image 라도 layer content 가 build 별 다름 → manifest digest unique → DELETE 가 target tag 한정. e2e 의 [7/8] 단계에서 `submit_and_wait` 가 build_idx parameter 받아 per-build Dockerfile 의 `printf 'ok-build-${build_idx}\n'` 으로 unique content 생성.

**운영 권고**: 운영 환경의 build pipeline 에서 image tag 와 Dockerfile content 가 1:1 unique 보장:
- image 의 `LABEL build_id=$CI_COMMIT_SHA` 또는 `ARG VERSION=...` 사용
- build time 의 `RUN echo "Build: $(date +%s)"` 같은 unique content
- multi-tenancy 환경 (같은 Dockerfile 의 다른 user build) 에서도 per-user unique 보장

### 5.2 curl `-I` (HEAD) 가 Docker-Content-Digest header 를 안 보냄

`curl -sSI` (HEAD 요청) 가 registry:2 의 digest header 를 response 에 포함 안 함 — register:v2 가 GET 요청에서만 digest header emit.

**보강**: `curl -sS -D - -o /dev/null` 패턴 — `-D -` 가 response header 를 stdout 으로 dump, `-o /dev/null` 가 body 는 discard. GET 요청으로 manifest + digest header 모두 수신. digest 추출 `awk 'tolower($1)=="docker-content-digest:" {print $2}'` 가 colons split 문제 없이 header value 추출.

### 5.3 submit_and_wait 함수의 per-build source archive 가 mktemp cleanup 으로 source archive 까지 삭제

`per_src="$(mktemp -d)"` 후 `rm -rf "${per_src}"` 를 source archive 생성 직후에 호출 → source archive (which is in `${per_src}/source.tar.gz`) 도 같이 삭제 → upload 가 0 bytes.

**보강**: `rm -rf "${per_src}"` 를 upload / build lifecycle 완료 후로 이동. lifecycle 중 source archive 가 사용되어야 함. lifecycle 완료 또는 실패 후 cleanup.

## 6. 빠른 재현 메모

### 6.1 최소 명령

```sh
export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"
export ADMIN_IDS=admin
bash apps/build-server/scripts/e2e-insecure-registry.sh
```

### 6.2 디버깅 (KEEP_PROJECT)

```sh
KEEP_PROJECT=1 bash apps/build-server/scripts/e2e-insecure-registry.sh
# 별도 shell — container / host dir 보존
PROJECT=$(grep -oE "dibs-insecure-registry-e2e-[0-9]+" /tmp/e2e-insecure-debug.log | head -1)
docker compose -p "$PROJECT" ps
ls -la /tmp/tmp.XXX/  # HOST_REGISTRY_CONFIG
cat /tmp/tmp.XXX/config.json
docker exec -i dibs-runner cat /registry-config/config.json
# 마지막 정리
docker compose -p "$PROJECT" down -v
rm -rf /tmp/tmp.XXX/
```

### 6.3 운영 환경 운영 playbook

1. **registry 기동**: k8s Deployment 또는 docker compose 로 `registry:2` 띄움. `REGISTRY_AUTH` env 미설정. `REGISTRY_STORAGE_DELETE_ENABLED=true`.
2. **접근 제어**: k8s NetworkPolicy (label selector) 또는 docker daemon ACL (allowlist) 으로 build-server / runner 만 registry 에 push/pull 가능.
3. **image push**: runner 가 `${REGISTRY_URL}/<image-name>:<tag>` 으로 push. `RUNNER_REGISTRY_CONFIG_DIR` 의 config.json 에 `insecure-registries` 만 등록 (auth 없음).
4. **image retention**: K8s CronJob (위 §4.3) 으로 매일 새벽 N 일 지난 tag 정리. 또는 운영자가 수동으로 `registry garbage-collect --delete-untagged=true` 실행.

## 7. 회귀 baseline (TASK-075 → TASK-076)

| 항목 | 결과 |
|---|---|
| TS 4 packages `tsc --noEmit` | clean (변경 파일 영향 없음) |
| build-server node:test | **131/131 동일** (backend 변경 0) |
| build-monitor vitest | **135/135 동일** (frontend 변경 0) |
| Go 8 packages | 모두 PASS (TASK-075 baseline 유지) |
| svelte-check | 0 errors / 0 warnings |
| `e2e-insecure-registry.sh` (TASK-076) | **ALL PASS** (~3-4 분: registry:2 cold start 5-10s + build-server healthcheck 30s + 5 build 동시 push ~30-60s + retention 검증 ~5s + cleanup) |
| catalog | `{"repositories":["docker-image-builder-system/cli"]}` |
| tags | 5 buildId 다 노출 (per-build unique manifest digest) |
| DELETE | 202 Accepted (target tag 만 삭제, 다른 4 tag 영향 없음) |
| retention 후 push | storage 재사용 동작 |

## 8. 다음 세션 권장

- (후속) htpasswd 와 insecure-registry 의 운영 trade-off 정식 가이드 — 외부 노출 위험 / 권한 분리 / retention 패턴 / credential rotation 의 4 가지 축으로 비교.
- (후속) k8s in-cluster registry 운영 smoke — k8s NetworkPolicy / ServiceAccount / RBAC 의 self-contained 검증. 본 TASK 의 e2e 가 self-contained 환경 검증, 후속이 k8s 운영 환경 검증.
- (후속) image vulnerability scan + retention 통합 — image lifecycle 의 GC + CVE scan pipeline 운영.
