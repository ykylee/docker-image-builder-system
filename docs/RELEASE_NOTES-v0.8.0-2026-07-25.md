# Release Notes — v0.8.0 (2026-07-25)

- 문서 목적: `v0.8.0` (k8s adapter 운영 결함 3종 해소) 의 종합 리뷰.
- 범위: `v0.7.0` 이후 TASK-175 코드 델타 + 후속 patch v0.8.1~0.8.4 누적 운영 보강.
- 대상 독자: 운영자, release reviewer, AI agent
- 상태: stable
- 최종 수정일: 2026-07-25
- 관련 문서: [CHANGELOG](../CHANGELOG.md), [k8s adapter 운영](./operations/k8s-deploy-webhook-2026-07-24.md), [호스팅 status 캐시 운영](./operations/hosting-2026-07-24.md), [release-checklist](./operations/release-checklist-2026-07-20.md), [Release Notes v0.5.0](./RELEASE_NOTES-v0.5.0-2026-07-24.md)

## 1. 요약

`v0.8.0` 은 k8s adapter 의 **운영 결함 3종을 옵트인/내부 보강으로 해소**한 minor release 다. `v0.7.0` 직후 follow-up 으로 분류된 k8s adapter 확장의 첫 묶음 — 외부 인터페이스는 env opt-in 1종 + payload 필드 1블록만 확장했고, 기본 동작은 완전히 불변.

- 코드 델타: **TASK-175** (E1 per-build namespace / E2 Ingress cleanup / E3 k8s 실패 시 docker registry 결과 보존)
- 5 package.json: `0.7.0` → **`0.8.0`**
- git tag: **`v0.8.0`**
- 회귀 baseline: build-server **205** / build-monitor vitest **279** / runner `go test ./...` **8 pkg** / TS 5 clean / migration **0001~0012** (모두 불변)
- 후속 patch 4종 누적: v0.8.1 k8s e2e nightly / v0.8.2 §6.6 실측 절차 / v0.8.3 release-checklist k8s 보강 / v0.8.4 PROJECT_PROFILE 운영 가이드 reference — 모두 **코드 변경 0 patch** (운영 가이드/CI/workflow meta 누적 보강)

## 2. 무엇이 생겼나 — k8s adapter 운영 결함 3종

기존 `kubectlDeployer` 는 1호 production adapter 로 v0.3.0 부터 운영 중이었지만 3 종의 잠복 결함이 v0.7.0 코드 리뷰에서 드러났다. 본 release 가 이를 해소.

- **E1 per-build namespace** (옵트인). `RUNNER_K8S_NAMESPACE_PER_BUILD=true` 면 buildID 별 namespace(`dib-<buildID>`, DNS-1123 정제)로 격리 — 빌드 간 ingress DNS 충돌 회피 + audit 개선. 기본값(`false`)은 기존 공유 namespace(`RUNNER_K8S_NAMESPACE`, 기본 `dib-builds`) 호환. migration 변경 0.
- **E2 Ingress cleanup**. `kubectlDeployer.Cleanup()` 의 `delete deployment,service` 만 → `delete deployment,service,ingress` 3-kind 묶음 확장. 동명 재빌드 시 stale Ingress 가 라우팅을 잡아채는 잠복 결함 해소. `--ignore-not-found` 유지로 Ingress 없는 정상 케이스 안전.
- **E3 k8s 실패 시 docker registry 결과 보존**. k8s 분기 시작에 `IN_PROGRESS(K8S)` 보고, 실패 시 `FAILED(K8S)` 와 함께 `payload.dockerRegistry={targetRef, resultRef, survivedAt}` 동봉. `errorMessage` 에 `k8s deploy failed: <원인> (docker registry push survived: <ref>)` 표기. 종전엔 docker registry push 가 성공해도 k8s 실패 시 결과가 사라졌다.

설계 단일 출처 — 외부 인터페이스 (env opt-in 1종 + payload 필드 1블록) 만 확장, 기본 동작 불변. API/스키마/마이그레이션 변경 0. 운영 절차 단일 출처 = [k8s-deploy-webhook-2026-07-24.md §6](./operations/k8s-deploy-webhook-2026-07-24.md).

## 3. 후속 patch 6종 (v0.8.1~0.8.6) 누적 운영 보강

| version | 모드 | 핵심 |
|---|---|---|
| v0.8.1 | patch | k8s e2e nightly CI 편입 — `.github/workflows/nightly-e2e.yml` 에 `k8s-deploy-e2e` job 추가 (v0.4.1 hosting-e2e 와 동형) |
| v0.8.2 | patch | k8s 운영 가이드 §6.6 보강 — E1/E2/E3 실측 절차 (per-build namespace / Ingress cleanup / docker registry 결과 보존) |
| v0.8.3 | patch | release-checklist k8s 보강 — §1/§3/§4/§5/§7/§8 에 status cache + e2e-k8s-deploy.sh + orphan cleanup |
| v0.8.4 | patch | PROJECT_PROFILE 운영 가이드 reference — v0.7.0+/v0.8.x 신규 운영 가이드 4종 + BuildDetail.tsx stale 주석 정합 |
| v0.8.5 | patch | v0.8.0 종합 RELEASE_NOTES — `docs/RELEASE_NOTES-v0.8.0-2026-07-25.md` 신규 6 섹션 95 줄 + CHANGELOG release history v0.8.0 entry 에 종합 리뷰 링크 추가 |
| v0.8.6 | patch | v0.6.0 / v0.7.0 종합 RELEASE_NOTES — `docs/RELEASE_NOTES-v0.6.0-2026-07-24.md` + `docs/RELEASE_NOTES-v0.7.0-2026-07-24.md` 신규 각 7 섹션 ~80 줄. 5 종 release notes(v0.4.0 72줄 / v0.5.0 51줄 / v0.6.0 ~80줄 / v0.7.0 ~80줄 / v0.8.0 95줄) 형식 정합 완료 |

모두 **코드 변경 0** (workflow / 운영 문서 / workflow meta / 주석 정합). 회귀 baseline 6종 모두 동일. v0.8.7 (2026-07-25) 가 본 §3 표의 6 종 누락(원래 v0.8.5 작성 시점엔 4종만 존재) 을 정합.

## 4. 검증

| 스위트 | 결과 |
|--------|------|
| build-server `node --test` | **205 PASS** (TASK-175 +3 신규 / 회귀 baseline 불변) |
| build-monitor `vitest run` | **279** (사전 환경 의존 1 fail v0.8.3 부터 정착, 회귀 영향 0) |
| runner `go test ./...` | **8 pkg PASS** (E1/E2/E3 단위 3건 신규, go vet clean) |
| `tsc --noEmit` × 5 packages | **clean** |
| postgres migration | **0001~0012** (변경 0) |
| **k8s e2e** (`e2e-k8s-deploy.sh`) | 환경 부재로 미실측 — v0.8.1 부터 nightly CI 자동 검증 |

## 5. 업그레이드 안내

- **DB/API 계약**: 변경 0.
- **신규 env(선택)**: `RUNNER_K8S_NAMESPACE_PER_BUILD` (accepts `true`/`1`/`yes`/`on`, default `false`).
- **k8s 분기 비활성 환경**: 완전 무영향. opt-in 시에만 격리 namespace / Ingress 동시 정리 / dockerRegistry payload 보존 적용.
- **Rollback**: `git checkout v0.7.0`. env 미설정 시 본 release 의 모든 신규 동작이 skip 되므로 운영 환경 측 별도 조치 불요.
- **nightly CI**: v0.8.1 부터 `k8s-deploy-e2e` 가 `schedule(cron 04:00 UTC)` + `workflow_dispatch` 에서 자동 검증. 운영자 개입 불요.

## 6. follow-up (v0.9.0 후보)

- **Helm/ArgoCD adapter** (mode="helm"/"argocd" 분기) — 1호 adapter 의 한계를 넘는 차트/단계적 출시(Blue/Green, Canary) 운영.
- **webhook 확장** (Slack/Nextcloud 어댑터, 재시도, 서명) — v0.3.0 의 단일 webhook 위.
- **실 k8s e2e sync 캐시 실측** — TASK-174 의 `availableReplicas` 캐시가 실 k8s drift 를 잡는 시나리오. 현재 단위 + 통합으로만 커버.

후속 patch 4종 (v0.8.1~0.8.4) 의 운영 가이드/CI 누적 보강으로 신규 운영자가 본 release 노트 + [k8s-deploy-webhook §6.6](./operations/k8s-deploy-webhook-2026-07-24.md) + [release-checklist](./operations/release-checklist-2026-07-20.md) 의 3 종 단일 출처만 따라가면 본 release 의 신규 기능을 운영 환경에서 안전하게 도입할 수 있다.
