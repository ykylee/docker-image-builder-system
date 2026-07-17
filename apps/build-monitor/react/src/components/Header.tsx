// TASK-095: Header (React).
//
// Svelte src/components/Header.svelte 와 1:1 정합. userId admin allow-list
// auto-enable (TASK-076 + 077 + 048) + admin 단일 진입점 + New Build +
// API Console + OpenAPI + Docs + ThemeToggle 통합.
//
// react-router-dom v7 의 <Link> 사용. Zustand adminAllowListStore 로
// admin list 캐시 + add/remove + contains(userId). React `useUserId` hook
// (TASK-089 follow-up) 의 setUserId 로 logout.
//
// a11y: nav 의 의미적 `<nav>` element + role 의미는 link element 자체로
// 충분히 전달. 구분선 `<div class="divider">` 는 aria-hidden 으로 처리.

import { useEffect, type CSSProperties, type ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";

import { setUserId, useUserId } from "@/lib/useUserId";
import { useAdminAllowListStore } from "@/lib/stores/adminAllowListStore";
import { ThemeToggle } from "@/components/ThemeToggle";

import "./Header.css";

export function Header(): ReactElement {
  const [userId] = useUserId();
  const admins = useAdminAllowListStore((s) => s.admins);
  const refreshAllowList = useAdminAllowListStore((s) => s.refresh);
  const navigate = useNavigate();

  // userId 가 admin allow-list 에 속하면 admin 으로 auto-enable.
  // userId 가 없거나 allow-list 가 비어있으면 false.
  const autoAdminEnabled =
    !!userId && admins.length > 0 && admins.includes(userId);
  const effectiveAdminId = autoAdminEnabled ? userId : null;

  useEffect(() => {
    // 부팅 시 userId 가 있으면 admin allow-list 를 prefetch.
    if (userId && admins.length === 0) {
      refreshAllowList(userId).catch(() => {
        // intentional: stale cache; admin menu stays hidden until next
        // successful refresh (e.g. next page navigation trigger).
      });
    }
    // refreshAllowList reference 가 안정적이라 userId / admins 만 의존.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function logout(): void {
    // userId 가 admin allow-list 에 있었더라도, logout 하면 더 이상
    // admin 메뉴는 노출되지 않는다 — userId null 이 되면 autoAdminEnabled
    // 도 false 가 되므로 admin 메뉴가 자연스럽게 사라진다.
    setUserId(null);
    navigate("/");
  }

  return (
    <header className="hdr" data-testid="app-header">
      <div className="hdr-inner">
        <Link to="/" className="brand" data-testid="hdr-brand">
          <div className="logo-wrapper">
            <span className="logo" aria-hidden="true">
              ⬢
            </span>
          </div>
          <span className="title">Build Monitor</span>
        </Link>
        <nav className="hdr-nav">
          {userId ? (
            <>
              <span className="user-id mono" data-testid="hdr-user-id">
                @{userId}
              </span>
              <Link
                to="/builds"
                className="hdr-link"
                data-testid="hdr-builds"
              >
                Builds
              </Link>
              {/* TASK-079 (skill 측 build request UI): 일반 인증 사용자
                   (admin 여부 무관) 가 POST /builds payload 를 직접 작성해
                   lifecycle 을 시험할 수 있는 진입점. */}
              <Link
                to="/build-request"
                className="hdr-link"
                data-testid="hdr-new-build"
              >
                New Build
              </Link>
              <button
                type="button"
                className="logout-btn"
                onClick={logout}
                data-testid="hdr-logout"
              >
                Logout
              </button>
            </>
          ) : null}
          {effectiveAdminId ? (
            <>
              <div className="divider" aria-hidden="true" />
              <span
                className="admin-id mono"
                title="Admin session active"
                data-testid="hdr-admin-id"
              >
                🛡 @{effectiveAdminId}
              </span>
              {/* TASK-077: admin 진입점은 단일 링크. 각 admin 섹션
                   (Builds / Users / Admins / Runners) 사이의 이동은
                   페이지 상단 <AdminTabs /> 가 담당. */}
              <Link
                to="/admin/builds"
                className="hdr-link"
                data-testid="hdr-admin"
              >
                Admin
              </Link>
            </>
          ) : null}
          <div className="divider" aria-hidden="true" />
          <Link
            to="/api-console"
            className="hdr-link"
            data-testid="hdr-api-console"
          >
            API Console
          </Link>
          <a
            href="/openapi.json"
            target="_blank"
            rel="noopener"
            className="hdr-link"
            data-testid="hdr-openapi"
          >
            OpenAPI
          </a>
          <a
            href="/docs/"
            target="_blank"
            rel="noopener"
            className="hdr-link"
            data-testid="hdr-docs"
          >
            Docs
          </a>
          <div className="divider" aria-hidden="true" />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

// CSSProperties type re-export 방지 (unused).
export type HeaderCSSProperties = CSSProperties;
