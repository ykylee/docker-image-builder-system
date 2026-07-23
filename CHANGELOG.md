# Changelog

- 문서 목적: 본 프로젝트의 release version 별 누적 변경 + 운영 가이드 인덱스 + 회귀 baseline 종합
- 범위: SemVer 정책, version 별 TASK 1-line 요약, 운영 가이드 인덱스, 회귀 baseline, follow-up 후보
- 대상 독자: 운영자, release reviewer, AI agent, 프로젝트 온보딩 담당자
- 상태: stable (TASK-123 신규 / v0.2.0 갱신)
- 최종 수정일: 2026-07-22
- 관련 문서: [Phase 1 회고](./docs/PHASE-1-RETROSPECTIVE.md), [Release Notes 2026-07-22](./docs/RELEASE_NOTES-2026-07-22.md), [Release Notes 2026-07-20](./docs/RELEASE_NOTES-2026-07-20.md), [Project Profile](./docs/PROJECT_PROFILE.md)

## 1. Release model

본 프로젝트는 **SemVer (Semantic Versioning)** 정책을 따르며 단일 release stream (main branch only) 으로 운영합니다.

- **MAJOR.MINOR.PATCH** — `v0.2.0` 형식
- **현재 release**: `v0.2.0` (2026-07-22, **Phase 1 완료 baseline**)
- **release history**:
  - `v0.2.0` (2026-07-22) — Phase 1 완료 baseline. React 19 + Astryx 프론트엔드 정식 도입 + 운영 가드 2계층 + 서버-프론트 계약 경화.
  - `v0.1.0` (2026-07-20, `53adb75`) — 백엔드/운영 성숙도 baseline. source archive scale-out + RFC 7233 + Postgres 동등성 + e2e.
- **5 package.json 통일 정책**: `apps/build-server` / `apps/build-monitor` / `packages/shared-contract` / `packages/shared-config` / `packages/db` 의 version field 가 모두 동일하게 유지되어야 함. `apps/runner` 는 Go module 이라 version field 없이 git tag 로 버전 관리. 본 release 시점 5/5 `0.2.0` 으로 통일.
- **release staging anchor**: 각 version 의 tagged commit 이 운영 환경의 release staging 의 단일 anchor.
- **standard_ai_workflow kit 의 version (`ai-workflow/workflow_kit/pyproject.toml`) 은 별도 stream** — 본 저장소가 의존하는 표준 워크플로우 키트의 자체 versioning 이며 본 프로젝트 release 와 무관 (TASK-121 정책).

## 2. v0.2.0 (2026-07-22) — Phase 1 완료 baseline

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

## 3. v0.1.0 (2026-07-20) — 백엔드/운영 성숙도 baseline

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

## 4. 회귀 baseline 종합 (TASK-088 → v0.2.0)

Phase 1 회귀 baseline 은 TASK-088 (React + Astryx 부트스트랩 PoC, 2026-07-08) 대비 누적 변화:

| 항목 | TASK-088 baseline | v0.1.0 | **v0.2.0** | delta (088→020) |
|------|-------------------|--------|-----------|-------|
| vitest (build-monitor) | 7 | 130 | **277** | +270 |
| build-server (node:test) | 113 | 164 | **178** | +65 |
| runner (`go test ./...`) | 7 pkg | 7 pkg | **8 pkg** | +1 |
| TS `tsc --noEmit` (5 pkg) | clean | clean | **clean** | 0 |
| vite build:react (gzip js, 초기 index) | n/a | 99.01 KB | **134.64 KB** | — |
| vite build:react (gzip css, 초기 index) | n/a | 30.62 KB | **24.08 KB** | — |
| postgres migration | 0001 | 0001~0006 | **0001~0006** | +5 |
| e2e scripts | 0 | 9 | **9** | +9 |
| 운영 가이드 | 0 | 32 | **37** | +37 |
| 운영 가드 (정적/실측) | 0 | 0 | **4종** (문서 무결성 / 대비 2계층 / CSS 유출 2계층 / 시각 QA) | +4 |

> **v0.2.0 초기 번들**: index js gzip 134.64 KB (AppShell 셸 + Astryx atomic 포함) / css gzip 24.08 KB. 라우트 지연 로드(TASK-139)로 BuildDetail(gzip 38.53) / buildColumns(9.85) / RegisterRunnerModal(5.74) 등은 필요 시 로드. 손 CSS 2,323 → 1,956줄.

## 5. follow-up 후보 (Phase 2 진입 대기)

| # | 후보 | scope | reference |
|---|------|-------|-----------|
| 1 | 사후 알림 자동화 (nightly 실패 → Issue / Slack) | CI 운영 | TASK-149 §6 |
| 2 | visual baseline CI 통합 (nightly-visual + PNG 외부 LFS 정책) | 시각 회귀 자동화 | TASK-152 §6 |
| 3 | 옵션 Z 외부 object storage (S3 / MinIO) | source archive scale-out | TASK-104 §5 |
| 4 | 신규 기능 추가 | (미정) | Phase 2 |
| 5 | Nextcloud Tasks 통합 | (미정) | Phase 2 |
| 6 | CI migration validation | GitHub Actions + `db-migrate.sh` | TASK-103 follow-up |
| 7 | git tag 다음 version (v0.2.1 / v0.3.0) | (후속) | Phase 2 |

## 6. 다음 release 가이드

- `v0.2.1` — patch (회귀 baseline 변경 0 + 운영 가이드 신규 1~2 종)
- `v0.3.0` — minor (Phase 2 신규 기능 / 외부 스토리지 / 알림 자동화 등 변경 표면 큼)
- `v1.0.0` — major (breaking change 또는 정식 GA; 실이미지 빌드 e2e 미검증 등 미결 존재로 진입 전)

운영자 release staging 검증 순서(5 phase)는 [`docs/operations/release-checklist-2026-07-20.md`](./docs/operations/release-checklist-2026-07-20.md) 참조.

## 7. 관련 문서

- [Phase 1 회고](./docs/PHASE-1-RETROSPECTIVE.md) — Phase 1 전체 범위·성과·회귀 baseline·미결·교훈
- [Release Notes 2026-07-22](./docs/RELEASE_NOTES-2026-07-22.md) — v0.2.0 종합 리뷰
- [Release Notes 2026-07-20](./docs/RELEASE_NOTES-2026-07-20.md) — v0.1.0 종합 리뷰
- [Project Profile](./docs/PROJECT_PROFILE.md) — 프로젝트 개요 + 기본 명령 + 검증 포인트
- [Work Backlog](./ai-workflow/memory/active/work_backlog.md) — 전체 TASK 인덱스
- [Session Handoff](./ai-workflow/memory/active/session_handoff.md) — 세션 인계
