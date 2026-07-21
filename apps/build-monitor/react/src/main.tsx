// TASK-089: React + Astryx + react-router-dom 진입점.
//
// TASK-088 PoC 에서 Theme 만 감쌌던 것에서 react-router-dom v7
// BrowserRouter 까지 합쳐 SPA shell 진입점으로 격상. Svelte 빌드와
// 완전히 독립 — Build Server mountBuildMonitorDist 영향 0.
//
// Router 위치: Theme 안쪽. react-router-dom 의 Outlet/context 가
// Theme CSS variable cascade 아래에 들어가지만 Login 자체가 Astryx
// 컴포넌트를 안 쓰므로 시각 영향 없음. 향후 TASK-090+ 에서 Astryx
// AppShell/TopNav 가 router-aware navigation 을 쓸 때 Theme 안쪽
// router 위치가 정합이다.
//
// StrictMode: React 19 권장. Login 의 useEffect (mount-only redirect)
// 가 StrictMode 에서 mount/unmount/mount 두 번 fire 하지만 의도된
// 동작 — replace navigate 가 idempotent.

// TASK-096.5 디자인 토큰 단일화: CSS import 순서.
//
//   1) tokens.css    — 우리 Svelte baseline 디자인 토큰 단일 source-of-truth
//                      (60+ 토큰 + light/dark cascade). 본 진입점이 가장 먼저
//                      평가되어 후속 layer 들이 specificity 와 무관하게 본
//                      토큰을 안정적으로 사용.
//   2) globals.css   — 토큰 사용처의 base style (html/body/a/button/etc).
//                      fallback 없는 직접 토큰 사용.
//
// Astryx 재도입 — TASK-136 (도입 2단계).
//
// ── 왜 다시 넣는가 ────────────────────────────────────────────────────
// TASK-132 는 Astryx 를 제거했다. theme-neutral 이 우리와 **이름이 같은**
// 토큰(--color-text-primary 등)을 재정의하고 <Theme> 가 그 속성을 문서 루트에
// 붙여 하위 전체에 상속시켜, tokens.css 값이 컴포넌트 위치에서 덮였기
// 때문이다 (.brand 계산색 대비 1.16:1 = 사실상 비가시).
//
// 그 원인은 TASK-134 에서 구조적으로 제거됐다 — 우리 토큰 67종이 전부
// `--dib-*` 로 개명돼 Astryx 토큰 172종과 **겹치는 이름이 0** 이다.
//
// ── 왜 안전한가 (재도입 전 확인한 것) ─────────────────────────────────
// 1. 토큰 충돌 0종. 이름이 겹치지 않으면 하이재킹이 성립하지 않는다.
// 2. `astryx.css` 에는 전역 element 셀렉터도, :root/html/body 규칙도 **0건**
//    이다. 순수 스코프 클래스(StyleX atomic)라 우리 마크업에 샐 수 없다.
// 3. Astryx 는 @layer 로 계층을 나눈다 (reset → astryx-base → astryx-theme).
//    **unlayered 인 우리 손 CSS 가 항상 이긴다** — 점진 이관 중 기존 화면이
//    Astryx 스타일에 밀리지 않는다.
// 4. 우리 CSS 는 `light-dark()` 를 쓰지 않고 color-scheme 을 `:root` 에 명시
//    선언한다 (globals.css + themeStore 가 인라인으로도 못박음). P0 의 기전인
//    "상속된 color-scheme 이 light-dark() 분기를 뒤집는" 경로가 없다.
//
// reset.css 는 **의도적으로 도입하지 않았다.** 전역 리셋이라 이관 중인 손 CSS
// 2,000여 줄의 렌더링을 흔들 수 있다. 손 CSS 가 사라진 뒤 재검토한다.
//
// ── CSS import 순서 ───────────────────────────────────────────────────
//   1) astryx.css  — Astryx 컴포넌트 스타일 (@layer astryx-base)
//   2) tokens.css  — 우리 --dib-* 토큰 단일 출처 (unlayered)
//   3) globals.css — 우리 토큰 사용처의 base style (unlayered)
// unlayered 가 layered 를 이기므로 순서와 무관하게 우리 것이 우선이지만,
// 읽는 사람이 계층을 오해하지 않도록 낮은 우선순위부터 적는다.
import "@astryxdesign/core/astryx.css";
import "@/tokens.css";
import "@/globals.css";

import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Theme } from "@astryxdesign/core";

import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { useThemeStore } from "@/lib/stores/themeStore";
import { dibTheme } from "@/theme";
import { App } from "@/App";

const container = document.getElementById("app-react");
if (container === null) {
  throw new Error("Root container #app-react not found");
}

/**
 * Astryx `<Theme>` 를 우리 테마 상태에 묶는 껍데기.
 *
 * `mode` 를 반드시 우리 모드와 **일치**시켜야 한다. Astryx 내부는
 * `light-dark()` 를 쓰므로, mode 가 어긋나면 페이지는 다크인데 Astryx
 * 컴포넌트만 light 분기로 렌더된다 — TASK-132 P0 와 같은 계열의 증상이다.
 * 그래서 `mode="system"` 을 쓰지 않고 store 값을 명시적으로 내린다.
 */
function ThemedApp(): React.ReactElement {
  const mode = useThemeStore((s) => s.mode);
  const init = useThemeStore((s) => s.init);

  // 저장값/시스템 선호로 초기 테마를 결정하고 문서 루트에 반영한다.
  // ThemeToggle 이 화면에 없는 페이지에서도 테마가 적용되도록 여기서 한다.
  useEffect(() => {
    init();
  }, [init]);

  return (
    <Theme theme={dibTheme} mode={mode}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Theme>
  );
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemedApp />
    </ErrorBoundary>
  </StrictMode>
);