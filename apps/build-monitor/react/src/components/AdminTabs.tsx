// TASK-097: AdminTabs (React).
//
// Svelte src/components/AdminTabs.svelte 와 1:1 정합. TASK-077 의 admin
// 섹션 간 탭 네비게이션. Header 가 admin 진입점을 단일 링크("🛡 Admin") 로
// 정리한 뒤, 각 admin 페이지의 상단에 공통 탭 바를 노출한다.
//
// react-router-dom v7 의 NavLink 사용 — `className` callback prop 으로
// active 시 `active` class 적용. `aria-current="page"` 자동 부여 (NavLink
// 기본 동작).
//
// 디자인 토큰: --dib-color-bg-surface / --dib-color-text-secondary /
// --dib-color-text-primary / --dib-color-accent-primary / --dib-shadow-card /
// --dib-shadow-glow / --dib-radius-pill / --dib-space-xs / --dib-space-sm /
// --dib-space-lg / --dib-size-sm / --dib-motion-duration-fast /
// --dib-motion-easing-standard.

import { NavLink } from "react-router-dom";
import type { CSSProperties, ReactElement } from "react";

import "./AdminTabs.css";

const TABS = [
  { href: "/admin/builds", label: "Builds" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/admins", label: "Admins" },
  { href: "/admin/runners", label: "Runners" },
  { href: "/admin/hosting", label: "Hosting" }
] as const;

export function AdminTabs(): ReactElement {
  const navStyle: CSSProperties = {
    display: "inline-flex",
    gap: "var(--dib-space-xs)",
    padding: "var(--dib-space-xs)",
    background: "var(--dib-color-bg-surface)",
    border: "1px solid var(--dib-color-border-subtle)",
    borderRadius: "var(--dib-radius-pill)",
    boxShadow: "var(--dib-shadow-card)"
  };

  const baseTabStyle: CSSProperties = {
    padding: "var(--dib-space-sm) var(--dib-space-lg)",
    borderRadius: "var(--dib-radius-pill)",
    color: "var(--dib-color-text-secondary)",
    fontSize: "var(--dib-size-sm)",
    fontWeight: "var(--dib-weight-medium)",
    textDecoration: "none",
    transition:
      "color var(--dib-motion-duration-fast) var(--dib-motion-easing-standard), background var(--dib-motion-duration-fast) var(--dib-motion-easing-standard)"
  };

  const activeTabStyle: CSSProperties = {
    ...baseTabStyle,
    background: "var(--dib-color-accent-primary)",
    color: "var(--dib-color-on-accent)",
    boxShadow: "var(--dib-shadow-glow)"
  };

  return (
    <nav
      className="admin-tabs"
      aria-label="Admin sections"
      data-testid="admin-tabs"
      style={navStyle}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.href}
          to={tab.href}
          className={({ isActive }) =>
            isActive ? "admin-tab active" : "admin-tab"
          }
          data-testid={`admin-tab-${tab.label.toLowerCase()}`}
          style={({ isActive }) =>
            isActive ? activeTabStyle : baseTabStyle
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
