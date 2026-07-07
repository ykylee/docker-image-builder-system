# 2026-07-07 Registry Push Auth E2E Validation (TASK-074)

- 문서 목적: TASK-074 의 htpasswd 인증 e2e 검증 결과를 다음 세션이 재현할 수 있게 남긴다.
- 범위: registry:2 htpasswd basic auth + busybox Dockerfile + 실제 docker push → registry API catalog/tags 로 검증. TASK-073 의 insecure-registry 케이스 위에서 인증 round-trip 까지 봉인.
- 대상 독자: AI 에이전트, 운영자, 다음 구현 세션
- 상태: draft (verified PASS 2026-07-07)

## 1. 동기

TASK-073 이 봉인한 `RUNNER_REGISTRY_CONFIG_DIR` + insecure-registry 의 foundation 위에서, 운영 환경이 실제 사용하는 htpasswd 인증이 e2e 검증되어야 한다. insecure-registry 만 검증하면 "production 환경에서 htpasswd 가 enabled 됐을 때 안 되는 silent failure" 가능성 — 본 TASK 가 그것을 명시적으로 봉인한다. private Docker Hub 의 access token, ECR 의 basic auth, GCR 의 OAuth 모두 htpasswd 와 동일한 basic-auth path 로 동작 — 본 TASK 가 그것의 foundation.

## 2. 환경

- 작업 경로: `/Users/yklee/repos/docker-image-builder-system`
- 검증 시점: 2026-07-07
- e2e duration: ~3-4 분 (httpd:alpine pull 20s + registry:2 cold start 5-10s + build-server healthcheck 30s + cli push lifecycle ~30-60s + cleanup)
- 요구사항:
  - `docker info` reachable
  - busybox:1.36 + registry:2 + httpd:alpine image pull 가능 (HTTP image 가 host daemon 에 미캐시 일 때만 다운로드)
  - host 의 docker daemon 에 `insecure-registries` 등록 불필요 (e2e 가 자체 config.json 으로 docker CLI 가이딩)

## 3. 사용 절차

```sh
export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"
export ADMIN_IDS=admin

bash apps/build-server/scripts/e2e-registry-push.sh
```

정상 종료 시:

```
==========================================
TASK-074 htpasswd 인증 registry-push 검증: ALL PASS
==========================================
  htpasswd 가 enabled 된 registry 가 testuser:testpw 의 auths entry 를
  받아들여 cli mode docker push 성공 (RUNNER_REGISTRY_CONFIG_DIR + base64 auth)
  registry catalog: docker-image-builder-system/cli 가 push 됨
  registry tags: <buildId> 가 push 됨
  bonus: auth 헤더 부재 / 잘못된 credential 이 모두 401 떨어뜨림
```

## 4. e2e 가 검증하는 것

### 4.1 TASK-073 의 8 단계 + 추가 단계

TASK-073 의 8 단계 + 보너스 위에 다음을 추가:
- [추가] htpasswd 파일 생성 (`docker run --rm httpd:alpine htpasswd -nbB` 로 bcrypt hash)
- [추가] HOST_REGISTRY_CONFIG/config.json 에 base64 auths entry 추가
- [bonus-A] 인증 헤더 부재 → 401 검증 (htpasswd 가 실제로 enabled 됐다는 evidence)
- [bonus-B] 잘못된 credential → 401 검증 (registry 가 htpasswd entry 와 일치하는 credential 만 인정하는지)
- [8/8] 인증 부착 curl 로 catalog/tags 조회 (htpasswd enabled 라 mandatory)

### 4.2 운영 의미 (RUNNER_REGISTRY_CONFIG_DIR + auth)

본 e2e 가 통과하면 다음 4 가지 운영 가정이 자동 검증된다:

1. **RUNNER_REGISTRY_CONFIG_DIR → DOCKER_CONFIG env propagation** — TASK-073 의 Go amend.
2. **htpasswd 인증 enabled 인 registry 가 basic auth 로 accept** — registry:2 의 REGISTRY_AUTH=htpasswd + REGISTRY_AUTH_HTPASSWD_REALM + REGISTRY_AUTH_HTPASSWD_PATH 가 registry 설정에서 동작.
3. **auths entry 의 base64 가 credential 임을 registry 가 검증** — bcrypt hash 의 htpasswd 와 base64 credential 이 같은 user/password 라 registry 가 authorization 통과.
4. **401 negative 검증** — auth 헤더 부재와 잘못된 credential 모두 거부 (운영 환경에서 credential rotation 이 잘못된 경우의 신호).

### 4.3 운영 환경으로의 확장

본 TASK 의 e2e 가 self-contained 로 검증하지만, 운영 환경에서는 다음 차이:
- HTTPS + 자체 CA cert (`registry-auth-tls` secret mount) → host 의 docker 가 insecure 옵션 불필요.
- htpasswd file (`/auth/htpasswd`) 대신 K8s secret (`/secrets/registry/htpasswd`) 로 volume mount.
- credential rotation 자동화 (e.g. 별도 CI 가 htpasswd 갱신 / config.json 의 auths 갱신 후 config-reload).
- multi-registry 환경 (Docker Hub + ECR + GCR 동시) — `RUNNER_REGISTRY_CONFIG_DIR` 가 단일 dir 만 가리킬 수 있어, 멀티 registry 각각 별도 dir 운영 권장.

## 5. 사전 결함 + 보강 (TASK-073 의 foundation 위에서 발견)

### 5.1 config.json auths entry key 가 exact match — `localhost:5000`

docker 가 push target 을 `localhost:5000/docker-image-builder-system/cli:<buildId>` 로 해석하고, config.json 의 auths entry key 가 `127.0.0.1:5000` 이면 entry 가 match 안 됨.

**보강** (`e2e-registry-push.sh`): config.json 의 auths entry key 를 `127.0.0.1:5000` → `localhost:5000` 로 정렬 (push target 의 URL 과 동일). insecure-registries 도 둘 다 등록.

### 5.2 host 임시 디렉터리의 permission (mktemp default 0700)

mktemp 가 0700 으로 디렉터리를 만들고, runner container 의 user (uid 1500) 가 host 의 volume mount 에서 권한 박탈.

**보강**: `chmod 0755 "${HOST_REGISTRY_CONFIG}" "${HOST_REGISTRY_AUTH_DIR}"` 로 host dir permission 을 world-readable 로 조정. compose override 가 `:ro` 마운트이지만 user id mismatch 로 dir 자체가 안 보이는 문제 봉인.

### 5.3 registry:2 가 apr1 hash format 을 인식 안 함

`openssl passwd -apr1 testpw` 가 `$apr1$<salt>$<hash>` 형식의 hash 를 emit 하지만 registry:2 (distribution package) 가 bcrypt / sha256 / sha512 만 인식. apr1 은 인식 안 함 → 401 authentication failure.

**보강** (`e2e-registry-push.sh`): htpasswd 생성을 `docker run --rm httpd:alpine htpasswd -nbB <user> <pw>` 로 통일. httpd apache2-utils 의 htpasswd 가 `-B` 옵션으로 bcrypt ($2y$05$) 형식 emit. registry 가 `$2y$` 인식 (bcrypt 호환). host 의 `htpasswd` 가 없거나 openssl fallback 만 있는 환경에서도 docker httpd image 가 docker-cleint 토큰 만 사용하면 동작.

### 5.4 bind mount 의 dangling source (debug 보강)

KEEP_PROJECT=1 env 로 trap 의 compose down 을 보류해도 host 의 `HOST_REGISTRY_CONFIG` / `HOST_REGISTRY_AUTH_DIR` 가 trap 의 `rm -rf` 로 같이 정리되어 container 의 bind mount 가 dangling source 가 됨 (`mountinfo` 에 `//deleted` 표시). Docker config.json 못 읽는 silent failure 의 원인.

**보강** (`e2e-registry-push.sh`): KEEP_PROJECT=1 시 `rm -rf` 까지 보류, debug 용으로 container / host dir / htpasswd 의 path 만 echo 후 운영자가 manual cleanup.

### 5.5 manifest v2 vs v1 schema (TASK-073 에서 발견, 본 TASK 에서도 잔존)

[bonus-9] manifest 검증의 Accept header mismatch 로 manifest 파싱 실패 (TASK-073 운영 가이드 §5.4 와 동일). main 8 단계는 fatal 아님.

## 6. 빠른 재현 메모

### 6.1 최소 명령

```sh
export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"
export ADMIN_IDS=admin
bash apps/build-server/scripts/e2e-registry-push.sh
```

### 6.2 디버깅 (KEEP_PROJECT)

```sh
KEEP_PROJECT=1 bash apps/build-server/scripts/e2e-registry-push.sh
# 별도 shell — container 와 host dir 보존
PROJECT=$(grep -oE "dibs-registry-e2e-[0-9]+" /tmp/e2e-auth-debug.log | head -1)
docker compose -p "$PROJECT" ps
ls -la /tmp/tmp.XXX/  # HOST_REGISTRY_CONFIG
docker exec -i dibs-runner cat /registry-config/config.json
docker exec -i dibs-runner docker pull localhost:5000/scratch:notexist  # 인증 검증
# 마지막 정리
docker compose -p "$PROJECT" down -v
rm -rf /tmp/tmp.XXX/  # HOST_REGISTRY_CONFIG + AUTH dir
```

### 6.3 운영 환경 도입 패턴

1. K8s secret 의 htpasswd 파일 (`/etc/registry-auth/htpasswd`):
   ```yaml
   apiVersion: v1
   kind: Secret
   metadata:
     name: registry-htpasswd
   data:
     htpasswd: $(htpasswd -nbB ci-runner "$CI_TOKEN" | base64)
   ```

2. K8s secret 의 config.json (`/etc/registry-config/config.json`):
   ```yaml
   apiVersion: v1
   kind: Secret
   metadata:
     name: registry-config
   data:
     config.json: |
       {
         "auths": {
           "registry.example.com": {"auth": "<base64(ci-runner:$CI_TOKEN)>"},
           "123456789.dkr.ecr.us-east-1.amazonaws.com": {"auth": "<AWS ECR token>"}
         }
       }
   ```

3. Runner deploy 의 volumeMount + env:
   ```yaml
   volumes:
     - name: registry-config
       mountPath: /registry-config
   - name: registry-htpasswd
     mountPath: /registry-htpasswd
   env:
     - name: RUNNER_REGISTRY_CONFIG_DIR
       value: /registry-config
   ```

본 TASK 가 검증한 e2e 가 secure / mount 자동화의 production 패턴 — htpasswd file + config.json + env 만 운영자가 채우면 동일하게 동작.

## 7. 회귀 baseline (TASK-073 → TASK-074)

| 항목 | 결과 |
|---|---|
| TS 4 packages `tsc --noEmit` | clean (변경 파일 영향 없음) |
| build-server node:test | **131/131 동일** (backend 변경 0) |
| build-monitor vitest | **135/135 동일** (frontend 변경 0) |
| Go 8 packages (TASK-073 baseline 유지) | 모두 PASS |
| svelte-check | 0 errors / 0 warnings |
| `e2e-registry-push.sh` | **ALL PASS** (~3-4 분: httpd:alpine pull 20s + registry:2 cold start 5-10s + build-server healthcheck 30s + cli push lifecycle ~30-60s + cleanup) |
| registry catalog | `{"repositories":["docker-image-builder-system/cli"]}` |
| registry tags | buildId 가 push 됨 |
| bonus: 인증 부재 | 401 |
| bonus: 잘못된 credential | 401 |

## 8. 다음 세션 권장

- (후속) HTTPS + 자체 CA cert 운영 smoke — `RUNNER_REGISTRY_CONFIG_DIR` 가 CA cert 까지 포함. 인증서 rotation / `restart` 가 registry 측 TLS handshake 정합 포함.
- (후속) K8s secret + config-reload — htpasswd file 갱신 시 runner 가 mid-claim 에서 auth 재시도 자동 반영. 본 e2e 가 cred 변경 시 reconstruct rebuild 가 아닌 hot-reload 패턴 검증.
- (후속) multiple registries — 같은 task 가 multi-target registry 동시 push. `RUNNER_REGISTRY_CONFIG_DIR` 가 단일 dir 으로는 한계 — 별도 dir 또는 in-memory multi-dir 지원 검토.
