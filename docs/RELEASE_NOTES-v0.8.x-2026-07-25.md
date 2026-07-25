# Release Notes — v0.8.x 8연속 운영 보강 patch (2026-07-25)

- 문서 목적: `v0.8.0` 이후 8연속 운영 보강 patch(v0.8.1~v0.8.8) 의 종합 리뷰.
- 범위: `v0.8.0` 이후 TASK-175 + v0.8.1~v0.8.8 8종 운영 patch 누적.
- 대상 독자: 운영자, release reviewer, AI agent
- 상태: stable
- 최종 수정일: 2026-07-25
- 관련 문서: [CHANGELOG](../CHANGELOG.md), [Release Notes v0.8.0](./RELEASE_NOTES-v0.8.0-2026-07-25.md), [k8s adapter 운영](./operations/k8s-deploy-webhook-2026-07-24.md), [호스팅 운영](./operations/hosting-2026-07-24.md), [release-checklist](./operations/release-checklist-2026-07-20.md)

## 1. 요약

`v0.8.0`(2026-07-25, k8s adapter 운영 결함 3종 해소 / TASK-175) 직후, 8연속 운영 보강 patch(v0.8.1~v0.8.8) 가 같은 날(2026-07-25) 누적 봉인됐다. 본 8종 모두 **외부 인터페이스 변경 없음**(env opt-in 1종 + payload 필드 1블록은 v0.8.0 본 release 가 정의, 후속 patch 는 정합 + 운영 가이드/CI/workflow meta 만 다룸). 코드 변경은 v0.8.4(BuildDetail.tsx 주석 19+/8-) 가 유일.

- 코드 델타(8종 누적):
  - v0.8.1 / v0.8.2 / v0.8.3 / v0.8.5 / v0.8.6 / v0.8.7 / v0.8.8 — **코드 변경 0** (workflow / 운영 문서 / workflow meta)
  - v0.8.4 — **코드 변경 = 주석 19+/8-** (BuildDetail.tsx stale TASK-060/091/160 → TASK-160/161/167/174/175 정합)
- 5 package.json: `0.7.0` → **`0.8.8`** (8회 0.8.X bump, 5/5 통일)
- git tag: 8개 (`v0.8.0`~`v0.8.8`) — 모두 annotated, 모두 origin push 완료
- 회귀 baseline: build-server **205** / build-monitor vitest **279** (사전 환경 의존 1 fail v0.8.3 부터 정착, 회귀 영향 0) / runner `go test ./...` **8 pkg** / TS 5 clean / migration **0001~0012** / k8s e2e nightly 자동 검증
- **API/스키마/마이그레이션 변경 0** (전 8 patch 의 누적)

## 2. v0.8.0 base

[v0.8.0 종합 release notes](./RELEASE_NOTES-v0.8.0-2026-07-25.md) 가 본 8연속 patch 의 base. **E1 per-build namespace** (옵트인), **E2 Ingress cleanup**, **E3 k8s 실패 시 docker registry 결과 보존** 의 3종 신규 운영 결함 해소가 v0.8.0 본 release 가 정의. 후속 8 patch 는 모두 v0.8.0 의 운영 안전성 / 정합성을 강화하는 데 집중.

## 3. 후속 8연속 patch (v0.8.1~v0.8.8) 누적

| version | 모드 | 핵심 | 코드 변경 |
|---|---|---|---|
| **v0.8.1** | patch | k8s e2e nightly CI 편입 — `.github/workflows/nightly-e2e.yml` 에 `k8s-deploy-e2e` job 추가 (v0.4.1 hosting-e2e 와 동형, cluster `dib-e2e` 분리) | 0 |
| **v0.8.2** | patch | k8s 운영 가이드 §6.6 보강 — E1/E2/E3 실측 절차 (per-build namespace / Ingress cleanup / docker registry 결과 보존) + 회귀 baseline 단락 | 0 |
| **v0.8.3** | patch | release-checklist k8s 보강 — §1 Pre-deploy #6 / §3 Verify #8 / §4 Post-deploy #5 / §5 Rollback #6 / §7/§8 follow-up 정합 | 0 |
| **v0.8.4** | patch | PROJECT_PROFILE 운영 가이드 reference — v0.7.0+/v0.8.x 신규 운영 가이드 4종 + BuildDetail.tsx stale 주석 정합 (19+/8-) | **주석 19+/8-** |
| **v0.8.5** | patch | v0.8.0 종합 RELEASE_NOTES 신규 — 6 섹션 95 줄, v0.4.0 / v0.5.0 release notes 형식 정합, v0.6.0 / v0.7.0 / v0.8.0 / v0.8.1~0.8.4 (8 release) 종합 리뷰 사각지대 해소 | 0 |
| **v0.8.6** | patch | v0.6.0 / v0.7.0 종합 RELEASE_NOTES 신규 — 각 7 섹션 ~80 줄, 5 종 release notes(v0.4.0 / v0.5.0 / v0.6.0 / v0.7.0 / v0.8.0) 형식 정합 완료 | 0 |
| **v0.8.7** | patch | RELEASE_NOTES-v0.8.0 §3 표 정합 — "후속 patch 4종(v0.8.1~0.8.4)" → "후속 patch 6종(v0.8.1~0.8.6)" 으로 정합. v0.8.5 작성 시점엔 v0.8.5 / v0.8.6 미존재라 표가 4 종에 머물렀던 사각지대 해소 | 0 |
| **v0.8.8** | patch | CHANGELOG release history v0.4.0 / v0.5.0 entry 종합 리뷰 링크 추가 + v0.5.1 entry 1 문장 정합(이전 commit 의 종합 리뷰 링크 미싱 명시). 6 종 release notes + CHANGELOG entry 정합 완료 | 0 |

모두 **코드 변경 0** (workflow / 운영 문서 / workflow meta / 주석 정합) — v0.8.4 의 BuildDetail.tsx 주석 정합만 예외. 회귀 baseline 8종 모두 동일.

## 4. 검증 (8 patch 누적)

| 스위트 | 결과 |
|--------|------|
| build-server `node --test` | **205 PASS** (v0.7.0 baseline + v0.8.0 신규 3건; 8 patch 의 회귀 0) |
| build-monitor `vitest run` | **279** (사전 환경 의존 1 fail v0.8.3 부터 정착, 회귀 영향 0) |
| runner `go test ./...` | **8 pkg PASS** (v0.8.0 신규 3건: E1 4케이스 / E2 / E3; 8 patch 의 회귀 0) |
| `tsc --noEmit` × 5 packages | **clean** |
| postgres migration | **0001~0012** (변경 0) |
| **k8s e2e** (`e2e-k8s-deploy.sh`) | v0.8.1 부터 nightly CI `k8s-deploy-e2e` 잡이 자동 검증 (`schedule(cron 04:00 UTC)` + `workflow_dispatch` 전용) |
| 운영 가드 2계층 (TASK-131 doc-integrity + b-layer) | **PASS** (8 patch 동안 미발견) |

## 5. 업그레이드 안내

- **DB/API/스키마/마이그레이션 변경 0** (8 patch 전체 누적).
- **신규 env**(v0.8.0 본 release 가 정의, 후속 patch 는 영향 0):
  - `RUNNER_K8S_NAMESPACE_PER_BUILD` (accepts `true`/`1`/`yes`/`on`, default `false`)
  - `HOSTING_BASE_HOST` (v0.4.0+ / v0.7.0 status cache 운영), `HOSTING_STATUS_SYNC_INTERVAL_MS` (default 30s)
  - `RUNNER_HOSTING_BASE_HOST` (subdomain 스킴 v0.5.0+)
- **CHANGELOG 정합**: 6 종 release notes(v0.4.0 / v0.5.0 / v0.6.0 / v0.7.0 / v0.8.0 / v0.8.x) 가 모두 CHANGELOG release history entry 와 정합. v0.5.1 entry 는 종합 리뷰 링크 미싱 명시(별도 release notes 없음).
- **워크플로 메타**: 8 patch 의 v0.8.0~v0.8.8 entry 가 state.json recent_done_items 에 누적. purpose_digest_rev 205.
- **Rollback**: `git checkout v0.8.0`. 8 patch 는 운영 보강만이라 image 단독 rollback 으로 충분. 단, `WORKFLOW_E2E_K8S_JOB` 활성화는 v0.8.1 부터이므로 v0.8.0 으로 rollback 시 k8s e2e nightly 가 자동으로 비활성.

## 6. follow-up (v0.9.0 후보)

- **Helm/ArgoCD adapter** (mode="helm"/"argocd" 분기) — 1호 adapter 의 한계를 넘는 차트/단계적 출시(Blue/Green, Canary) 운영.
- **webhook 확장** (Slack/Nextcloud 어댑터, 재시도, 서명) — v0.3.0 의 단일 webhook 위.
- **실 k8s e2e sync 캐시 실측** — TASK-174 의 `availableReplicas` 캐시가 실 k8s drift 를 잡는 시나리오. 현재 단위 + 통합 + nightly 로만 커버.
- **후속 운영 보강 patch** (v0.8.9+) — 8연속 patch 의 누적 정합을 마친 본 시점에서 v0.9.0 신규 기능 표면이 우선. 운영 가이드/CI/workflow meta 의 신규 결손 발견 시 patch 진행.

## 7. 종합 release notes 정합

본 문서는 v0.8.9 (2026-07-25) patch 에서 신규 작성. v0.8.0 종합 release notes 의 §3 표가 4종 patch 에 머물렀던 사각지대를 8연속 patch 로 확장 정합. CHANGELOG release history v0.8.0 entry 의 종합 리뷰 링크는 v0.8.0 본 release notes 로 유지(이중 링크 회피), 본 v0.8.x 종합 release notes 는 v0.8.8 entry 또는 본 v0.8.9 의 신규 entry 에서 link 한다.
