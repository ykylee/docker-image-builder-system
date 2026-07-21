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
// Astryx (theme.css + <Theme> 래퍼) 제거 — 2026-07-21 UI 검수.
//
// 제거 이유: theme-neutral 이 우리와 **이름이 같은** 토큰
// (--dib-color-text-primary / --dib-color-text-secondary / --dib-color-text-disabled) 을
// `[data-astryx-theme="neutral"]` 로 재정의하고, <Theme> 가 그 속성을 문서
// 루트에 붙여 하위 전체에 상속시켰다. 그 결과 tokens.css 의 값이 컴포넌트
// 위치에서 Astryx 값으로 덮였고, 동시에 하위 color-scheme 이 `light dark` 가
// 되어 `light-dark()` 가 다크 모드에서도 light 분기를 골랐다 → .brand 계산색
// #171717 on #0b0c10 = 대비 1.16:1 (사실상 비가시). 라이트 모드에서는 증상이
// 드러나지 않아 오래 잠복했다.
//
// 제거해도 안전한 근거: Astryx 컴포넌트는 본 진입점 외 어디에서도 import
// 되지 않았다 (사용처 0건). 보호할 default 컴포넌트 스타일이 없고, reset 은
// globals.css 가 자체 보유 (box-sizing / margin / color-scheme).
// 부수 효과: 본문 폰트가 Astryx 의 Figtree → 우리 --dib-font-sans 로 복귀.
import "@/tokens.css";
import "@/globals.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { App } from "@/App";

const container = document.getElementById("app-react");
if (container === null) {
  throw new Error("Root container #app-react not found");
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);