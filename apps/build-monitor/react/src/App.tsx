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
//   /api-console   → ApiConsole — Scalar API Reference iframe 임베드
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

import { Suspense, lazy, useEffect, type ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@astryxdesign/core";

import { AppHeader } from "@/components/AppHeader";
import { Login } from "@/routes/Login";
import { getAuthSession } from "@/lib/auth-session";
import { setUserId } from "@/lib/useUserId";

// TASK-139: 라우트 지연 로드.
//
// 왜: 라우트 9종이 전부 정적 import 라 **모든 사용자가 모든 페이지의 코드를
// 초기 번들로 받고 있었다.** `/login` 만 여는 사용자도 admin 4종과 빌드 요청
// 폼을 함께 내려받는다. Astryx 이관이 진행되면서 이 비용이 눈에 띄게 커졌다 —
// TASK-138 에서 BuildRequest 한 페이지를 옮기자 초기 JS gzip 이 104.30 →
// 134.51KB 로 뛰었고, 남은 이관(LogStream / BuildsList / 레이아웃 셸)마다
// 같은 증가가 반복될 구조였다. 그래서 이관을 더 진행하기 전에 깔아둔다.
//
// Login 만 eager 인 이유: `/` 가 `/login` 으로 redirect 하므로 인증 전
// 사용자의 **첫 화면**이다. 이것까지 lazy 로 만들면 첫 페인트에 청크 왕복이
// 하나 더 붙는다. 나머지는 최소 한 번의 사용자 행동(로그인/탐색) 뒤에
// 필요하므로 그 시점에 받아도 늦지 않다.
const BuildsList = lazy(async () => ({ default: (await import("@/routes/BuildsList")).BuildsList }));
const ServicesList = lazy(async () => ({ default: (await import("@/routes/ServicesList")).ServicesList }));
const BuildDetail = lazy(async () => ({ default: (await import("@/routes/BuildDetail")).BuildDetail }));
const BuildRequest = lazy(async () => ({ default: (await import("@/routes/BuildRequest")).BuildRequest }));
const ApiConsole = lazy(async () => ({ default: (await import("@/routes/ApiConsole")).ApiConsole }));
const AdminBuilds = lazy(async () => ({ default: (await import("@/routes/AdminBuilds")).AdminBuilds }));
const AdminUsers = lazy(async () => ({ default: (await import("@/routes/AdminUsers")).AdminUsers }));
const AdminAdmins = lazy(async () => ({ default: (await import("@/routes/AdminAdmins")).AdminAdmins }));
const AdminRunners = lazy(async () => ({ default: (await import("@/routes/AdminRunners")).AdminRunners }));
const AdminHostedServices = lazy(async () => ({ default: (await import("@/routes/AdminHostedServices")).AdminHostedServices }));

export function App(): ReactElement {
  useEffect(() => {
    let active = true;
    getAuthSession()
      .then((session) => {
        if (active && session.authenticated && session.subject) setUserId(session.subject);
      })
      .catch(() => {
        // Local/test deployments may not expose OIDC routes yet. The existing
        // development login bridge remains available in that case.
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    // TASK-144: 손수 만든 <header> + <main class=app-main> 셸 →
    // Astryx AppShell. skip-to-content 링크와 responsive mobile nav 를
    // AppShell 이 자동 처리한다 (TASK-132 가 손으로 만든 셸을 대체).
    //
    // height="auto": 우리 페이지는 콘텐츠에 따라 자란다(빌드 목록·폼). 'fill'
    // 은 100dvh 고정 + 내부 독립 스크롤이라 대시보드용이다.
    //
    // contentPadding={4}: 폼/텍스트가 지배적인 콘텐츠라 16px. 폭 중앙정렬은
    // Astryx 기본을 따른다(사용자 결정) — TASK-132 의 --dib-layout-max 는
    // globals.css 에서 제거됐다.
    <AppShell
      topNav={<AppHeader />}
      height="auto"
      contentPadding={4}
      // <md 에서 TopNav 를 mobile-bar 로 전환 + 탐색 링크를 drawer 로.
      // 명시하지 않아도 disabled 는 아니지만(=== false 만 disabled), toggle
      // 동작을 확실히 하려고 config 를 준다. breakpoint 기본 md(768px).
      mobileNav={{ breakpoint: "md" }}
    >
      {/* 청크를 받는 동안의 대체 표시. 각 페이지가 자체 로딩 상태에서
          쓰는 `.muted` 문구와 같은 형태라 전환이 튀지 않는다. */}
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/builds" element={<BuildsList />} />
          <Route path="/services" element={<ServicesList />} />
          <Route path="/builds/:buildId" element={<BuildDetail />} />
          <Route path="/build-request" element={<BuildRequest />} />
          <Route path="/api-console" element={<ApiConsole />} />
          <Route path="/admin/builds" element={<AdminBuilds />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/admins" element={<AdminAdmins />} />
          <Route path="/admin/runners" element={<AdminRunners />} />
          <Route path="/admin/services" element={<AdminHostedServices />} />
          {/* Backward-compatible alias for the original hosting management URL. */}
          <Route path="/admin/hosting" element={<AdminHostedServices />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
