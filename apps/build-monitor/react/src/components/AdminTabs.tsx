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
// 디자인 토큰: --color-bg-surface / --color-text-secondary /
// --color-text-primary / --color-accent-primary / --shadow-card /
// --shadow-glow / --radius-pill / --space-xs / --space-sm /
// --space-lg / --size-sm / --motion-duration-fast /
// --motion-easing-standard.

import { NavLink } from "react-router-dom";
import type { CSSProperties, ReactElement } from "react";

import "./AdminTabs.css";

const TABS = [
  { href: "/admin/builds", label: "Builds" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/admins", label: "Admins" },
  { href: "/admin/runners", label: "Runners" }
] as const;

export function AdminTabs(): ReactElement {
  const navStyle: CSSProperties = {
    display: "inline-flex",
    gap: "var(--space-xs)",
    padding: "var(--space-xs)",
    background: "var(--color-bg-surface)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "var(--radius-pill)",
    boxShadow: "var(--shadow-card)"
  };

  const baseTabStyle: CSSProperties = {
    padding: "var(--space-sm) var(--space-lg)",
    borderRadius: "var(--radius-pill)",
    color: "var(--color-text-secondary)",
    fontSize: "var(--size-sm)",
    fontWeight: "var(--weight-medium)",
    textDecoration: "none",
    transition:
      "color var(--motion-duration-fast) var(--motion-easing-standard), background var(--motion-duration-fast) var(--motion-easing-standard)"
  };

  const activeTabStyle: CSSProperties = {
    ...baseTabStyle,
    background: "var(--color-accent-primary)",
    color: "white",
    boxShadow: "var(--shadow-glow)"
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
