// TASK-095: Header (React) 테스트.
//
// Svelte Header.test.ts 의 11 시나리오를 RTL + jsdom 으로 동등 검증.
// theme toggle 의 matchMedia 가 jsdom 에 없으므로 stub.
// adminAllowListStore 는 beforeEach 에서 reset.
//
// 11 case —
//  1. 비로그인 시 user-id pill + logout 버튼 안 보임
//  2. 로그인 시 user-id pill + logout 버튼 보임
//  3. logout 클릭 시 userId clear + / 로 navigate
//  4. 비-admin userId + admin list ["admin"] → "Admin" 링크 안 보임
//  5. admin user + logout → admin pill + "Admin" 링크 사라짐
//  6. admin user → 단일 "Admin" 진입점 (4개 섹션 링크 아님)
//  7. 비-admin userId + admin list ["admin"] → admin nav 안 보임
//  8. admin user → admin-id pill + 단일 Admin 진입점 + /admin/builds href
//  9. userId set + admin list 비어있음 → admin nav 안 보임
// 10. userId set + admin list 비어있음 → "New Build" 링크 보임
// 11. userId 미설정 → "New Build" 링크 안 보임
// 12. userId 무관 → "API Console" / "OpenAPI" / "Docs" 링크 항상 노출

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { Header } from "@/components/Header";
import { useAdminAllowListStore } from "@/lib/stores/adminAllowListStore";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

beforeEach(() => {
  navigateMock.mockReset();
  useAdminAllowListStore.getState().reset();
  // jsdom 의 matchMedia 부재 — ThemeToggle 의 readInitialTheme 이
  // try/catch 로 fallback 하지만, 안전망으로 stub.
  if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: () => ({
        matches: false,
        media: "(prefers-color-scheme: light)",
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false
      })
    });
  }
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  useAdminAllowListStore.getState().reset();
  localStorage.clear();
});

function renderHeader(): void {
  render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>
  );
}

describe("Header (TASK-095)", () => {
  it("hides the user-id pill and logout button when not signed in", () => {
    renderHeader();
    expect(screen.queryByTestId("hdr-user-id")).toBeNull();
    expect(screen.queryByTestId("hdr-logout")).toBeNull();
  });

  it("shows the user-id pill and logout button when signed in", () => {
    localStorage.setItem("userId", "yklee");
    renderHeader();
    expect(screen.getByTestId("hdr-user-id")).toHaveTextContent("@yklee");
    expect(screen.getByTestId("hdr-logout")).toBeInTheDocument();
  });

  it("removes userId and routes to / on logout", async () => {
    localStorage.setItem("userId", "yklee");
    renderHeader();
    const btn = screen.getByTestId("hdr-logout");
    await fireEvent.click(btn);
    expect(localStorage.getItem("userId")).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("does not render an Admin link when userId is not in the allow-list", () => {
    localStorage.setItem("userId", "yklee");
    useAdminAllowListStore.setState({ admins: ["admin"] });
    renderHeader();
    expect(screen.queryByTestId("hdr-admin")).toBeNull();
  });

  it("clears admin nav alongside userId when admin user clicks Logout", async () => {
    localStorage.setItem("userId", "yky.lee");
    useAdminAllowListStore.setState({ admins: ["admin", "yky.lee"] });
    renderHeader();
    expect(screen.getByTestId("hdr-admin-id")).toHaveTextContent("🛡 @yky.lee");
    expect(screen.getByTestId("hdr-admin")).toBeInTheDocument();
    const btn = screen.getByTestId("hdr-logout");
    await fireEvent.click(btn);
    expect(localStorage.getItem("userId")).toBeNull();
    expect(screen.queryByTestId("hdr-admin-id")).toBeNull();
    expect(screen.queryByTestId("hdr-admin")).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("renders a single Admin link (not 4 section links) when user is admin (TASK-077)", () => {
    localStorage.setItem("userId", "yky.lee");
    useAdminAllowListStore.setState({ admins: ["admin", "yky.lee"] });
    renderHeader();
    expect(screen.getByTestId("hdr-admin")).toBeInTheDocument();
    expect(screen.getByTestId("hdr-admin").getAttribute("href")).toContain(
      "/admin/builds"
    );
  });

  it("auto-enables single Admin entry when userId is in the allow-list", () => {
    localStorage.setItem("userId", "yky.lee");
    useAdminAllowListStore.setState({ admins: ["admin", "yky.lee"] });
    renderHeader();
    expect(screen.getByTestId("hdr-admin-id")).toHaveTextContent("🛡 @yky.lee");
    const adminLink = screen.getByTestId("hdr-admin");
    expect(adminLink).toBeInTheDocument();
    expect(adminLink.getAttribute("href")).toContain("/admin/builds");
  });

  it("hides admin nav when userId is set but not in the allow-list", () => {
    localStorage.setItem("userId", "yklee");
    useAdminAllowListStore.setState({ admins: ["admin"] });
    renderHeader();
    expect(screen.getByTestId("hdr-user-id")).toHaveTextContent("@yklee");
    expect(screen.queryByTestId("hdr-admin")).toBeNull();
  });

  it("renders 'New Build' link when userId is set (TASK-079)", () => {
    localStorage.setItem("userId", "alice");
    useAdminAllowListStore.setState({ admins: [] });
    renderHeader();
    const newBuildLink = screen.getByTestId("hdr-new-build");
    expect(newBuildLink).toBeInTheDocument();
    expect(newBuildLink.getAttribute("href")).toBe("/build-request");
  });

  it("hides 'New Build' link when userId is not set", () => {
    useAdminAllowListStore.setState({ admins: [] });
    renderHeader();
    expect(screen.queryByTestId("hdr-new-build")).toBeNull();
  });

  it("renders 'API Console' (in-app Swagger UI) regardless of userId", () => {
    useAdminAllowListStore.setState({ admins: [] });
    renderHeader();
    const apiConsoleLink = screen.getByTestId("hdr-api-console");
    expect(apiConsoleLink).toBeInTheDocument();
    expect(apiConsoleLink.getAttribute("href")).toBe("/api-console");
  });

  it("renders 'OpenAPI' / 'Docs' links to external target=_blank", () => {
    useAdminAllowListStore.setState({ admins: [] });
    renderHeader();
    const openapi = screen.getByTestId("hdr-openapi");
    expect(openapi.getAttribute("href")).toBe("/openapi.json");
    expect(openapi.getAttribute("target")).toBe("_blank");
    const docs = screen.getByTestId("hdr-docs");
    expect(docs.getAttribute("href")).toBe("/docs/");
    expect(docs.getAttribute("target")).toBe("_blank");
  });

  it("'New Build' link visible for admin users too (admin nav 와 독립)", () => {
    localStorage.setItem("userId", "admin");
    useAdminAllowListStore.setState({ admins: ["admin", "yky.lee"] });
    renderHeader();
    expect(screen.getByTestId("hdr-new-build")).toBeInTheDocument();
    expect(screen.getByTestId("hdr-admin")).toBeInTheDocument();
  });

  it("calls admin allow-list refresh on mount when userId is set and list is empty", async () => {
    const refreshMock = vi.fn().mockResolvedValue(["admin", "yklee"]);
    useAdminAllowListStore.setState({
      admins: [],
      refresh: refreshMock
    });
    localStorage.setItem("userId", "yklee");
    renderHeader();
    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledWith("yklee");
    });
  });
});
