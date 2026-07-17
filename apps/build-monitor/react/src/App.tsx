// TASK-089/090/091/095: App shell — react-router-dom v7 라우터 통합.
//
// TASK-088 PoC (단일 페이지 VStack + Button) 에서 출발, TASK-089 에서
// Login + placeholder Builds, TASK-090 에서 BuildsList React 컴포넌트
// 교체, TASK-091 에서 BuildDetail React 컴포넌트 교체, TASK-095 에서
// Header + ThemeToggle 통합. 추후 TASK-096+ 에서 BuildRequest, ApiConsole,
// Admin* 페이지를 동일 패턴으로 route 추가.
//
// 라우팅 결정:
//   /              → /login (replace, default 진입)
//   /login         → Login
//   /builds        → BuildsList (TASK-090)
//   /builds/:id    → BuildDetail (TASK-091)
//   *              → /login (replace, fallback)
//
// TASK-095: 모든 라우트가 Header 를 공유. react-router-dom v7 의
// `<Layout>` 패턴 대신 각 라우트가 Header 를 직접 렌더 — Layout component
// 가 빌드 시 children prop 의 type narrowing 을 깰 수 있어 inline 사용.
// 향후 Svelte 측 Header 가 정리되면 React 측 Header 가 SPA shell 의
// single source-of-truth 가 된다 (TASK-096 follow-up).

import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { Header } from "@/components/Header";
import { BuildDetail } from "@/routes/BuildDetail";
import { BuildsList } from "@/routes/BuildsList";
import { Login } from "@/routes/Login";

export function App(): ReactElement {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/builds" element={<BuildsList />} />
        <Route path="/builds/:buildId" element={<BuildDetail />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
}