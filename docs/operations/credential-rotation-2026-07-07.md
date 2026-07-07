# 2026-07-07 Credential Rotation E2E Validation (TASK-075)

- 문서 목적: TASK-075 의 credential rotation 검증 결과를 다음 세션이 즉시 재현할 수 있게 남긴다.
- 범위: TASK-074 의 htpasswd 인증 환경에서 htpasswd + config.json 의 auths entry 를 runtime 중 갱신해도 docker CLI + registry 가 새 credential 로 push 동작함을 검증. 한 번 더 나아가 htpasswd 갱신이 registry:v2 의 cache 정책 때문에 즉시 반영되지 않는 보안 결함을 발견하고, SIGHUP → restart fallback 으로 봉인.
- 대상 독자: AI 에이전트, 운영자, 다음 구현 세션
- 상태: draft (verified PASS 2026-07-07)

## 1. 동기

TASK-074 의 htpasswd 인증 e2e 가 "credential 을 한 번 적용하고 동작" 을 검증했다면, TASK-075 는 "운영자가 htpasswd 와 config.json 을 mid-claim 갱신할 때 docker CLI 가 새 credential 로 push 동작" 을 검증. credential rotation 은 운영 환경의 표준 시나리오:

1. CI token 만료 / 정기 rotation (Vault / cert-manager / cron job)
2. 운영자의 secret 자동 rotation (K8s external-secrets / Vault dynamic secrets)
3. credential 노출 감지 후 즉시 갱신 (incident response)

본 TASK 가 봉인되면서 운영자가 rotate 시점에 알아야 할 두 가지 운영 규약도 정립:

- (a) **htpasswd 갱신 후 registry container restart 필수** — registry:v2 가 htpasswd file 을 container lifetime 동안 memory cache 함. SIGHUP 으로 reload 안 됨. restart 해야만 새 hash 적용.
- (b) **runner 의 `RUNNER_REGISTRY_CONFIG_DIR` 가리키는 config.json 도 같이 갱신** — 두 file 이 어긋나면 docker 가 한쪽 credential 만 사용하고 registry 가 다른쪽으로 인증 시도 → 즉시 unauthorized.

## 2. 환경

- 작업 경로: `/Users/yklee/repos/docker-image-builder-system`
- 검증 시점: 2026-07-07
- e2e duration: ~3-4 분 (httpd:alpine pull 20s + registry:2 cold start 5-10s + build-server healthcheck 30s + cli push v1 ~30s + htpasswd 갱신 + SIGHUP+restart ~10s + cli push v2 ~30s + cleanup)
- 요구사항:
  - `docker info` reachable
  - busybox:1.36 + registry:2 + httpd:alpine image pull 가능 (HTTP image 가 host daemon 에 미캐시 일 때만 다운로드)
  - host 의 docker daemon 에 `insecure-registries` 등록 불필요 (e2e 가 자체 config.json 으로 docker CLI 가이딩)

## 3. 사용 절차

```sh
export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"
export ADMIN_IDS=admin

bash apps/build-server/scripts/e2e-credential-rotation.sh
```

정상 종료 시:

```
==========================================
TASK-075 credential-rotation 검증: ALL PASS
==========================================
  build_v1=<buildId> (credential v1) — push 통과
  htpasswd v2 + config.json v2 갱신 (testuser 의 hash rotation)
  build_v2=<buildId> (credential v2) — push 통과 (docker 가 새 credential 적용)
  catalog 에 두 buildId 다 노출
  옛 credential (testpw) 즉시 401 — rotation 즉시 무효화
  새 credential (testpw_NEW) catalog 정상 조회
```

## 4. e2e 가 검증하는 것

### 4.1 9 단계 + 보너스 2 단계

| 단계 | 검증 항목 |
|---|---|
| [0/9] | busybox:1.36 image warm-up |
| [1/9] | registry:2 image warm-up |
| [2/9] | HOST_REGISTRY_AUTH_DIR + HOST_REGISTRY_CONFIG 초기 셋업 (htpasswd v1 + config.json v1) |
| [3/9] | compose up — build-server + runner (cli mode) + registry |
| [4/9] | registry healthy 대기 (curl /v2/) |
| [5/9] | build-server healthy 대기 |
| [6/9] | runner registry 등록 대기 |
| [7/9] | 첫 번째 build (credential v1) — push 통과 |
| [8/9] | htpasswd v2 + config.json v2 갱신 |
| [8.5/9] | registry htpasswd reload — SIGHUP → restart fallback |
| [9/9] | 두 번째 build (credential v2) — push 통과 |
| [bonus-A] | 옛 credential (testpw) → 401 검증 |
| [bonus-B] | 새 credential (testpw_NEW) catalog 정상 조회 + 두 buildId tags 노출 |

### 4.2 운영 의미

본 e2e 가 통과하면 다음 5 가지 운영 가정이 자동 검증된다:

1. **config.json auths entry rotation** — base64(testuser:TESTPW) → base64(testuser:TESTPW_NEW) 갱신이 docker CLI 의 다음 push 에 즉시 반영. docker 가 process 내 in-memory credential state 없이 매 push 마다 config.json 을 read.
2. **htpasswd file rotation** — 같은 user 의 bcrypt hash 가 갱신되어도 registry 가 즉시 cache reload 안 함 — restart 또는 SIGHUP 가 필요. 본 TASK 가 SIGHUP 시도 + restart fallback 으로 봉인.
3. **registry cache 정책** — registry:v2 가 htpasswd file 을 container lifetime 동안 cache. credential rotation 직후 옛 credential 이 cache 만료 전까지 동작. 운영 환경에서는 rotation 직후 registry container 가 자동 restart 되는지 (K8s rollout job 등) 확인 필수.
4. **runner 의 config.json mount 가 host 의 volume mount** — host dir 에 갱신하면 즉시 반영. host 파일 시스템을 single source-of-truth 로 운영 (Vault Agent / K8s secret volume mount 등).
5. **docker CLI 의 credential push 자동 retry 없음** — 한 build 의 push 가 fail 하면 그 build 는 FAILED. 다음 build 부터 새 credential 적용. mid-claim 갱신은 안전하지 않음 — 운영자가 credential rotation 시 build queue 를 drain 한 후 진행 권장.

### 4.3 운영 환경 credential rotation 흐름

```
1. CI cron / Vault 가 htpasswd file 갱신:
   $ htpasswd -nbB ci-runner "$NEW_CI_TOKEN" > /secrets/registry/htpasswd
   $ chmod 0444 /secrets/registry/htpasswd

2. Vault 가 config.json 갱신:
   $ jq '.auths["registry.example.com"].auth = "$base64(ci-runner:$NEW_CI_TOKEN)"' \\
       /secrets/registry/config.json > /secrets/registry/config.json.new
   $ mv /secrets/registry/config.json.new /secrets/registry/config.json

3. registry container rollout (K8s deployment 가 자동):
   $ kubectl rollout restart deployment/registry

4. registry 가 새 htpasswd 로 시작 — 옛 credential 즉시 401.

5. (build queue 가 비어 있는지 확인 후 진행; 새 build 부터 새 credential)
```

## 5. 사전 결함 + 보강 (TASK-075 가 발견)

### 5.1 htpasswd file 0444 read-only 가 갱신 시 Permission denied

초기 credential 셋업 시 htpasswd file 을 `chmod 0444` 로 read-only 부착. v2 credential 갱신 시 `echo > htpasswd` 가 silent fail (Permission denied). mktemp 의 default 0700 와는 다른 결함 — 0444 의 의도된 보안 모드가 update 시점의 silent fail 의 원인이 됨.

**보강**: `update_htpasswd()` 가 갱신 직전 `chmod 0644` 후 redirect, 그 후 `chmod 0444` 다시 부착. update 와 read-only 의 의도가 양립.

### 5.2 submit_and_wait 함수의 stdout 이 buildId 와 log 메시지 혼합

`submit_and_wait()` 가 buildId 외에 "✓ appName → buildId" / "✓ source upload accepted" / "✓ build COMPLETED" 같은 진행 log 도 stdout 으로 내보냄. caller 가 `$(submit_and_wait ...)` 로 capture 할 때 buildId 가 오염되어 후속 `grep -q "$BUILD_V1"` 이 "Invalid range end" 같은 fail.

**보강**: 함수 안의 모든 progress log 를 `log()` helper + `>&2` redirect. stdout 에는 buildId 만 emit.

### 5.3 registry:v2 가 htpasswd file 의 container-runtime 갱신을 즉시 반영 안 함

registry:v2 가 htpasswd file 을 container 시작 시 memory load 한 뒤 영구히 cache. host 의 bind mount 로 file 을 갱신해도 registry 측에 반영 안 됨. SIGHUP signal 도 받지 않음 (registry 가 죽지 않고 signal 무시).

**보강**: 두 단계 htpasswd reload —
1. `docker kill -s HUP ${REGISTRY_CONTAINER}` 시도. cache reload 안 되면 (probe HTTP code 가 200 으로 안 떨어지면) fallback.
2. `docker compose restart registry` — htpasswd file 이 mount 였으므로 restart 시 새 hash 로 reload. 운영 환경에서는 credential rotation 시 항상 registry container 의 rollout 가 동반되어야 함.

**운영 의의**: 본 TASK 가 e2e 봉인 외에 credential rotation workflow 의 보안 결함 (옛 credential 이 cache 기간 동안 동작) 도 명시화. 운영자가 htpasswd 갱신 시 곧바로 registry container rollout 을 trigger 하는지 (예: kubectl rollout restart deployment/registry) 의 alert 가 추가됨.

### 5.4 v2 credential 의 base64 갱신 후 옛 credential 의 즉시 무효화

본 TASK 의 기대는 "옛 credential (testpw) → 즉시 401" 인데, registry:v2 의 cache 정책 (5.3) 으로 SIGHUP 안 받고 restart 만 했을 때 — restart 후 옛 credential 의 hash 가 cache 에서 사라지므로 즉시 401. 즉 **restart 후엔 즉시 무효화** 가 보장됨. SIGHUP 만으로는 cache invalidation 안 되지만 restart 는 보장. 운영자에게 "credential rotation 직후 registry restart 가 필수" 라는 명확한 rule.

## 6. 빠른 재현 메모

### 6.1 최소 명령

```sh
export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"
export ADMIN_IDS=admin
bash apps/build-server/scripts/e2e-credential-rotation.sh
```

### 6.2 디버깅 (KEEP_PROJECT)

```sh
KEEP_PROJECT=1 bash apps/build-server/scripts/e2e-credential-rotation.sh
# 별도 shell — container / host dir 보존
PROJECT=$(grep -oE "dibs-credrot-e2e-[0-9]+" /tmp/e2e-credrot-debug.log | head -1)
docker compose -p "$PROJECT" ps
ls -la /tmp/tmp.XXX/  # HOST_REGISTRY_CONFIG + AUTH dir
cat /tmp/tmp.XXX/config.json
# 마지막 정리
docker compose -p "$PROJECT" down -v
rm -rf /tmp/tmp.XXX/
```

### 6.3 운영 환경 credential rotation playbook

1. **credential 갱신**: htpasswd file + config.json 의 auths entry 를 동시에 갱신 (둘이 어긋나면 한 build 가 unauthorized fail).
2. **registry rollout**: htpasswd 갱신이 registry 측에 반영되려면 registry container 재시작 필수. K8s 환경: `kubectl rollout restart deployment/registry`.
3. **build queue 검증**: runner mid-claim 중일 때 credential 이 바뀌면 그 build 는 fail — queue 가 빌드 없거나 다음 build 부터 새 credential 적용. mid-claim rotation 은 권장하지 않음.
4. **로그/모니터**: registry 에서 "authentication failure" 가 build lifecycle 실패 로그로 떨어지면 credential 불일치 가능성. 운영 alert 로 등록.

## 7. 회귀 baseline (TASK-074 → TASK-075)

| 항목 | 결과 |
|---|---|
| TS 4 packages `tsc --noEmit` | clean (변경 파일 영향 없음) |
| build-server node:test | **131/131 동일** (backend 변경 0) |
| build-monitor vitest | **135/135 동일** (frontend 변경 0) |
| Go 8 packages (TASK-074 baseline 유지) | 모두 PASS |
| svelte-check | 0 errors / 0 warnings |
| `e2e-registry-push.sh` (TASK-074) | **ALL PASS** (회귀 baseline 유지) |
| `e2e-credential-rotation.sh` (TASK-075) | **ALL PASS** (~3-4 분: httpd:alpine pull 20s + registry:2 cold start 5-10s + build-server healthcheck 30s + cli push v1 ~30s + htpasswd 갱신 + SIGHUP+restart ~10s + cli push v2 ~30s + cleanup) |
| catalog `{"repositories":["docker-image-builder-system/cli"]}` | 정상 노출 |
| tags list | build_v1 + build_v2 둘 다 노출 |
| bonus: 옛 credential | 401 |
| bonus: 새 credential | catalog 정상 조회 |

## 8. 다음 세션 권장

- (후속) K8s external-secrets + CronJob 통합 운영 smoke — Vault 가 htpasswd + config.json 갱신 → K8s secret 갱신 → runner 가 hot-reload 으로 새 credential 적용 → 빌드 queue 의 다음 build 가 새 credential 로 통과. 본 TASK 가 self-contained 환경 검증, 후속이 K8s 운영 환경 검증.
- (후속) Credential rotation + 동시에 여러 build in-flight — mid-claim rotation 의 영향 평가. 본 TASK 가 한 build 완료 → 갱신 → 다음 build 순서를 가정, 동시 mid-claim rotation 도 검증 가능.
- (후속) Registry container 별 htpasswd reload 정책 — registry:v2 가 향후 update 에서 SIGHUP reload 또는 hot-reload 지원을 추가하는지 모니터링. 현재는 restart 필수.
