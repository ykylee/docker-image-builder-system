# App.svelte Router Simplify (TASK-100)

- 작성일: 2026-07-18
- TASK: TASK-100 M4.5 Group F — App.svelte router 단순화
- 시리즈: frontend rewrite 후속 M4.5 6단계

## 의도

frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 Group A~E (TASK-095~099) 가 모두 main 합류. 본 TASK 시점에는 **React 측이 primary SPA** 이고 Svelte 측 routes 는 unreachable 상태:

| Route | React 측 담당 | TASK | 비고 |
|---|---|---|---|
| `/` (Login) | Login.tsx | TASK-089 | React 마이그레이션 완료 |
| `/builds` | BuildsList.tsx | TASK-090 | React 마이그레이션 완료 |
| `/builds/:id` | BuildDetail.tsx | TASK-091 | React 마이그레이션 완료 + Build Server dist swap (TASK-093) |
| `/build-request` | BuildRequest.tsx | TASK-099 | React 마이그레이션 완료 (PR #54) |
| `/api-console` | ApiConsole.tsx | TASK-099 | React 마이그레이션 완료 (PR #54) |
| `/admin/builds` | AdminBuilds.tsx | TASK-098 | React 마이그레이션 완료 (PR #52) |
| `/admin/users` | AdminUsers.tsx | TASK-098 | React 마이그레이션 완료 (PR #52) |
| `/admin/admins` | AdminAdmins.tsx | TASK-098 | React 마이그레이션 완료 (PR #52) |
| `/admin/runners` | AdminRunners.tsx | TASK-098 | React 마이그레이션 완료 (PR #52) |

Build Server 의 `mountBuildMonitorDist` (apps/build-server/src/app/create-app.ts) 가 React dist (`apps/build-monitor/dist-react/`) 만 mount 하고 Svelte 빌드 산출물은 더 이상 정적 서빙되지 않음 (TASK-094 최종 단계). 따라서 본 Svelte App.svelte 의 routes 정의는 **운영 환경에서 unreachable** — TASK-101 Group G 에서 Svelte scaffold 일괄 정리 시 본 파일 자체가 삭제될 예정.

## 결정 (옵션 A)

**Svelte routes 일괄 삭제 + App.svelte 단순화 (1 file only)**

옵션 비교:
- **옵션 A (채택)**: App.svelte 의 routes 정의에서 미사용 9개 route 일괄 삭제, `*` (NotFound) 만 유지. svelte-spa-router 가 정상 동작하는 최소 routes 정의 보존.
- 옵션 B: Svelte 빌드 자체를 제거 (vite.config.ts, svelte plugin, tsconfig, package.json 정리). 변경 범위가 매우 커서 별도 TASK 권장.
- 옵션 C: BuildDetailRedirect 만 유지하여 운영자 UX 안전망 보존. React 측이 모든 routes 를 처리하므로 불필요.

## 변경 전후 비교

### 변경 전 (commit `17adad6`)

```svelte
const routes = {
  "/": Login,
  "/builds": BuildsList,
  "/builds/:buildId": BuildDetailRedirect,
  "/build-request": BuildRequest,
  "/api-console": ApiConsole,
  "/admin/builds": AdminBuilds,
  "/admin/users": AdminUsers,
  "/admin/admins": AdminAdmins,
  "/admin/runners": AdminRunners,
  "*": NotFound
};
```

10 route entries + 9 component imports + `<main>` wrapper.

### 변경 후

```svelte
const routes = {
  "*": NotFound
};
```

1 route entry + 1 component import + `<main>` wrapper. 운영 영향 0 (Svelte 측 routes unreachable), 코드 단순성 ↑.

## 핵심 변경 (1 file / -36 lines)

- `apps/build-monitor/src/App.svelte` amend — 9개 route + 9개 component import 제거, `*` (NotFound) 만 유지. 본 파일은 TASK-101 Group G 의 Svelte scaffold 일괄 정리 시 본 파일 자체가 삭제될 예정 (Svelte 빌드 폐기와 함께).

## 사전 결함 + 보강 1건

1. **cross-framework router 충돌 가능성 차단** — TASK-094 최종 단계 (Build Server 가 React dist 만 mount) 이후 Svelte 측 routes 가 unreachable 인 상태가 명확했으나 본 App.svelte 의 9 route 정의가 그대로 남아 dead code 였음. 본 TASK 에서 9 route 일괄 삭제 + 주석으로 "React 측이 primary SPA, 본 Svelte 측 routes 는 unreachable, TASK-101 에서 일괄 정리 예정" 명시.

## 회귀 baseline (TASK-100 봉인 시점)

- TS 5 packages `tsc --noEmit` clean
- build-monitor vitest **265/265 PASS** (TASK-099 baseline 동일)
- svelte-check **0 errors / 1 warning** (TASK-077 RegisterRunnerModal a11y baseline 무해)
- vite build:react 정상 — gzip js **99.08KB** / css **30.62KB** (TASK-099 baseline 동일)
- vite build svelte 정상 — gzip js **21.03KB** / css **2.01KB** (TASK-099 baseline js 36.90KB → **-15.87KB** / css 6.18KB → **-4.17KB**, Svelte 측 routes 10개 → 1개 단순화 효과 — 빌드 결과물 자체도 약 44% 감소)

## 운영 영향

**0** — 운영 환경은 React 측이 primary SPA 이고 Svelte 측 routes 는 unreachable. 본 TASK 는 코드 정리 / cross-framework 코드량 감소 차원의 가치.

## follow-up

- **TASK-101 Group G** (Svelte scaffold 일괄 정리 — Svelte 측 components / routes / lib / package.json 일괄 삭제 + vite Svelte plugin / tsconfig.json 통합 단일화)

## 관련 문서

- `apps/build-monitor/src/App.svelte` (본 TASK amend)
- `apps/build-server/src/app/create-app.ts` (TASK-094 Build Server React dist mount)
- `docs/operations/svelte-cleanup-2026-07-08.md` (TASK-094 선행 가이드)
- `docs/operations/single-port-react-2026-07-08.md` (TASK-093 선행 가이드)"