# Release Notes — v0.6.0 (2026-07-24)

- 문서 목적: `v0.6.0` (실패 경로 e2e) 의 종합 리뷰.
- 범위: `v0.5.1` 이후 TASK-173 코드 델타
- 대상 독자: 운영자, release reviewer, AI agent
- 상태: stable
- 최종 수정일: 2026-07-24
- 관련 문서: [CHANGELOG](../CHANGELOG.md), [Release Notes v0.5.1](./RELEASE_NOTES-v0.5.1-2026-07-24.md) [v0.5.0](./RELEASE_NOTES-v0.5.0-2026-07-24.md) [v0.4.0](./RELEASE_NOTES-v0.4.0-2026-07-24.md)

## 1. 요약

**빌드 실패 보고 경로를 실 인프라 e2e 로 처음 검증**한 minor release. `v0.5.1` 직전까지의 e2e 13종은 전부 happy path(`COMPLETED`) 만 실측했고, 빌드가 canonical 하게 `FAILED` + 단계별 errorCode 로 보고되는 경로(P2-M3 `stageFailure` 채널)는 단위 테스트만 있었다. 본 release 가 이 사각지대를 실 compose 왕복으로 메웠다.

- 코드 델타: **TASK-173** (e2e-failure-paths.sh 신설 + run-e2e-suite 스위트 등록)
- 5 package.json: `0.5.1` → **`0.6.0`**
- git tag: **`v0.6.0`**
- 회귀 baseline: build-server **199** (불변) / e2e **13→14종** (compose 편입 6→7종) / TS 5 clean
- **계약/스키마/마이그레이션 변경 0** — 테스트 자산만 추가

## 2. 무엇이 생겼나 — 실패 경로 e2e

기존 happy path 13종은 `phase=COMPLETED` + `status=COMPLETED` 단일 종착만 검증해서, 빌드 실패가 단일 채널(`errorCode`)로 정확히 보고되는지를 실 인프라에서 단언한 적이 없었다. 본 release 가 2 단계의 대표 실패 경로를 실 docker build + 컨테이너 실행으로 재현해 hard assert 한다.

- **신설 `apps/build-server/scripts/e2e-failure-paths.sh`** — 단일 compose 스택(`compose.dev.yaml` + `compose.dev.e2e-production.yaml`, `cli mode` 실 `docker build`) 재사용. 의도적 실패 build 2종을 순차 투입 후 `GET /builds/:id` 로 `status=FAILED` / `phase=FAILED` / `lastError.code` 를 hard assert.
  - **A) docker build 실패** — Dockerfile `RUN exit 1` → `DOCKER_BUILD_FAILED`. docker build 단계에서 fail-fast, image 미생성.
  - **B) 컨테이너 테스트 실패** — Dockerfile `CMD ["sleep","3600"]` 으로 이미지는 빌드되나 8080 미개방 → `CONTAINER_TEST_FAILED`. container test 단계에서 healthcheck 실패로 fail.
- **스위트 등록 `scripts/run-e2e-suite.sh`** — `COMPOSE_E2E` 배열에 편입(compose 6 → 7종, 총 13 → 14종). 고정 project name `dibs-fail-e2e-$$` 라 기존 잔재 정리 로직(`docker ps --filter name=dibs-`) 과 정합 — 직전 실패 런의 컨테이너/볼륨이 본 케이스에 영향 주지 않음.

## 3. 후속 patch

없음. 본 release 직후 `v0.6.0` → `v0.7.0` 으로 minor 가 직행.

## 4. 검증

| 스위트 | 결과 |
|--------|------|
| `e2e-failure-paths.sh` (로컬 실측) | **ALL PASS** — A `DOCKER_BUILD_FAILED` / B `CONTAINER_TEST_FAILED` 각각 status=FAILED·phase=FAILED·lastError.code 일치 |
| build-server `node --test` | **199 PASS** (불변) |
| `tsc --noEmit` × 5 packages | **clean** |
| postgres migration | **0001~0008** (변경 0) |
| run-e2e-suite (전체 14종) | **ALL PASS** (compose 7종 + local 5종 + runner 2종) |

## 5. 업그레이드 안내

- **DB/API 계약 변경 0**.
- **신규 스크립트** (CI/nightly 자동): `apps/build-server/scripts/e2e-failure-paths.sh` — 운영자가 신규 commit 에 의도적 실패 케이스 추가 시 동일 패턴으로 케이스 확장.
- **로컬 재현** — `docker` + `docker compose v2` 환경에서 `bash apps/build-server/scripts/e2e-failure-paths.sh` 단독 실행 가능. CI 가 nightly 에서 자동 검증.
- **Rollback** — `git checkout v0.5.1`. 신규 스크립트 1 종 미사용이며 build-server / frontend / runner / migration 모두 본 release 와 동일 — 롤백 시 별도 조치 불요.

## 6. follow-up (v0.7.0 후보)

- 호스팅 status 캐시 / k8s adapter 확장 / webhook 확장. ([CHANGELOG §8](../CHANGELOG.md))

## 7. 종합 release notes 정합

본 문서는 v0.8.6 (2026-07-25) patch 에서 사후 작성. v0.6.0 release commit(`845c7b7`) 와 TASK-173 commit(`4694123`) 의 본문을 종합 리뷰 형태로 정리. CHANGELOG release history v0.6.0 entry 에 본 문서 링크 추가.
