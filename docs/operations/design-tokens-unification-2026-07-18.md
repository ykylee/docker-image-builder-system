# Design Tokens Unification (TASK-096.5 / M4.6)

- 작성일: 2026-07-18
- TASK: TASK-096.5 디자인 토큰 단일화 (M4.6)
- 시리즈: frontend rewrite 후속 M4.5 디자인 시스템 정합 봉인 (TASK-099/100/101 진입 전)

## 의도

frontend rewrite 시리즈 (TASK-088~094) + M4.5 Group A~D (TASK-095~098) 가 완료되어 React 측가 primary SPA 이지만 디자인 토큰이 두 시스템에 분산되어 있었음:

- **Svelte 측** (`apps/build-monitor/src/lib/tokens.css`) — 자체 디자인 토큰 시스템 (60+ 토큰, dark/light 모드, 운영 검증 완료 — TASK-046 follow-up, TASK-083, TASK-090 의 디자인 토큰 정렬).
- **React 측** (`apps/build-monitor/react/src/globals.css`) — Astryx Theme 컴포넌트의 StyleX CSS-in-JS cascade + 우리 토큰을 `var(--color-bg-canvas, transparent)` 같은 fallback 으로 cross-reference.

TASK-096 (StatusPill 디자인 토큰 baseline 정합) 은 component-level 보강에 그쳤고 디자인 시스템 자체 단일화는 본 TASK scope.

## 결정 (옵션 A' 채택)

**Svelte tokens.css 단일 source-of-truth + Astryx Theme 컴포넌트 보호용 layer 분리.**

옵션 비교:

- **옵션 A** (원래 결정): Svelte tokens.css 단일화 + Theme 컴포넌트 제거. **rejected** — Astryx Theme 컴포넌트가 자체 StyleX CSS-in-JS 로 `[data-astryx-theme="neutral"]` scope 의 token 을 inject 하므로 Theme 제거 시 향후 Astryx 컴포넌트 도입 시 default 스타일이 깨질 수 있음.
- **옵션 A'** (채택): Svelte tokens.css 가 단일 source-of-truth + Astryx Theme 컴포넌트는 유지하되 layer 분리. 우리 React 컴포넌트는 `var(--color-*)` 만 사용 — neutralTheme 영향 우회.
- **옵션 B** (rejected): 양쪽 디자인 시스템 병행 유지 — 장기 토큰 drift 위험.
- **옵션 C** (rejected): 통합 파일 추출 — 단일화 효과는 동일하나 파일 1개 더 만들지 않고 Svelte tokens.css 자체를 단일 source 로 채택.

## 변경 전후 비교

### 변경 전

```
main.tsx:
  import "@/globals.css";
  → globals.css 가 Astryx 3-layer @import + 우리 토큰 (placeholder fallback) 동시 보유

globals.css:
  @import "@astryxdesign/core/reset.css";
  @import "@astryxdesign/core/astryx.css";
  @import "@astryxdesign/theme-neutral/theme.css";

  #app-react {
    padding: var(--spacing-8, 32px);             /* Astryx 토큰 fallback */
    font-family: var(--font-family-sans, system-ui, ...);  /* Astryx 토큰 fallback */
    color: var(--color-text-primary, inherit);    /* 우리 토큰 fallback */
    background: var(--color-background-body, transparent);
  }
```

문제점: 우리 토큰이 `var(--color-text-primary, inherit)` 처럼 fallback 으로만 정의되어 Astryx theme-neutral 의 동일 이름 토큰 (`--color-text-primary`) 이 있으면 충돌 가능. 단일 source-of-truth 가 없음.

### 변경 후

```
main.tsx (CSS import 순서):
  import "@/tokens.css";     ← 우리 Svelte baseline (단일 source-of-truth)
  import "@/theme.css";      ← Astryx Theme 컴포넌트 보호용 (3-layer @import)
  import "@/globals.css";    ← 토큰 사용처의 base style (fallback 없음)

tokens.css (신규):
  Svelte tokens.css 의 60+ 토큰 + dark/light cascade 그대로 정의

theme.css (신규):
  Astryx Theme 컴포넌트 보호용 — 3-layer @import 만 보관
  우리 React 컴포넌트는 본 layer 의 token 사용 안 함

globals.css:
  #app-react {
    padding: var(--space-xxl);    /* 우리 토큰 직접 사용, fallback 없음 */
  }
```

개선점: 우리 토큰이 `:root` selector 에 단일 정의되어 specificity 우선. React 컴포넌트 CSS 가 `var(--color-*)` 만 사용하므로 Svelte 측과 의미상 1:1 정합. Astryx Theme 컴포넌트의 default 스타일은 layer 분리하여 보호.

## light/dark cascade 검증

| 단계 | 검증 항목 | 결과 |
|---|---|---|
| 1 | `tokens.css` 가 `main.tsx` 에서 globals.css 보다 먼저 import | ✅ |
| 2 | `:root[data-theme="light"]` selector 가 light 모드 정의 | ✅ |
| 3 | ThemeToggle 이 `document.documentElement.setAttribute('data-theme', 'light' \| null)` 적용 | ✅ (TASK-046 QA 정합) |
| 4 | React 측 css transition 이 light/dark 전환 시 bg/color 에 적용 | ✅ (`globals.css` 의 `transition` 속성) |
| 5 | Astryx Theme 컴포넌트의 `[data-astryx-theme="neutral"]` scope 가 별도 영역으로 유지 | ✅ (`theme.css` 분리) |
| 6 | 우리 React 컴포넌트 (BuildRow/Header/Login/StatusPill 등) 가 Astryx token 사용 안 함 | ✅ (검증: var(--color-*) / var(--font-sans) / var(--space-*) / var(--size-*) / var(--shadow-*) / var(--motion-*) 만 사용) |

## 운영 절차

### 디자인 토큰 추가 시

1. **우리 토큰 추가** (e.g. `--color-accent-new`): `apps/build-monitor/src/lib/tokens.css` (Svelte baseline) 와 `apps/build-monitor/react/src/tokens.css` (React 사본) **양쪽을 동시에 갱신**. 두 파일은 항상 동일 내용 유지.
2. **dark 모드**: 양쪽 `:root` selector 에 추가.
3. **light 모드**: 양쪽 `:root[data-theme="light"]` selector 에 추가 (필요 시).

### 향후 단일화 후보 (옵션 C)

`apps/build-monitor/shared/design-tokens.css` 추출 후 두 측이 동일 파일을 import. 현재는 운영 검증된 Svelte baseline + 신규 파일 0개 유지의 균형으로 React 측 사본 채택.

### Astryx 컴포넌트 도입 시

`theme.css` 의 3-layer @import 가 이미 정의되어 있어 추가 작업 불필요. 단, Astryx 컴포넌트의 default 스타일이 우리 Svelte baseline 과 충돌할 경우 `theme.css` 의 token 을 우리 토큰으로 override 하는 selector 추가 검토.

## 회귀 baseline (TASK-096.5 봉인 시점)

- TS 5 packages `tsc --noEmit` clean (shared-contract / shared-config / db / build-server / build-monitor-react)
- build-monitor vitest **244/244 PASS** (TASK-098 baseline 동일 — React 측 CSS 만 변경, 동작 영향 0)
- svelte-check **0 errors / 1 warning** (TASK-077 RegisterRunnerModal a11y baseline 무해)
- vite build:react 정상 — gzip js **95.14KB** / css **29.63KB** (TASK-098 baseline css 29.44KB → +0.19KB, tokens.css 추가분)
- vite build svelte 정상 (영향 0)

## follow-up

- TASK-099 Group E (BuildRequest + ApiConsole React 마이그레이션) — 디자인 토큰 정합 후 진입
- TASK-100 Group F (App.svelte router 단순화)
- TASK-101 Group G (Svelte scaffold 일괄 정리) — 디자인 토큰이 이미 단일 source 이므로 Svelte 폐기 시 디자인 시스템 영향 0
- 디자인 토큰 단일화 옵션 C (shared file) 후속 검토

## 관련 문서

- `apps/build-monitor/src/lib/tokens.css` (Svelte baseline, 단일 source-of-truth)
- `apps/build-monitor/react/src/tokens.css` (React 사본, 본 TASK 신규)
- `apps/build-monitor/react/src/theme.css` (Astryx Theme 보호용 layer, 본 TASK 신규)
- `apps/build-monitor/react/src/globals.css` (base style, 본 TASK amend)
- `apps/build-monitor/react/src/main.tsx` (CSS import 순서 정합, 본 TASK amend)
- `docs/operations/design-tokens-react-svelte-2026-07-08.md` (TASK-096 선행 가이드)
- `ai-workflow/memory/active/backlog/2026-07-18.md` (본 TASK 일일 백로그)