# Admin Entry React (TASK-097)

- 작성일: 2026-07-08
- TASK: TASK-097 M4.5 Group C (Admin 진입점 React 마이그레이션)
- 시리즈: frontend rewrite 후속 M4.5 3단계

## 의도

TASK-077 의 admin 진입점 패턴을 React 측으로 신규 추가. Header 가 admin 진입점을 단일 링크("🛡 Admin")로 정리한 뒤, 각 admin 페이지의 상단에 공통 탭 바 + deep link UX 권한 없음 패널을 React 측 신규 추가.

신규 추가 (React 측):

- `AdminTabs.tsx` + `.css` — react-router-dom v7 NavLink 로 4 섹션 (`/admin/builds` / `/admin/users` / `/admin/admins` / `/admin/runners`) 탭 네비게이션. active 표시 자동.
- `AdminAccessDenied.tsx` + `.css` — TASK-084 의 deep link UX — 비-admin user 가 `/admin/*` deep link 진입 시 친절한 권한 없음 패널. reason 별 (`NO_USER` / `FORBIDDEN` / `NOT_IN_ALLOW_LIST`) 메시지 + `Back to Builds` / `Switch user` 액션.
- `admin-guard.ts` — `ensureAdminAccess` helper 의 React + Zustand port. Svelte `admin-store.js` → React `useAdminAllowListStore`.

## Svelte 측 정합

TASK-097 의 scope 는 **React 측 신규 추가만**. Svelte 측의 다음은 그대로 유지:

- `apps/build-monitor/src/components/AdminTabs.svelte` + `.test.ts`
- `apps/build-monitor/src/components/AdminAccessDenied.svelte`
- `apps/build-monitor/src/lib/admin-guard.ts`

Svelte 측 admin pages (AdminBuilds / AdminUsers / AdminAdmins / AdminRunners) 는 Svelte 측 Tabs + AccessDenied 를 그대로 사용. **App.tsx 의 routes 도 변경하지 않음** — admin routes 의 페이지 본체는 TASK-098 (Group D) 에서 React 마이그레이션.

cross-framework 공존 상태:

- Svelte 측 admin pages → Svelte 측 AdminTabs / AdminAccessDenied 사용
- (TASK-098 후) React 측 admin pages → React 측 AdminTabs / AdminAccessDenied 사용
- 두 구현은 의미상 1:1 정합 (colorFor / reason union / aria-current / Back to Builds / Switch user 모두 동일)

## react-router-dom v7 NavLink 정합

Svelte `svelte-spa-router` 의 `use:link` + `$location` store + 수동 `aria-current` 적용 vs React `NavLink` 의 자동 `aria-current` + `className` callback:

```tsx
<NavLink
  to="/admin/builds"
  className={({ isActive }) => isActive ? "admin-tab active" : "admin-tab"}
  style={({ isActive }) => isActive ? activeTabStyle : baseTabStyle}
>
  Builds
</NavLink>
```

- `aria-current="page"` 자동 적용 (NavLink 기본 동작)
- `isActive` 로 active class 와 inline style 분기
- MemoryRouter 의 initialEntries 로 테스트 가능

## 사전 결함 + 보강

1. **AdminAccessDenied 의 `@yklee` 중복 매칭** — body message 와 code pill 양쪽에 등장. `getAllByText` 로 검증하거나 `within(code element)` 로 좁힘. 테스트 코드 정정.
2. **admin-guard 의 refresh error handling** — 403/401 만 FORBIDDEN 으로 처리, 그 외 (네트워크 / 5xx) 는 캐시 변경 없이 fallback. Svelte 와 동일 패턴.
3. **`useAdminAllowListStore.getState()` 의 호출 시점** — refresh 전후 store snapshot 이 다를 수 있어 두 번 호출 (refresh 전 check, refresh 후 check). Zustand `getState()` 가 안정적이라 안전.

## 회귀 baseline

- TS 5 packages clean
- build-monitor vitest **227 → 244 PASS** (신규 17: AdminTabs 6 + AdminAccessDenied 7 + admin-guard 4)
- svelte-check 0/1 (TASK-077 baseline 무해)
- build-server tests 동일 (영향 0)
- vite build:react 정상 — gzip js 91.04KB / css 28.10KB (TASK-096 baseline 유지)
- vite build svelte 정상 (영향 0)

## M4.5 Group 시리즈 진행 상황

| Group | TASK | 상태 |
|---|---|---|
| A | TASK-095 Header / ThemeToggle / FilterChips | ✅ |
| B | TASK-096 StatusPill 디자인 토큰 | ✅ |
| **C** | **TASK-097 Admin 진입점 (Tabs + AccessDenied + guard)** | ✅ 본 TASK |
| D | TASK-098 Admin 페이지 4종 | 🔄 |
| E | TASK-099 Build / API 페이지 | pending |
| F | TASK-100 App.svelte router 단순화 | pending |
| G | TASK-101 NotFound + Svelte scaffold 일괄 정리 | pending |

## Follow-up

- **TASK-098** Group D (AdminBuilds + AdminUsers + AdminAdmins + AdminRunners React 마이그레이션) — 본 TASK 의 React AdminTabs / AdminAccessDenied 가 실제 admin pages 에서 사용됨.
- 디자인 토큰 단일화 (TASK-096.5 / M4.6) — 후속 TASK
