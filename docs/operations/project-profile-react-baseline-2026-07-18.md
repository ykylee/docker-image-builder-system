# Project Profile React Baseline Sync (TASK-101 follow-up)

- 작성일: 2026-07-18
- TASK: TASK-101 follow-up — `docs/PROJECT_PROFILE.md` React baseline 동기화
- 시리즈: frontend rewrite 7-PR + M4.5 8-PR 시리즈 + 디자인 토큰 단일화 (TASK-096.5) 후속

## 의도

frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 8-PR 시리즈 (TASK-095~101) + 디자인 토큰 단일화 (TASK-096.5) 까지 16 TASK 연속 봉인 완료. 본 TASK 는 `docs/PROJECT_PROFILE.md` 의 §3 frontend 관련 섹션이 Svelte 측 baseline 으로 작성되어 있어 React 측 baseline 으로 동기화.

## 변경 (1 file / +20 / -20)

### 수정 1

- `docs/PROJECT_PROFILE.md` — §3 명령의 TASK-075 reverse proxy 섹션 (`BUILD_MONITOR_DIST_PATH` → `BUILD_MONITOR_REACT_DIST_PATH`), §3.2 Admin 엔드포인트 (Svelte `Header` + `<AdminTabs />` + svelte-spa-router → React `Header` + `AdminTabs` + react-router-dom NavLink), §3.3 Build Monitor UI 정합 (TASK-083 Svelte FilterChips → TASK-095/096/096.5 React Header / ThemeToggle / FilterChips / StatusPill + 디자인 토큰 단일화), §3.4 Admin 가드 deep link UX (Svelte `AdminAccessDenied.svelte` + `lib/admin-guard.ts` → React `AdminAccessDenied.tsx` + `lib/admin-guard.ts`), §3.12 React 빌드 mount 운영 패턴 (TASK-093+094 → TASK-093+094+100+101).

## 핵심 정합 사항

### §3.2 Admin 엔드포인트

- **변경 전 (TASK-076/077 baseline)**: Svelte `Header.svelte` + `<AdminTabs />` (svelte-spa-router `$location` store 구독) + `localStorage` `userId` 키.
- **변경 후 (TASK-097/098 baseline)**: React `Header.tsx` + `AdminTabs.tsx` (react-router-dom NavLink) + `adminAllowListStore` (Zustand) + `useUserId` hook. 비-admin user deep link 시 React `AdminAccessDenied.tsx` 패널 노출 (TASK-084 frontend 가드).

### §3.3 Build Monitor UI 정합

- **변경 전 (TASK-083 baseline)**: Svelte `FilterChips.svelte` (status filter chip 디자인 단일 source) + raw rgba 잔재 4건의 `--shadow-glow` 디자인 토큰 정렬.
- **변경 후 (TASK-095/096/096.5 baseline)**: React `FilterChips.tsx` + `Header.tsx` + `ThemeToggle.tsx` + `StatusPill.tsx` (12 canonical + 2 legacy + RunnerStatus 상태 매핑 + Svelte baseline 정합). 디자인 토큰 단일화 — Svelte `tokens.css` 가 단일 source-of-truth. React 측 `tokens.css` 사본 + Astryx Theme 컴포넌트 보호용 `theme.css` 별도 layer 분리.

### §3.4 Admin 가드 deep link UX

- **변경 전 (TASK-084 baseline)**: Svelte `lib/admin-guard.ts` + `AdminAccessDenied.svelte` + Svelte test 14건.
- **변경 후 (TASK-084 + TASK-097 baseline)**: React `lib/admin-guard.ts` + `AdminAccessDenied.tsx` + RTL test 9건 (TASK-097 + TASK-098 통합).

### §3.12 React 빌드 mount 운영 패턴

- **변경 전 (TASK-093+094 baseline)**: React 빌드 mount + Svelte legacy mount + `BuildDetailRedirect.svelte` 신규 진입점.
- **변경 후 (TASK-093+094+100+101 baseline)**: React 빌드 mount 만 활성. Svelte legacy mount + `BuildDetailRedirect.svelte` + Svelte src/ 디렉터리 전체 + Svelte package dep 일괄 폐기. React 단일 SPA 운영.

## 사전 결함 + 보강 1건

1. **§3 의 React baseline 누락** — frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 8-PR 시리즈 (TASK-095~101) + 디자인 토큰 단일화 (TASK-096.5) 가 모두 main 합류되었으나 `docs/PROJECT_PROFILE.md` 의 §3 frontend 관련 섹션이 Svelte 측 baseline 으로 작성되어 있어 운영자 / 신규 개발자 onboarding 시 잘못된 정보 제공 위험. **해결**: 본 TASK 에서 4 섹션 (§3.2 / §3.3 / §3.4 / §3.12) React baseline 동기화. 회귀 baseline 도 TASK-101 baseline (vitest 130/130) 으로 갱신.

## 회귀 baseline (변경 없음)

- TS 5 packages `tsc --noEmit` clean
- build-monitor vitest **130/130 PASS**
- vite build:react 정상 — gzip js **99.01KB** / css **30.62KB**
- main HEAD `2fb7c0d` (workflow meta sync 회수)

## follow-up

- **PROJECT_PROFILE §3.5~§3.11** (Backend / Runner 측 TASK-073~077 + e2e-multi-runner) 는 frontend rewrite 와 무관 — 그대로 유지. 추후 Backend / Runner 측 TASK 추가 시 별도 동기화.
- **PROJECT_PROFILE §1 (프로젝트 개요) / §2 (문서 구조) / §4 (검증 포인트) / §5 (예외 규칙)** 은 본 TASK 범위 외 — 일반적인 운영 baseline 이라 정합성 회복 불필요.

## 관련 문서

- `docs/PROJECT_PROFILE.md` (본 TASK amend)
- `docs/operations/svelte-scaffold-cleanup-2026-07-18.md` (TASK-101 선행 가이드)
- `docs/operations/app-router-simplify-2026-07-18.md` (TASK-100 선행 가이드)
- `docs/operations/design-tokens-unification-2026-07-18.md` (TASK-096.5 디자인 토큰 단일화)
- `docs/operations/admin-pages-react-2026-07-08.md` (TASK-098 Admin 4종 React)
- `docs/operations/admin-entry-react-2026-07-08.md` (TASK-097 Admin 진입점 React)"
