// TASK-089/090: App shell — react-router-dom v7 라우터 통합.
//
// TASK-088 PoC (단일 페이지 VStack + Button) 에서 출발, TASK-089 에서
// Login + placeholder Builds, TASK-090 에서 BuildsList React 컴포넌트
// 교체 완료. 추후 TASK-091~094 에서 BuildDetail, BuildRequest, ApiConsole,
// Admin* 페이지를 동일 패턴으로 route 추가.
//
// 라우팅 결정:
//   /              → /login (replace, default 진입)
//   /login         → Login
//   /builds        → BuildsList (TASK-090)
//   /builds/:id    → BuildDetail (TASK-091 예정, 현재는 /builds 로 fallback)
//   *              → /login (replace, fallback)
//
// Build Server (TASK-093) 의 mountBuildMonitorDist 가 SPA fallback 을
// 제공할 때까지 client-side 라우터만 동작 — /builds/:id 직접 URL 입력 시
// 404 가능. TASK-090 범위는 client routing 으로 한정.

import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { Login } from "@/routes/Login";
import { BuildsList } from "@/routes/BuildsList";

export function App(): ReactElement {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/builds" element={<BuildsList />} />
      <Route path="/builds/:buildId" element={<BuildDetailPlaceholder />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function BuildDetailPlaceholder(): ReactElement {
  return (
    <section
      data-testid="build-detail-placeholder"
      style={{
        padding: "var(--space-xxl)",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        color: "var(--color-text-primary, inherit)"
      }}
    >
      <h1>Build Detail (TASK-091 예정)</h1>
      <p style={{ color: "var(--color-text-secondary, #666)" }}>
        Build detail / logs / phases 페이지. TASK-091 에서 Svelte routes/BuildDetail.svelte
        를 React 컴포넌트로 마이그레이션하면서 교체.
      </p>
    </section>
  );
}