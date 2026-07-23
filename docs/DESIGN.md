---
design_spec: dib/v2
project: docker-image-builder-system
surface: build-monitor (React 19 + Astryx)
status: stable (TASK-152 — React 19 + Astryx rewrite 이후 정합)
last_updated: 2026-07-22
---

# DESIGN.md

이 문서는 Docker Image Builder System 의 Build Server Monitor UI 가 따라야
할 design spec 이다. **React 19 + Astryx 0.1.4** 기반이며 (`apps/build-monitor/`),
Svelte 5 시절의 첫안 (PR #6, 2026-07-03) 은 **폐기** — frontend rewrite
시리즈 (TASK-088~094) 와 Astryx 도입 1~3단계 (TASK-134~144) 로 전면 전환됐다.
본 v2 는 **현 tokens.css / 현 컴포넌트 셋 / 현 라우트 셋** 과 1:1 정합.

Stitch 호환 YAML frontmatter 의 tokens 섹션과 8개 markdown 섹션으로
구성된다. 색·타이포·간격·컴포넌트·레이아웃·a11y 의 1차 source-of-truth.

## 0. Stack (TASK-088 + Astryx 도입 결정)

```yaml
framework: React 19 (functional + hooks, no class component)
build: Vite 5 + @vitejs/plugin-react
language: TypeScript 5.6
routing: react-router-dom v7 (BrowserRouter, lazy + Suspense 청크 분리)
data_client: openapi-fetch + openapi-typescript (생성형: /openapi.json)
testing: vitest + @testing-library/react + jsdom
ui_library: @astryxdesign/core 0.1.4 + @astryxdesign/theme-neutral 0.1.4
theming: <Theme theme={neutralTheme}> + StyleX atomic CSS-in-JS
styling: 디자인 토큰 (CSS custom properties `--dib-*`, `apps/build-monitor/react/src/tokens.css`) + Astryx atomic
```

선정 근거: Build Monitor 는 internal single-page tool 이지만 정보 밀도가
높은 table UI + live data 위주. **TASK-088 의 결정 (PR #43) 으로
Svelte → React 전환**, **TASK-136/148/149 로 Astryx 도입** 후 Table /
Dialog / TextInput / CodeBlock / AppShell+TopNav 까지 이관 완료 (TASK-144).
Astryx 0.1.4 + React 19 가 운영 baseline. ecosystem / future-proof 양쪽
트레이드오프에서 Astryx 의 디자인 시스템 일관성을 우선.

## 1. Tokens (현 tokens.css 와 1:1)

`apps/build-monitor/react/src/tokens.css` 가 **단일 source-of-truth**.
Svelte 측 사본 (`apps/build-monitor/src/lib/tokens.css`) 은 Svelte 빌드용
보조 사본 — 운영 원칙: **한쪽만 수정, 양쪽 동기화**. (TASK-096.5 옵션 A')

```yaml
# ── Color (dark = default, light = :root[data-theme="light"] override) ──
color:
  bg:
    canvas: "#0b0c10"            # 페이지 배경
    surface: "#13151c"           # 카드 / 패널
    surface-elevated: "#1a1d27"  # 모달 / hover / active tab
  text:
    primary: "#f8f9fa"           # 본문
    secondary: "#a0a8b4"         # 부제
    muted: "#7d8593"             # metadata — AA 4.5:1
    disabled: "#3d4351"          # inactive (1.97:1 — WCAG 면제)
  border:
    subtle: "#242936"
    strong: "#566282"            # AA 3:1 (canvas/surface)
  accent:
    primary: "#7e81f3"           # Indigo — CTA, link
    primary-hover: "#9a9cf6"
    success: "#10b981"           # Emerald — COMPLETED
    warning: "#f59e0b"           # Amber — BUILDING
    danger: "#f15656"            # Red — FAILED
    info: "#0ea5e9"              # Sky — PROVISIONING
  focus:
    ring: "rgba(126, 129, 243, 0.5)"
  on_accent: "#0b0c10"           # 솔리드 accent 배경 위 전경 (다크)
  glass:
    bg: "rgba(19, 21, 28, 0.7)"
    border: "rgba(255, 255, 255, 0.05)"

# ── Light 모드 override (요약, 전체는 tokens.css :root[data-theme="light"]) ──
# canvas: #f1f5f9, surface: #ffffff, surface-elevated: #dde4ed
# text: #0f172a / #475569 / #57657f / #8a99b0
# accent: #4f46e5 / #04704e / #945104 / #bb1e1e / #02679c
# on_accent: #ffffff

# ── Typography ──
typography:
  font:
    sans: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    mono: "JetBrains Mono, ui-monospace, 'SF Mono', Consolas, monospace"
  size:
    xs: "0.75rem"    # 12px
    sm: "0.875rem"   # 14px
    md: "1rem"       # 16px
    lg: "1.125rem"   # 18px
    xl: "1.5rem"     # 24px
    xxl: "2.25rem"   # 36px
  weight:
    regular: 400
    medium: 500
    semibold: 600
  line:
    tight: 1.25
    normal: 1.5
    relaxed: 1.625

# ── Spacing ──
spacing:
  xs: "0.25rem"   # 4px
  sm: "0.5rem"    # 8px
  md: "0.75rem"   # 12px
  lg: "1rem"      # 16px
  xl: "1.5rem"   # 24px
  xxl: "2rem"    # 32px
  xxxl: "3rem"   # 48px

# ── Radius ──
radius:
  sm: "6px"
  md: "10px"
  lg: "16px"
  pill: "9999px"

# ── Shadow (dark) ──
shadow:
  card: "0 4px 6px -1px rgba(0,0,0,0.5), 0 2px 4px -2px rgba(0,0,0,0.5)"
  card-hover: "0 10px 15px -3px rgba(0,0,0,0.6), 0 4px 6px -4px rgba(0,0,0,0.6), 0 0 0 1px var(--dib-color-accent-primary)"
  modal: "0 20px 25px -5px rgba(0,0,0,0.6), 0 8px 10px -6px rgba(0,0,0,0.6)"
  glow: "0 0 20px rgba(126,129,243,0.3)"

# ── Motion ──
motion:
  duration:
    fast: "150ms"
    base: "300ms"
    slow: "500ms"
  easing:
    standard: "cubic-bezier(0.4, 0, 0.2, 1)"
    bouncy: "cubic-bezier(0.34, 1.56, 0.64, 1)"

# ── Code surface (양 테마 동일 — LogStream 터미널 톤 정책) ──
code:
  bg: "#0b0c10"
  fg: "#e2e8f0"
  muted: "#6a7b93"   # code-bg 위 4.53:1 AA 통과 (TASK-133 정정)
  phase: "#38bdf8"
  border: "var(--dib-color-border-strong)"
  inset-shadow: "inset 0 2px 4px rgba(0,0,0,0.5)"

# ── Z-Index ──
z:
  header: 100
  drawer: 200
  modal: 300
  toast: 400

# ── Build Server GET /builds 의 owner filter (`requestedBy`) ──
# IDENTITY_MODEL 의 userId 와 같은 canonical key.
```

## 2. Foundations

- **Surface**: Build Monitor 는 **dark-first** 이지만 light 모드 운영 baseline 도
  확보됨 (TASK-046/132/133). light 토큰은 dark 와 의미 반전 — light 의
  surface-elevated 는 "한 단계 어두운" (위 element 강조), dark 의
  surface-elevated 는 "한 단계 밝은" (마찬가지). density 우선.
- **Density**: 정보 밀도가 높은 table-first UI. `/builds` 에 build 20~50
  row 가 한 화면. row height 약 36px. **BuildRow 컴포넌트는 TASK-142
  에서 삭제** (Astryx Table 로 일원화), column 정의는 `buildColumns.tsx`
  단일 출처 (`withOwner` flag 로 5열 / 4열 분기).
- **Predictability**: 같은 phase / status 는 같은 색·같은 위치
  (좌측 status pill, 우측 updated time). StatusPill 배지 정책
  (TASK-141, **P2-M1 (TASK-159) 로 status 정렬**): **주의가 필요한
  상태만 배지** — warning: PREPARING_SOURCE / BUILDING, info: TESTING /
  DEPLOYING / PROVISIONING / CONTAINER_TEST_STARTED, error: FAILED /
  DISABLED, 정상 종료·대기는 평문 (RECEIVED / QUEUED / *_SUCCESS /
  COMPLETED / CANCELLED / EXPIRED / ACTIVE). canonical phase 표기 전체
  목록은 [`docs/PHASE-2-CONCEPT.md` §P2-M1](./PHASE-2-CONCEPT.md#p2-m1--계약-청산-contract-reset-완결)
  참조 — `CLAIMED` / `TEST_READY` / `PREVIEW_*` 같은 preview-era status
  와 `PREVIEW_QUEUED` / `PREVIEW_READY` phase 는 v0.2.1 이후 cycle
  (TASK-158/159/160) 에서 canonical 로 대체됐다.
- **Theme toggle**: header 우측 sun/moon 아이콘. localStorage `theme`
  영속화. `themeStore` (Zustand) 가 `<Theme>` 컴포넌트에 명시 전달
  (mode='system' 미사용 — TASK-136 결정).

## 3. Components (현 `apps/build-monitor/react/src/components/` 기준)

| 컴포넌트 | 위치 | 역할 | 비고 |
|---|---|---|---|
| **StatusPill** | `components/StatusPill.tsx` | 상태 표기 (라벨 + 선택적 배지) | TASK-141 배지 정책. `role="status"` + `aria-label="Status: <state>"` |
| **PhaseTimeline** | `components/PhaseTimeline.tsx` | 빌드 단계 시각화 (11 phase) | TASK-150 — `buildPhases` 를 shared-contract 에서 import, drift 구조적 봉인 |
| **LogStream** | `components/LogStream.tsx` | 로그 monospace 터미널 톤 (양 테마 동일) | Astryx `CodeBlock` + custom tokenizer (TIMESTAMP, [PHASE]) |
| **FilterChips** | `components/FilterChips.tsx` | status multi-select | 디자인 토큰 기반 단일 source (TASK-083) |
| **AdminTabs** | `components/AdminTabs.tsx` | admin 페이지 탭 네비 | active = `--dib-color-accent-primary` 배경 + `--dib-shadow-glow` |
| **AdminAccessDenied** | `components/AdminAccessDenied.tsx` | admin 가드 실패 표시 | TASK-084 |
| **AppHeader** | `components/AppHeader.tsx` | TopNav 슬롯용 wrapper | TASK-144 — Astryx `TopNav` 슬롯 |
| **ThemeToggle** | `components/ThemeToggle.tsx` | dark/light 토글 | localStorage 영속화 + themeStore |
| **RegisterRunnerModal** | `components/RegisterRunnerModal.tsx` | 모달 (Astryx `Dialog`) | TASK-137, 148 — `data-open-modal="register-runner"` 트리거 |
| **buildColumns** | `components/buildColumns.tsx` | Table column 정의 단일 출처 | TASK-142 — `withOwner` flag, 5열/4열 분기 |

**삭제/이관된 컴포넌트** (v1 → v2 차이):
- ~~**BuildRow**~~ — TASK-142 에서 Astryx Table 로 일원화, 삭제.
- ~~**PreviewLinkCard**~~ — BuildDetail 페이지의 `Legacy preview block` 으로 통합 (deprecated badge).
- ~~**EmptyState / ErrorBanner**~~ — Astryx `EmptyState` 도입 후보였으나 현 MVP 는 인라인 처리. 후속 결정.

**Astryx 라이브러리 컴포넌트** (TASK-137~144 이관):
- `Dialog` (RegisterRunnerModal), `TextInput` (BuildRequest 폼 8필드),
  `NumberInput` (TTL / port), `Button` (primary/ghost/secondary),
  `CodeBlock` (LogStream), `Table` (BuildsList/AdminBuilds/AdminUsers),
  `AppShell` + `TopNav` (레이아웃 셸, TASK-144).

## 4. Layout (TASK-144 AppShell + TopNav)

- **Shell**: Astryx `AppShell` 단일 root. `topNav={<AppHeader/>}`,
  `height="auto"`, `contentPadding={4}`. 자체 폭·여백·헤더-본문 정렬 —
  TASK-132 의 손수 만든 셸(`<main class="app-main">` + `--dib-layout-max`)
  은 TASK-144 에서 제거됨. `--dib-layout-max/gutter/header-h` 토큰은
  운영 가치가 사라져 삭제.
- **TopNav (AppHeader 슬롯)**: 좌측 **탐색** (Builds / New Build / Admin /
  API Console / OpenAPI / Docs) — 6개. **mobile-bar** 모드에서 startContent
  만 숨기고 hamburger drawer 로 접근. **endContent** 는 세션 컨트롤
  (`@userId` + role 배지 + Logout + ThemeToggle) 만.
- **모바일 drawer**: `<768px` 에서 자동 활성화. desktop `mobileNav={
  breakpoint: "md" }` 명시.
- **라우트 셋** (`App.tsx`):

  ```
  /                        → /login (redirect)
  /login                   Welcome to Build Monitor 카드
  /builds                  BuildsList (Astryx Table)
  /builds/:buildId         BuildDetail (PhaseTimeline + LogStream)
  /build-request           BuildRequest 폼 (TextInput × 8)
  /api-console             ApiConsole (Swagger UI iframe)
  /admin/builds            AdminBuilds (5열 table + AdminTabs)
  /admin/users             AdminUsers (recent builds + rollup)
  /admin/admins            AdminAdmins (admin list)
  /admin/runners           AdminRunners (+ Register Runner 모달)
  *                        → /login (404 fallback)
  ```

- **Admin 페이지 공통**: 상단 `AdminTabs` (Builds / Users / Admins / Runners)
  + `<h1>` 헤더 + 필터/검색 + 본문 (table or grid). page-head 컨테이너 +
  표 행 호버 surface-elevated.
- **build-detail 페이지**: 4 block (lifecycle / test / deploy / resultDelivery)
  + meta header + PhaseTimeline + LogStream + Legacy preview block.

## 5. Voice & Tone

- **State copy**: 짧고 사실적. 예: "Build queued at 14:02 by yklee"
  (시간 + actor). `updatedAt` 은 relative (`2 min ago` / `7m ago`).
- **Error copy**: 무엇이 잘못됐는지 + 다음 행동. 4xx/5xx 응답은
  `parseApiError` 가 envelope `message` + `issues` 를 파싱해 필드별
  에러로 표시 (TASK-130). 예: "Build not found. Verify the buildId
  or check the runner logs."
- **Empty copy**: 다음 행동을 안내. CTA 1개로 제한. `/builds` 의
  "No builds." + `/admin/runners` 의 "No runners.".
- **Modal copy**: RegisterRunnerModal 의 도움말 paragraph 가
  "Pre-register a runner so it appears in the admin registry before
  the runner process boots." — **state + actor + next action** 패턴.

## 6. Accessibility

- **Contrast**: 본문 text **4.5:1**, large text **3:1**. 다크/라이트 양
  모드 모두 WCAG AA 통과 (TASK-133 가드). `--color-text-disabled` 는
  WCAG 1.4.3 inactive component 예외로 면제 (다크 1.97 / 라이트 2.64).
  솔리드 accent 위 텍스트는 `--dib-color-on-accent` (다크 canvas, 라이트
  white) 사용 — color:white 하드코딩은 amber 에서 2.15:1 미달.
- **Focus**: 모든 interactive element 는 Astryx `:focus-visible` outline.
  StatusPill, FilterChips, Tab, Button 모두 `--dib-color-focus-ring` 기반.
- **Keyboard**:
  - `Tab` / `Shift+Tab` — focus 이동.
  - `Enter` — table row 활성화 (BuildsList/AdminBuilds 의 buildId 링크).
  - `Space` — FilterChips toggle.
  - `Esc` — RegisterRunnerModal 닫기 (Astryx `Dialog`).
- **ARIA**:
  - StatusPill: `role="status"` + `aria-label="Status: <STATE>"`.
  - PhaseTimeline: `<ol role="list">` + 각 step `role="listitem"`.
  - RegisterRunnerModal: native `<dialog>` + `aria-modal="true"`.
  - TopNav: `<nav role="banner">` (Astryx TopNav).
- **Reduced motion**: `prefers-reduced-motion: reduce` 일 때 Astryx
  `phase-pulse` 1.6s infinite → 정지. 그 외 transition/modal slide
  는 Astryx 정책에 따름.

## 7. Do / Don't

**Do**
- status 를 **색 + 텍스트 + 위치(좌측 pill)** 로 동시에 encode
  (color blindness 대비 — TASK-141).
- updated time 은 **relative** (`7m ago`) + hover 시 absolute tooltip.
- log 는 monospace 고정폭, **wrap 토글 가능** (LogStream의 `wrap` checkbox).
- 모든 destructive action (cancel build, expire preview) 은 confirm
  dialog (현 MVP 범위 밖이지만 가이드).
- 모달 트리거는 **`data-open-modal="<name>"`** 어트리뷰트 (TASK-148).
  사람/AT 영향 0, 가드(B층)만 사용.
- 디자인 토큰 변경은 **반드시 `--dib-*` 접두사** 로 (TASK-134 —
  Astryx/theme-neutral 과 이름 충돌 구조적 차단).
- 새 컴포넌트 도입 시 **shared-contract import** 가능한지 먼저 검토
  (예: PhaseTimeline 의 `buildPhases`).

**Don't**
- status 를 **색만**으로 구분하지 않는다.
- log 영역에 markdown / rich text 를 쓰지 않는다 (copy/paste 우선).
- dashboard chart 는 MVP 범위 밖 (status table + page 단위만).
- unlayered CSS 로 Astryx element 셀렉터 (`button {}` 같은) 를 덮지
  않는다 (TASK-145 회귀 — `:not([class*="astryx-"])` 으로 제외).
- 디자인 토큰을 **접두사 없이** 선언하지 않는다 (Astryx 의 172종 토큰과
  충돌 위험 — TASK-134).
- globals 에 `* { margin: 0 }` 같은 raw reset 을 두지 않는다 (TASK-138/140
  회귀 — Login.css 가 400px max-width 로 Astryx CodeBlock 덮음).

## 8. References

### 8.1 운영 가이드 (현 정합)

- `docs/operations/build-monitor-ui-visual-2026-07-22.md` (TASK-152) —
  Visual QA baseline 운영 가이드 (React + Astryx 정합, RegisterRunnerModal 포함).
- `docs/operations/design-tokens-unification-2026-07-18.md` (TASK-096.5) —
  디자인 토큰 단일화 (Svelte tokens.css 가 source-of-truth, React 측 사본 정합).
- `docs/operations/theme-contrast-guard-2026-07-21.md` (TASK-133/148) —
  테마별 시각 회귀 2계층 가드 (A층 vitest + B층 Playwright + 오버레이 검사).
- `docs/operations/b-layer-overlay-extension-2026-07-22.md` (TASK-148) —
  B층 가드 오버레이 검사 확장 운영 가이드.

### 8.2 봉인 TASK (디자인 영향)

- **TASK-088~094**: frontend rewrite Svelte → React 7-PR 시리즈.
- **TASK-096.5**: 디자인 토큰 단일화 (M4.6) — `--dib-*` 접두사 결정.
- **TASK-132**: UI 균형 붕괴 수정 (Astryx 토큰 충돌 4종 → 0종 해소).
- **TASK-133**: 테마별 시각 회귀 가드 (A+B 2계층).
- **TASK-134**: Astryx 0.1.4 도입 1단계 — 디자인 토큰 `--dib-*` 재확인.
- **TASK-136**: Astryx 2단계 `<Theme>` + `astryx.css` 재도입.
- **TASK-137~144**: Astryx 3-1~3-5 컴포넌트 이관.
- **TASK-141**: StatusPill 배지 정책 변경 (주의 상태만).
- **TASK-142**: AdminBuilds / AdminUsers Table 이관 + `buildColumns` 추출.
- **TASK-143**: admin 라우트 통합 테스트 복원.
- **TASK-144**: AppShell + TopNav (마지막 큰 이관).
- **TASK-145/146/148**: CSS 유출 가드 + 오버레이 검사.
- **TASK-150**: PhaseTimeline drift 9 → 11 phase 수정 (shared-contract 정합).
- **TASK-152**: 본 v2 재작성 (React 19 + Astryx + 현 tokens/components/routes 정합).

### 8.3 폐기 reference (v1 에서만 유효)

- Svelte 5 / `svelte-spa-router` / `@sveltejs/vite-plugin-svelte` —
  TASK-088 의 frontend rewrite 로 전면 폐기.
- PR #5 (`codex/frontend-swagger-2026-07-03`) / PR #6
  (`codex/frontend-attach-2026-07-03`) — Svelte 시절.
- `apps/build-monitor/src/lib/tokens.css` (Svelte 측 사본) — 운영상
  `apps/build-monitor/react/src/tokens.css` 와 동기 유지 (TASK-096.5).
- `docs/sdlc/design/` — system architecture level (UI 디자인 토큰 아님).
  도메인 모델 / API 계약은 여전히 유효.
