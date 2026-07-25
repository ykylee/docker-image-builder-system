# Changelog

- 문서 목적: 본 프로젝트의 release version 별 누적 변경 + 운영 가이드 인덱스 + 회귀 baseline 종합
- 범위: SemVer 정책, version 별 TASK 1-line 요약, 운영 가이드 인덱스, 회귀 baseline, follow-up 후보
- 대상 독자: 운영자, release reviewer, AI agent, 프로젝트 온보딩 담당자
- 상태: stable (v0.8.9 갱신 — v0.8.x 8연속 patch 종합 RELEASE_NOTES)
- 최종 수정일: 2026-07-25
- 관련 문서: [subdomain 설계](./docs/design/subdomain-hosting.md), [Phase 3 컨셉](./docs/PHASE-3-CONCEPT.md), [Phase 2 컨셉](./docs/PHASE-2-CONCEPT.md), [Phase 1 회고](./docs/PHASE-1-RETROSPECTIVE.md), [Release Notes v0.4.0](./docs/RELEASE_NOTES-v0.4.0-2026-07-24.md), [Release Notes v0.3.0](./docs/RELEASE_NOTES-2026-07-24.md), [Release Notes 2026-07-23](./docs/RELEASE_NOTES-2026-07-23.md), [Release Notes 2026-07-22](./docs/RELEASE_NOTES-2026-07-22.md), [Release Notes 2026-07-20](./docs/RELEASE_NOTES-2026-07-20.md), [Project Profile](./docs/PROJECT_PROFILE.md)

## 1. Release model

본 프로젝트는 **SemVer (Semantic Versioning)** 정책을 따르며 단일 release stream (main branch only) 으로 운영합니다.

- **MAJOR.MINOR.PATCH** — `v0.8.9` 형식
- **현재 release**: `v0.8.9` (2026-07-25, v0.8.x 8연속 patch 종합 RELEASE_NOTES)
- **release history**:
  - `v0.8.7` (2026-07-25) — patch. `docs/RELEASE_NOTES-v0.8.0-2026-07-25.md` §3 의 "후속 patch 4종 (v0.8.1~0.8.4)" 표를 "후속 patch 6종 (v0.8.1~0.8.6)" 으로 정합. v0.8.5 (v0.8.0 종합 RELEASE_NOTES) + v0.8.6 (v0.6.0 / v0.7.0 종합 RELEASE_NOTES) 2 종 row 추가. v0.8.5 작성 시점엔 v0.8.5/v0.8.6 가 미존재라 표가 4 종에 머물렀던 사각지대 해소. 코드 변경 0.
  - `v0.8.9` (2026-07-25) — patch. `docs/RELEASE_NOTES-v0.8.x-2026-07-25.md` 신규 (7 섹션 ~110 줄). v0.8.0 종합 release notes 의 §3 표가 4종 patch(v0.8.1~0.8.4) 에 머물렀던 사각지대를 v0.8.5 / v0.8.6 / v0.8.7 / v0.8.8 까지 8연속 patch 표로 확장 정합. 8연속 운영 보강 patch 의 마침표. 6 종 release notes(v0.4.0 / v0.5.0 / v0.6.0 / v0.7.0 / v0.8.0 / v0.8.x) 가 모두 정합 완료. 코드 변경 0.
  - `v0.8.8` (2026-07-25) — patch. CHANGELOG §1 release history 의 v0.4.0 / v0.5.0 entry 에 종합 리뷰 링크 추가 + v0.5.1 entry 1 문장 정합(이전 commit 의 종합 리뷰 링크 미싱 명시). 6 종 release notes(v0.4.0 / v0.5.0 / v0.6.0 / v0.7.0 / v0.8.0 + 미싱 v0.5.1) 가 CHANGELOG entry 와 정합 완료. v0.8.5~v0.8.7 의 release notes 5 종 정합 라인의 자연스러운 종점. 코드 변경 0.
  - `v0.8.6` (2026-07-25) — patch. `docs/RELEASE_NOTES-v0.6.0-2026-07-24.md` + `docs/RELEASE_NOTES-v0.7.0-2026-07-24.md` 신규 작성 (각 7 섹션 ~80 줄, v0.4.0 / v0.5.0 / v0.8.0 release notes 형식 정합). v0.8.5 의 잔여 (v0.6.0 / v0.7.0 종합 리뷰 사각지대) 해소. CHANGELOG release history v0.6.0 / v0.7.0 entry 에 종합 리뷰 링크 추가. 코드 변경 0.
  - `v0.8.5` (2026-07-25) — patch. `docs/RELEASE_NOTES-v0.8.0-2026-07-25.md` 신규 작성 (v0.4.0 / v0.5.0 release notes 형식 정합, 6 섹션 95 줄). v0.6.0 / v0.7.0 / v0.8.0 / v0.8.1~0.8.4 (8 release) 의 종합 리뷰 사각지대 해소. §1 요약 / §2 무엇이 생겼나(E1/E2/E3) / §3 후속 patch 4종 누적 / §4 검증 / §5 업그레이드 / §6 follow-up. CHANGELOG release history 의 v0.8.0 entry 에 종합 리뷰 링크 추가. 코드 변경 0.
  - `v0.8.4` (2026-07-25) — patch. PROJECT_PROFILE.md 가 2026-07-21 마지막 수정(v0.5.0~ 직전) 이라 v0.7.0/v0.8.x 신규 운영 가이드 4종( hosting-2026-07-24 / hosting-sub-path-2026-07-24 / k8s-deploy-webhook-2026-07-24 / release-checklist-2026-07-20 §3 k8s 보강) + k8s e2e nightly 가 reference 되지 않았던 사각지대 해소. §2 문서 구조에 운영 가이드 인덱스 + 설계 결정 reference 추가, §3 기본 명령 4 종 운영 가이드 reference + k8s e2e nightly 절차, §4 검증 포인트에 v0.7.0+/v0.8.0+ 회귀 baseline. 부수: BuildDetail.tsx 의 stale TASK-060/091 주석 + "TASK-160: deprecated Legacy preview" 잔재를 TASK-160/161/167/174/175 정합으로 갱신. 코드 변경 = 주석 19+/8-. 회귀 baseline: build-server 205 / build-monitor vitest 269(사전 환경 의존 1 fail v0.8.3 동일) / TS 5 clean / migration 0001~0012 / go 8 pkg.
  - `v0.8.3` (2026-07-25) — patch. release-checklist `docs/operations/release-checklist-2026-07-20.md` 보강 — v0.8.1 nightly 편입 + v0.7.0 status cache + v0.4.0+ Phase 3 자원이 release-checklist §1/§3/§4/§5/§7/§8 에 누락돼 있던 사각지대 해소. §1 Pre-deploy 에 k8s staging kind/kubectl env 점검 추가, §3 Verify #8 e2e-k8s-deploy.sh, §4 Post-deploy #5 hosted service status 캐시 검증, §5 Rollback #6 k8s 호스팅 자원 정리, §7/§8 follow-up 에 k8s e2e nightly 결과 운영 반영 + 자동화. 코드 변경 0.
  - `v0.8.2` (2026-07-25) — patch. k8s 운영 가이드 `docs/operations/k8s-deploy-webhook-2026-07-24.md` §6 보강: §4/§5 의 "kind 미가용 CI 편입 follow-up" → v0.8.1 해소 명시, §6.6 신규 — E1/E2/E3 실측 절차(per-build namespace / Ingress cleanup / k8s 실패 시 docker registry 결과 보존) + 회귀 baseline. 코드 변경 0.
  - `v0.8.1` (2026-07-25) — patch. k8s e2e 를 nightly CI 에 편입. .github/workflows/nightly-e2e.yml 에 k8s-deploy-e2e job 신규 — kind + kubectl + e2e-k8s-deploy.sh. 코드 변경 0(회귀 baseline 불변).
  - `v0.8.0` (2026-07-25) — minor. k8s adapter 운영 결함 3종 해소 — per-build namespace 옵트인 / Ingress cleanup / k8s 실패 시 docker registry 결과 보존. 외부 인터페이스(env opt-in + payload 필드)만 확장, API/스키마 변경 0. 종합 리뷰: [Release Notes v0.8.0](./RELEASE_NOTES-v0.8.0-2026-07-25.md).
  - `v0.7.0` (2026-07-24) — minor. 호스팅 status 캐시 — desired status 와 분리된 live replica read cache 를 주기 sync(availableReplicas + lastSyncedAt). UI degraded 파생. 종합 리뷰: [Release Notes v0.7.0](./RELEASE_NOTES-v0.7.0-2026-07-24.md).
  - `v0.6.0` (2026-07-24) — minor. 실패 경로 e2e 신설 — 빌드 실패가 canonical FAILED + 단계별 errorCode(DOCKER_BUILD_FAILED/CONTAINER_TEST_FAILED) 로 보고되는지 실 compose 왕복 검증. e2e 13→14종. 종합 리뷰: [Release Notes v0.6.0](./RELEASE_NOTES-v0.6.0-2026-07-24.md).
  - `v0.5.1` (2026-07-24) — patch. HTTPS 미도입 확정 — url 평문 http + 로드맵 TLS 제외. (이전 commit 의 종합 리뷰 링크 미싱 — v0.8.8 정합.)
  - `v0.5.0` (2026-07-24) — minor. subdomain 호스팅 스킴(`<cp>.<host>/`, 앱 무수정) 추가. path-prefix 와 병존. 종합 리뷰: [Release Notes v0.5.0](./RELEASE_NOTES-v0.5.0-2026-07-24.md).
  - `v0.4.1` (2026-07-24) — patch. 호스팅 e2e 를 nightly CI(hosting-e2e job)에 편입. 코드 변경 0.
  - `v0.4.0` (2026-07-24) — **Phase 3 완료**. 호스팅 능력 — k8s Ingress path-prefix 호스팅 + 관리 라이프사이클 + sub-path 규약. 실 e2e(kind+ingress-nginx) ALL PASS. 종합 리뷰: [Release Notes v0.4.0](./RELEASE_NOTES-v0.4.0-2026-07-24.md).
  - `v0.3.0` (2026-07-24) — **Phase 2 완료**. preview-era 청산(P2-M1~M4) + 배포 능력(k8s) + 결과 전달(webhook). 제품 목적 4단계 모두 1급 phase + e2e.
  - `v0.2.1` (2026-07-23) — Phase 1 후속 패치. 이미지 빌드 회귀 + chunked claim 제품 결함 수정 + e2e 13/13 전수 PASS.
  - `v0.2.0` (2026-07-22) — Phase 1 완료 baseline. React 19 + Astryx 프론트엔드 정식 도입 + 운영 가드 2계층 + 서버-프론트 계약 경화.
  - `v0.1.0` (2026-07-20, `53adb75`) — 백엔드/운영 성숙도 baseline. source archive scale-out + RFC 7233 + Postgres 동등성 + e2e.
- **5 package.json 통일 정책**: `apps/build-server` / `apps/build-monitor` / `packages/shared-contract` / `packages/shared-config` / `packages/db` 의 version field 가 모두 동일하게 유지되어야 함. `apps/runner` 는 Go module 이라 version field 없이 git tag 로 버전 관리. 본 release 시점 5/5 `0.8.9` 로 통일.
- **release staging anchor**: 각 version 의 tagged commit 이 운영 환경의 release staging 의 단일 anchor.
- **standard_ai_workflow kit 의 version (`ai-workflow/workflow_kit/pyproject.toml`) 은 별도 stream** — 본 저장소가 의존하는 표준 워크플로우 키트의 자체 versioning 이며 본 프로젝트 release 와 무관 (TASK-121 정책).

## 2. v0.8.9 (2026-07-25) — v0.8.x 8연속 patch 종합 RELEASE_NOTES (patch)

`docs/RELEASE_NOTES-v0.8.x-2026-07-25.md` 신규 (7 섹션 ~110 줄). v0.8.0 종합 release notes 의 §3 표가 **4종 patch**(v0.8.1~0.8.4) 에 머물렀던 사각지대를 v0.8.5 / v0.8.6 / v0.8.7 / v0.8.8 까지 **8연속 patch 표**로 확장 정합. 8연속 운영 보강 patch 의 마침표. **코드 변경 0** (운영 문서 1 종 + CHANGELOG §1 release history 1 entry + §2 신규 entry + state.json).

- **`docs/RELEASE_NOTES-v0.8.x-2026-07-25.md` 신규** — §1 요약(8연속 patch + 회귀 baseline 누적) / §2 v0.8.0 base / §3 후속 8연속 patch 표(코드 변경 컬럼 포함) / §4 검증(build-server 205 / vitest 279 / go 8 pkg / TS clean / migration 0001~0012 / k8s e2e nightly 자동) / §5 업그레이드(DB/API 0 변경 + 신규 env 4종) / §6 follow-up(v0.9.0 후보 4종) / §7 종합 release notes 정합.
- **6 종 release notes 가 모두 정합 완료** — v0.4.0(72줄) / v0.5.0(51줄) / v0.6.0(~80줄) / v0.7.0(~80줄) / v0.8.0(95줄) / v0.8.x(~110줄, 본 신규).
- **CHANGELOG release history v0.8.9 entry 신규** — `docs/RELEASE_NOTES-v0.8.x` 링크 1 줄 표기.
- **v0.8.0 release notes 본문은 유지** — v0.8.0 표는 v0.8.0 release 시점의 4종 patch 가 정확한 정보(시점 정합). 본 v0.8.x 종합 release notes 가 8종 정합을 단일 페이지로 표기(이중 링크 회피).

**검증**: TS 5 clean / build-server 205 / build-monitor vitest 269(사전 환경 의존 1 fail v0.8.3 동일) / migration 0001~0012 / go 8 pkg. **코드 변경 0** (운영 문서 + CHANGELOG + state.json 만). 9연속 운영 보강 patch 의 누적 정합 완료.

**업그레이드 안내**: 운영 문서 1 종 신규. DB/API/스키마/migration 변경 0. 별도 조치 불요.

## 3. v0.8.8 (2026-07-25) — CHANGELOG release history v0.4.0 / v0.5.0 entry 종합 리뷰 링크 (patch)

CHANGELOG §1 release history 의 **v0.4.0 / v0.5.0 entry 에 종합 리뷰 링크 누락** 사각지대 해소. v0.8.5~v0.8.7 의 release notes 5 종 정합 라인의 자연스러운 종점. **코드 변경 0** (CHANGELOG §1 release history 2 entry 링크 + 1 entry 1 문장 정합).

- **v0.4.0 entry** — `종합 리뷰: [Release Notes v0.4.0](./RELEASE_NOTES-v0.4.0-2026-07-24.md)` 추가.
- **v0.5.0 entry** — `종합 리뷰: [Release Notes v0.5.0](./RELEASE_NOTES-v0.5.0-2026-07-24.md)` 추가.
- **v0.5.1 entry** — `(이전 commit 의 종합 리뷰 링크 미싱 — v0.8.8 정합.)` 1 문장 명시. 본 release 의 종합 리뷰는 v0.5.1 release commit(`0cfcf10`) 가 patch summary 1 줄 entry 로 작성되어 release notes 가 별도로 없음 — 본 정합으로 미싱을 명시.
- **6 종 release notes 가 CHANGELOG entry 와 정합 완료** — v0.4.0(72줄) / v0.5.0(51줄) / v0.6.0(~80줄) / v0.7.0(~80줄) / v0.8.0(95줄) 모두 entry 와 정합. v0.5.1 은 patch summary 1 줄 entry 형식(별도 release notes 없음)으로 정합 완료.

**검증**: TS 5 clean / build-server 205 / build-monitor vitest 269(사전 환경 의존 1 fail v0.8.3 동일) / migration 0001~0012 / go 8 pkg. **코드 변경 0** (CHANGELOG 만). 8연속 운영 보강 patch(v0.8.1~0.8.8) 의 누적 정합 — 운영 가이드 44종 + release notes 5종 + PROJECT_PROFILE reference + release-checklist + k8s-deploy-webhook + §3 표 6종 + CHANGELOG entry 링크 모두 정합.

**업그레이드 안내**: CHANGELOG §1 release history 정합만. DB/API/스키마/migration 변경 0. 별도 조치 불요.

## 4. v0.8.7 (2026-07-25) — RELEASE_NOTES-v0.8.0 §3 표 정합 (patch)

`docs/RELEASE_NOTES-v0.8.0-2026-07-25.md` §3 의 "후속 patch 4종 (v0.8.1~0.8.4)" 표를 "후속 patch 6종 (v0.8.1~0.8.6)" 으로 정합. v0.8.5 작성 시점엔 v0.8.5 / v0.8.6 이 미존재라 표가 4 종에 머물렀던 사각지대 해소. **코드 변경 0** (운영 문서 1 행 + 1 문장 갱신).

- **§3 표 2 종 row 추가** — v0.8.5 (v0.8.0 종합 RELEASE_NOTES) / v0.8.6 (v0.6.0 / v0.7.0 종합 RELEASE_NOTES). 본 2 종 모두 운영 문서만(코드 변경 0) patch.
- **헤더 텍스트 정합** — "후속 patch 4종 (v0.8.1~0.8.4)" → "후속 patch 6종 (v0.8.1~0.8.6)" + "회귀 baseline 4종 모두 동일" → "회귀 baseline 6종 모두 동일".
- **본 1 문장 추가** — v0.8.7 정합 의도 명시.

**검증**: TS 5 clean / build-server 205 / build-monitor vitest 269(사전 환경 의존 1 fail v0.8.3 동일) / migration 0001~0012 / go 8 pkg. **코드 변경 0** (운영 문서만). v0.8.0 종합 release notes 의 완결성 회복.

**업그레이드 안내**: 운영 문서 1 종 정합. DB/API/스키마/migration 변경 0. 별도 조치 불요.

## 5. v0.8.6 (2026-07-25) — v0.6.0 / v0.7.0 종합 RELEASE_NOTES (patch)

v0.8.5 의 잔여 — v0.6.0 / v0.7.0 종합 release notes 사각지대 해소. **코드 변경 0**. 신규 운영 문서 2 종:

- **`docs/RELEASE_NOTES-v0.6.0-2026-07-24.md`** (7 섹션 ~80 줄) — 실패 경로 e2e (TASK-173). §1 요약(e2e 13→14종 + 계약 변경 0) / §2 무엇이 생겼나(e2e-failure-paths.sh + 스위트 등록) / §3 후속 patch(없음) / §4 검증(테이블 5 행) / §5 업그레이드(테스트 자산만) / §6 follow-up / §7 종합 release notes 정합.
- **`docs/RELEASE_NOTES-v0.7.0-2026-07-24.md`** (7 섹션 ~80 줄) — 호스팅 status 캐시 (TASK-174). §1 요약(desired vs live 분리) / §2 무엇이 생겼나(live replica read cache + opt-in + UI degraded) / §3 후속 patch(없음) / §4 검증(테이블 5 행 + migration 0012) / §5 업그레이드(API 호환 확장 + kubectl 호출 첫 운영권) / §6 follow-up / §7 종합 release notes 정합.
- **CHANGELOG release history v0.6.0 / v0.7.0 entry 에 종합 리뷰 링크 추가** — 4 종(v0.4.0 / v0.5.0 / v0.6.0 / v0.7.0 / v0.8.0) 종합 release notes 정합.
- v0.4.0(72줄) / v0.5.0(51줄) / v0.6.0(~80줄) / v0.7.0(~80줄) / v0.8.0(95줄) — 5 종 release notes 형식 1:1 정합.

**검증**: TS 5 clean / build-server 205 / build-monitor vitest 269(사전 환경 의존 1 fail v0.8.3 동일) / migration 0001~0012 / go 8 pkg. **코드 변경 0** (운영 문서만). 모든 release 의 회귀 baseline 정합.

**업그레이드 안내**: 운영 문서 신규 2 건. DB/API/스키마/migration 변경 0. 별도 조치 불요.

## 6. v0.8.5 (2026-07-25) — v0.8.0 종합 RELEASE_NOTES (patch)

v0.6.0 / v0.7.0 / v0.8.0 / v0.8.1~0.8.4 (8 release) 의 종합 리뷰 사각지대 해소 — v0.4.0 / v0.5.0 release notes 형식 정합의 `docs/RELEASE_NOTES-v0.8.0-2026-07-25.md` 신규 작성. **코드 변경 0**.

- **신설 6 섹션 95 줄** — §1 요약 (TASK-175 k8s adapter 운영 결함 3종 + 후속 patch 4종 누적) / §2 무엇이 생겼나 (E1 per-build namespace / E2 Ingress cleanup / E3 k8s 실패 시 docker registry 결과 보존) / §3 후속 patch 4종 표 (v0.8.1 nightly / v0.8.2 §6.6 / v0.8.3 release-checklist / v0.8.4 PROJECT_PROFILE) / §4 검증 (build-server 205 / vitest 279 / go 8 pkg / TS 5 clean / migration 0001~0012) / §5 업그레이드 안내 (env opt-in / 코드 0 변경 / nightly CI 자동 검증) / §6 follow-up (v0.9.0 후보: Helm/ArgoCD / webhook 확장 / 실 k8s e2e sync 캐시 실측).
- **단일 출처 3 종** — 본 release notes + [`docs/operations/k8s-deploy-webhook-2026-07-24.md`](./operations/k8s-deploy-webhook-2026-07-24.md) §6.6 + [`docs/operations/release-checklist-2026-07-20.md`](./operations/release-checklist-2026-07-20.md). 신규 운영자 onboarding 이 본 3 종 만 따라가면 v0.8.x 의 모든 신규 기능을 운영 환경에서 안전하게 도입 가능.
- **CHANGELOG release history v0.8.0 entry 에 RELEASE_NOTES 링크 추가** — 종합 리뷰의 단일 entrypoint.

**검증**: TS 5 clean / build-server 205 / build-monitor vitest 269 (사전 환경 의존 1 fail v0.8.3 동일, 회귀 영향 0) / migration 0001~0012 / go 8 pkg. **코드 변경 0** (운영 문서만). v0.4.0 (72 줄) / v0.5.0 (51 줄) release notes 형식 1:1 정합.

**업그레이드 안내**: 운영 문서 신규 1 건. DB/API/스키마/migration 변경 0. 별도 조치 불요.

## 7. v0.8.4 (2026-07-25) — PROJECT_PROFILE 신규 운영 가이드 reference + BuildDetail.tsx stale 주석 정합 (patch)

v0.7.0 / v0.8.x 의 운영 가이드 4종 + k8s e2e nightly 가 `docs/PROJECT_PROFILE.md` 에 reference 되지 않았던 사각지대 해소. **코드 변경 = 주석 19+/8-** (BuildDetail.tsx stale TASK-060/091/160 주석 정합), 회귀 영향 0.

- **§2 문서 구조 — 운영 가이드 인덱스 신규** — `docs/operations/` 홈 reference + 호스팅 능력(`hosting-2026-07-24` / `hosting-sub-path-2026-07-24`) + k8s adapter(`k8s-deploy-webhook-2026-07-24`) + 운영 절차(`release-checklist-2026-07-20`) + 설계 결정(`subdomain-hosting`) 4 종 운영 가이드 + 1 설계 reference.
- **§3 기본 명령 — 4종 운영 가이드 reference 신규** — 호스팅 능력 종합(v0.4.0 Phase 3 / TASK-166~170) + 호스팅 status 캐시(v0.7.0 / TASK-174) + k8s adapter 외부 배포 + webhook(P2-M5 / TASK-165 + TASK-175 / v0.8.0) + k8s e2e nightly(v0.8.1 / TASK-171 동형) — 각 운영 가이드의 anchor + 운영 권고 + follow-up 1-line. `bash apps/runner/scripts/e2e-k8s-deploy.sh` 명령 박스 단일 출처 명시.
- **§4 검증 포인트 — v0.7.0+ / v0.8.0+ 회귀 baseline 단락 신규** — frontend vitest 279 / build-server 205 / TS 5 clean / migration 0001~0012 / 호스팅 e2e ALL PASS / 부팅 스모크 ALL PASS + API 호환 확장(HostedService 2 nullable 필드). v0.8.0+ 누적 baseline 명시 — k8s e2e nightly 는 `schedule(cron 04:00 UTC)` + `workflow_dispatch` 전용, 매 push 제외.
- **BuildDetail.tsx stale 주석 정합** — "TASK-060 follow-up 에서 제거 예정" 잔재 + "TASK-160: deprecated Legacy preview" 잔재를 TASK-160/161/167/174/175 정합으로 갱신. 코드 동작 변경 0(빌드 산출물 / 단언 / 스타일 동일).

**검증**: TS 5 clean / build-server 205 / build-monitor vitest 269 (사전 환경 의존 1 fail — v0.8.3 release commit `8b79a78` 시점과 동일, 우리 변경 회귀 0) / migration 0001~0012 / go 8 pkg 모두 baseline 정합. 운영 문서 cross-reference — PROJECT_PROFILE §2 / §3 / §4 가 `docs/operations/hosting-*` / `k8s-deploy-webhook` / `release-checklist` / `subdomain-hosting` 4 종 운영 가이드와 정합.

**업그레이드 안내**: 운영 문서 보강 + BuildDetail.tsx 주석 정합. DB/API 계약 변경 0. 별도 조치 불요.

## 8. v0.8.3 (2026-07-25) — release-checklist k8s 보강 (patch)

`docs/operations/release-checklist-2026-07-20.md` 의 v0.4.0+ Phase 3 / v0.7.0 status cache / v0.8.1 nightly 편입 사각지대 4종을 보강한 patch release. **코드 변경 0** — 운영 가이드만.

- **§1 Pre-deploy #6** — k8s staging kind/kubectl env 점검 추가. `kind version` / `kubectl version --client` / `cluster-info --context kind-dib-staging` 단언. 미설치/미접속 시 §3 의 k8s e2e 가드 skip + follow-up deferred. 신규 commit 이 k8s adapter / hosted service / status cache 영향 시 필수 점검.
- **§3 Verify #8** — `e2e-k8s-deploy.sh` 회귀 가드 추가. v0.8.1 부터 nightly 에 편입된 절차의 수동 staging 재현 경로. 운영 절차 단일 출처 = `docs/operations/k8s-deploy-webhook-2026-07-24.md` §6.6.
- **§4 Post-deploy #5** — `hosted_service` 의 `available_replicas` / `last_synced_at` 주기 sync 검증. `status=RUNNING` 인데 `available_replicas=0` 이면 degraded 신호(UI `/admin/hosting` 배지). `last_synced_at` 이 NULL / 1분 초과면 sync 정지 — §3 health + build-server logs 의 sync tick 단언.
- **§5 Rollback #6** — k8s 호스팅 자원 정리(orphan) — 직전 commit 으로 rollback 시 새 commit 의 hosted service / Ingress 가 잘못된 namespace 에 남는 경우. `kubectl delete deployment,service,ingress -n <ns> -l dib-rollback-orphan=true --ignore-not-found` 또는 per-build namespace 옵트인 사용 시 namespace 통째 정리.
- **§7/§8 follow-up** — k8s e2e nightly 결과 운영 반영 + 자동화. 현재 운영자 수동 반영, 자동 게이트는 별도 TASK 권장.

**검증**: TS 5 clean / build-server 205 / build-monitor 279 / migration 0001~0012 / go 8 pkg 모두 **불변**(코드 무변경). 운영 가이드 정합 — §1→§3→§4→§5→§7/§8 cross-reference.

**업그레이드 안내**: 운영 가이드 보강만. DB/API 계약 변경 0. 별도 조치 불요.

## 9. v0.8.2 (2026-07-25) — k8s 운영 가이드 §6.6 보강 (patch)

`docs/operations/k8s-deploy-webhook-2026-07-24.md` §6 을 보강해 **E1/E2/E3 실측 절차** 를 명문화한 patch release. **코드 변경 0** — 운영 문서 보강 + workflow meta 만.

- **§4 갱신** — "kind 미가용 CI 편입은 별도 follow-up" 잔재를 v0.8.1 의 `k8s-deploy-e2e` nightly 편입 완료로 정정. 호스팅 e2e 와 cluster 분리(`dib-e2e` vs `dib-hosting-e2e`) 명시.
- **§5 follow-up 갱신** — 첫 항목 "kind 기반 e2e 의 nightly CI 편입" 취소선 + "v0.8.1 에서 해소" 표기.
- **§6.5 검증 갱신** — "kind/kubectl 실측" 단락을 "v0.8.1 부터 nightly CI 자동 검증, 로컬 절차는 §6.6 참조" 로 변경.
- **§6.6 신규** — E1/E2/E3 실측 절차(전제 / 단계 / 단언) + 회귀 baseline 단락.
  - **E1 per-build namespace**: `RUNNER_K8S_NAMESPACE_PER_BUILD=true` vs `false` 비교, `kubectl get ns -l dib-build-id` 로 buildID 라벨 namespace 생성 확인.
  - **E2 Ingress cleanup**: `kubectl get ingress` 로 Ingress 생성 확인 → `kubectl delete deployment,service,ingress ... --ignore-not-found` 3-kind 정리 검증 → 동명 재빌드 stale Ingress 미흡 검증.
  - **E3 docker registry 결과 보존**: 의도적 k8s 실패(context 깨뜨림) → `GET /builds/:id` 의 `errorMessage` 에 "(docker registry push survived: <ref>)" + `responsePayload.dockerRegistry` 블록 단언.

**검증**: TS 5 clean / build-server 205 / build-monitor 279 / migration 0001~0012 / go 8 pkg 모두 **불변** (코드 무변경). 운영 문서 정합성 — §4/§5/§6.5/§6.6 cross-reference.

**업그레이드 안내**: 운영 문서 보강만. DB/API 계약 변경 0. 별도 조치 불요.

## 10. v0.8.1 (2026-07-25) — k8s e2e nightly CI 편입 (patch)

수동 실행이던 k8s e2e(`apps/runner/scripts/e2e-k8s-deploy.sh` — TASK-165 P2-M5 의 산출물)를 nightly CI 에 편입. **코드 변경 0** — `.github/workflows/nightly-e2e.yml` 에 `k8s-deploy-e2e` job 추가만.

- **신설 job**: kind(`go install sigs.k8s.io/kind@v0.24.0`) + kubectl(`v1.31.4`) 설치 후 `apps/runner/scripts/e2e-k8s-deploy.sh` 실행 — busybox httpd 빌드 → kind load → `kubectlDeployer` 실배포(`availableReplicas=1`) + webhook 결과 전달(수신 stub) 검증. cluster 없으면 생성, 종료 시 삭제(기존 클러스터 보존).
- **호스팅 e2e 와 동시 실행 가능** — 다른 cluster(`dib-e2e` vs `dib-hosting-e2e`) 사용 + 별도 잡이라 두 cluster 가 격리됨.
- **트리거**: `schedule(cron 04:00 UTC)` + `workflow_dispatch` 전용. kind 셋업이 무거워 매 push 제외(v0.4.1 hosting-e2e 와 동일 정책). push trigger 의 paths 필터는 `apps/runner/scripts/e2e-*.sh` glob 으로 자동 매칭.
- **teardown**: `dibs-*` 컨테이너/볼륨 정리(기존 e2e 잡과 동일).

**검증**: YAML 파싱 통과(`jobs: e2e, visual, hosting-e2e, k8s-deploy-e2e` 4 잡), 회귀 baseline **변경 0**(TS 5 clean / build-server 205 / build-monitor 279 / migration 0001~0012 / go 8 pkg 모두 불변 — 코드 무변경). 실제 CI 실행은 다음 nightly / dispatch 검증.

**업그레이드 안내**: workflow 파일만 추가(사용자 코드 영향 0). DB/API 계약 변경 0. 별도 조치 불요.

## 11. v0.8.0 (2026-07-25) — k8s adapter 운영 결함 3종 해소 (minor)

k8s adapter 의 **운영 결함 3종을 옵트인/내부 보강으로 해소**한 minor release. `v0.7.0` 이후 코드 델타 = **TASK-175**. 외부 인터페이스는 env opt-in 1종 + payload 필드 1블록만 확장했고, 기본 동작은 완전히 불변.

- **E1 per-build namespace 옵트인** — `RUNNER_K8S_NAMESPACE_PER_BUILD=true` 면 buildID 별 namespace(`dib-<buildID>`, DNS-1123 정제)로 격리. 기본값(`false`)은 기존 공유 namespace(`RUNNER_K8S_NAMESPACE`) 호환. 부수효과 격리(빌드 간 ingress DNS 충돌 회피) + audit 개선.
- **E2 Ingress cleanup** — `kubectlDeployer.Cleanup()` 의 `delete deployment,service` 를 `delete deployment,service,ingress` 3-kind 묶음으로 확장. 동명 재빌드 시 stale Ingress 가 라우팅을 잡아채는 잠복 결함 해소. `--ignore-not-found` 유지로 Ingress 없는 정상 케이스 안전.
- **E3 k8s 실패 시 docker registry 결과 보존** — k8s 분기 시작에 `IN_PROGRESS(K8S)` 보고 후 실패 시 `FAILED(K8S)` 와 함께 `payload.dockerRegistry={targetRef, resultRef, survivedAt}` 블록 동봉. `ErrorMessage` 에 `k8s deploy failed: <원인> (docker registry push survived: <ref>)` 표기. 종전엔 k8s 실패 시 docker registry 결과가 사라졌다.

**검증**: runner `go test ./...` **8 pkg PASS**(신규 3건: E1 4케이스 / E2 / E3, 강화 1건), `go vet` clean. **k8s e2e**(kind/kubectl 실배포)는 환경 부재로 미실측 — 단위 + 통합 테스트로 변경 표면을 커버. 회귀 baseline: build-server **205** / build-monitor **279** / TS 5 clean / migration 0001~0012 — 모두 불변.

**업그레이드 안내**: **DB/API 계약 변경 0**. **신규 env(선택)**: `RUNNER_K8S_NAMESPACE_PER_BUILD` (`true`/`1`/`yes`/`on` accept, 기본 `false`). k8s 분기 비활성 환경은 완전 무영향. 운영 문서 [`docs/operations/k8s-deploy-webhook-2026-07-24.md` §6](./docs/operations/k8s-deploy-webhook-2026-07-24.md) 신규.

## 12. v0.7.0 (2026-07-24) — 호스팅 status 캐시 (minor)

호스팅 서비스의 **live k8s 상태를 주기적으로 캐시**하는 minor release. `v0.6.0` 이후 코드 델타 = **TASK-174**. 종전 `HostedService.status`(desired lifecycle)는 관리 명령·배포 upsert 로만 갱신돼 실 k8s 상태(파드 crash/OOM 로 replica 0)와 drift 해도 알 방법이 없었다.

- **분리 설계**: desired `status` 를 건드리지 않고 별도 live 필드(`availableReplicas` + `lastSyncedAt`)를 추가해 주기 sync 가 관리 명령과 충돌하지 않는다. `status=RUNNING` 인데 `availableReplicas=0` 이면 UI 가 **degraded**(파드 미기동)로 파생 표시.
- **주기 sync**: build-server 가 프로세스 최초의 background job(`setInterval`, `.unref()`)으로 REMOVED 제외 전 서비스의 실측 available replica 를 `kubectl` 로 읽어 registry 에 캐시. 개별 서비스 조회 실패는 격리(stale 유지 + 다음 tick 재시도). 재배포 시 캐시 null 리셋.
- **opt-in**: `HOSTING_BASE_HOST` 설정 시에만 스케줄러 기동(미설정 배포는 kubectl 호출 0). `HOSTING_STATUS_SYNC_INTERVAL_MS`(기본 30s, `0`=비활성)로 간격 제어.
- **UI**(`/admin/hosting`): Replicas 컬럼 + degraded 배지 + `lastSyncedAt` tooltip.

**검증**: build-server **205 PASS**(+6), build-monitor **279 PASS**, TS 5 clean, migration **0012** 로컬 적용, 부팅 스모크(스케줄러 기동+health) ALL PASS.

**업그레이드 안내**: **API 계약(호환 확장)** — HostedService 에 `availableReplicas`/`lastSyncedAt`(nullable, sync 전 null). **DB**: migration 0012(`available_replicas`/`last_synced_at`, `ADD COLUMN IF NOT EXISTS`) — 자동 bootstrap 경로에서 적용. **신규 env(선택)**: `HOSTING_STATUS_SYNC_INTERVAL_MS`.

## 13. v0.6.0 (2026-07-24) — 실패 경로 e2e (minor)

**빌드 실패 보고 경로를 실 인프라 e2e 로 처음 검증**한 minor release. `v0.5.1` 이후 코드 델타 = **TASK-173**. 기존 e2e 13종은 전부 happy path(COMPLETED)만 실측했고, 빌드가 canonical 하게 `FAILED` + 단계별 errorCode 로 보고되는 경로(P2-M3 `stageFailure` 채널)는 단위 테스트만 있었다.

- **신설 `apps/build-server/scripts/e2e-failure-paths.sh`**: 단일 compose 스택(`compose.dev.yaml` + `compose.dev.e2e-production.yaml`, cli mode 실 `docker build`) 재사용, 의도적 실패 build 2종을 순차 투입 후 `GET /builds/:id` 로 `status=FAILED` / `phase=FAILED` / `lastError.code` 를 hard assert.
  - **A) docker build 실패** — Dockerfile `RUN exit 1` → `DOCKER_BUILD_FAILED`.
  - **B) 컨테이너 테스트 실패** — 이미지는 빌드되나 8080 미개방(`CMD ["sleep","3600"]`) → `CONTAINER_TEST_FAILED`.
- **스위트 등록 `scripts/run-e2e-suite.sh`**: `COMPOSE_E2E` 배열에 편입(compose 6→7종, 총 **13→14종**). 고정 project name `dibs-fail-e2e-$$` 라 기존 잔재 정리 로직(`docker ps --filter name=dibs-`)과 정합.

**검증**: 로컬 실측(Docker 29.1.3 + compose v2, cli mode) **ALL PASS** — A/B 각각 status=FAILED·phase=FAILED·lastError.code 일치.

**업그레이드 안내**: DB/API 계약 변경 **0**(테스트 자산만 추가). 별도 조치 불요.

## 14. v0.5.1 (2026-07-24) — HTTPS 미도입 확정 (patch)

**HTTPS/TLS 를 시스템 범위에서 제외**하고 조립 URL 을 평문 http 로 정합시킨 patch release. `v0.5.0` 직후의 스코프 정정(사용자 결정).

- build-server 의 `HostedService.url` 조립을 `https://` → **`http://`**(path·subdomain 양 스킴). 시스템은 평문 HTTP 만 서빙하며, TLS 가 필요하면 외부 LB 가 종단한다(시스템 밖).
- 로드맵/문서에서 wildcard TLS(cert-manager) 후속 항목 제거. subdomain 전제는 **wildcard DNS** 만(HTTPS 아님).

**검증**: build-server **199 PASS**(url http 기대값), TS 5 clean. 계약/스키마 변경 **0**(url 은 값). DB/API 계약 변경 0 — 별도 조치 불요.

## 15. v0.5.0 (2026-07-24) — subdomain 호스팅 스킴 (minor)

호스팅에 **subdomain URL 스킴**을 더한 minor release. `v0.4.1` 이후 코드 델타 = **TASK-172**. path-prefix(`host/<cp>/`)와 **병존**하며 per-build 로 선택한다.

### 2.1 제품 영향 (운영자 주목)

**subdomain 스킴(`<context-path>.<host>/`)** 은 path-prefix 의 sub-path 자산 제약을 근본 해소한다. 앱이 자기 subdomain 의 **루트**에서 서빙되므로 **절대경로 자산(`/main.js`)이 자연 동작 — 앱 무수정 지원**(`APP_BASE_PATH`·rewrite·stripPrefix 불필요).

- `POST /builds` 의 `hostingScheme`: `"path"`(기본) | `"subdomain"`.
- subdomain 은 Ingress `host:` rule(`<cp>.<HOSTING_BASE_HOST>`)로 라우팅. runner 가 host rule 을 렌더하려면 **base host 를 알아야 하므로** 신규 env `RUNNER_HOSTING_BASE_HOST`(build-server `HOSTING_BASE_HOST` 와 대칭).
- **전제**: subdomain 은 **wildcard DNS**(`*.<host>`) 필요. dev/e2e 는 **nip.io** magic DNS 로 무설정 검증. **HTTPS/TLS 는 시스템 범위 밖**(평문 HTTP 로 서빙 — 필요 시 외부 LB 가 종단). URL 은 `http://<cp>.<host>/`.
- 설계: [subdomain 호스팅](./docs/design/subdomain-hosting.md), [sub-path 규약](./docs/operations/hosting-sub-path-2026-07-24.md).

### 2.2 검증

회귀 baseline(전 green, v0.4.x 대비 후퇴 없음): frontend vitest **279** / build-server **199** / runner go **8 pkg** / skill_mcp **225** / TS 5 packages clean / migration **0001~0011** / **호스팅 e2e**(`e2e-hosting.sh`: path + **subdomain**(nip.io 실 host 라우팅 + 루트 자산 무수정 로드) + 관리) **ALL PASS**.

### 2.3 Breaking / 마이그레이션

- **DB migration**: **0011**(build_request + hosted_service 에 `hosting_scheme`, default `'path'`) 신규. 적용 필요.
- **API 계약(호환 확장)**: BuildRequest·BuildSummary·HostedService 에 optional `hostingScheme`(기본 path — 미지정 시 종전 동작).
- **신규 env(선택)**: `RUNNER_HOSTING_BASE_HOST`(runner, subdomain Ingress host rule 렌더용). subdomain 사용 시 **wildcard DNS** 필수.

## 16. v0.4.1 (2026-07-24) — 호스팅 e2e nightly CI 편입 (patch)

`v0.4.0`(Phase 3) 직후, 수동 실행이던 **호스팅 e2e 를 nightly CI 에 편입**한 patch release. 코드 변경 0 — CI 워크플로우만 추가. (TASK-171)

- `.github/workflows/nightly-e2e.yml` 에 **`hosting-e2e` job 신규**: kind + kubectl 을 설치하고 `apps/runner/scripts/e2e-hosting.sh`(kind + ingress-nginx 실 path 라우팅 + APP_BASE_PATH 자산 로드 + stop/remove 관리)를 실행한다.
- kind 셋업이 무거워 **schedule(cron 04:00 UTC) + 수동 dispatch 에서만** 돈다(매 push 제외, `if: github.event_name == 'schedule' || 'workflow_dispatch'`). 기존 `e2e`(13종) / `visual` job 과 병렬.
- 배경: v0.2.1/v0.3.0/v0.4.0 이 반복 실증한 "e2e 를 안 돌리면 결함이 잠복한다"의 연장 — 호스팅 라우팅/관리도 nightly 로 지속 검증한다.

**검증**: 회귀 baseline 변경 **0**(코드 무변경, TS/테스트 산출 동일). YAML 파싱 통과. 실제 CI 실행은 다음 nightly(또는 수동 dispatch)에서 검증.

**업그레이드 안내**: DB/API 계약 변경 0. 별도 조치 불요.

## 17. v0.4.0 (2026-07-24) — Phase 3 완료 (호스팅 능력)

**Phase 3 (호스팅 능력) 을 종결**하는 minor release. `v0.3.0` 이후 코드 델타 = **TASK-166 ~ TASK-170**. 빌드된 이미지가 k8s 에 **지속 호스팅**되고 `http(s)://<HOSTING_BASE_HOST>/<context-path>/` 로 접근·관리된다. 실 e2e(kind + ingress-nginx)로 라우팅+자산+관리를 실증. 컨셉/설계는 [Phase 3 컨셉](./docs/PHASE-3-CONCEPT.md)·[설계](./docs/PHASE-3-DESIGN.md) 참조.

| # | TASK | 의도 (1-line) | milestone |
|---|------|---------------|-----------|
| 1 | TASK-166 | **P3-M1** — 계약 + hosted_service registry + context-path 할당 (migration 0009) | P3-M1 |
| 2 | TASK-167 | **P3-M2** — Ingress adapter (배포=호스팅 upsert, APP_BASE_PATH) | P3-M2 |
| 3 | TASK-168 | **P3-M3** — 관리 라이프사이클 (kubectl scale/delete + admin UI /admin/hosting) | P3-M3 |
| 4 | TASK-169 | **P3-M4** — sub-path (stripPrefix override, migration 0010, 예제 앱 + 가이드) | P3-M4 |
| 5 | TASK-170 | **P3-M5** — 실 e2e (kind+ingress-nginx 라우팅 + 관리) → **Phase 3 완료** | P3-M5 |

### 2.1 제품 영향 (운영자 주목)

**호스팅 능력이 생겼다.** 빌드된 이미지가 k8s 에 Deployment+Service+**Ingress** 로 배포돼 `host/<context-path>/` 로 접근된다. `POST /builds` 가 `contextPath`(URL prefix, 미지정 시 appName 정규화·전역 유일)·`runtimePort`·`stripPrefix` 를 받고, 배포 성공 시 build-server 가 `HostedService` 를 upsert 한다(`HOSTING_BASE_HOST` 설정 시 — opt-in). 배포 = 호스팅으로 일원화.

**관리된다.** `GET/POST/DELETE /admin/hosted-services`(+ UI `/admin/hosting`)로 목록·중지(scale 0)·재개(scale 1)·제거(delete + context-path 반환). 관리 kubectl 은 **build-server 가 직접 shell-out**(runner=배포 생성, build-server=수명 관리).

**sub-path 규약.** 앱은 주입된 `APP_BASE_PATH=/<context-path>/` 를 읽어 emit URL 에 prefix 를 붙인다(`stripPrefix=true` 기본). base-path-aware 서버는 `stripPrefix=false`(pass-through). 절대경로 하드코딩 앱은 미지원 — [sub-path 가이드](./docs/operations/hosting-sub-path-2026-07-24.md) 참조.

세부 운영: [호스팅 종합](./docs/operations/hosting-2026-07-24.md), [sub-path](./docs/operations/hosting-sub-path-2026-07-24.md), [k8s 배포/webhook](./docs/operations/k8s-deploy-webhook-2026-07-24.md).

### 2.2 검증

회귀 baseline(전 green, Phase 2 대비 후퇴 없음): frontend vitest **279** / build-server **198** / runner go **8 pkg** / skill_mcp **225** / TS 5 packages clean / migration **0001~0010** / 계약 e2e 13 + k8s e2e + **호스팅 e2e**(`apps/runner/scripts/e2e-hosting.sh`: 실 path 라우팅 + APP_BASE_PATH 자산 로드 + stop/remove 관리, kind v0.24.0 + kubectl v1.31.4 + ingress-nginx) **ALL PASS**.

Phase 3 완료 판정([PHASE-3-CONCEPT §9](./docs/PHASE-3-CONCEPT.md)) 5항 전부 충족.

### 2.3 Breaking / 마이그레이션

- **DB migration**: **0009**(hosted_service 테이블 + build_request context_path/runtime_port) + **0010**(build_request strip_prefix) 신규. 적용 필요.
- **API 계약(호환 확장)**: BuildRequest 에 optional `contextPath`/`runtimePort`/`stripPrefix` 추가(미지정 시 기본 동작 — 하위 호환). BuildSummary 에 `contextPath`/`runtimePort`/`stripPrefix`, DeploymentReportRequest 에 `contextPath`/`namespace`/`deploymentName` + targetType `K8S`, errorCode `CONTEXT_PATH_TAKEN` 추가. 신규 admin 엔드포인트 `/admin/hosted-services*`.
- **신규 env(선택)**: `HOSTING_BASE_HOST`(설정해야 호스팅 upsert 활성)/`HOSTING_KUBE_CONTEXT`/`HOSTING_KUBECTL_BIN`(build-server 관리). 전제: 클러스터에 ingress-nginx, runner/build-server 에 kubectl+kubeconfig.

## 18. v0.3.0 (2026-07-24) — Phase 2 완료 (preview-era 청산 → 배포 능력)

**Phase 2 (preview-era 청산 → 배포 능력 완성) 를 종결**하는 minor release. `v0.2.1` 이후의 코드 델타 = **TASK-156 ~ TASK-165**. 제품 목적 4단계(`build → container test → deploy → result delivery`)가 모두 1급 phase 로 존재하고 실인프라 e2e 로 검증된다. 컨셉/서사는 [Phase 2 컨셉](./docs/PHASE-2-CONCEPT.md) 참조.

| # | TASK | 의도 (1-line) | milestone |
|---|------|---------------|-----------|
| 1 | TASK-156 | e2e·visual CI/nightly 통합 (run-e2e-suite / run-visual-check / nightly-e2e.yml) | 사전 |
| 2 | TASK-157 | runner e2e hard assertion 화 — soft 단언이 가리던 결함 3건 수정 | 사전 |
| 3 | TASK-158 | **P2-M1** Step1 — phase 개명 PREVIEW_* → CONTAINER_TEST_* (컨테이너 테스트 1급화) | P2-M1 |
| 4 | TASK-159 | P2-M1 Step2 — legacy status 제거 (CLAIMED/TEST_READY, previewStatuses) | P2-M1 |
| 5 | TASK-160 | P2-M1 Step3 — legacy 응답 필드 + DB 컬럼 제거 (migration 0007) | P2-M1 |
| 6 | TASK-161 | **P2-M2** — 서버 정렬 + 컨테이너 테스트 엔드포인트 재설계 (previewUrl→runtimeUrl, migration 0008) | P2-M2 |
| 7 | TASK-162 | **P2-M3** — runner 정렬 + 실패 보고 경로 (errorCode 채널 신설) | P2-M3 |
| 8 | TASK-163 | **P2-M4** — 소비자 정렬 + skill_mcp 실서버 검증 (단위 green 결함 3건 검출) | P2-M4 |
| 9 | TASK-164 | 원격 발산 조정 + k8s adapter skeleton 이식 (merge -s ours) | P2-M5 사전 |
| 10 | TASK-165 | **P2-M5** — 배포 능력 = k8s(kubectl) + 결과 전달 = webhook → **Phase 2 완료** | P2-M5 |

### 2.1 제품 영향 (운영자 주목)

**외부 배포 능력이 생겼다 (k8s).** `RUNNER_K8S_MODE=k8s` 설정 시 runner 가 컨테이너 테스트를 통과한 이미지를 `kubectl`(manifest apply + rollout status)로 k8s 클러스터에 배포한다. client-go 가 아니라 기존 docker CLI shell-out 패턴과 일관된 kubectl shell-out. 미설정이면 기존 docker registry 배포만(하위 호환).

**결과 전달이 생겼다 (webhook).** `RESULT_WEBHOOK_URL` 설정 시 build 가 terminal(COMPLETED/FAILED)에 도달하면 build-server 가 canonical `BuildStatusResponse` 를 그 URL 로 POST 한다(NOTIFICATION). best-effort + idempotent. 미설정이면 기존 POLLING(조회) 유지.

**preview-era 어휘가 사라졌다.** phase/status/응답 필드/엔드포인트/DTO/skill 이름의 preview-era 잔재를 P2-M1~M4 에서 전량 청산. `previewUrl`→`runtimeUrl`, `PREVIEW_*` phase→`CONTAINER_TEST_*`, 엔드포인트 4종→2종(`/container-test/{start,result}`), 실패 이유 채널(errorCode) 신설.

**실패 빌드가 이유를 나른다.** 이전에는 모든 실패 빌드의 `lastError` 가 null 이었다(계약에 errorCode 채널 부재). P2-M3 에서 채널 신설 + 양 저장소 실기록. build-monitor 실패 이유 배너 활성.

세부 운영: [k8s 배포/webhook](./docs/operations/k8s-deploy-webhook-2026-07-24.md), [컨테이너 테스트 엔드포인트](./docs/operations/container-test-endpoints-2026-07-23.md), [빌드 실패 보고](./docs/operations/build-failure-reporting-2026-07-23.md), [skill_mcp 실서버 검증](./docs/operations/skill-mcp-live-verification-2026-07-23.md).

### 2.2 검증

회귀 baseline(전 green, Phase 1 대비 후퇴 없음): frontend vitest **275** / build-server **186** / runner go **8 pkg** / skill_mcp **225** / TS 5 packages clean / 계약 e2e **13종** + **k8s e2e 1종**(실 kind 배포 availableReplicas=1 + 실 webhook 수신, kind v0.24.0 + kubectl v1.31.4 ALL PASS) / migration **0001~0008**.

build phase **11 → 13** (result-delivery 2종 신설). Phase 2 완료 판정([PHASE-2-CONCEPT §9](./docs/PHASE-2-CONCEPT.md)) 4항 전부 충족.

### 2.3 Breaking / 마이그레이션

- **DB migration**: **0007**(legacy preview 컬럼 drop) + **0008**(preview_url → runtime_url rename) 신규. 적용 필요.
- **API 계약 breaking**: preview-era 표면 제거 — 엔드포인트 `POST /builds/:id/preview`·`.../test-deployment/*`·`GET .../test-deployment` 삭제, `/builds/:id/container-test/{start,result}` 로 대체. 응답 `previewUrl`→`runtimeUrl`, `previewStatus`/`previewTtlMinutes` 제거. phase `PREVIEW_QUEUED`/`PREVIEW_READY` → `CONTAINER_TEST_STARTED`/`CONTAINER_TEST_PASSED`. **외부 소비자 0 결정** 하에 하위 호환 없이 정리(runner·skill_mcp·build-monitor 동시 정렬).
- **신규 env(선택)**: `RUNNER_K8S_MODE`/`RUNNER_K8S_CLUSTER`/`RUNNER_K8S_NAMESPACE`/`RUNNER_K8S_MANIFEST`/`RUNNER_KUBECTL_BIN`/`RUNNER_K8S_CONTAINER_PORT`/`RUNNER_K8S_ROLLOUT_TIMEOUT_SECONDS`(k8s 배포), `RESULT_WEBHOOK_URL`(결과 전달). 전부 미설정 시 기존 동작.

## 19. v0.2.1 (2026-07-23) — Phase 1 후속 패치

`v0.2.0` 태깅 직후 **실이미지 빌드 e2e 를 처음 돌리면서** 드러난 결함들을 수정한 patch release. 코드 델타 = **TASK-153 ~ TASK-155** (5 commits).

| # | TASK | 의도 (1-line) | commit |
|---|------|---------------|--------|
| 1 | TASK-153 | build-monitor 이미지 빌드 회귀 수정 + 실이미지 e2e 검증 | `c170082` |
| 2 | TASK-154 | dual vite config 통일 + e2e 변종 전수 실행 (스크립트 결함 8건 + compose 포트) | `e0f2c81` |
| 3 | TASK-155 | **chunked 업로드 build 가 claim 되지 않던 제품 결함** 수정 + 회귀 가드 3건 | `f4e6010` |
| 4 | TASK-155 | multi-runner e2e 의 죽은 cleanup trap + flaky 분배 단언 수정 | `615c013` |
| 5 | — | TASK-154/155 봉인 + workflow meta sync | `dbe508c` |

### 2.1 제품 영향 (운영자 주목)

**`claimNextBuild` 의 source-gate 가 chunked 업로드를 인식하지 못했다.** TASK-080 의 게이트는 legacy 단일행 `build_source` 로 inner join 해 claim 자격을 판정하는데, TASK-106 의 chunked 업로드는 **첫 chunk 에서 그 legacy row 를 삭제**하고 `build_source_chunk` 에 기록한다. 그 결과 **chunked 경로로 소스를 올린 build 는 runner 가 영원히 claim 하지 못하고 QUEUED 로 정체**했다.

- 영향 범위: `POST /builds/:buildId/source/chunk` 로 소스를 업로드하는 모든 build. 단일 shot(`POST .../source`)은 영향 없음.
- 수정: 자격을 `(legacy row 존재) OR (chunk >= 1건 AND 누적 size >= 선언 total)` 로 확장 (postgres / memory 양쪽).
- 회귀 가드 3건 신규 → build-server **178 → 181**.

**루트 `Dockerfile` 의 build-monitor 빌드가 깨져 있었다** (TASK-153). `vite build`(config 미지정)가 확장자 우선순위로 Svelte 잔재 config 를 잡아 이미지 빌드가 실패했다. React 이관 후 실이미지 e2e 를 한 번도 안 돌려 `v0.2.0` 까지 잠복. → TASK-154 에서 단일 canonical `vite.config.ts` 로 통일해 구조적으로 재발 차단.

### 2.2 검증 — e2e 13/13 PASS

```
LOCAL    source-archive / -postgres / chunked / chunked-postgres / single-port      (5)
COMPOSE  production-semantic / -postgres / multi-runner / -postgres /
         -chunked-postgres / insecure-registry                                      (6)
RUNNER   container-run / deploy-push                                                (2)
```
실제 `docker build`(busybox+httpd) → `docker run` → preview HTTP 200 → 10 phase → container cleanup 경로 포함.

회귀 baseline: frontend vitest **277** / build-server **181** / runner go **8 pkg** / TS 5 packages clean / vite build 초기 index js gzip 134.64KB · css 24.08KB.

### 2.3 Breaking / 마이그레이션

- DB migration 변경 **0** (0001~0006 유지).
- API 계약 변경 **0**. claim 자격 확장은 **더 많은 build 가 claim 되는 방향**이라 기존 동작을 깨지 않는다.
- 빌드 명령 변경: `apps/build-monitor` 는 이제 플래그 없는 `vite` / `vite build` 를 쓴다(`--config vite.react.config.ts` 불필요). `vite.react.config.ts` / 루트 `index.html` / `svelte.config.js` 삭제됨.
- 신규 env(선택): `DIBS_POSTGRES_HOST_PORT` — 로컬 native PostgreSQL 이 5432 를 점유한 환경에서 compose postgres 호스트 포트를 바꿀 때 사용.

## 20. v0.2.0 (2026-07-22) — Phase 1 완료 baseline

본 release 는 **Phase 1 (초기 시스템 구축 국면) 을 종결**하는 baseline anchor 다. `v0.1.0` (tagged `53adb75`) 이후의 코드 델타 = **TASK-124 ~ TASK-152** 를 한 자리에 누적한다. 전체 Phase 1 서사(백엔드 + runner + 프론트엔드 + 디자인 시스템 + 운영 가드)는 [Phase 1 회고](./docs/PHASE-1-RETROSPECTIVE.md) 참조.

> **주의**: React 19 프론트엔드 rewrite 자체(TASK-088~101)의 *코드* 는 이미 `v0.1.0` tagged commit 에 포함돼 있었으나, `v0.1.0` CHANGELOG 는 narrative 를 source archive 작업(TASK-102~114)으로 한정하고 version bump 를 유보했다(옵션 A). `v0.2.0` 는 그 유보분 + 이후 Astryx 정식 도입/가드/계약 경화를 **버전 경계로 확정**한다.

### 2.1 변경 요약 (TASK 그룹)

| 그룹 | TASK | 의도 (1-line) |
|------|------|---------------|
| 환경/baseline 복구 | TASK-124 | PROJECT_PROFILE.md bulk sync 회귀 복구 (302 insertions 복원) |
| | TASK-125 | 로컬 개발 환경 셋업 + baseline 실측 정정 (신규 결함 3건 발견) |
| | TASK-126 | runner tar 절대경로 가드 크로스플랫폼 결함 (`filepath.IsAbs` → `path.IsAbs` 병용) |
| | TASK-127 | POST /builds 400 계약 복구 + 회귀 가드 8건 (164 → 172) |
| | TASK-128 | `scripts/db-migrate.sh` pnpm 실행 경로 복구 (6 게이트 실행 검증) |
| 서버-프론트 계약 경화 | TASK-129 | parseApiError envelope 계약 회귀 수정 (frontend 130 → 133) |
| | TASK-130 | shared-contract 에러 응답 스키마 도입 (컴파일 타임 계약 고정) |
| | TASK-151 | 진단-필드 응답 helper 흡수 (`errorBody`/`notFoundBody`, 28곳 envelope 일관) |
| 운영 가드 2계층 | TASK-131 | 문서 무결성 가드 (히스토리 166 쌍 오탐 0, 미발견 사고 2호 발견·복구) |
| | TASK-133 | 테마별 시각 회귀 가드 (2계층 + AA 위반 11건 전수 해소) |
| | TASK-145 | 라우트 CSS 전역 유출 감사 (Astryx 버튼 배경 복구 + lint) |
| | TASK-146 | 실측 CSS 유출 가드 스크립트화 (정적 lint + 실측 2층 완성) |
| | TASK-148 | B층 가드 오버레이(모달) 검사 확장 (`data-open-modal` 트리거 규약) |
| | TASK-149 | CI 통합 — 정적/실측 가드 분리 (PR=정적, nightly/main=실측) |
| UI 균형 + 레이아웃 셸 | TASK-132 | UI 균형 붕괴 수정 (Astryx 토큰 충돌 제거 + 레이아웃 셸 — 172 → 178) |
| Astryx 디자인 시스템 정식 도입 | TASK-134 | 도입 1단계 — 토큰 네임스페이스 `--dib-*` (토큰 충돌 4종 → 0종) |
| | TASK-135 | Astryx 0.1.4 → 0.1.7 업데이트 (peer stylex 명시 선언) |
| | TASK-136 | 도입 2단계 — 기반 구축 (`<Theme>` + `astryx.css` 재도입, 하이재킹 0) |
| | TASK-137 | 3-1 RegisterRunnerModal → `Dialog` 이관 |
| | TASK-138 | 3-2 BuildRequest 폼 → `TextInput`/`NumberInput` + 에러 필드 결속 |
| | TASK-139 | 라우트 지연 로드 (초기 로드 gzip 161.39 → 119.07KB) |
| | TASK-140 | 3-3 LogStream → `CodeBlock` (복사 버튼·줄번호) |
| | TASK-141 | 3-4 BuildsList → `Table` + StatusPill 배지 정책 (주의 상태만 배지) |
| | TASK-142 | 3-4b Admin 테이블 이관 + BuildRow 제거 (유령 헤더 결함 해소) |
| | TASK-143 | admin 라우트 통합 테스트 복원 (신규 15건) |
| | TASK-144 | 3-5 레이아웃 셸 → `AppShell` + `TopNav` (3단계 마지막 큰 이관) |
| | TASK-147 | Astryx reset.css 도입 검토 — 실측 결과 미도입 결정 (코드 변경 0) |
| 드리프트 수정 | TASK-150 | PhaseTimeline 9 → 11 phase drift 수정 (shared-contract `buildPhases` 직접 import) |
| 설계 문서 + 시각 QA | TASK-152 | `docs/DESIGN.md` v2 + build-monitor UI 시각 QA baseline (20 PNG) |

### 2.2 신규 운영 가이드 (v0.1.0 이후 6종)

| TASK | 운영 가이드 | anchor |
|------|-------------|--------|
| TASK-131 | `doc-integrity-guard-2026-07-21.md` | 문서 무결성 가드 (bulk sync 재발 방지) |
| TASK-133 | `theme-contrast-guard-2026-07-21.md` | 테마별 대비 2계층 가드 |
| TASK-148 | `b-layer-overlay-extension-2026-07-22.md` | B층 가드 오버레이(모달) 확장 |
| TASK-149 | `ci-integration-2026-07-22.md` | 정적/실측 가드 CI 분리 |
| TASK-152 | `build-monitor-ui-visual-2026-07-22.md` | UI 시각 QA baseline 절차 |
| (갱신) | `migration-cli-workflow-2026-07-20.md` | migration 운영 workflow (실행 경로 정정) |

누적 운영 가이드 **37종** (v0.1.0 32종 + 5종 신규).

## 21. v0.1.0 (2026-07-20) — 백엔드/운영 성숙도 baseline

`v0.1.0` 은 source archive scale-out + RFC 7233 Content-Range + Postgres 동등성 + e2e 를 봉인한 14 TASK (TASK-102~114 + TASK-122) 를 누적한다. 전체 상세는 [Release Notes 2026-07-20](./docs/RELEASE_NOTES-2026-07-20.md).

| # | TASK | 의도 (1-line) | commit |
|---|------|---------------|--------|
| 1 | TASK-102 | PROJECT_PROFILE §3 baseline 양축 동기화 (memory/Postgres) | `4ad57f2` |
| 2 | TASK-103 | migration standalone CLI 운영 workflow + `db-migrate.sh` | `7b74614` |
| 3 | TASK-104 | build_source SLO + TOAST follow-up 운영 가이드 | `d4fb554` |
| 4 | TASK-105 | 운영 배포 체크리스트 운영 가이드 (8 섹션) | `4de639c` |
| 5 | TASK-106 | source archive chunked split + multi-row schema (옵션 Y) | `fadddcf` |
| 6 | TASK-107 | RFC 7233 Content-Range chunked wire-format follow-up 권장 | `7c25a06` |
| 7 | TASK-108 | RFC 7233 wire-format 의미 C bipartite 완전 봉인 | `4e5161e` |
| 8 | TASK-109 | RFC 7233 `*` 케이스 (unknown total) dynamic boundary check | `0663785` |
| 9 | TASK-110 | STRICT_CONTENT_RANGE env flag strict 모드 | `1105a8e` |
| 10 | TASK-111 | Production-semantic Postgres backend 동등 보강 (8 단계) | `3369d0a` |
| 11 | TASK-112 | 양 variant 운영 가이드 cross-reference | `81110df` |
| 12 | TASK-113 | chunked multi-runner cross-backend 회귀 가드 (7 단계) | `7e9f777` |
| 13 | TASK-114 | 종합 RELEASE_NOTES + 운영 가이드 인덱스 (10 섹션) | `d19038a` |
| 14 | TASK-122 | untracked 52종 잔재 정리 (.gitignore 보강) | `53adb75` |

## 22. 회귀 baseline 종합 (TASK-088 → v0.8.9)

Phase 1 회귀 baseline 은 TASK-088 (React + Astryx 부트스트랩 PoC, 2026-07-08) 대비 누적 변화:

| 항목 | TASK-088 baseline | v0.2.1 | v0.3.0 | v0.4.0 | **v0.5.0** | delta(088→0.5.0) |
|------|-------------------|--------|--------|--------|-----------|-------|
| vitest (build-monitor) | 7 | 277 | 275 | 279 | **279** | +272 |
| build-server (node:test) | 113 | 181 | 186 | 198 | **199** | +86 |
| runner (`go test ./...`) | 7 pkg | 8 pkg | 8 pkg | 8 pkg | **8 pkg** | +1 |
| skill_mcp (pytest) | — | 226 | 225 | 225 | **225** | — |
| TS `tsc --noEmit` (5 pkg) | clean | clean | clean | clean | **clean** | 0 |
| build phase (canonical) | — | 11 | 13 | 13 | **13** | +2 |
| postgres migration | 0001 | 0001~0006 | 0001~0008 | 0001~0010 | **0001~0011** | +10 |
| e2e scripts | 0 | 13종 | 13종+k8s | +호스팅(path) | **+호스팅(path·subdomain)** | — |
| 운영 가이드 | 0 | 37 | 42 | 45 | **45** | +45 |
| 운영 가드 (정적/실측) | 0 | 4종 | 4종 | 4종 | **4종** | +4 |

> **TASK-153 (2026-07-23, post-tag 패치)**: `e2e-production-semantic.sh` 실이미지 빌드 e2e 를 검증하다가 루트 `Dockerfile` 이 build-monitor 를 `vite build`(config 미지정)로 빌드해 Svelte 잔재 config 를 잡던 회귀를 발견·수정 (`--config vite.react.config.ts` + `.dockerignore` 보강). 수정 후 실제 `docker build`/`docker run` 10 phase **ALL PASS**. v0.2.1 후보.

> **v0.2.0 초기 번들**: index js gzip 134.64 KB (AppShell 셸 + Astryx atomic 포함) / css gzip 24.08 KB. 라우트 지연 로드(TASK-139)로 BuildDetail(gzip 38.53) / buildColumns(9.85) / RegisterRunnerModal(5.74) 등은 필요 시 로드. 손 CSS 2,323 → 1,956줄.

## 23. follow-up 후보

| # | 후보 | scope | reference |
|---|------|-------|-----------|
| 1 | 사후 알림 자동화 (nightly 실패 → Issue / Slack) | CI 운영 | TASK-149 §6 |
| 2 | visual baseline CI 통합 (nightly-visual + PNG 외부 LFS 정책) | 시각 회귀 자동화 | TASK-152 §6 |
| 3 | 옵션 Z 외부 object storage (S3 / MinIO) | source archive scale-out | TASK-104 §5 |
| 4 | 신규 기능 추가 | (미정) | Phase 2 |
| 5 | Nextcloud Tasks 통합 | (미정) | Phase 2 |
| 6 | CI migration validation | GitHub Actions + `db-migrate.sh` | TASK-103 follow-up |
| 7 | git tag 다음 version (v0.2.1 / v0.3.0) | (후속) | Phase 2 |
| 8 | **e2e·visual baseline 의 CI/nightly 통합 (최우선)** | 회귀 재발 방지 | TASK-153/155 follow-up |

> **TASK-154/155 (2026-07-23, post-tag 패치)**: dual vite config 통일(TASK-153 회귀의 구조적 원인 제거) + e2e 변종 **13/13 전수 PASS**. 그 과정에서 제품 결함 1건 발견·수정 — `claimNextBuild` 의 source-gate 가 legacy `build_source` 로만 판정해 **chunked 로 업로드된 build 가 영원히 claim 되지 않던** 결함(회귀 가드 3건, build-server 178→181). 실이미지 빌드 경로와 chunked claim 둘 다 "e2e 를 안 돌리면 잠복한다"가 실증돼 §6-8 이 최우선 후보가 됐다. v0.2.1 후보.

> ~~실이미지 빌드 e2e 검증~~ — **TASK-153 (2026-07-23) 에서 해소** (Dockerfile 회귀 수정 + `e2e-production-semantic.sh` ALL PASS).

## 24. 다음 release 가이드

- `v0.8.10` — patch (회귀 baseline 변경 0 + 운영 가이드/CI 소폭)
- `v0.9.0` — minor (신규 기능 표면 큼: k8s adapter 확장 잔여 — Helm·ArgoCD adapter / webhook 확장(Slack·재시도) / 실 k8s e2e sync 캐시 실측). **HTTPS/TLS 는 도입하지 않음(범위 밖).**
- `v1.0.0` — major (breaking change 또는 정식 GA)

운영자 release staging 검증 순서(5 phase)는 [`docs/operations/release-checklist-2026-07-20.md`](./docs/operations/release-checklist-2026-07-20.md) 참조.

## 25. 관련 문서

- [Phase 1 회고](./docs/PHASE-1-RETROSPECTIVE.md) — Phase 1 전체 범위·성과·회귀 baseline·미결·교훈
- [Release Notes 2026-07-22](./docs/RELEASE_NOTES-2026-07-22.md) — v0.2.0 종합 리뷰
- [Release Notes 2026-07-20](./docs/RELEASE_NOTES-2026-07-20.md) — v0.1.0 종합 리뷰
- [Project Profile](./docs/PROJECT_PROFILE.md) — 프로젝트 개요 + 기본 명령 + 검증 포인트
- [Work Backlog](./ai-workflow/memory/active/work_backlog.md) — 전체 TASK 인덱스
- [Session Handoff](./ai-workflow/memory/active/session_handoff.md) — 세션 인계
