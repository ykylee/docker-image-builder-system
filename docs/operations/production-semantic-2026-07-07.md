# 2026-07-07 Production Semantic E2E Validation

- 문서 목적: TASK-085 의 production semantic 검증 결과를 다음 세션이 즉시 재현할 수 있게 남긴다.
- 범위: busybox/scratch Dockerfile + 실제 tar.gz source archive 로 build 가 COMPLETED 까지 가는 운영 시나리오 자동 검증 — 이전 dogfood (`docs/operations/dogfood-e2e-2026-07-06.md` §2.2, `bab5995f-…-95d53684263d`) 의 자동 재현 동등물.
- 대상 독자: AI 에이전트, 운영자, 다음 구현 세션
- 상태: draft (verified PASS 2026-07-07)

## 1. 동기 / 직전 한계

TASK-081-B / TASK-082 의 multi-runner 운영 검증은 build 가 terminal phase 까지 도달하는지 + multi-runner 분산의 두 가지를 검증했다. 단, dummy (size 0 source archive) 의 한계로 build 가 FAILED 로 끝나는 시나리오만 다뤘다:

```
$ bash apps/build-server/scripts/e2e-multi-runner.sh
... completed=0 failed=5 (terminal=5/5)
⚠ all 5 builds FAILED — likely source upload did not carry a working tar.gz
```

이는 다음을 보장하지 못한다:

- (a) `docker build` 가 user 의 Dockerfile 로 실제 image 를 만드는지
- (b) `docker run -d -p <port>` 으로 container 가 host 에 실제로 떠는지
- (c) HTTP healthcheck (200 OK + stability window) 가 통과하는지
- (d) 10 phase 가 canonical order 로 emit 되는지
- (e) previewUrl 이 진짜 host port + GET / 2xx 인지

TASK-085 는 이를 `bab5995f-…-95d53684263d` 의 자동 재현 동등물로 봉인한다 — busybox (가장 작은 production-grade base image) + 실제 `tar.gz` source + 1 runner cli mode + docker run cli mode + skeleton deploy + auto-cleanup 까지 운영 시나리오 전체.

## 2. 환경

- 작업 경로: `/Users/yklee/repos/docker-image-builder-system`
- 검증 시점: 2026-07-07
- e2e duration: ~2 분 (build-server cold start + busybox pull (warmup) + 단일 build lifecycle + cleanup)
- 도커 호스트 요구사항: `docker info` reachable, busybox:1.36 image pull 가능 (internet / local registry), host 의 `getent group docker` 가 gid 반환
- 포트 요구사항:
  - host port 3000 (build-server expose)
  - host 가 자동 할당한 ephemeral port (busybox container 의 host port) — `docker run -p 8080` 가 docker daemon 에서 OS ephemeral port 를 잡음

## 3. 사용 절차

```sh
export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"
export ADMIN_IDS=admin

bash apps/build-server/scripts/e2e-production-semantic.sh
```

끝. 정상 종료 시:

```
==========================================
TASK-085 production-semantic 검증: ALL PASS
==========================================
  build COMPLETED in 1 runner (busybox:1.36 + httpd)
  10/10 phases present
  previewUrl well-formed (127.0.0.1:<hostPort>/)
  container auto-cleaned after completion
```

## 4. e2e 가 검증하는 것

### 4.1 7 단계 자동 검증 (스크립트 §[0/7] ~ §[7/7])

| 단계 | 검증 항목 | 근거 |
|---|---|---|
| [0/7] busybox:1.36 warm-up | host daemon 이 busybox image 를 pull 가능 | busybox 의 1.5 MB 가 docker daemon 에 캐시되면 cold start 비용 제거 |
| [1/7] compose up | build-server + 1 runner (`RUNNER_DOCKER_BUILD_MODE=cli` / `RUNNER_DOCKER_RUN_MODE=cli` / `RUNNER_DEPLOY_MODE=skeleton` / `RUNNER_STOP_CONTAINER_ON_DONE=true` / `network_mode: host`) | compose.dev.e2e-production.yaml override — production semantic 의 본질이 cli mode + host network + auto-cleanup |
| [2/7] build-server health | 30s 내 `/health` 200 OK | cold start + applyMigrations 여유 |
| [3/7] runner registry 등록 | `/admin/runners` 가 1 row 반환 | 첫 register + 첫 poll cycle 까지 30-90s — 최대 90s 여유 |
| [4/7] source archive 작성 + POST | busybox Dockerfile + `index.html` 을 tar.gz 로 묶어 `/builds` + `/builds/:id/source` 로 upload — declared checksumSha256 = real sha256, declared sizeBytes = real sizeBytes | server 가 실제 sha256 재계산으로 검증 — TASK-066 contract 와 정합 |
| [5/7] build lifecycle | `status=COMPLETED` 도달 (상한 5 분) — `FAILED` 면 즉시 fatal + 로그 dump | TASK-066/067/068/071a 의 production semantic — FAILED 면 이전 dummy 검증과 구분 불가 |
| [6/7] 10 phase 검증 | logs 의 `phase` field 가 canonical 10 phase 모두 emit — REQUEST_ACCEPTED, QUEUE_CLAIMED, SOURCE_PREPARED, DOCKER_BUILD_STARTED, DOCKER_BUILD_COMPLETED, PREVIEW_QUEUED, PREVIEW_READY, DEPLOYMENT_STARTED, DEPLOYMENT_COMPLETED, COMPLETED | `apps/runner/internal/services/build_service.go:ProcessClaim` 의 canonical phase emit 정합 |
| [6/7] previewUrl 검증 | `previewUrl = http://127.0.0.1:<hostPort>/` regex match + `test.healthCheckPassed=True test.stabilityWindowPassed=True` (GET / 가 stability window 동안 2xx) | BuildStatusResponse.test.healthCheckPassed / stabilityWindowPassed 는 runner 의 WaitForHealth 가 ReportPreviewReady 로 emit 한 값 그대로 저장 (TASK-067) |
| [7/7] container cleanup | host 에 `container-<buildId>` 가 남아있지 않음 | RUNNER_STOP_CONTAINER_ON_DONE=true 의 defer StopContainer 가 발화 — preview 가 끝나면 자동 cleanup |

### 4.2 운영 의미 (production semantic 검증)

본 e2e 가 통과하면 다음 5 가지 운영 가정이 자동 검증된다:

1. **source archive 라운드트립** (TASK-066): Skill 이 POST 한 bytes 가 host 에 그대로 저장되고, runner 가 같은 bytes 를 GET 해서 사용 — checksum 불일치 시 거절.
2. **docker build** (TASK-068 1차): runner 가 user Dockerfile 로 image 를 빌드하고 tag 까지 emit — host docker daemon 의 권한 / group / image cache 가 정상.
3. **docker run + healthcheck** (TASK-067): `-p <port>` 로 auto-assign 된 host port 가 readable, HTTP GET `<RuntimeURL>` 이 2xx + stability window 통과.
4. **deploy 단계** (TASK-068 + TASK-071a): skeleton mode 라 외부 registry push 는 없지만 deploy-result.json emit + ReportDeployment 가 SUCCESS 로 닫힘.
5. **lifecycle cleanup** (TASK-067 후속): `RUNNER_STOP_CONTAINER_ON_DONE=true` 가 preview-ready 직후 defer StopContainer 발화 — host 에 container 잔존 없음.

## 5. 사전 결함 + 봉인 내역

본 TASK 봉인 과정에서 발견된 3 가지 결함 + 보강:

### 5.1 busybox httpd 의 default Basic Auth (`/login` 302 redirect)

`httpd -p 8080` 만 주면 busybox 의 default 설정이 Basic Auth 를 적용해 GET / 가 `302 Found / Location: ./login` 으로 redirect 된다. Runner 의 `WaitForHealth` 는 2xx 만 통과시키므로 healthcheck 가 즉시 timeout 으로 fail 한다.

**봉인**: busybox Dockerfile 에 `printf 'A:*\n' > /etc/httpd.conf` 로 permissive access rule 을 emit 한 뒤 `httpd ... -c /etc/httpd.conf` 로 명시적 config 적용 — auth prompt 비활성화.

### 5.2 docker inspect race (hostPort=0)

`docker run -d -p 8080 busybox` 가 즉시 return 해도 container 의 `NetworkSettings.Ports` 가 docker daemon 의 port binding 종료 시점까지 populate 되지 않을 수 있다. inspect 가 너무 빨리 호출되면 empty 응답 → `hostPort = 0` → RuntimeURL `http://127.0.0.1:0/` → healthcheck 즉시 timeout.

**봉인** (`apps/runner/internal/docker/client.go`): inspect 호출을 최대 5 회 × 200ms 간격으로 retry. 빈 응답 시 다음 시도까지 200ms 대기. port 가 확인된 즉시 break. 회귀 가드 `TestRunContainerCliModeInspectRetriesUntilPortAppears` / `TestRunContainerCliModeInspectAllAttemptsEmptyLeavesHostPortZero` 신규 추가.

### 5.3 compose bridge network 의 host namespace 격리

기본 compose bridge network 에선 runner container 의 `127.0.0.1` 이 자기 자신을 가리킨다. 따라서 spawn 한 busybox container 의 published host port (e.g. 32785) 가 runner 의 `probePort("127.0.0.1", 32785)` 로는 unreachable.

**봉인** (`compose.dev.e2e-production.yaml`): `network_mode: host` 추가 — runner 가 host 의 network namespace 를 공유해 child container 의 host port 가 runner 의 localhost 에 그대로 노출. dogfood `bab5995f-…-95d53684263d` 의 `http://127.0.0.1:32770/health` 가 host network 에서 동작한 결과와 정합.

## 6. e2e 의 한계 / 후속 옵션

### 6.1 검증하지 않는 것

- **docker push 단계**: `RUNNER_DEPLOY_MODE=skeleton` 으로 외부 registry push 는 emit 만 — 실제 push 동시성 / 인증 / rate limit 은 별도 e2e (TASK-072 / TASK-073 후속 권장).
- **host port 충돌 정책**: 본 e2e 는 단일 build 만 수행. 동시 build 5건 의 host port 자동 할당 충돌은 TASK-081-B / TASK-082 가 검증 (compose override 가 multi-runner 분산의 evidence). port collision retry 는 후속 TASK 의 후보.
- **다른 base image (alpine / distroless / scratch + 정적 binary)**: busybox 외 image 는 별도 e2e script 후보. 본 TASK 는 busybox/scratch base 의 production semantic 을 검증 — base image 자체의 검증은 별도 운영 환경 (CI) 에서.
- **TLS healthcheck**: `HealthcheckScheme=https` 는 본 e2e 가 다루지 않음. mTLS / TLS terminate container 가 필요한 경우 별도 TASK.
- **runner disk / memory 한계**: 512m mem_limit 안에서 busybox image build + httpd 실행이 가능한지 검증하지 않음. 운영 환경에서는 별도 부하 테스트 필요.

### 6.2 운영 환경 도입 시 검토

- `network_mode: host` 는 host network namespace 를 공유 — multi-tenant 환경에서는 보안 위험. 운영 도입 시에는 host 의 ephemeral port range 가 충분한지, 다른 process 와 충돌하지 않는지 사전 검토.
- `RUNNER_STOP_CONTAINER_ON_DONE=true` 는 preview lifecycle 동안 container 가 떠있어야 하는 use case (preview URL 을 user 가 직접 조회)와 trade-off. 본 e2e 의 검증 단계를 위해 켜 두지만, 운영에서는 `false` 가 default — preview TTL (TASK-037 후속) 기반 cleanup 으로 갈음.
- `RUNNER_DOCKER_PUSH_TIMEOUT_SECONDS=30` 은 skeleton mode 에선 무시되지만 cli mode 운영 전환 시 적절한 값으로 재조정 필요.

## 7. 빠른 재현 메모

### 7.1 최소 명령

```sh
export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"
export ADMIN_IDS=admin
bash apps/build-server/scripts/e2e-production-semantic.sh
```

### 7.2 실패 시 디버깅 단서

`KEEP_PROJECT=1` 환경 변수로 trap 의 compose down 을 보류한 뒤 (디버깅 전용 — 운영 영향 없음), runner 의 직접 inspect:

```sh
export KEEP_PROJECT=1
bash apps/build-server/scripts/e2e-production-semantic.sh
# 별도 shell
docker exec -i dibs-runner sh -c 'docker ps -a | grep container-'  # spawned container 확인
docker logs dibs-runner 2>&1 | tail -50  # runner log tail
curl -fsS "http://127.0.0.1:3000/builds/<BUILD_ID>"  # build status
```

### 7.3 운영 검증 재현 (실제 운영 환경)

self-dogfood 의 `bab5995f-…-95d53684263d` (2026-07-06)와 본 e2e 가 같은 flow 를 거친다 — 동일 source archive structure, 동일 10 phase, 동일 preview URL format. 운영 환경에서 동일 결과를 기대할 수 있다.

## 8. 회귀 baseline (TASK-085 봉인 시점)

| 항목 | 결과 |
|---|---|
| TS 4 packages `tsc --noEmit` | clean |
| build-server `node:test` | **131/131 동일** (TASK-082 baseline 유지, 본 PR 의 backend 변경 0) |
| build-monitor vitest | **121/121 동일** (TASK-083 baseline 유지, frontend 변경 0) |
| Go 7 packages | **모두 PASS** (신규 docker test 2건 + 기존 모두) — `TestRunContainerCliModeInspectRetriesUntilPortAppears` / `TestRunContainerCliModeInspectAllAttemptsEmptyLeavesHostPortZero` |
| svelte-check | 0 errors / 0 warnings |
| `e2e-production-semantic.sh` | **ALL PASS** (cold start 30s + busybox pull warmup 10s + build lifecycle ~30s + cleanup, 총 ~2분) |

## 9. 다음 세션 권장

- TASK-086: TASK-081-B 의 `e2e-multi-runner.sh` 의 `BASE` + heredoc fix (TASK-085 와 분리 권장 — 본 TASK 는 cli mode 검증에 집중).
- TASK-073: `RUNNER_REGISTRY_CONFIG_DIR` env 도입으로 private Docker Hub / ECR / GCR 인증 후 `cli` deploy mode 의 production semantic e2e (TASK-085 와 정합, skeleton → cli 전환 + push 동시성).
- (후속) host port collision retry 정책 — `TestRunContainerCliModeInspectAllAttemptsEmptyLeavesHostPortZero` 가 hostPort=0 을 가시화한 후속 fix.
