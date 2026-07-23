# 컨테이너 테스트 엔드포인트 재설계 (TASK-161 / P2-M2)

- 문서 목적: preview-era 의 test-deployment 엔드포인트 4종을 canonical 컨테이너 테스트 2종으로 재설계한 내역과 근거, 소비자 영향, 검증 결과를 남긴다.
- 범위: HTTP 계약 · 저장소/서비스 메서드 · DB 컬럼(migration 0008) · Go runner hostclient · 프런트엔드 필드
- 대상 독자: 개발자, AI agent, 운영자
- 상태: stable
- 최종 수정일: 2026-07-23
- 관련 문서: [Phase 2 컨셉](../PHASE-2-CONCEPT.md), [Step 15 로드맵](../sdlc/15-refactoring-roadmap-and-milestones.md)

## 1. 무엇을 바꿨나

### 1.1 HTTP 엔드포인트

| 이전 | 이후 | 비고 |
|---|---|---|
| `POST /builds/:id/preview` | `POST /builds/:id/container-test/start` | 요청에서 `ttlMinutes` 제거 |
| `POST /builds/:id/test-deployment/ready` | `POST /builds/:id/container-test/result` | `status` 필드로 통합 |
| `POST /builds/:id/test-deployment/status` | 위와 동일 (흡수) | 별도 엔드포인트 **제거** |
| `GET /builds/:id/test-deployment` | — | **제거** |

두 제거는 **런타임 소비자가 0** 임을 먼저 확인하고 진행했다 — 서버 자신의 route/OpenAPI 정의와 테스트 외에는 참조가 없었고, `GET` 쪽은 canonical `test` 블록(`GET /builds/:id` 응답)과 정보가 완전히 중복이었다. Runner 가 실제로 호출하던 것은 `preview` 와 `test-deployment/ready` 두 개뿐이다.

응답도 통일했다. 이전에는 `POST /preview` 만 `{ testDeployment: {...} }` 라는 자기만의 모양을 돌려줬으나, 이제 두 엔드포인트 모두 **canonical `BuildStatusResponse`** 를 돌려준다(202 / 200).

### 1.2 상태 모델 — 이중 매핑 제거

핵심 변화는 경로 이름이 아니라 **상태값**이다.

```
이전:  runner → "READY"/"PROVISIONING"/"FAILED"/"EXPIRED"  (previewStatuses)
         → 서버가 executionToPreviewStatus 로 ExecutionStatus 에 역매핑
         → build_test 에 저장

이후:  runner → "IN_PROGRESS"/"SUCCESS"/"FAILED"  (ExecutionStatus)
         → build_test 에 그대로 저장
```

preview enum 은 컨테이너 테스트에 어차피 쓰이지 않는 상태(`EXPIRED`)를 포함했고, 저장 직전 매번 `ExecutionStatus` 로 되돌려지고 있었다. 즉 **두 어휘를 오가는 왕복 변환만 있었고 표현력 이득은 없었다.** 어댑터 `executionToPreviewStatus` / `mapPreviewStatusToExecutionStatus` 를 양 저장소에서 제거했다.

### 1.3 이름·필드 정렬

| 계층 | 이전 | 이후 |
|---|---|---|
| 계약 | `testDeploymentQueueRequest/Response`, `testDeploymentReady/StatusRequest`, `testDeploymentSchema` | `containerTestStartRequest`, `containerTestResultRequest` |
| 계약 | `BuildSummary.previewUrl` | `BuildSummary.runtimeUrl` |
| DB | `build_request.preview_url` | `build_request.runtime_url` (**migration 0008**) |
| 저장소 | `queueTestDeployment` / `reportPreviewStatus` / `getTestDeployment` | `startContainerTest` / `reportContainerTestResult` / (제거) |
| 서비스 | `QueuePreviewOutcome` / `ReportPreviewOutcome` / `GetTestDeploymentOutcome` | `StartContainerTestOutcome` / `ReportContainerTestOutcome` / (제거) |
| Go runner | `QueueTestDeployment` / `ReportPreviewReady` | `StartContainerTest` / `ReportContainerTestResult` |
| OpenAPI tag | `Test Deployment` | `Container Test` |

`packages/db/src/schema/test-deployment.ts` 는 참조 0 이라 P2-M1 에서 이미 삭제됐다.

### 1.4 사문(dead) 설정 제거

P2-M1 이 계약에서 `previewTtlMinutes` 를 걷어낸 뒤에도 아래가 남아 있었다. 소비자를 추적하니 **어디에서도 읽히지 않았다** — 테스트 픽스처 한 곳뿐이고, `PREVIEW_TTL_MINUTES` 는 compose 나 CI 어디에서도 설정된 적이 없다.

- `packages/shared-config`: `DEFAULT_PREVIEW_TTL_MINUTES` 상수 · env 스키마의 `PREVIEW_TTL_MINUTES` · `RuntimeSettings.previewTtlMinutes`
- e2e/smoke/CI 페이로드 7곳의 `"previewTtlMinutes": 30|60` — 계약이 이미 제거해 **서버가 조용히 무시**하던 죽은 필드

TTL 개념 자체가 사라졌으므로(테스트 컨테이너 수명은 runner 가 결과 보고 시점에 정리) 함께 제거했다.

## 2. 왜 지금인가

P2-M1(계약 청산)에서 **분리 불가로 판정해 넘긴 잔여분**이 정확히 이 묶음이었다: 필드명 `previewUrl`, enum `previewStatuses`, DTO `TestDeployment` 일가, 어댑터, 저장소 메서드명. 이들은 전부 엔드포인트 모양에 물려 있어 엔드포인트를 손대지 않고는 뗄 수 없었다.

또한 P2-M3(runner 정렬)이 이 계약 위에 얹히므로, 먼저 정리하지 않으면 runner 를 두 번 고치게 된다 — Phase 2 의 "정합 먼저" 원칙(로드맵 §3) 그대로다.

## 3. 파괴적 변경과 그 근거

이 변경은 **하위 호환을 두지 않는다** (deprecated alias 없음). 2026-07-23 결정 — 외부 소비자가 없으므로 유예 기간을 두지 않는다(Phase 2 컨셉 §8-3). 확인 방법은 다음과 같았다:

```bash
# runner 가 호출하는 엔드포인트 전수
grep -rn "builds/%s/" apps/runner/internal/hostclient/
# 그 외 계층의 참조
grep -rn "test-deployment\|/preview" apps/ packages/ scripts/ --include=*.ts --include=*.go --include=*.py --include=*.sh
```

`apps/skill_mcp` 은 이 엔드포인트들을 호출하지 않고 응답 payload 만 해석한다. 그 payload 정렬은 **P2-M4 소비자 정렬**의 범위다 — 본 작업에서 건드리지 않았다.

## 4. migration 0008

```sql
ALTER TABLE build_request RENAME COLUMN preview_url TO runtime_url;
```

forward-only 다. 0007(legacy preview 컬럼 drop)과 함께 preview-era 의 DB 흔적을 닫는다.

적용:

```bash
cd apps/build-server
export DATABASE_URL="postgres://postgres@127.0.0.1:5432/docker_image_builder"
MIGRATIONS_DIR=migrations node --import tsx scripts/migrate.ts --list      # pending 확인
MIGRATIONS_DIR=migrations node --import tsx scripts/migrate.ts --bootstrap # 적용
```

> **주의 — `--dry-run` 의 출력은 신뢰하지 말 것.** 현재 구현은 dry-run 시 `applied: []` 를 반환하고 CLI 가 그걸 `would apply:` 라벨로 찍기 때문에 **항상 `would apply: (none)`** 이 나온다. 실제 계획은 같은 출력의 `pending:` 줄에 있다. 별도 backlog 로 등록했다.

## 5. 검증

| 대상 | 결과 |
|---|---|
| TS `tsc --noEmit` (shared-contract / shared-config / db / build-server / build-monitor) | clean |
| build-server 단위 테스트 | **178 PASS** (구 `GET /test-deployment` 테스트 제거, canonical `test` 블록 누적 테스트로 대체) |
| build-monitor vitest | **273 PASS** |
| Go `go test ./...` | **8/8 package PASS** |
| OpenAPI 재생성 | paths 14종, components 40 — `container-test/{start,result}` 노출 확인 |
| migration 0008 | 적용 후 `build_request.runtime_url` 존재 확인 |
| e2e 13종 | §6 참조 |

`tests/memory-preview.test.ts` → `tests/memory-container-test.test.ts` 로 개명했다.

### 5.1 openapi.d.ts 재생성이 필수인 이유

계약을 바꾸면 `apps/build-monitor/.generated/openapi.d.ts` 가 즉시 낡는다. 이 파일은 **실행 중인 서버의 `/openapi.json` 에서** 생성되므로 순서가 있다:

```bash
# 1. 계약과 서버를 먼저 빌드 — dist 가 낡으면 서버가 부팅조차 안 된다
(cd packages/shared-contract && ../../node_modules/.bin/tsc -p tsconfig.json)
(cd packages/shared-config  && ../../node_modules/.bin/tsc -p tsconfig.json)
(cd packages/db             && ../../node_modules/.bin/tsc -p tsconfig.json)
(cd apps/build-server       && ../../node_modules/.bin/tsc -p tsconfig.json)
# 2. 서버 기동 → 3. 생성
BUILD_REPOSITORY_BACKEND=memory node apps/build-server/dist/apps/build-server/src/index.js &
(cd apps/build-monitor && pnpm generate:openapi)
```

1번을 건너뛰면 `SyntaxError: ... does not provide an export named 'containerTestResultRequestSchema'` 로 서버가 죽는다 — dist 의 shared-contract 가 낡아서다. P2-M1 에서도 같은 함정을 두 번 밟았다.

## 6. e2e

e2e 스크립트 2종이 응답의 `build.previewUrl` 을 읽고 있었다 — 필드가 사라지면 **빈 문자열을 받고 경고만 찍은 뒤 PASS** 했을 것이다(가짜 통과). `runtimeUrl` 로 함께 정렬했다:

- `apps/build-server/scripts/e2e-production-semantic.sh`
- `apps/build-server/scripts/e2e-production-semantic-postgres.sh`

`apps/runner/scripts/e2e-container-run.sh` 는 TASK-157 에서 이미 canonical `test` 블록 기준으로 바뀌어 있어 주석만 정리했다.

```bash
export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"; export ADMIN_IDS=admin
bash scripts/run-e2e-suite.sh
```

## 7. 한 줄 요약

엔드포인트 4종 → 2종, preview 상태 어휘 → canonical `ExecutionStatus` 단일 어휘, `preview_url` → `runtime_url`. **왕복 변환 어댑터와 중복 조회 경로가 사라졌고**, runner 가 P2-M3 에서 한 번만 고쳐지도록 계약을 먼저 닫았다.
