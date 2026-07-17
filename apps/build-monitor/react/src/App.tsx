// TASK-089/090/091: App shell — react-router-dom v7 라우터 통합.
//
// TASK-088 PoC (단일 페이지 VStack + Button) 에서 출발, TASK-089 에서
// Login + placeholder Builds, TASK-090 에서 BuildsList React 컴포넌트
// 교체, TASK-091 에서 BuildDetail React 컴포넌트 교체 완료. 추후 TASK-092~094
// 에서 BuildRequest, ApiConsole, Admin* 페이지를 동일 패턴으로 route 추가.
//
// 라우팅 결정:
//   /              → /login (replace, default 진입)
//   /login         → Login
//   /builds        → BuildsList (TASK-090)
//   /builds/:id    → BuildDetail (TASK-091)
//   *              → /login (replace, fallback)
//
// Build Server (TASK-093) 의 mountBuildMonitorDist 가 SPA fallback 을
// 제공할 때까지 client-side 라우터만 동작 — /builds/:id 직접 URL 입력 시
// SPA shell 진입 후 useParams 가 빌드 id 를 추출. TASK-091 범위는
// client routing 으로 한정.

import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { BuildDetail } from "@/routes/BuildDetail";
import { BuildsList } from "@/routes/BuildsList";
import { Login } from "@/routes/Login";

export function App(): ReactElement {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/builds" element={<BuildsList />} />
      <Route path="/builds/:buildId" element={<BuildDetail />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}