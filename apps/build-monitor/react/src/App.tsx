// TASK-089/090/091/095/098/099: App shell — react-router-dom v7 라우터 통합.
//
// TASK-088 PoC 에서 출발, TASK-089 Login + placeholder Builds, TASK-090
// BuildsList, TASK-091 BuildDetail, TASK-095 Header + ThemeToggle, TASK-098
// Admin 페이지 4종, TASK-099 BuildRequest + ApiConsole React 마이그레이션 통합.
//
// 라우팅 결정:
//   /              → /login (replace, default 진입)
//   /login         → Login
//   /builds        → BuildsList (TASK-090)
//   /builds/:id    → BuildDetail (TASK-091)
//   /build-request → BuildRequest (TASK-099) — Skill → Host POST /builds
//   /api-console   → ApiConsole (TASK-099) — Swagger UI iframe 임베드
//   /admin/builds    → AdminBuilds (TASK-098)
//   /admin/users     → AdminUsers (TASK-098)
//   /admin/admins    → AdminAdmins (TASK-098)
//   /admin/runners   → AdminRunners (TASK-098)
//   *              → /login (replace, fallback)
//
// TASK-095: 모든 라우트가 Header 를 공유. react-router-dom v7 의
// `<Layout>` 패턴 대신 각 라우트가 Header 를 직접 렌더 — Layout component
// 가 빌드 시 children prop 의 type narrowing 을 깰 수 있어 inline 사용.
//
// TASK-098/099: admin / build-request / api-console routes 를 React 측
// page 로 교체. Svelte 측 pages 는 그대로 유지되며, TASK-101 (Group G) 에서
// 일괄 정리 예정. cross-framework 의 라우팅 충돌은 없음 — Svelte 측
// pages 는 자체 svelte-spa-router 의 Routes 를 사용하고 React 측은 별도
// 빌드 (TASK-093 의 mount 구조).

import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { Header } from "@/components/Header";
import { AdminAdmins } from "@/routes/AdminAdmins";
import { AdminBuilds } from "@/routes/AdminBuilds";
import { AdminRunners } from "@/routes/AdminRunners";
import { AdminUsers } from "@/routes/AdminUsers";
import { ApiConsole } from "@/routes/ApiConsole";
import { BuildDetail } from "@/routes/BuildDetail";
import { BuildRequest } from "@/routes/BuildRequest";
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
        <Route path="/build-request" element={<BuildRequest />} />
        <Route path="/api-console" element={<ApiConsole />} />
        <Route path="/admin/builds" element={<AdminBuilds />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/admins" element={<AdminAdmins />} />
        <Route path="/admin/runners" element={<AdminRunners />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
}