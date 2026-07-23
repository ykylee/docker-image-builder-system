# 빌드 실패 보고 경로 (TASK-162 / P2-M3)

- 문서 목적: runner 가 실패를 호스트에 **이유와 함께** 보고하도록 만든 변경의 내역과 근거, 그 전까지 무엇이 유실되고 있었는지를 남긴다.
- 범위: 실패 계약(errorCode 채널) · 저장소 기록 · runner 실행 구조 · preview-era 이름 정리
- 대상 독자: 개발자, AI agent, 운영자
- 상태: stable
- 최종 수정일: 2026-07-23
- 관련 문서: [Phase 2 컨셉](../PHASE-2-CONCEPT.md), [컨테이너 테스트 엔드포인트 재설계](container-test-endpoints-2026-07-23.md)

## 1. 그 전까지 무엇이 유실되고 있었나

P2-M3 착수 전 실측에서 실패 경로에 **구조적 결함 3건**이 나왔다. 셋 다 "테스트는 전부 green 인데 운영자가 볼 정보가 없다" 는 같은 결의 문제다.

### 1.1 `lastError` 가 한 번도 기록되지 않았다

`build_request` 에는 `last_error_code` / `last_error_message` 컬럼이 있고, 응답 계약에도 `lastError` 가 있고, `skill_mcp` 의 `failure-summary-shaper` / `build-status-explainer` 는 그 값을 읽어 사람이 읽을 문장을 만든다. 그런데 **두 컬럼에 값을 쓰는 코드가 어디에도 없었다.**

```bash
# 착수 전 실측
grep -rn "lastErrorCode" apps/build-server/src/
# → 읽기 2곳 + `null` 로 초기화 1곳. 쓰기 0곳.
```

memory backend 도 마찬가지로 `lastError: null` 만 있었다. 즉 **모든 실패 빌드가 이유 없이 FAILED 로만 보였다.**

근본 원인은 계약이었다. `PhaseUpdateRequest` 에 `{ phase, runnerId, occurredAt }` 뿐이라 runner 가 실패 이유를 실어 보낼 **채널 자체가 없었다.**

### 1.2 컨테이너 테스트 실패가 `test` 블록을 닫지 않았다

runner 는 컨테이너 기동 실패 / healthcheck 미통과 시 `reportPhase(FAILED)` 만 보내고 `POST /container-test/result` 는 호출하지 않았다. 결과적으로:

```
build.status = FAILED        ← phase 보고로 갱신됨
test.status  = IN_PROGRESS   ← 시작만 하고 영영 닫히지 않음
```

두 값이 **서로 모순**인 상태로 남았다. P2-M2 가 만든 `container-test/result` 의 FAILED 경로는 runner 쪽에서 한 번도 호출되지 않는 dead path 였다.

### 1.3 postgres 가 계약에 없는 에러 코드를 하드코딩했다

```ts
errorCode: status === "FAILED" ? "TEST_DEPLOYMENT_FAILED" : null,
errorMessage: status === "FAILED" ? "Container test failed." : null,
```

`TEST_DEPLOYMENT_FAILED` 는 canonical 9개 `errorCodes` 에 **없는 문자열**이다. 게다가 memory backend 는 이 필드를 아예 기록하지 않아 **backend 별로 동작이 갈렸다** — Phase 2 의 "memory/postgres 는 항상 같은 semantics" 원칙 위반.

### 1.4 emit 되지 않는 에러 코드들

`DOCKER_BUILD_FAILED` 와 `PREVIEW_PROVISION_FAILED` 는 3-way canonical enum(TS/Go/Python)에 선언돼 있었지만 **emit 하는 곳이 하나도 없었다.** 계약에만 존재하는 값이었다.

## 2. 무엇을 바꿨나

### 2.1 계약 — 실패 이유 채널 신설

| 스키마 | 추가 |
|---|---|
| `phaseUpdateRequestSchema` | `errorCode?` (canonical enum) · `errorMessage?` |
| `containerTestResultRequestSchema` | `errorCode?` · `errorMessage?` |

둘 다 optional 이다 — FAILED 가 아닌 보고에는 의미가 없다.

### 2.2 계약 — preview-era 에러 코드 개명

`PREVIEW_PROVISION_FAILED` → **`CONTAINER_TEST_FAILED`** (TS `errors.ts` · Go `contract/errors.go` · Python `canonical.py` 3-way 동시). 이 코드가 가리키는 것은 컨테이너 테스트 단계의 실패(기동 실패 / healthcheck 미통과 / port 미개방)다.

> **함정**: TS 배열 **안** 주석에 옛 이름을 적었더니 `contract-drift-checker` 가 그 토큰을 열거값으로 복원해 "TS 에만 있는 여분 값" 으로 잡았다. 배열 본문은 토큰 단위로 훑기 때문에 주석의 UPPER_SNAKE 도 값으로 보인다. 설명은 배열 밖에 쓴다 — `errors.ts` 상단에 그 주의를 박아뒀다.

### 2.3 서버 — 실패 이유를 실제로 기록

- `updatePhase(buildId, phase, failure?)` — FAILED 면 `last_error_code`/`last_error_message` 를 쓴다. 이유가 없으면 canonical `UNKNOWN_ERROR` 로 폴백한다. **FAILED 가 아닌 phase 로 전이하면 이전 오류를 지운다**(재시도 시 낡은 오류가 남지 않게).
- `reportContainerTestResult` — 하드코딩 `TEST_DEPLOYMENT_FAILED` 제거. runner 가 준 코드를 쓰고, 없으면 `CONTAINER_TEST_FAILED`. build-level `lastError` 도 함께 갱신한다.
- **memory / postgres 양쪽 동일 semantics.**

### 2.4 Runner — 실행 순서를 코드 구조로

`ProcessClaim` 이 200줄 단일 함수였고 여섯 단계가 섞여 있었다. canonical 순서를 그대로 함수로 쪼갰다:

```go
sourceDir, failure := s.prepareSource(ctx, buildID)      // claim → source prepare
if failure := s.buildImage(ctx, buildID, sourceDir);     // → docker build
containerStatus, failure := s.runContainerTest(ctx, ...) // → container test
if failure := s.deployImage(ctx, buildID, ...)           // → deploy
s.reportPhase(ctx, buildID, contract.PhaseCompleted)     // → finalize
```

각 단계는 실패 시 canonical errorCode 를 실은 `*stageFailure` 를 돌려주고, 단일 `fail()` 이 그것을 보고한다:

| 단계 | errorCode |
|---|---|
| source prepare | `UNKNOWN_ERROR` |
| docker build | **`DOCKER_BUILD_FAILED`** (최초 emit) |
| container test | **`CONTAINER_TEST_FAILED`** (최초 emit) + `test` 블록도 FAILED 로 닫음 |
| deploy | `DEPLOYMENT_FAILED` |

`fail()` 은 컨테이너 정리(stop)까지 책임진다. 보고 자체가 실패해도 **원래 실패 원인을 덮지 않는다** — 원인 유실이 훨씬 나쁘기 때문에 보고 오류는 로그로만 남긴다.

### 2.5 preview-era 이름 정리

| 이전 | 이후 |
|---|---|
| env `PREVIEW_INTERNAL_PORT` | `RUNNER_INTERNAL_PORT` (나머지 runner env 는 전부 `RUNNER_` 접두사인데 이것만 예외였다) |
| skeleton mode host `preview.local` | `container-test.local` |
| `hostclient.ReportPhase(ctx, buildID, phase, runnerID)` | `ReportPhase(ctx, buildID, PhaseReport{...})` |

compose 파일 2종(`compose.dev.e2e-production.yaml` / `compose.dev.e2e-insecure-registry.yaml`)과 `docs/PROJECT_PROFILE.md` 의 env 이름도 함께 바꿨다.

## 3. 놓치기 쉬운 지점 — 실패 payload 의 `omitempty`

컨테이너 테스트 **실패** 보고에는 런타임 정보가 없다. 그런데 계약이 `runtimeUrl` 에 `.url()`, `host` 에 `.min(1)` 을 걸어두어 **빈 문자열을 보내면 400** 이 된다. Go 구조체에서 두 필드는 반드시 `omitempty` 여야 한다:

```go
RuntimeURL string `json:"runtimeUrl,omitempty"`
Host       string `json:"host,omitempty"`
```

`hostPort`(0 허용) 와 boolean 들은 그대로 보내도 된다. 회귀 테스트가 실패 보고에 런타임 정보가 실리지 않는지 직접 단언한다.

## 4. 검증

| 대상 | 결과 |
|---|---|
| TS `tsc --noEmit` 5 packages | clean |
| build-server | **182 PASS** (178 → 실패 기록 회귀 가드 4건 추가) |
| build-monitor vitest | **273 PASS** |
| Go `go test ./...` | **8/8 package PASS** (실패 경로 회귀 가드 2건 추가) |
| skill_mcp pytest | **222 PASS** (+19 subtests) — contract-drift-checker 포함 |
| OpenAPI 재생성 | paths 14 · components 40, `BuildError.code` 에 `CONTAINER_TEST_FAILED` 노출 |
| postgres 실DB | `POST /phase {FAILED, errorCode}` → `last_error_code` 컬럼에 실제 기록됨 |
| e2e 13종 | ALL PASS |

### 4.1 음성 검증 (단언이 실제로 무는지)

새 회귀 가드는 **개선 전 동작으로 되돌리면 실패해야** 의미가 있다. 둘 다 확인했다:

- runner: `fail()` 의 컨테이너 테스트 보고와 errorCode 전달을 제거 → `expected 1 container test result report, got 0` / `expected errorCode DOCKER_BUILD_FAILED, got ""` 로 **FAIL**.
- build-server: `updatePhase` 의 `lastError` 기록을 제거 → 13 중 **2 FAIL**.

복원 후 전부 PASS.

### 4.2 postgres 실DB 확인

```bash
curl -s -X POST "http://127.0.0.1:3000/builds/$BID/phase" -H 'Content-Type: application/json' \
  -d '{"phase":"FAILED","runnerId":"r-1","errorCode":"DOCKER_BUILD_FAILED","errorMessage":"docker build exited 1"}'
# → lastError: {'code': 'DOCKER_BUILD_FAILED', 'message': 'docker build exited 1'}

psql "$DATABASE_URL" -tAc "SELECT last_error_code, last_error_message FROM build_request WHERE id='$BID'"
# → DOCKER_BUILD_FAILED|docker build exited 1
```

## 5. 남은 것

- **실패 경로 e2e 가 아직 없다.** 현재 13종은 전부 happy path 다. 실패한 빌드가 `lastError` 와 `test.status=FAILED` 를 노출하는지를 실제 컨테이너로 검증하는 e2e 는 P2-M5(신규 e2e 1종)와 함께 검토한다. 지금은 단위 회귀 가드 + 실DB 확인으로 덮는다.
- **`skill_mcp` 의 실패 문구 재설계**는 P2-M4 범위다. 이번에는 canonical enum 개명에 따른 키 정렬만 했고 문구는 그대로다.
- `migrate.ts --dry-run` 의 보고 결함(별도 backlog).

## 6. 한 줄 요약

실패에 **이유를 실을 채널이 없었다.** 계약에 `errorCode`/`errorMessage` 를 열고, 서버가 그것을 실제로 기록하게 하고, runner 의 각 단계가 canonical 코드를 실어 보고하도록 구조를 바꿨다. 컨테이너 테스트 실패는 이제 `test` 블록까지 닫아 build 와 test 상태가 어긋나지 않는다.
