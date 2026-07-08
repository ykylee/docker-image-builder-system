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

import "@/globals.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

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
        <Theme theme={neutralTheme}>
          <App />
        </Theme>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);