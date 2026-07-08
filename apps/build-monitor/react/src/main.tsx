// TASK-088 React + Astryx 진입점. Svelte 빌드 (apps/build-monitor/dist/) 와
// 완전히 독립적 — Build Server 의 mountBuildMonitorDist 가 mount 하는
// 경로는 그대로 Svelte dist. React 빌드 (apps/build-monitor/dist-react/)
// 는 dev:react (port 5174) 와 build:react 로만 노출.
//
// CSS import 순서가 layer cascade 를 결정한다 (Astryx 가이드):
//   reset.css      → @layer reset
//   astryx.css     → @layer astryx-base (컴포넌트 default 스타일)
//   theme-neutral  → @layer astryx-theme (토큰 override)
// 순서 뒤집히면 컴포넌트 default 가 theme 토큰을 덮어 디자인 시스템 무너짐.

import "@/globals.css";

import { createRoot } from "react-dom/client";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { App } from "@/App";

const container = document.getElementById("app-react");
if (container === null) {
  throw new Error("Root container #app-react not found");
}

createRoot(container).render(
  <Theme theme={neutralTheme}>
    <App />
  </Theme>
);