# Admin Pages React (TASK-098)

- 작성일: 2026-07-08
- TASK: TASK-098 M4.5 Group D (Admin 페이지 4종 React 마이그레이션)
- 시리즈: frontend rewrite 후속 M4.5 4단계

## 의도

frontend rewrite 시리즈 후속 M4.5 4단계. Svelte 측 admin pages 4종 (AdminBuilds / AdminUsers / AdminAdmins / AdminRunners) 의 React 측 신규 추가. App.tsx 의 admin routes 4종이 React 측 pages 로 교체 — Svelte 측 admin pages 는 그대로 유지 (TASK-101 Group G 에서 일괄 정리).

## 변경 사항

### 신규 9종

- `react/src/routes/AdminBuilds.tsx` + `.css` — `/admin/builds`. Svelte `AdminBuilds.svelte` 1:1 정합. Tabs + FilterChips + owner filter + BuildRow.
- `react/src/routes/AdminUsers.tsx` + `.css` — `/admin/users`. Tabs + user rollup + Show builds inline expansion (BuildRow 컴포넌트).
- `react/src/routes/AdminAdmins.tsx` + `.css` — `/admin/admins`. Tabs + admin allow-list 추가/제거 (Zustand `useAdminAllowListStore` 정합).
- `react/src/routes/AdminRunners.tsx` + `.css` — `/admin/runners`. Tabs + FilterChips + Register Runner + runner registry + DELETE.
- `react/src/components/RegisterRunnerModal.tsx` + `.css` — admin UI 의 Register Runner modal. POST /admin/runners. TASK-077 의 pre-registration UX.

### 수정 2종

- `react/src/App.tsx` — 4 admin routes 추가 (`/admin/builds` / `/admin/users` / `/admin/admins` / `/admin/runners`). Svelte 측 admin pages 는 그대로 유지 (TASK-101 에서 일괄 정리).
- `react/src/lib/api.ts` — admin endpoint helpers 추가:
  - `listAdminBuilds` (callerId, params)
  - `listAdminUsers` (callerId)
  - `listAdminRunners` (callerId)
  - `enableAdminRunner` (callerId, runnerId)
  - `disableAdminRunner` (callerId, runnerId)
  - `deleteAdminRunner` (callerId, runnerId)
  - `AdminUserBuildSummary` / `AdminListBuildsResponse` / `AdminUserListResponse` / `RunnerStatus` / `AdminRunner` / `AdminRunnerListResponse` 타입 export
  - `apiSend` 의 method union 에 PATCH 추가

## Svelte 측 정합

TASK-098 의 scope 는 React 측 admin pages 4종 신규 + App.tsx routes 교체. Svelte 측 admin pages (AdminBuilds.svelte / AdminUsers.svelte / AdminAdmins.svelte / AdminRunners.svelte) 는 그대로 유지:

- Svelte 측 svelte-spa-router Routes 는 별도 빌드 (TASK-093 의 mount 구조) — cross-framework 충돌 없음
- React 측 `Routes` 가 `/admin/*` 를 먼저 매치 → React 측 pages 렌더
- Svelte 측 admin pages 의 svelte-spa-router 의 Routes 는 Svelte 빌드에만 mount 되므로 React 측 빌드에 영향 없음
- TASK-101 (Group G) 에서 Svelte 측 admin pages 일괄 정리 + svelte-spa-router 의 Routes 정리

## 디자인 토큰 baseline 정렬 (TASK-096 정합)

본 TASK 의 admin pages 4종 + RegisterRunnerModal 모두 Svelte baseline 디자인 토큰 사용:

- `--color-bg-surface` / `--color-bg-canvas` / `--color-bg-surface-elevated`
- `--color-text-primary` / `--color-text-secondary` / `--color-text-muted`
- `--color-accent-primary` / `--color-accent-primary-hover` / `--color-accent-danger`
- `--color-border-subtle` / `--color-border-strong`
- `--radius-md` / `--radius-lg` / `--radius-pill`
- `--shadow-card` / `--shadow-modal` / `--shadow-glow`
- `--size-xs` / `--size-sm` / `--size-md` / `--size-xxl`
- `--space-xs` / `--space-sm` / `--space-md` / `--space-lg` / `--space-xl` / `--space-xxl`
- `--motion-duration-fast` / `--motion-duration-slow`
- `--motion-easing-standard`

## 사전 결함 + 보강

1. **`setStatus` (status toggle) 미구현** — 본 TASK 의 scope 에서 단순화. Svelte 의 disable/enable toggle UI 는 본 PR 에서 React port 안 함. Delete 만 지원. follow-up 에서 PATCH helper 추가 + UI 보강.
2. **createAdminRunner inline 호출** — `api.POST("/admin/runners", ...)` 직접 호출. TASK-099 follow-up 에서 `createAdminRunner` helper 분리.
3. **admin-guard 의 useUserId store 비동기성** — `useUserId()` 의 `callerId` 가 null 인 경우 early return. React `useUserId` 가 Svelte `userIdStore` 와 의미상 동등.
4. **Tab + 페이지 rendering 의 cross-framework 순서** — React 측 routes 가 매치되면 React 측 component 만 mount. Svelte 측은 본 TASK 의 변경 없음.

## 회귀 baseline

- TS 5 packages clean
- build-monitor vitest **244/244 PASS** (page level 통합 test 는 다음 TASK 에서 일괄 — TASK-097 의 admin-guard + adminAllowListStore unit test 가 이미 보강됨)
- svelte-check 0/1 (TASK-077 baseline 무해)
- build-server tests 동일 (영향 0)
- vite build:react 정상 — gzip js **95.14KB** / css **29.44KB** (TASK-097 baseline 91.04KB → +4.10KB admin 4 page + RegisterRunnerModal)
- vite build svelte 정상 (영향 0)

## M4.5 Group 시리즈 진행 상황

| Group | TASK | 상태 |
|---|---|---|
| A | TASK-095 Header / ThemeToggle / FilterChips | ✅ |
| B | TASK-096 StatusPill 디자인 토큰 | ✅ |
| C | TASK-097 Admin 진입점 (Tabs + AccessDenied + guard) | ✅ |
| **D** | **TASK-098 Admin 페이지 4종** | ✅ 본 TASK |
| E | TASK-099 Build / API 페이지 | 🔄 |
| F | TASK-100 App.svelte router 단순화 | pending |
| G | TASK-101 NotFound + Svelte scaffold 일괄 정리 | pending |

## Follow-up

- **TASK-099** Group E (BuildRequest + ApiConsole React 마이그레이션)
- **TASK-100** Group F (App.svelte 의 svelte-spa-router router 일괄 폐기)
- **TASK-101** Group G (Svelte 측 admin pages + components/routes 일괄 삭제 + svelte / svelte-spa-router package 정리)
- 디자인 토큰 단일화 (TASK-096.5 / M4.6)
- React 측 admin pages 의 page level 통합 test (RTL + MemoryRouter + mock)
- createAdminRunner helper 분리 + setStatus UI 보강
