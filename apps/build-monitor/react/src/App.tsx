// TASK-089: App shell — react-router-dom v7 라우터 통합.
//
// TASK-088 PoC (단일 페이지 VStack + Button) 에서 출발, 본격 마이그레이션
// 의 첫 페이지 (Login) + placeholder Builds 페이지 + default redirect +
// wildcard fallback 으로 확장. 추후 TASK-090~094 에서 BuildsList,
// BuildDetail, BuildRequest, ApiConsole, Admin* 페이지를 동일 패턴으로
// route 로 추가.
//
// 라우팅 결정:
//   /              → /login (replace, default 진입)
//   /login         → Login
//   /builds        → BuildsPlaceholder (TASK-090 Svelte BuildsList 마이그
//                   션 시 교체)
//   *              → /login (replace, fallback — 미지정 path 진입 차단)
//
// Build Server (TASK-093) 의 mountBuildMonitorDist 가 SPA fallback 을
// 제공할 때까지 client-side 라우터만 동작 — /builds 직접 URL 입력 시
// 404 가능. TASK-089 범위는 client routing 으로 한정.

import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { Login } from "@/routes/Login";

export function App(): ReactElement {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/builds" element={<BuildsPlaceholder />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function BuildsPlaceholder(): ReactElement {
  return (
    <section
      data-testid="builds-placeholder"
      style={{
        padding: "var(--space-xxl)",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        color: "var(--color-text-primary, inherit)"
      }}
    >
      <h1>Builds (TASK-090 예정)</h1>
      <p style={{ color: "var(--color-text-secondary, #666)" }}>
        Login 성공 후 진입하는 첫 페이지. TASK-090 에서 Svelte routes/BuildsList.svelte
        를 React 컴포넌트로 마이그레이션하면서 교체한다.
      </p>
    </section>
  );
}