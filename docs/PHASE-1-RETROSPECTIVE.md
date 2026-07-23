# Phase 1 회고 — 초기 시스템 구축 국면 (v0.2.0 baseline)

- 문서 목적: Docker Image Builder System 의 **Phase 1 (초기 시스템 구축)** 을 종결하며 전체 범위·성과·회귀 baseline·미결·교훈을 한 자리에 정리한다. Phase 2 진입의 단일 기준선.
- 범위: TASK-001 ~ TASK-152 누적 (백엔드 + runner + 프론트엔드 + 디자인 시스템 + 운영 가드)
- 대상 독자: 프로젝트 온보딩 담당자, 운영자, AI agent, Phase 2 설계자
- 상태: stable
- 최종 수정일: 2026-07-22
- release anchor: **v0.2.0** (2026-07-22, Phase 1 완료 baseline)
- 관련 문서: [CHANGELOG](../CHANGELOG.md), [Release Notes 2026-07-22](./RELEASE_NOTES-2026-07-22.md), [Project Profile](./PROJECT_PROFILE.md), [DESIGN.md](./DESIGN.md)

## 1. Phase 1 정의

**Phase 1 = 초기 시스템 구축 국면.** 외부 사용자 또는 AI 에이전트가 전달한 앱 산출물을 빌드 서버가 받아 Docker build → 컨테이너 테스트 → 배포 → 결과 전달까지 자동화하는 플랫폼의 **작동하는 초기 시스템 + 운영 문서 + 회귀 가드 자산**을 확보하는 것이 목표였다.

두 개의 릴리스 anchor 로 나뉜다:

| anchor | 시점 | 성격 | 핵심 |
|--------|------|------|------|
| `v0.1.0` | 2026-07-20 | 백엔드/운영 성숙도 baseline | source archive scale-out + RFC 7233 Content-Range + Postgres 동등성 + e2e 9종 + 운영 가이드 32종 |
| **`v0.2.0`** | **2026-07-22** | **Phase 1 완료 baseline** | React 19 + Astryx 프론트엔드 정식 도입 + 운영 가드 2계층 + 서버-프론트 계약 컴파일 타임 고정 + 시각 QA baseline |

## 2. 시스템 아키텍처 (Phase 1 종료 시점)

모노레포 3-앱 + 3-패키지 구조:

```
apps/
  build-server/   Node/TS (Fastify) — 빌드 요청 intake / 영속화 / 조회 API / SPA 서빙
  runner/         Go — 실제 Docker build / 컨테이너 테스트 / 배포 실행
  build-monitor/  React 19 + Astryx — 운영 모니터링 SPA (단일 포트 서빙)
packages/
  shared-contract/  서버-프론트 공유 계약 (Zod 스키마 + OpenAPI 생성 타입)
  shared-config/    공유 설정
  db/               Postgres 스키마 / migration (0001~0006)
```

- **백엔드**: Fastify 기반 build-server. `POST /builds` intake → phase lifecycle (11 phase) → runner claim → source archive (chunked, RFC 7233 Content-Range) → 결과. 저장 백엔드 2종 (memory / Postgres) **동등성 보장**.
- **runner**: Go. `RUNNER_DOCKER_BUILD_MODE` 기본 `skeleton` (단위 테스트는 Docker 없이 통과). tar 절대경로 가드 등 보안 검증.
- **프론트엔드**: React 19 + react-router-dom v7 + Zustand + openapi-fetch. Astryx 디자인 시스템 정식 도입 (토큰 네임스페이스 `--dib-*`, `<Theme>` + astryx.css, 컴포넌트 Dialog/TextInput/CodeBlock/Table/AppShell). 단일 포트로 build-server 가 빌드된 SPA 서빙.
- **계약**: shared-contract 가 서버-프론트 계약을 **컴파일 타임에 고정** — 에러 응답 스키마 + envelope 일관 (`validationErrorBody`/`errorBody`/`notFoundBody`).

## 3. 주요 성과 (마일스톤)

### 3.1 백엔드 / 영속화 / API (v0.1.0 이전 ~ v0.1.0)

- build-server intake / 영속화 / 조회 API 3-tier (PKG-002/003/004).
- source archive **chunked split + multi-row schema** (대용량 산출물 분할 저장).
- **RFC 7233 Content-Range** 준수 — bipartite 의미 봉인 + `*` (unknown total) dynamic boundary + `STRICT_CONTENT_RANGE` strict 모드.
- **memory / Postgres 백엔드 동등성** — production-semantic 양 variant + cross-backend 회귀 가드.
- migration standalone CLI + `db-migrate.sh` 6 게이트 운영 workflow.

### 3.2 프론트엔드 Svelte 5 → React 19 전면 이관 (TASK-088~101)

- Login / BuildsList / BuildDetail / BuildRequest / ApiConsole / Admin 4종 전 라우트 React 마이그레이션.
- lib layer (Zustand store 분리) + build-server dist swap (단일 포트 서빙).
- Svelte scaffold 일괄 정리 — 스택 완전 교체.

### 3.3 Astryx 디자인 시스템 정식 도입 (TASK-132~152)

- **UI 균형 붕괴 수정** (TASK-132) — Astryx 토큰 충돌(동명 토큰 3종 하이재킹, 다크 모드 대비 1.16:1 비가시) 제거 + 레이아웃 셸 도입.
- **토큰 네임스페이스 `--dib-*`** (TASK-134) — 충돌 4종 → 0종. Astryx 0.1.7 업데이트 + `<Theme>` + astryx.css 기반 재구축.
- **컴포넌트 3단계 이관** — Dialog(RegisterRunnerModal) / TextInput·NumberInput(BuildRequest) / CodeBlock(LogStream) / Table(BuildsList+Admin) / AppShell+TopNav(레이아웃 셸) + StatusPill 배지 정책(주의 상태만 배지).
- **라우트 지연 로드** (TASK-139) — 초기 로드 gzip 161.39 → 119.07KB.
- **DESIGN.md v2 + 시각 QA baseline** (TASK-152) — 서술 SSOT + 픽셀 실측 20 PNG.

### 3.4 운영 가드 자산 (2계층 방어)

Phase 1 의 핵심 자산은 "회귀를 구조적으로 잡는 가드" 4종:

| 가드 | TASK | 방어 대상 |
|------|------|-----------|
| 문서 무결성 가드 | TASK-131 | bulk sync 가 문서를 템플릿 빈칸으로 덮는 회귀 (급격한 축소 + placeholder 회귀 두 신호) |
| 테마별 대비 2계층 가드 | TASK-133 | 다크/라이트 대비비 AA 위반 (정적 lint + 실측) |
| CSS 유출 2계층 가드 | TASK-145/146/148 | 라우트 CSS 전역 유출 (bare selector 가 Astryx atomic 을 덮음) + 오버레이(모달) 확장 |
| 시각 QA baseline | TASK-152 | 픽셀 단위 시각 회귀 (light/dark × 라우트 diff) |

+ **서버-프론트 계약 컴파일 타임 고정** (TASK-130/151) — 에러 응답 스키마 위반이 TS 컴파일에서 잡힘.
+ **CI 분리** (TASK-149) — PR=정적 가드 / nightly·main=실측 가드.

## 4. 회귀 baseline 종합 (v0.2.0 실측)

2026-07-22 실측 (전 스위트 green):

| 항목 | 값 | 비고 |
|------|-----|------|
| build-monitor vitest | **277 PASS** (25 files) | React + Astryx 이관 특성화 테스트 누적 |
| build-server node:test | **178 PASS** (42 suites) | 계약/회귀 가드 포함 |
| runner `go test ./...` | **8 pkg PASS** | config/contract/deploy/docker/hostclient/services/source/worker |
| TS `tsc --noEmit` | **5 packages clean** | shared-contract/shared-config/db/build-server + build-monitor react |
| vite build (초기 index) | js gzip **134.64 KB** / css gzip **24.08 KB** | AppShell 셸 + Astryx atomic 포함 |
| lazy chunks | BuildDetail 38.53 / buildColumns 9.85 / RegisterRunnerModal 5.74 (gzip) | 라우트 지연 로드 |
| postgres migration | **0001~0006** | 9 테이블 |
| e2e scripts | **9종** | Docker 환경에서 실행 (본 로컬은 Docker 미설치) |
| 손 CSS | **1,956줄** | Astryx 이관으로 2,323 → 1,956 |

## 5. 미결 / Phase 2 진입 후보

Phase 1 baseline 위에서 자연스럽게 이어질 후속:

1. **사후 알림 자동화** — nightly 가드 실패 → Issue / Slack (TASK-149 후속).
2. **visual baseline CI 통합** — nightly-visual 워크플로 + baseline PNG 외부 LFS/저장소 동기화 정책 선행 결정 (TASK-152 후속).
3. **옵션 Z 외부 object storage** (S3 / MinIO) — source archive scale-out.
4. **신규 기능 추가** — (미정, Phase 2 축).
5. **Nextcloud Tasks 통합** — (미정).
6. **CI migration validation** — GitHub Actions + `db-migrate.sh`.
7. **실이미지 빌드 e2e 검증** — 현재 runner `RUNNER_DOCKER_BUILD_MODE=skeleton` 기본이라 실제 Docker build 는 미검증. Docker 환경에서 compose.dev.*.yaml 기반 e2e 11종 실행이 필요.

## 6. 교훈 (Phase 1 반복 패턴)

Phase 1 내내 반복적으로 재발한 실패 패턴 — Phase 2 에서 사전 차단 대상:

- **측정 오류 (반복)**: "엉뚱한 요소를 잡고 회귀로 단정" — span 부재 ≠ 색 부재 / 속성선택자는 암묵 role 을 못 잡음 / ghost variant 버튼(정상 투명)을 primary 로 오인 (TASK-140/141/147). **실측 시 대상 요소를 먼저 확정**하는 습관 필요.
- **regex 일괄 변환의 다중 동시 결함**: 한 번에 여러 곳을 바꾸는 regex 는 "어디서 매칭이 틀렸는지 추적 불가한 결함"을 동시에 만든다 (TASK-130/151). **read_file + search_replace 1:1** 이 안전.
- **양쪽 green 인데 계약은 아무도 검증 안 함**: build-server / frontend 가 각자 mock 으로 green 이어도 둘 사이 envelope 계약이 깨질 수 있다 (TASK-129). **계약을 컴파일 타임에 고정**(shared-contract)하는 것이 근본 해법.
- **크로스플랫폼 잠복 결함**: `path/filepath` 는 호스트 OS 규약을 따라 Linux CI 에선 green 이지만 Windows 에서 Unix 절대경로를 놓친다 (TASK-126). 슬래시 기반 판정엔 `path`.
- **bulk sync 가 문서를 덮어씀**: workflow kit sync 도구가 문서를 템플릿 스켈레톤으로 덮는 회귀가 12일 방치된 적 있음 (TASK-124/131). 저장소 자신이 보유한 무결성 가드로 방어.
- **디자인 시스템 토큰 하이재킹**: 외부 디자인 시스템이 동명 토큰을 재정의하고 문서 루트에 상속시키면 우리 토큰이 컴포넌트 위치에서 조용히 덮인다 (TASK-132). 네임스페이스 격리(`--dib-*`)가 근본 해법.

## 7. Phase 2 진입 기준선

- **코드 baseline**: v0.2.0 tagged commit. 전 스위트 green (§4).
- **문서 baseline**: CHANGELOG v0.2.0 + 본 회고 + RELEASE_NOTES-2026-07-22 + 운영 가이드 37종.
- **가드 baseline**: 4종 운영 가드 + 서버-프론트 계약 고정 + CI 분리.
- **워크플로 baseline**: `state.json` / `session_handoff.md` / `work_backlog.md` 에 Phase 1 종료 경계 기록.

Phase 2 는 위 baseline 을 회귀 없이 유지하면서 §5 후보 중 사용자가 선택한 축으로 진입한다.
