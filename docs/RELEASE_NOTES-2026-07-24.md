# Release Notes — v0.3.0 (2026-07-24)

- 문서 목적: `v0.3.0` (Phase 2 완료) 의 종합 리뷰 — 무엇이 생겼나, 무엇이 사라졌나, 운영 영향, 검증, 업그레이드 안내.
- 범위: `v0.2.1` 이후 TASK-156 ~ TASK-165 코드 델타
- 대상 독자: 운영자, release reviewer, AI agent
- 상태: stable
- 최종 수정일: 2026-07-24
- 관련 문서: [CHANGELOG](../CHANGELOG.md), [Phase 2 컨셉](./PHASE-2-CONCEPT.md), [k8s 배포/webhook 운영](./operations/k8s-deploy-webhook-2026-07-24.md), [Release Notes 2026-07-23](./RELEASE_NOTES-2026-07-23.md)

## 1. 요약

`v0.3.0` 은 **Phase 2 (preview-era 청산 → 배포 능력 완성) 를 종결**하는 minor release 다. 제품 목적의 4단계 — `build → container test → deploy → result delivery` — 가 이제 모두 1급 phase 로 존재하고 **실인프라 e2e** 로 검증된다.

- 코드 델타: TASK-156 ~ TASK-165 (P2-M1~M5 + 사전 CI/e2e 경화 + k8s 이식)
- 5 package.json: `0.2.1` → **`0.3.0`**
- git tag: **`v0.3.0`**
- 회귀 baseline: build-server **181 → 186** / build phase **11 → 13** / migration **0001~0008** / **k8s e2e 신규**

두 축이었다: **(A) preview-era 청산**(P2-M1~M4) 으로 모델을 정합시키고, **(B) 배포 능력**(P2-M5) 으로 제품 목적을 완성했다.

## 2. 새로 생긴 것

### 2.1 🟢 외부 배포 능력 — k8s (TASK-165 / P2-M5)

runner 가 컨테이너 테스트를 통과한 이미지를 k8s 클러스터에 배포한다.

- `RUNNER_K8S_MODE=k8s` 설정 시 활성. `kubectlDeployer` 가 `Namespace + Deployment + Service` manifest 를 렌더 → `kubectl apply -f -` → `kubectl rollout status` 로 배포 완료를 기다린다.
- **client-go 가 아니라 `kubectl` shell-out** — 기존 `deploy.Client` 의 docker CLI shell-out 패턴과 일관. runner 실행 환경에 `kubectl` + 유효한 kubeconfig 필요.
- `imagePullPolicy: IfNotPresent` — 로컬(kind `kind load`)/registry-push 된 이미지를 그대로 사용.
- 미설정이면 기존 docker registry 배포만(하위 호환). TASK-164 에서 이식한 skeleton(noop) 위에 실구현을 얹었다.

### 2.2 🟢 결과 전달 — webhook (TASK-165 / P2-M5)

build 가 terminal(COMPLETED/FAILED)에 도달하면 build-server 가 결과를 외부에 알린다.

- `RESULT_WEBHOOK_URL` 설정 시 canonical `BuildStatusResponse` 를 그 URL 로 POST(NOTIFICATION).
- **best-effort**(전달 실패가 빌드 흐름을 안 깨뜨림) + **idempotent**(중복 전송 방지).
- `resultDelivery` 블록은 phase history 에서 파생(`RESULT_DELIVERED`→NOTIFICATION/SUCCESS). **별도 DB 컬럼/마이그레이션 없음** — memory/postgres 동일 semantics.
- 미설정이면 기존 POLLING(소비자가 `GET /builds/:id` 조회) 유지.

### 2.3 🟢 result-delivery 1급 phase (TASK-165 Step 1)

`RESULT_DELIVERY_STARTED` / `RESULT_DELIVERED` 를 canonical phase 로 신설(11→13). 3-way(TS/Go/Python) 정합. 제품 목적 4단계가 모두 phase 로 표현된다. build-monitor PhaseTimeline 자동 반영.

## 3. 사라진 것 (preview-era 청산, P2-M1~M4)

| 무엇 | 이전 | 이후 |
|---|---|---|
| phase 이름 | `PREVIEW_QUEUED`/`PREVIEW_READY` | `CONTAINER_TEST_STARTED`/`CONTAINER_TEST_PASSED` (TASK-158) |
| legacy status | `CLAIMED`/`TEST_READY`/`previewStatuses` | canonical 흡수 (TASK-159) |
| 응답 필드 | `previewStatus`/`previewTtlMinutes`/`previewUrl` | 제거 / `runtimeUrl` (TASK-160/161) |
| 엔드포인트 | `/preview` + `/test-deployment/{ready,status}` + `GET /test-deployment` (4종) | `/container-test/{start,result}` (2종) (TASK-161) |
| DB 컬럼 | `preview_status`/`preview_ttl_minutes`/`preview_url` | drop/rename (migration 0007/0008) |
| 실패 이유 | 채널 없음 (모든 실패 `lastError=null`) | `errorCode`/`errorMessage` 채널 신설 + 실기록 (TASK-162) |
| skill 이름 | `preview_readiness_checker` | `container_test_readiness_checker` (TASK-163) |

이 청산 과정에서 **단위 테스트가 green 인 채 잠복하던 결함들**을 실측으로 잡았다: skill_mcp 실서버 검증(TASK-163)이 canonical 형제 블록 소실 등 3건을, runner 실패 경로 실측(TASK-162)이 `lastError` 미기록 등 3건을 즉시 검출했다.

## 4. 검증

| 스위트 | 결과 |
|--------|------|
| build-monitor `vitest run` | **275 PASS** |
| build-server `node --test` | **186 PASS** (181 → 186) |
| runner `go test ./...` | **8 pkg PASS** |
| skill_mcp `pytest -s` | **225 PASS** |
| `tsc --noEmit` × 5 packages | **clean** |
| build phase (canonical) | **13** (result-delivery 2종 신설) |
| postgres migration | **0001~0008** |
| 계약 e2e | **13종** |
| **k8s e2e (신규)** | **ALL PASS** — 실 kind 배포 `availableReplicas=1` + 실 webhook 수신 (kind v0.24.0 + kubectl v1.31.4) |

**Phase 2 완료 판정**([PHASE-2-CONCEPT §9](./PHASE-2-CONCEPT.md)) 4항 전부 충족: preview-era 심볼 0 / 4단계 1급 phase + e2e / 배포·전달 각 1종 + 운영문서 / 회귀 후퇴 없음.

## 5. 업그레이드 안내 (⚠️ breaking)

Phase 1 대비 **API 계약이 breaking** 하다 — preview-era 표면을 외부 소비자 0 결정 하에 하위 호환 없이 정리했다.

- **DB migration**: `0007`(legacy preview 컬럼 drop) + `0008`(preview_url → runtime_url rename) **적용 필요**. `bash apps/build-server/scripts/db-migrate.sh --apply-all`.
- **엔드포인트 변경**: preview/test-deployment 계열 삭제 → `/builds/:id/container-test/{start,result}`. runner·skill_mcp·build-monitor 는 동시 정렬돼 있으므로 저장소 내부는 정합. **외부에서 옛 엔드포인트를 호출하던 소비자가 있다면 재정렬 필요**.
- **응답 필드 변경**: `previewUrl`→`runtimeUrl`, `previewStatus`/`previewTtlMinutes` 제거. phase enum 값 변경(`PREVIEW_*`→`CONTAINER_TEST_*`, `RESULT_DELIVERY_*` 추가).
- **신규 env (전부 선택, 미설정 시 기존 동작)**:
  - 배포: `RUNNER_K8S_MODE`(=k8s 로 활성) / `RUNNER_K8S_CLUSTER` / `RUNNER_K8S_NAMESPACE` / `RUNNER_K8S_MANIFEST` / `RUNNER_KUBECTL_BIN` / `RUNNER_K8S_CONTAINER_PORT` / `RUNNER_K8S_ROLLOUT_TIMEOUT_SECONDS`.
  - 결과 전달: `RESULT_WEBHOOK_URL`.
- **Rollback**: `git checkout v0.2.1` (단, preview-era 계약으로 되돌아가고 배포/전달 능력이 사라진다. migration 0007/0008 은 데이터 컬럼 변경이므로 롤백 시 스키마 정합 주의).

## 6. 운영자 검증 순서

1. `git fetch && git checkout v0.3.0` + 5 package version `0.3.0` 확인.
2. `pnpm install` → 5 pkg TS clean → build-server dist 빌드 → migration `0001~0008` 적용.
3. `GET /health` → `{"status":"ok"}` / `POST /builds` 202 왕복 / phase 진행이 `CONTAINER_TEST_*` → `DEPLOYMENT_*` 로 나오는지.
4. (선택) k8s: `RUNNER_K8S_MODE=k8s` + kubeconfig 로 runner 기동 → 배포가 `deploy` 블록/status query 에 반영되는지. e2e: `bash apps/runner/scripts/e2e-k8s-deploy.sh`(kind 필요).
5. (선택) webhook: `RESULT_WEBHOOK_URL` 설정 후 build 완료 시 수신 + `resultDelivery.mode=NOTIFICATION` 확인.

## 7. follow-up

- **kind e2e 의 nightly CI 편입** (현재 수동, kind 미가용 CI) — 다음 patch 후보.
- k8s adapter 확장(Helm/ArgoCD, per-build namespace 정리, 실 URL 회수) / webhook 확장(Slack·Nextcloud, 재시도·서명).
- 실패 경로 e2e(현 계약 e2e 13종 전부 happy path — P2-M3 이월). ([CHANGELOG §7·§8](../CHANGELOG.md))
