# Changelog

- 문서 목적: 본 프로젝트의 release version 별 누적 변경 + 운영 가이드 인덱스 + 회귀 baseline 종합
- 범위: SemVer 정책, version 별 TASK 1-line 요약, 운영 가이드 인덱스, 회귀 baseline, follow-up 후보
- 대상 독자: 운영자, release reviewer, AI agent, 프로젝트 온보딩 담당자
- 상태: stable (TASK-123 신규)
- 최종 수정일: 2026-07-20
- 관련 문서: [Release Notes 2026-07-20](./docs/RELEASE_NOTES-2026-07-20.md), [Project Profile](./docs/PROJECT_PROFILE.md)

## 1. Release model

본 프로젝트는 **SemVer (Semantic Versioning)** 정책을 따르며 단일 release stream (main branch only) 으로 운영합니다.

- **MAJOR.MINOR.PATCH** — `v0.1.0` 형식
- **현재 release**: `v0.1.0` (2026-07-20, main HEAD `53adb75` — TASK-122 sync commit)
- **5 package.json 통일 정책**: `apps/build-server` / `apps/build-monitor` / `apps/runner` (Go module) / `packages/shared-contract` / `packages/shared-config` / `packages/db` 의 version field 가 모두 동일하게 유지되어야 함. 본 release 시점 5/5 `0.1.0` 으로 통일.
- **release staging anchor**: 각 version 의 tagged commit 이 운영 환경의 release staging 의 단일 anchor. 운영 가이드 인덱스 (§3) + 회귀 baseline 종합 (§4) + follow-up 후보 (§5) 가 한 자리에 정합.
- **standard_ai_workflow kit 의 version (`ai-workflow/workflow_kit/pyproject.toml`) 은 별도 stream** — 본 저장소가 의존하는 표준 워크플로우 키트의 자체 versioning 이며 본 프로젝트 release 와 무관 (TASK-121 정책).

## 2. v0.1.0 (2026-07-20) — 본 세션 13 TASK

본 release 는 본 세션 (2026-07-20) 의 단일 작업 흐름에서 봉인한 13 TASK (TASK-102~114) + TASK-122 working tree clean 보존을 한 자리에 누적합니다.

| # | TASK | 의도 (1-line) | commit |
|---|------|---------------|--------|
| 1 | TASK-102 | PROJECT_PROFILE §3 baseline 양축 동기화 (memory/Postgres) | `4ad57f2` |
| 2 | TASK-103 | scripts/migrate.ts standalone CLI 운영 workflow + scripts/db-migrate.sh 권고 스크립트 | `7b74614` |
| 3 | TASK-104 | build_source SLO + TOAST follow-up 운영 가이드 | `d4fb554` |
| 4 | TASK-105 | 운영 배포 체크리스트 운영 가이드 (8 섹션) | `4de639c` |
| 5 | TASK-106 | source archive chunked split + multi-row schema (옵션 Y) | `fadddcf` |
| 6 | TASK-107 | RFC 7233 Content-Range chunked wire-format follow-up 권장 | `7c25a06` |
| 7 | TASK-108 | RFC 7233 Content-Range chunked wire-format 의미 C bipartite 완전 봉인 | `4e5161e` |
| 8 | TASK-109 | RFC 7233 `*` 케이스 (unknown total) dynamic boundary check | `0663785` |
| 9 | TASK-110 | STRICT_CONTENT_RANGE env flag 의 운영적 strict 모드 | `1105a8e` |
| 10 | TASK-111 | Production-semantic Postgres backend 동등 보강 (8 단계) | `3369d0a` |
| 11 | TASK-112 | 양 variant 운영 가이드 cross-reference (memory + postgres) | `81110df` |
| 12 | TASK-113 | chunked multi-runner cross-backend 회귀 가드 (7 단계) | `7e9f777` |
| 13 | TASK-114 | 본 세션 종합 RELEASE_NOTES + 운영 가이드 인덱스 (10 섹션) | `d19038a` |
| 14 | TASK-122 | untracked 52종 잔재 정리 (.gitignore 보강) | `53adb75` |

> **standard_ai_workflow kit 의 v0.15.19-beta / v0.15.20-beta 배포 (TASK-117~121) 는 본 release 에 미포함** — 표준 워크플로우 키트의 자체 versioning 이며 본 저장소가 의존하는 meta layer 입니다. 본 release 의 영향 표면은 `apps/` + `packages/` + `docs/` + `scripts/` + `compose.*` + `.gitignore` 한정입니다.

## 3. 신규 운영 가이드 인덱스 (32 종)

본 release 까지 누적된 운영 가이드 32 종 (기존 21 종 + 본 세션 신규 11 종). 각 운영 가이드는 `docs/operations/<name>.md` 경로.

### 3.1 본 세션 신규 (11 종)

| TASK | 운영 가이드 | anchor |
|------|-------------|--------|
| TASK-102 | `project-profile-baseline-postgres-sync-2026-07-20.md` | §3 baseline 양축 동기화 |
| TASK-103 | `migration-cli-workflow-2026-07-20.md` | §3 migration 운영 workflow + 6 게이트 |
| TASK-104 | `build-source-toast-strategy-2026-07-20.md` | §3.5 SLO + TOAST follow-up |
| TASK-105 | `release-checklist-2026-07-20.md` | §5 운영 배포 체크리스트 8 섹션 |
| TASK-106 | `source-archive-chunked-2026-07-20.md` | §3 source archive chunked split |
| TASK-108 | `content-range-rfc-7233-2026-07-20.md` | §3 wire-format 의미 C bipartite |
| TASK-109 | `content-range-rfc-7233-star-2026-07-20.md` | §3 `*` 케이스 dynamic boundary |
| TASK-110 | `content-range-rfc-7233-strict-mode-2026-07-20.md` | §3 strict 모드 rollout playbook |
| TASK-111 | `production-semantic-postgres-2026-07-20.md` | §3.5 production-semantic postgres variant |
| TASK-112 | `production-semantic-2026-07-07.md` (TASK-085 memory variant 정합) | §3.5 production-semantic memory variant cross-ref |
| TASK-113 | `multi-runner-chunked-postgres-2026-07-20.md` | §3.6 chunked + strict cross-backend 회귀 |

### 3.2 기존 운영 가이드 (21 종)

본 release 이전 (2026-07-04 ~ 2026-07-18) 의 운영 가이드 21 종. 자세한 목록은 [docs/RELEASE_NOTES-2026-07-20.md §5](./docs/RELEASE_NOTES-2026-07-20.md) 운영 가이드 32 종 인덱스 참조.

## 4. 회귀 baseline 종합 (TASK-088 baseline 대비)

본 release 의 회귀 baseline 은 TASK-088 (React + Astryx 부트스트랩 PoC, 2026-07-08) 의 baseline 대비 누적 변화:

| 항목 | TASK-088 baseline | v0.1.0 | delta |
|------|-------------------|--------|-------|
| vitest (build-monitor) | 7 | 130 | +123 |
| build-server (node:test) | 113 | 165 | +52 |
| TS packages `tsc --noEmit` | clean | clean | 0 |
| Go packages (`go test ./...`) | 7+ | 7+ | 0 |
| vite build:react (gzip js) | n/a | 99.01 KB | n/a |
| vite build:react (gzip css) | n/a | 30.62 KB | n/a |
| postgres migration 적용 | 0001 | 0001~0006 | +5 |
| e2e scripts | 0 | 7 (ALL PASS) | +7 |
| 운영 가이드 | 0 | 32 | +32 |

**7 종 e2e ALL PASS (v0.1.0 시점)**:
1. `e2e-source-archive.sh` (memory backend)
2. `e2e-source-archive-postgres.sh` (postgres backend)
3. `e2e-source-archive-chunked.sh` (memory chunked)
4. `e2e-source-archive-chunked-postgres.sh` (postgres chunked)
5. `e2e-multi-runner-postgres.sh` (TASK-082)
6. `e2e-production-semantic.sh` (memory)
7. `e2e-production-semantic-postgres.sh` (postgres, TASK-111)
8. `e2e-multi-runner-chunked-postgres.sh` (TASK-113)
9. `e2e-single-port.sh` (TASK-075)

## 5. follow-up 후보 (TASK-114 6종 중 미봉인 5종)

본 release 에서 미봉인된 follow-up 후보. 각 후보는 본 release 의 운영자 release staging 검증 후 자연스럽게 발견되는 후속 결정.

| # | 후보 | scope | reference |
|---|------|-------|-----------|
| ~~4~~ | ~~CHANGELOG / release notes 후속~~ | ~~본 TASK 봉인~~ | **본 TASK-123** |
| 1 | 옵션 Z 외부 object storage (S3 / MinIO) | source archive scale-out | TASK-104 §5 |
| 2 | 신규 기능 추가 | (미정) | TASK-114 follow-up |
| 3 | Nextcloud Tasks 통합 | (미정) | TASK-114 follow-up |
| 5 | CI migration validation | GitHub Actions + db-migrate.sh | TASK-103 follow-up |
| 6 | git tag 다음 version (v0.2.0 / v0.1.1) | (후속) | TASK-105 운영 후 권장 |

## 6. 결정 옵션 비교 (A 채택)

본 release 의 version 선택 옵션 비교:

- **A. v0.1.0 release staging baseline 동기화 (채택)** — 본 세션 13 TASK 의 운영자 release staging anchor. CHANGELOG.md + tag + 운영 가이드 anchor 갱신. 5 package.json 모두 이미 `0.1.0` 통일 → version bump 변경 0.
- **B. v0.2.0** — frontend rewrite 7-PR (TASK-088~094) + M4.5 8-PR (TASK-095~101) + 디자인 토큰 단일화 (TASK-096.5) + TASK-102~114 의 source archive scale-out 모두 반영. 본 세션에는 변경 표면 과다.
- **C. 보류** — 후속 결정 시 본 TASK 진입.

## 7. 다음 release 가이드

본 release (`v0.1.0`) 의 후속 결정 (TASK-114 follow-up 5종) 중 사용자가 선택한 축으로 다음 release 진입 권장:

- 본 release 의 운영자 release staging 검증 (§6 의 운영 rollout playbook 5 phase) 완료 후 후속 TASK 시작
- 다음 version 후보:
  - `v0.1.1` — patch (회귀 baseline 변경 0 + 운영 가이드 신규 1~2 종)
  - `v0.2.0` — minor (frontend rewrite / M4.5 / source archive scale-out 등 변경 표면 큼)
  - `v1.0.0` — major (breaking change 포함; 본 프로젝트는 아직 진입 전)

## 8. 운영자 release staging 운영 가이드

본 release 의 운영자 검증 순서는 [`docs/RELEASE_NOTES-2026-07-20.md` §6](./docs/RELEASE_NOTES-2026-07-20.md) 의 5 phase 검증 순서를 따릅니다:

1. **Pre-deploy**: git log / git status / state.json 동기성 / 4 packages TS / Go build / db-migrate.sh --plan
2. **Deploy**: build-server 4 packages TS + Vite build + Go build + compose/k8s 배포 + applyMigrations 자동 부팅
3. **Verify**: 7 종 회귀 가드 (health / OpenAPI / React SPA + admin + API / e2e 4 종 / db-migrate.sh --status)
4. **Post-deploy Monitoring**: lifecycle_status 분포 + runner ACTIVE + source archive bytea round-trip + 24h 신규 build FAILED 비율
5. **DR / Rollback**: 직전 commit (이전 tag) checkout + 재부팅 + 회귀 baseline 재검증 + workflow meta sync

자세한 절차는 [`docs/operations/release-checklist-2026-07-20.md`](./docs/operations/release-checklist-2026-07-20.md) 참조.

## 9. 관련 문서

- [Release Notes 2026-07-20](./docs/RELEASE_NOTES-2026-07-20.md) — 본 세션 13 TASK 종합 리뷰 + 운영 가이드 인덱스 + follow-up 후보
- [Project Profile](./docs/PROJECT_PROFILE.md) — 프로젝트 개요 + 기본 명령 + 검증 포인트
- [Release Checklist](./docs/operations/release-checklist-2026-07-20.md) — 운영자 release staging 운영 가이드
- [Work Backlog](./ai-workflow/memory/active/work_backlog.md) — 전체 TASK 인덱스
- [Session Handoff](./ai-workflow/memory/active/session_handoff.md) — 세션 인계
