// TASK-097: AdminTabs (React) 테스트.
//
// Svelte AdminTabs.test.ts 의 6 케이스를 RTL + MemoryRouter + react-router-dom
// v7 NavLink 로 동등 검증. NavLink 의 `className` callback 으로 active
// 시 `active` class 자동 적용 — MemoryRouter 의 initialEntries 로 현재
// path 제어.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { AdminTabs } from "@/components/AdminTabs";

afterEach(() => {
  cleanup();
});

function renderTabs(initialPath: string): void {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AdminTabs />
    </MemoryRouter>
  );
}

describe("AdminTabs (TASK-097)", () => {
  it("renders 4 tabs (Builds / Users / Admins / Runners)", () => {
    renderTabs("/admin/builds");
    expect(screen.getByRole("link", { name: "Builds" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admins" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Runners" })).toBeInTheDocument();
  });

  it("navigates to the correct admin section href for each tab", () => {
    renderTabs("/admin/builds");
    expect(
      screen.getByRole("link", { name: "Builds" }).getAttribute("href")
    ).toBe("/admin/builds");
    expect(
      screen.getByRole("link", { name: "Users" }).getAttribute("href")
    ).toBe("/admin/users");
    expect(
      screen.getByRole("link", { name: "Admins" }).getAttribute("href")
    ).toBe("/admin/admins");
    expect(
      screen.getByRole("link", { name: "Runners" }).getAttribute("href")
    ).toBe("/admin/runners");
  });

  it("marks the active tab with aria-current='page' matching the current route", () => {
    renderTabs("/admin/users");
    expect(
      screen.getByRole("link", { name: "Users" }).getAttribute("aria-current")
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Builds" }).getAttribute("aria-current")
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "Admins" }).getAttribute("aria-current")
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "Runners" }).getAttribute("aria-current")
    ).toBeNull();
  });

  it("applies the shared 'admin-tab' class to all 4 links", () => {
    renderTabs("/admin/builds");
    expect(screen.getByRole("link", { name: "Builds" })).toHaveClass(
      "admin-tab"
    );
    expect(screen.getByRole("link", { name: "Users" })).toHaveClass("admin-tab");
    expect(screen.getByRole("link", { name: "Admins" })).toHaveClass(
      "admin-tab"
    );
    expect(screen.getByRole("link", { name: "Runners" })).toHaveClass(
      "admin-tab"
    );
  });

  it("applies 'active' only to the current route tab", () => {
    renderTabs("/admin/users");
    expect(screen.getByRole("link", { name: "Users" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Builds" })).not.toHaveClass(
      "active"
    );
    expect(screen.getByRole("link", { name: "Admins" })).not.toHaveClass(
      "active"
    );
    expect(screen.getByRole("link", { name: "Runners" })).not.toHaveClass(
      "active"
    );
  });

  it("uses /admin/builds as the default current path (TASK-077 single Admin entry)", () => {
    renderTabs("/admin/builds");
    expect(screen.getByRole("link", { name: "Builds" })).toHaveClass("active");
    expect(
      screen.getByRole("link", { name: "Builds" }).getAttribute("href")
    ).toBe("/admin/builds");
  });
});
