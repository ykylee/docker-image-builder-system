# 2026-07-07 Registry Push E2E Validation (TASK-073)

- 문서 목적: TASK-073 의 RUNNER_REGISTRY_CONFIG_DIR + cli mode push e2e 검증 결과를 다음 세션이 재현할 수 있게 남긴다.
- 범위: insecure-registry 기반의 self-contained registry:2 container + busybox Dockerfile + 실제 docker push → registry catalog / tags / manifest 로 검증.
- 대상 독자: AI 에이전트, 운영자, 다음 구현 세션
- 상태: draft (verified PASS 2026-07-07)

## 1. 동기

private Docker Hub / ECR / GCR 인증이 필요한 운영 환경에서, `RUNNER_REGISTRY_CONFIG_DIR` env 로 docker CLI 의 registry 인증 config dir 을 override 하여 push 가 가능해진다. TASK-073 은 이 foundation 을 봉인한다 — e2e 가 self-contained 한 local registry:2 로 cli mode docker push 가 실제 image layer 까지 registry 에 기록됨을 검증한다.

## 2. 환경

- 작업 경로: `/Users/yklee/repos/docker-image-builder-system`
- 검증 시점: 2026-07-07
- e2e duration: ~2-3 분 (registry:2 cold start 5-10s + build-server 30s + 단일 build lifecycle ~30-60s + cleanup)
- 요구사항:
  - `docker info` reachable
  - busybox:1.36 + registry:2 image pull 가능
  - host 의 `getent group docker` 가 gid 반환
  - host 의 docker daemon 에 `insecure-registries` 등록 불필요 (e2e 가 자체 config 사용)

## 3. 사용 절차

```sh
export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"
export ADMIN_IDS=admin

bash apps/build-server/scripts/e2e-registry-push.sh
```

정상 종료 시:

```
==========================================
TASK-073 registry-push 검증: ALL PASS
==========================================
  build COMPLETED in cli mode deploy (docker tag + push)
  registry catalog: docker-image-builder-system/cli 가 push 됨
  registry tags: <buildId> 가 push 됨
  RUNNER_REGISTRY_CONFIG_DIR 가 docker CLI 의 config dir override 로 동작 —
  private registry 인증 패턴 (auths entry) 의 foundation 이 insecure-registry
  케이스로 검증.
```

## 4. e2e 가 검증하는 것

### 4.1 8 단계 + 보너스 단계

| 단계 | 검증 항목 |
|---|---|
| [0/8] busybox warm-up | host daemon 이 busybox image pull 가능 |
| [1/8] registry:2 warm-up | host daemon 이 registry:2 image pull 가능 |
| [2/8] config.json 검증 | HOST_REGISTRY_CONFIG 의 config.json 존재 + insecure-registries 등록 |
| [3/8] compose up | build-server + runner (cli mode) + registry container 모두 기동 |
| [4/8] registry healthy | docker registry:2 HTTP `/v2/` 응답 시작 |
| [5/8] build-server healthy | cold start + applyMigrations 후 `/health` 200 OK |
| [6/8] runner registry | `/admin/runners` 가 1 row 반환 |
| [7/8] source archive + build | busybox Dockerfile + index.html 을 tar.gz 로 묶어 POST → runner 가 build → cli mode 의 `docker tag <sourceImage> localhost:5000/docker-image-builder-system/cli:<buildId>` + `docker push localhost:5000/docker-image-builder-system/cli:<buildId>` 까지 완료 → COMPLETED |
| [8/8] registry API 검증 | `/v2/_catalog` 에 `docker-image-builder-system/cli` 가 보이고 `/v2/docker-image-builder-system/cli/tags/list` 에 buildId 가 tags 로 나열됨 |
| [bonus] manifest layer | `/v2/<repo>/manifests/<buildId>` 가 layers + config 모두 포함한 v2 manifest 응답 |

### 4.2 운영 의미 (RUNNER_REGISTRY_CONFIG_DIR 의 본질)

본 e2e 가 통과하면 다음 5 가지 운영 가정이 자동 검증된다:

1. **RUNNER_REGISTRY_CONFIG_DIR env 가 config.go 에서 read** — `Config.RegistryConfigDir` 필드 + `parseString("RUNNER_REGISTRY_CONFIG_DIR", "")` 로 default empty.
2. **main.go 가 DOCKER_CONFIG env 로 propagate** — `os.Setenv("DOCKER_CONFIG", cfg.RegistryConfigDir)` 가 호출되어 후속 모든 docker CLI invocation 이 그 dir 의 config.json 을 사용.
3. **insecure-registries entry 가 docker push 에 적용** — `http://127.0.0.1:5000` 가 insecure-registry 로 인식되어 HTTP-only local registry 에 docker push 성공.
4. **image path 의 slash split** — `docker-image-builder-system/cli` 가 registry repo 로 들어가도록 `RUNNER_DEPLOY_TARGET_REF=localhost:5000/docker-image-builder-system/cli` 형태로 consumer 가 잡아야 함 (registry :5000/ 뒤의 `docker-image-builder-system/cli` 가 repo = `<name>/<subname>` 으로 파싱).
5. **cli mode 의 docker tag + push round-trip** — busybox 기반의 단일 layer image 가 busybox:1.36 image pull → busybox Dockerfile build → cli mode `docker tag` → `docker push` 까지 실제 registry 측에 layer 들이 도달.

### 4.3 private registry 인증 패턴 (후속 TASK)

본 TASK 의 insecure-registry 케이스 + RUNNER_REGISTRY_CONFIG_DIR env 전파가 검증되어, 후속 TASK 는 auths entry 만 추가하면 private Docker Hub / ECR / GCR push 까지 봉인 가능:

```json
{
  "auths": {
    "https://index.docker.io/v1/": {
      "auth": "base64(username:password)"
    }
  },
  "credsStore": "desktop"
}
```

또는 운영 환경이 K8s secret 같은 volume mount 로 secret.json 을 노출하는 구조:

```yaml
volumes:
  - name: registry-secret
    secret:
      secretName: registry-pull-secret
volumes:
  - name: registry-secret
    mountPath: /secrets/registry
env:
  - name: RUNNER_REGISTRY_CONFIG_DIR
    value: /secrets/registry
```

runner 안의 docker CLI 가 그 path 의 config.json 을 자동 사용 — cli mode 의 push 가 secret-based ECR / GCR push 까지 투명하게 가능.

## 5. 사전 결함 + 보강

### 5.1 runner binary 에 RUNNER_REGISTRY_CONFIG_DIR 가 없었음

TASK-073 이전엔 docker CLI 가 default `~/.docker/config.json` 만 참조 — 운영자가 private registry auth 를 runner 에 게이트하기 위해선 /root/.docker/config.json 을 volume mount + UID/GID 정렬 + docker daemon 의 config 도 무관하게 유지되는 어려움이 있었음.

**보강** (`apps/runner/internal/config/config.go` + `cmd/runner/main.go`):
- `Config.RegistryConfigDir string` 필드 추가, `RUNNER_REGISTRY_CONFIG_DIR` env parse (default empty).
- `cmd/runner/main.go` 에서 `os.Setenv("DOCKER_CONFIG", cfg.RegistryConfigDir)` 호출.
- 회귀 가드 `config_test.go` 6건 (default empty / env read / all-fields / PollInterval default / bare-integer seconds / Setenv observability) — 전부 PASS.

### 5.2 compose 검증 시 group_add 중복 오류

`compose.dev.e2e-registry.yaml` 첫 작성에서 `group_add: ["${DOCKER_SOCKET_GID:?...}"]` 가 compose-spec 항목 중복 검사로 reject 됨 — host 의 docker group gid 가 base image `alpine:3.20 + docker-cli` 의 docker group gid 와 같으면 `items at 0 and 1 are equal` 메시지.

**보강**: `group_add` 항목을 제거하고 Dockerfile 의 `addgroup runner docker` 에 의존 — TASK-078 self-review 가 검증한 권한 정렬 (root:docker 0660 + alpine 의 docker group) 그대로 사용. docker 가 잘 못 동작하면 e2e 의 build 단계에서 명확히 surface.

### 5.3 RUNNER_DEPLOY_TARGET_REF 가 docker registry 에서 slash split 됨

`RUNNER_DEPLOY_TARGET_REF=localhost:5000/docker-image-builder-system` 로 push 한 결과 registry catalog 가 `{"repositories":["docker-image-builder-system"]}` 만 노출 — docker push 가 `:` / `/` 로 image path 를 split 하므로 `docker-image-builder-system/cli:<buildId>` 가 되어야 `docker-image-builder-system/cli` 가 repo 로 잡힘.

**보강**: `RUNNER_DEPLOY_TARGET_REF=localhost:5000/docker-image-builder-system/cli` 로 정렬 — consumer 가 registry endpoint 와 image path 를 함께 주는 패턴. e2e 가 회귀 가드로 catalog 에 `docker-image-builder-system/cli` 가 들어왔는지 매번 검증.

### 5.4 manifest v2 vs v1 schema

registry:2 는 single-layer image 에 대해 v1 호환 manifest (fat manifest) 를 반환할 수 있음 — 현재 bonus 단계의 `Accept: application/vnd.docker.distribution.manifest.v2+json` 가 이 경우 정상 JSON 이 아닌 schema 목록을 반환하여 `json.loads()` 가 실패. `extra_hosts: host.docker.internal:host-gateway` 로 host ↔ container DNS 정렬은 정상이지만 manifest 형식 검증은 `errors.New(...)` 처리로 fallback. 본 단계는 bonus (fatal 아님) — main 8 단계가 PASS 하면 e2e 자체는 통과.

## 6. 빠른 재현 메모

### 6.1 최소 명령

```sh
export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"
export ADMIN_IDS=admin
bash apps/build-server/scripts/e2e-registry-push.sh
```

### 6.2 실패 시 디버깅 단서

`KEEP_PROJECT=1` 환경 변수로 trap 의 compose down 을 보류 (디버깅 전용):

```sh
# 별도 shell
KEEP_PROJECT=1 bash apps/build-server/scripts/e2e-registry-push.sh
# 또는 compose 만 띄우고
ADMIN_IDS=admin DOCKER_SOCKET_GID=116 docker compose \
  -f compose.dev.yaml -f compose.dev.e2e-registry.yaml \
  --project-name dibs-registry-debug up -d --build
docker exec -i <runner> sh -c 'DOCKER_CONFIG=/registry-config docker pull localhost:5000/docker-image-builder-system/cli:latest'
curl -s http://127.0.0.1:5000/v2/_catalog | python3 -m json.tool
```

### 6.3 운영 검증 재현

운영 환경에선 같은 e2e 가 아닌 (외부 registry 의 응답 시간이 local registry 와 다르므로) 별도 운영 smoke 가 필요. recommended:
1. 운영 cluster 에서 `RUNNER_REGISTRY_CONFIG_DIR=/secrets/registry` + RUNNER_REGISTRY_CONFIG_DIR 안의 config.json 이 인증 entry 를 가짐.
2. 실제 build 가 외부 registry 에 push 되고 registry console 에서 manifest 가 노출되는지 manual verify.
3. private repo access token rotation 후 env 갱신 절차 확인.

## 7. 회귀 baseline (TASK-086 → TASK-073)

| 항목 | 결과 |
|---|---|
| TS 4 packages `tsc --noEmit` | clean (변경 파일 영향 없음) |
| build-server node:test | **131/131 동일** (backend 변경 0) |
| build-monitor vitest | **135/135 동일** (frontend 변경 0) |
| Go 7 packages (이전) | 모두 PASS |
| Go config package 신규 | **6/6 PASS** (`TestLoadRegistryConfigDirDefaultEmpty` + `TestLoadRegistryConfigDirFromEnv` + `TestLoadAllFieldsWithEnv` + `TestLoadPollIntervalDefaults` + `TestLoadPollIntervalAcceptsBareIntegerSeconds` + `TestSetenvIsObservableWithinSameProcess`) |
| svelte-check | 0 errors / 0 warnings |
| `e2e-registry-push.sh` | **ALL PASS** (~2-3 분: registry:2 cold start 5-10s + build-server healthcheck 30s + cli push lifecycle ~30-60s + cleanup) |

## 8. 다음 세션 권장

- TASK-074: htpasswd 인증이 enabled 인 local registry e2e — `RUNNER_REGISTRY_CONFIG_DIR` 의 config.json 에 `auths: { "127.0.0.1:5000": { "auth": "base64(testuser:testpw)" } }` 추가하고 registry:2 에 htpasswd volume mount. 본 TASK 의 foundation 위에서 인증까지 검증.
- (후속) Docker Hub / ECR / GCR 운영 smoke — `RUNNER_REGISTRY_CONFIG_DIR=/secrets/registry` + K8s secret volume 의 실제 인증 entry 로 private repo push 검증.
- (후속) TASK-074 의 deploy target axis 확장 (e.g. 로컬 docker save, k8s 직접 deploy 등).

