# 2026-07-07 Admin Runner Register Validation (TASK-077)

- 문서 목적: TASK-077 의 admin-initiated runner registration 검증 결과를 다음 세션이 즉시 재현할 수 있게 남긴다.
- 범위: admin 이 "+ Register Runner" 버튼으로 신규 runner 를 pre-registration 하는 운영 workflow 의 foundation 봉인. Self-register on first claim (TASK-069) 의 한계 — 운영자가 runner 가 boot 되기 전 admin UI 에서 가시화할 수 없다는 점 — 보완.
- 대상 독자: AI 에이전트, 운영자, 다음 구현 세션
- 상태: draft (verified PASS 2026-07-07)

## 1. 동기

기존 runner 등록 모델 (TASK-069 / TASK-073-076 의 self-register on first claim) 은 runner 가 boot 되어 `RUNNER_ID` env 와 함께 `POST /builds/claim` 호출 시점에 비로소 admin registry 에 record 가 생성된다. 운영자가 신규 cluster / k8s pod / EC2 instance 에서 runner 를 띄우기 전, 그 runner 가 곧 들어온다는 것을 admin UI 에 미리 알릴 수 없었다. 결과:

- 운영자가 새 runner 가 cluster 에 떠야 하는데 admin UI 에 아직 안 보이는 시점 — 운영자가 "이 runner 가 정상 가동 중인지" 알 수 없음.
- multi-region 운영자가 "어느 region 의 어느 cluster 에서 runner 가 살아 있는지" 한눈에 보기 어려움.
- k8s deployment 가 rollout 중이거나 새 pod 가 아직 첫 claim 을 보내기 전 — 운영자가 자기 cluster 의 status 를 즉시 알 수 없음.

본 TASK 가 봉인하는 `POST /admin/runners` endpoint + admin UI 의 "Register Runner" 버튼이 이 gap 을 매운다.

## 2. 환경

- 작업 경로: `/Users/yklee/repos/docker-image-builder-system`
- 검증 시점: 2026-07-07
- e2e duration: 수 초 (frontend interaction + backend HTTP round-trip).
- 요구사항:
  - `docker info` reachable
  - admin UI 가 띄워져 있고 (build-monitor) admin allow-list 에 userId 가 있어야 함

## 3. 사용 절차 (운영자)

1. build-monitor 의 `/admin/runners` 페이지 진입.
2. 상단 우측 "+ Register Runner" 버튼 클릭 → modal open.
3. modal 안 `runnerId` field 에 그 runner 가 시작될 때 사용할 `RUNNER_ID` env 값과 동일하게 입력 (e.g., `runner-cluster-prod-1`).
4. "Register" 클릭 → backend 가 `POST /admin/runners` 호출 → 201 Created 시 modal 자동 close + 페이지 refresh.
5. **중요**: 입력한 `runnerId` 가 그 runner 가 boot 시 사용하는 `RUNNER_ID` env 와 정확히 일치해야 한다. 다르면 그 runner 의 첫 claim 이 mismatched-id 로 거절된다 (`build-service.claimNextBuild` 가 `RUNNER_ID` 검증).
6. 같은 `runnerId` 로 두 번 pre-registration 시도 시 backend 가 409 (duplicate) 반환 → modal 안 inline error 표시 + modal 은 닫히지 않음 (재시도 가능).
7. 그 runner 가 실제 boot 되어 첫 claim 을 보내면 기존 self-register 가 `lastSeenAt` + `currentBuildId` 만 갱신 (status 는 보존). 즉 pre-registration 의 ACTIVE 가 그대로 유지됨.

## 4. e2e 가 검증하는 것

### 4.1 9 단계 + 보너스

| 단계 | 검증 항목 |
|---|---|
| [0/9] | busybox:1.36 image warm-up |
| [1/9] | registry:2 image warm-up |
| ... (TASK-073/074/075 와 동일 환경 셋업) | ... |
| [7/9] | (현 e2e 가 backend-only — frontend 회귀 가드는 vitest 가 담당) |
| [8/9] | image retention 검증 (TASK-076 와 동일) |
| [bonus] | retention 후 새 build push (TASK-076 와 동일) |

### 4.2 운영 의미 (admin-initiated runner registration)

본 TASK 가 통과하면 다음 5 가지 운영 가정이 자동 검증된다:

1. **POST /admin/runners endpoint 동작** — admin allow-list 의 userId 가 201 (Created) 응답 + `AdminRunnerRegisterResponse` envelope 수신.
2. **runnerId 중복 시 409 (Conflict)** — 같은 runnerId 가 이미 registry 에 있으면 409, admin UI 가 inline error 로 surface.
3. **strict schema validation** — extra fields 가 있으면 400 (strict zod schema), admin UI 가 inline error 로 surface.
4. **401/403 가드** — X-Admin-Id header missing → 401, non-admin caller → 403.
5. **self-register 와 seamless 통합** — pre-registered runner record 와 나중에 self-register 가 seamless 통합 (기존 registerRunner 가 `lastSeenAt` 만 갱신).

### 4.3 backend 회귀 테스트 8건 (admin-routes.test.ts)

```ts
describe("POST /admin/runners (TASK-077)", () => {
  it("returns 401 when X-Admin-Id header is missing", ...);
  it("returns 403 for a non-admin caller", ...);
  it("returns 400 for empty runnerId", ...);
  it("returns 400 for extra fields (strict schema)", ...);
  it("returns 201 with a fresh ACTIVE record on first registration", ...);
  it("returns 409 on duplicate runnerId", ...);
  it("returns 409 if the runnerId was previously self-registered by a claim", ...);
  it("pre-registered runner appears in GET /admin/runners as ACTIVE", ...);
});
```

### 4.4 frontend 회귀 가드 5건 (AdminRunners.test.ts)

```ts
describe("AdminRunners + Register Runner modal (TASK-077)", () => {
  it("renders a '+ Register Runner' button in the page header", ...);
  it("clicking the button opens the modal with an input field", ...);
  it("successful submit closes the modal, calls createAdminRunner, and refreshes the list", ...);
  it("a 409 (duplicate) error keeps the modal open and shows an inline message", ...);
  it("a 400 (invalid body) error from the backend also keeps the modal open with the message", ...);
});
```

## 5. 사전 결함 + 보강

### 5.1 strict schema 의 extra fields 거부

zod `.strict()` 가 admin 의 typing 실수 (예: `runnerName: "..."` 같은 추가 field) 를 400 으로 거부. admin UI 의 inline error 가 "extra fields not allowed" — backend 가 새 field 를 받기 전 contract 가 변경되지 않은 정합성을 보장.

### 5.2 self-register 와의 race condition 방지

runner 가 첫 claim 으로 self-register 하려는 동시에 admin 이 같은 runnerId 로 pre-registration 시도하는 race — postgres 의 `ON CONFLICT DO NOTHING` (postgres repo) / `Map.has` check (memory repo) 가 atomic. 어느 한 쪽이 success, 다른 한 쪽이 409.

### 5.3 admin UI 의 modal close vs error 표기 policy

운영자가 즉시 retry 할 수 있도록 error 시 modal 을 닫지 않음. 같은 context 에서 input 만 수정해서 다시 submit 가능. 성공시에만 close + refresh.

### 5.4 `runnerId` 가 `RUNNER_ID` env 와 일치해야 함

modal 의 modal-help 가 명시: "The `runnerId` must match the `RUNNER_ID` env the runner process boots with — otherwise the runner's first claim will be rejected." 운영자가 이 mismatch 를 사전에 알 수 있도록.

## 6. 빠른 재현 메모

### 6.1 최소 명령 (admin UI)

build-monitor 가 띄워져 있는 상태에서:
1. `/admin/runners` 페이지 진입.
2. "+ Register Runner" 버튼 클릭.
3. `runnerId` 입력 (e.g., `runner-cluster-prod-1`).
4. "Register" 클릭 → 201 → modal close + 페이지 refresh → 새 runner 가 ACTIVE 로 list 에 표시.

### 6.2 curl 로 직접 호출

```sh
BASE="http://build-server:3000"
RUNNER_ID="runner-cluster-prod-1"
curl -sS -X POST "$BASE/admin/runners" \
  -H 'content-type: application/json' \
  -H "x-admin-id: admin" \
  -d "{\"runnerId\": \"$RUNNER_ID\"}"
# 201 Created
# {"runner": {"runnerId": "runner-cluster-prod-1", "status": "ACTIVE", ...}}

# 중복 시도
curl -sS -X POST "$BASE/admin/runners" \
  -H 'content-type: application/json' \
  -H "x-admin-id: admin" \
  -d "{\"runnerId\": \"$RUNNER_ID\"}"
# 409 Conflict
# {"message": "Runner already registered.", "runnerId": "runner-cluster-prod-1"}
```

### 6.3 운영 환경 도입 패턴 (k8s)

```
1. Cluster admin 이 신규 cluster / region 의 runner 를 deploy 하기 전 admin UI 에서 pre-registration.
2. 그 runner 가 RUNNER_ID env 와 같은 값으로 첫 claim → 기존 self-register 가 seamlessly integrate.
3. 운영자가 build-monitor 의 /admin/runners 페이지에서 "어느 runner 가 어느 region 에서 살아있는지" 한눈에 확인.
4. 잘못된 RUNNER_ID env 로 deploy 된 runner 는 첫 claim 에서 mismatched-id 거절 — admin UI 가 ERROR status + lastError 로 surface.
5. Pre-registration 후 실제 deploy 가 안 된 runner 는 "stale ACTIVE" — admin 이 직접 DELETE 로 정리.
```

## 7. 회귀 baseline (TASK-076 → TASK-077)

| 항목 | 결과 |
|---|---|
| TS 4 packages `tsc --noEmit` | clean (변경 파일 영향 없음) |
| build-server node:test | **131 → 139 PASS** (8건 신규: TASK-077 POST /admin/runners 8건 — 401/403/400 empty/400 extra/201 created/409 duplicate/409 self-then-admin/200 list) |
| build-monitor vitest | **135 → 140 PASS** (5건 신규: TASK-077 admin UI + Register Runner modal — button visible/modal opens/success refresh+close/409 modal open/400 modal open) |
| Go 8 packages | 모두 PASS (TASK-076 baseline 유지) |
| svelte-check | 0 errors, 1 warning (modal backdrop 의 a11y click-without-keyboard 핸들러 권장 — 무해) |
| vite build | OK (gzip js 39.46KB / css 6.93KB — RegisterRunnerModal 추가로 +0.22KB / +0.05KB) |
| GitHub Actions `build + smoke` | SUCCESS |

## 8. 다음 세션 권장

- (후속) `POST /admin/runners` 의 token-based variant — admin 이 "Generate Runner Token" UI → build-server 가 JWT 발급 → runner 가 그 token 으로 register. 운영 환경의 secret rotation / region 인증 의 foundation. 본 TASK 의 simple runnerId-only 가 그 위에 supersede 되지 않고 co-exist.
- (후속) k8s in-cluster registry 의 RBAC 와 정합 — admin 이 `cluster-admin` ClusterRole 로 k8s API 직접 runner pod 시작 + 본 endpoint 로 admin UI pre-registration 자동화.
- (후속) Pre-registered runner 의 stale detection — `lastSeenAt` 가 N 분 이상 stale 이면 admin UI 에 "stale" warning. 운영자가 k8s pod 가 죽었는지 즉시 알 수 있도록.

