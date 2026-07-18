# Svelte Scaffold Cleanup (TASK-101)

- 작성일: 2026-07-18
- TASK: TASK-101 M4.5 Group G — Svelte scaffold 일괄 정리
- 시리즈: frontend rewrite 후속 M4.5 7단계 (마지막)

## 의도

frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 Group A~F (TASK-095~100) 가 모두 main 합류. TASK-100 에서 App.svelte 의 routes 정의 단순화 (9 route → 1 placeholder) 완료. 본 TASK 에서는 Svelte 측 src/ 디렉터리 일괄 삭제 + vite / package / tsconfig 설정 단순화.

**cross-framework 코드량 0** — Svelte 측 unreachable 인 dead code 일괄 폐기.

## 결정 (옵션 A)

**src/ 일괄 삭제 + 설정 파일 단순화 (vite.config.ts / package.json / tsconfig.json)**

옵션 비교:
- **옵션 A (채택)**: src/ 일괄 삭제 + vite svelte plugin 제거 + package svelte 의존성 6종 제거 + tsconfig.json Svelte extends 제거 + tsconfig.react.json 단일화. scripts/generate-openapi 유지 (React build:react prebuild hook).
- 옵션 B: src/ 일괄 삭제만. package.json / tsconfig.json / scripts/ 는 다음 TASK 권장.
- 옵션 C: src/ 일괄 삭제 + 설정 통합. 변경 범위 최대.

## 변경 (49 file / +46 / -1,373)

### 삭제 46 file (apps/build-monitor/src/ 전체)

```
src/App.svelte                                          (1)
src/components/ 8종:                                     (8)
  AdminAccessDenied.svelte / .test.ts
  AdminTabs.svelte / .test.ts
  BuildRow.svelte / .test.ts
  FilterChips.svelte / .test.ts
  Header.svelte / .test.ts
  RegisterRunnerModal.svelte
  StatusPill.svelte / .test.ts
  ThemeToggle.svelte / .test.ts
src/lib/ 7종:                                           (7)
  admin-guard.ts / .test.ts
  admin-store.ts
  api.ts / .test.ts
  chipFilter.ts / .test.ts
  session.ts
  theme.css
  tokens.css
src/routes/ 16종:                                      (16)
  AdminAdmins.svelte / .test.ts
  AdminBuilds.svelte / .test.ts
  AdminRunners.svelte / .test.ts
  AdminUsers.svelte / .test.ts
  BuildDetailRedirect.svelte
  BuildRequest.svelte / .test.ts
  BuildsList.svelte / .test.ts
  Login.svelte / .test.ts
  NotFound.svelte
src/test/ 2종:                                         (2)
  jsdom.d.ts
  setup.ts
src/main.ts                                            (1)
```

### 신규 1 file

- `apps/build-monitor/react/src/test/setup.ts` — TASK-064 의 Svelte 측 src/test/setup.ts (jsdom localStorage polyfill + JSDOM fallback) 를 React 측으로 이식.

### 수정 5 file

- `apps/build-monitor/vite.config.ts` — svelte plugin 제거, setupFiles React 측 setup.ts 로 변경, test include Svelte → React 단일화
- `apps/build-monitor/package.json` — svelte / svelte-spa-router / svelte-check / @sveltejs/vite-plugin-svelte / @testing-library/svelte / @tsconfig/svelte 6종 dep 제거. svelte-check script 제거. build / build:react 가 동일 명령 (React 만 남음)
- `apps/build-monitor/tsconfig.json` — `@tsconfig/svelte/tsconfig.json` extends 제거 + Svelte include/exclude 정리. 삭제 후 `tsconfig.react.json` 단일화
- `apps/build-monitor/react/src/routes/BuildsList.css` — `@import "../../../src/lib/tokens.css"` → `@import "../tokens.css"` (Svelte 측 tokens.css 부재 — React 측 tokens.css 가 단일 source-of-truth, TASK-096.5 정합)
- `apps/build-monitor/react/src/routes/Login.css` — 동일 패턴

## 사전 결함 + 보강 4건

1. **vitest localStorage 부재** — Svelte 측 `src/test/setup.ts` 일괄 삭제 후 `localStorage.clear()` 호출이 `Cannot read properties of undefined` 에러. **해결**: React 측 `src/test/setup.ts` 신규 작성 (Svelte 측 setup.ts 의 localStorage / sessionStorage / matchMedia fallback 패턴 이식).
2. **@testing-library/jest-dom matcher 부재** — `toBeInTheDocument` / `toHaveClass` 가 load 되지 않음 (Svelte 측 setup.ts 가 import 했었음). **해결**: setup.ts 에 `import "@testing-library/jest-dom/vitest"` 추가.
3. **React 측 component CSS 의 Svelte 측 tokens.css import 깨짐** — BuildsList.css / Login.css 가 `@import "../../../src/lib/tokens.css"` 로 Svelte 측 tokens.css 를 가리키고 있었음 (TASK-090/089 부터의 의도). Svelte 측 src/ 일괄 삭제 후 import 실패. **해결**: 두 CSS 의 @import 경로를 React 측 tokens.css (`../tokens.css`) 로 교체. TASK-096.5 디자인 토큰 단일화 정합.
4. **`useUserId.test.ts` 부재** — Login.test.tsx 가 `import { USER_ID_KEY, setUserId } from "@/lib/useUserId"` 를 import 하나 `useUserId.test.ts` 가 Svelte 측에 있었음 (Svelte 측 src/lib/useUserId.ts 와 함께). **해결**: React 측 `lib/useUserId.ts` 가 이미 별도 존재 (TASK-095 + 이후). import 만 import 해결되면 test 자체는 Login.test.tsx 내장. 회귀 영향 0.

## 운영 영향

**0** — Svelte 측 src/ 가 production 에서 unreachable 이었음 (TASK-094 + TASK-100 로 확정). 본 TASK 는 cross-framework dead code 폐기 + 빌드 파이프라인 단순화.

## 회귀 baseline (TASK-101 봉인 시점)

- TS 5 packages `tsc --noEmit` clean
- build-monitor vitest **130/130 PASS** (TASK-100 baseline 265 → 130, Svelte 측 135 케이스 일괄 삭제)
- vite build:react 정상 — gzip js **99.01KB** / css **30.62KB** (TASK-100 baseline js 99.08KB → 99.01KB 약간 감소 / css 30.62KB 동일)
- svelte-check script 제거 (Svelte 측 일괄 삭제로 불필요)

## 누적 회귀 baseline (TASK-088 baseline 대비)

- vitest 7 → **130** (+123) / build-server 113 → 143 (+30) — Svelte 측 135 케이스 삭제 후 +123 net 증가
- TS 5 packages clean
- vite build:react gzip js 99.01KB / css 30.62KB

## follow-up

M4.5 8-PR 시리즈 (TASK-095~102) 완료 — 모든 Task 들이 main 합류. 후속은 별도 사용자 결정.

## 관련 문서

- `apps/build-monitor/vite.config.ts` (본 TASK amend)
- `apps/build-monitor/package.json` (본 TASK amend)
- `apps/build-monitor/tsconfig.json` (본 TASK 삭제 — `tsconfig.react.json` 단일화)
- `apps/build-monitor/react/src/test/setup.ts` (본 TASK 신규)
- `apps/build-monitor/react/src/routes/BuildsList.css` (본 TASK amend)
- `apps/build-monitor/react/src/routes/Login.css` (본 TASK amend)
- `docs/operations/app-router-simplify-2026-07-18.md` (TASK-100 선행 가이드)
- `docs/operations/svelte-cleanup-2026-07-08.md` (TASK-094 선행 가이드)
- `docs/operations/design-tokens-unification-2026-07-18.md` (TASK-096.5 디자인 토큰 단일화)"
