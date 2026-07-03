---
design_spec: stitch/v1
project: docker-image-builder-system
surface: build-monitor (future frontend)
status: draft (P2 phase — frontend 부착은 별도 PR)
last_updated: 2026-07-03
---

# DESIGN.md

이 문서는 Docker Image Builder System 의 Build Server Monitor UI 가
따라야 할 design spec 의 1차안이다. Stitch 호환 YAML frontmatter 의
tokens 섹션과 8개 markdown 섹션으로 구성된다. 본 PR (#5) 에서는
`/openapi.json` 과 `/docs` (Swagger UI) 만 활성화되며, 실제 frontend
(Vite + React) 부착과 design token 의 CSS 변수화는 별도 PR 에서 다룬다.

## 1. Tokens

```yaml
# Color
color:
  bg:
    canvas: "#0F1115"          # 페이지 배경
    surface: "#171A21"         # 카드 / 패널
    surface-elevated: "#1E222B" # 모달 / hover
  text:
    primary: "#E6E8EC"
    secondary: "#9AA1AC"
    muted: "#5C6370"
    disabled: "#3A3F4A"
  border:
    subtle: "#232832"
    strong: "#2E3440"
  accent:
    primary: "#5B8DEF"         # CTA, link
    primary-hover: "#7AA3FF"
    success: "#3FB950"         # COMPLETED
    warning: "#D29922"         # BUILDING
    danger: "#F85149"          # FAILED
    info: "#79C0FF"            # PROVISIONING
  focus:
    ring: "#5B8DEF"            # a11y outline

# Typography
typography:
  font:
    sans: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    mono: "JetBrains Mono, ui-monospace, 'SF Mono', Consolas, monospace"
  size:
    xs: "11px"
    sm: "12px"
    md: "14px"
    lg: "16px"
    xl: "20px"
    xxl: "28px"
  weight:
    regular: 400
    medium: 500
    semibold: 600
  line:
    tight: 1.25
    normal: 1.45
    relaxed: 1.6

# Spacing
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"

# Radius
radius:
  sm: "4px"
  md: "6px"
  lg: "10px"
  pill: "9999px"

# Shadow
shadow:
  card: "0 1px 2px rgba(0,0,0,0.4), 0 4px 8px rgba(0,0,0,0.2)"
  modal: "0 8px 24px rgba(0,0,0,0.5)"

# Motion
motion:
  duration:
    fast: "120ms"
    base: "200ms"
    slow: "320ms"
  easing:
    standard: "cubic-bezier(0.2, 0, 0, 1)"
```

## 2. Foundations

- **Surface**: Build Monitor 는 dark-first. `/openapi.json` 의 data plane
  이 `BUILDING / COMPLETED / FAILED / QUEUED / PREVIEW_QUEUED` 같은
  stateful 데이터 중심이므로 light mode 대비 대비비 우선.
- **Density**: 정보 밀도가 높은 table-first UI. 한 화면에 build 20~50
  row 가 보여야 한다. row height 36px 기준.
- **Predictability**: 같은 phase / status 는 같은 색·같은 위치
  (좌측 status pill, 우측 updated time).

## 3. Components

- **BuildRow**: `<tr>` 1 row. 좌측 status pill, 중앙 `buildId`
  (mono, click → detail drawer), 우측 `updatedAt` (relative time).
- **StatusPill**: radius pill, 11px mono uppercase. 색은 token 의
  `accent.{status}` 매핑.
- **PhaseTimeline**: 수직 step indicator. DOCKER_BUILD_STARTED →
  COMPLETED 같은 transition 을 시계열로 표시.
- **LogStream**: monospace, auto-scroll 토글, since cursor 기반
  증분 fetch.
- **PreviewLinkCard**: PREVIEW_READY 상태일 때 노출. `previewUrl`
  을 외부 링크로, `host:hostPort` 는 secondary text.
- **EmptyState`: 데이터 0건일 때 단일 카드 + 1 CTA ("Create build").
- **ErrorBanner**: 4xx/5xx 응답 상단 banner. dismiss 가능.

## 4. Layout

- **Top-level grid**: 12-column, max-width 1440px, gutter 16px.
  Build list 는 8 col, detail drawer 는 4 col (open 시).
- **Header**: 좌측 logo / project switcher, 우측 theme toggle +
  user menu. sticky, 56px.
- **List page**: filter chips 상단 (status multi-select), table 본문,
  pagination 하단.
- **Detail drawer**: 480px wide, 우측에서 slide-in. section: status
  meta / phase timeline / log stream / preview link.

## 5. Voice & Tone

- **State copy**: 짧고 사실적. 예: "Build queued at 14:02 by
  yklee" (시간 + actor).
- **Error copy**: 무엇이 잘못됐는지 + 다음 행동. 예: "Build not
  found. Verify the buildId or check the runner logs."
- **Empty copy**: 다음 행동을 안내. CTA 1개로 제한.

## 6. Accessibility

- **Contrast**: 본문 text 4.5:1, large text 3:1. `accent.danger` /
  `accent.warning` 도 WCAG AA 통과하도록 검증됨 (v0 색).
- **Focus**: 모든 interactive element 는 `focus.ring` 으로 명확한
  outline. `outline: 2px solid` + `outline-offset: 2px`.
- **Keyboard**: table row 는 `Enter` 로 drawer open, `Esc` 로
  drawer close. filter chip 은 `Space` 로 toggle.
- **ARIA**: StatusPill 은 `role="status"` + `aria-label="Build
  status: BUILDING"`. timeline 은 `role="list"` + 각 step `role="listitem"`.
- **Reduced motion**: `prefers-reduced-motion: reduce` 일 때
  drawer slide 생략, 즉시 표시.

## 7. Do / Don't

**Do**
- status 를 색 + 텍스트 + 위치(좌측 pill) 로 동시에 encode.
- updated time 은 relative (`2 min ago`) + hover 시 absolute tooltip.
- log 는 monospace 고정폭, wrap 토글 가능.
- 모든 destructive action (cancel build, expire preview) 은 confirm
  dialog.

**Don't**
- status 를 색만으로 구분하지 않는다 (color blindness 대비).
- log 영역에 markdown / rich text 를 쓰지 않는다 (copy/paste 우선).
- dashboard chart 는 MVP 범위 밖 (status table + drawer 만).
- light mode 는 P2 (frontend PR) 에서 추가.

## 8. References

- `docs/sdlc/13-backend-development-target-selection.md` — 본 surface
  가 다루는 backend PKG-001~006 의 범위.
- `docs/sdlc/08-build-server-tech-stack-baseline.md` — Build Server
  의 runtime 과 ENV (CORS_ORIGIN 포함).
- `docs/REQUIREMENTS_BASELINE.md` — NFR (성능, 보안) 기준.
- Stitch design spec v1: <https://stitch.withgoogle.com/docs/design-md/specification>
  (참조 형식 차용, 본 프로젝트는 Stitch 가 아님)
- PR #5 (`codex/frontend-swagger-2026-07-03`) — Swagger UI / CORS
  / OpenAPI snapshot. frontend 부착은 별도 PR 예정.
