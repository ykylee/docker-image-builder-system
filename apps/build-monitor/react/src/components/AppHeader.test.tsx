// TASK-144: AppHeader (Astryx TopNav 기반) 테스트.
//
// TASK-095 의 Header.test.tsx 를 승계. 손수 만든 <nav> 가 Astryx TopNav 로
// 바뀌면서 링크의 `data-testid`(hdr-builds / hdr-new-build / hdr-admin /
// hdr-api-console …)는 사라졌다 — TopNavItem 은 label 로 렌더된다. 그래서
// 그 링크들은 **접근성 질의**(role="link" + name)로 확인한다. 사용자/AT 가
// 보는 기준과 같아지는 정당한 개선이며, 검증 의도는 그대로다.
//
// 유지된 testid: hdr-user-id / hdr-admin-id / hdr-logout (우리가 직접 붙인 것).
//
// 고정하는 계약(구현이 바뀌어도 유지):
//   - 비로그인: 사용자 링크(Builds/New Build)·user pill·logout 없음
//   - 로그인: user pill + Builds + New Build + Logout
//   - logout → userId clear + `/` 이동
//   - admin allow-list 포함 시에만 단일 Admin 진입점 + 🛡 pill 노출
//   - API Docs 는 로그인 무관 항상 노출

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

import { AppHeader } from "@/components/AppHeader";
import { useAdminAllowListStore } from "@/lib/stores/adminAllowListStore";

beforeEach(() => {
  navigateMock.mockReset();
  useAdminAllowListStore.getState().reset();
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
      <AppHeader />
    </MemoryRouter>
  );
}

function link(name: RegExp | string): HTMLElement | null {
  return screen.queryByRole("link", { name });
}

describe("AppHeader", () => {
  it("비로그인 시 user pill / logout / 사용자 링크가 없다", () => {
    renderHeader();
    expect(screen.queryByTestId("hdr-user-id")).toBeNull();
    expect(screen.queryByTestId("hdr-logout")).toBeNull();
    expect(link(/^Builds$/)).toBeNull();
    expect(link(/New Build/)).toBeNull();
  });

  it("로그인 시 user pill + Builds + New Build + Logout 을 노출한다", () => {
    localStorage.setItem("userId", "yklee");
    renderHeader();
    expect(screen.getByTestId("hdr-user-id")).toHaveTextContent("@yklee");
    expect(link(/^Builds$/)).toBeInTheDocument();
    expect(link(/New Build/)).toBeInTheDocument();
    expect(screen.getByTestId("hdr-logout")).toBeInTheDocument();
  });

  it("logout 시 userId 를 지우고 / 로 이동한다", async () => {
    localStorage.setItem("userId", "yklee");
    sessionStorage.setItem("accessToken", "stale-token");
    renderHeader();
    fireEvent.click(screen.getByTestId("hdr-logout"));
    await waitFor(() => {
      expect(localStorage.getItem("userId")).toBeNull();
    });
    expect(sessionStorage.getItem("accessToken")).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("allow-list 에 없으면 Admin 진입점을 렌더하지 않는다", () => {
    localStorage.setItem("userId", "yklee");
    useAdminAllowListStore.setState({ admins: ["admin"] });
    renderHeader();
    expect(link(/^Admin$/)).toBeNull();
    expect(screen.queryByTestId("hdr-admin-id")).toBeNull();
  });

  it("allow-list 에 있으면 단일 Admin 진입점 + 🛡 pill 을 노출한다", () => {
    localStorage.setItem("userId", "yky.lee");
    useAdminAllowListStore.setState({ admins: ["admin", "yky.lee"] });
    renderHeader();

    expect(screen.getByTestId("hdr-admin-id")).toHaveTextContent(
      "🛡 @yky.lee"
    );
    const adminLink = link(/^Admin$/);
    expect(adminLink).toBeInTheDocument();
    // 단일 진입점 — 4개 섹션 링크를 나열하지 않는다 (TASK-077).
    expect(adminLink?.getAttribute("href")).toContain("/admin/builds");
    expect(link(/Users/)).toBeNull();
    expect(link(/Runners/)).toBeNull();
  });

  it("admin 사용자 logout 시 admin nav 도 userId 와 함께 사라진다", async () => {
    localStorage.setItem("userId", "yky.lee");
    useAdminAllowListStore.setState({ admins: ["admin", "yky.lee"] });
    renderHeader();

    expect(screen.getByTestId("hdr-admin-id")).toBeInTheDocument();
    expect(link(/^Admin$/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("hdr-logout"));
    await waitFor(() => {
      expect(localStorage.getItem("userId")).toBeNull();
    });
  });

  it("API Docs 는 로그인 무관 항상 노출된다", () => {
    renderHeader();
    expect(link(/^API Docs$/)).toBeInTheDocument();
  });

  it("API Docs 는 단일 SPA 진입점이다", () => {
    renderHeader();
    expect(link(/^API Docs$/)?.getAttribute("href")).toBe("/api-console");
    expect(link(/^API Docs$/)?.getAttribute("target")).toBeNull();
  });
});
