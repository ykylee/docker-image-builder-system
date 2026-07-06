import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/svelte";
import AdminTabs from "./AdminTabs.svelte";

// svelte-spa-router 모킹. `link` 액션은 anchor element 에 부착만 하고
// `aria-current` 같은 자동 속성은 테스트 환경에서 검증하지 않는다 —
// active 표시는 `currentPath === tab.href` 의 $derived 비교로 결정되므로
// `$location` store 만 적절히 set 해주면 충분.
//
// `vi.mock` factory 는 hoist 되므로 top-level 변수를 직접 참조할 수
// 없다. `vi.hoisted` 로 묶어서 hoist-safe 한 writable store 생성.
const { locStore, pushMock } = vi.hoisted(() => ({
  locStore: (
    require("svelte/store") as typeof import("svelte/store")
  ).writable<string>("/admin/builds"),
  pushMock: vi.fn()
}));

vi.mock("svelte-spa-router", () => ({
  push: (...args: unknown[]) => pushMock(...args),
  link: (_node: HTMLAnchorElement) => ({ destroy() {}, update() {} }),
  location: locStore
}));

beforeEach(() => {
  pushMock.mockReset();
  locStore.set("/admin/builds");
});

afterEach(() => {
  cleanup();
});

describe("AdminTabs (TASK-077)", () => {
  it("renders 4 tabs (Builds / Users / Admins / Runners)", () => {
    render(AdminTabs);
    expect(screen.getByRole("link", { name: "Builds" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admins" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Runners" })).toBeInTheDocument();
  });

  it("navigates to the correct admin section href for each tab", () => {
    render(AdminTabs);
    expect(screen.getByRole("link", { name: "Builds" }).getAttribute("href"))
      .toContain("/admin/builds");
    expect(screen.getByRole("link", { name: "Users" }).getAttribute("href"))
      .toContain("/admin/users");
    expect(screen.getByRole("link", { name: "Admins" }).getAttribute("href"))
      .toContain("/admin/admins");
    expect(screen.getByRole("link", { name: "Runners" }).getAttribute("href"))
      .toContain("/admin/runners");
  });

  it("marks the active tab with aria-current=\"page\" matching the current route", async () => {
    locStore.set("/admin/users");
    const { rerender } = render(AdminTabs);
    // Svelte 5 $derived 는 microtask 끝에 reactive 갱신되므로 한 tick 대기.
    await Promise.resolve();
    await rerender({});
    // Users 탭이 active, 나머지는 inactive.
    expect(screen.getByRole("link", { name: "Users" }).getAttribute("aria-current"))
      .toBe("page");
    expect(screen.getByRole("link", { name: "Builds" }).getAttribute("aria-current"))
      .toBeNull();
    expect(screen.getByRole("link", { name: "Admins" }).getAttribute("aria-current"))
      .toBeNull();
    expect(screen.getByRole("link", { name: "Runners" }).getAttribute("aria-current"))
      .toBeNull();
  });

  it("switches the active tab when the route changes", async () => {
    // /admin/builds → Builds active.
    locStore.set("/admin/builds");
    const { rerender } = render(AdminTabs);
    await Promise.resolve();
    await rerender({});
    expect(screen.getByRole("link", { name: "Builds" }).getAttribute("aria-current"))
      .toBe("page");

    // 라우트 변경: /admin/runners → Runners active.
    locStore.set("/admin/runners");
    await Promise.resolve();
    await rerender({});
    expect(screen.getByRole("link", { name: "Runners" }).getAttribute("aria-current"))
      .toBe("page");
    expect(screen.getByRole("link", { name: "Builds" }).getAttribute("aria-current"))
      .toBeNull();
  });

  // TASK-077 (self-review amend): 시각적 active 상태 (`.active` 클래스) 와
  // 공통 `.admin-tab` 클래스 적용을 검증. aria-current="page" 와 함께
  // 디자인 토큰 기반 primary 배경 pill 의 게이트. 없으면 active pill 이
  // 시각적으로 노출되지 않아 active 섹션 표시가 사라진다.
  it("applies the shared .admin-tab class to all 4 links", () => {
    render(AdminTabs);
    expect(screen.getByRole("link", { name: "Builds" })).toHaveClass("admin-tab");
    expect(screen.getByRole("link", { name: "Users" })).toHaveClass("admin-tab");
    expect(screen.getByRole("link", { name: "Admins" })).toHaveClass("admin-tab");
    expect(screen.getByRole("link", { name: "Runners" })).toHaveClass("admin-tab");
  });

  it("applies .active only to the current route tab", async () => {
    // /admin/users → Users 만 .active.
    locStore.set("/admin/users");
    const { rerender } = render(AdminTabs);
    await Promise.resolve();
    await rerender({});
    expect(screen.getByRole("link", { name: "Users" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Builds" })).not.toHaveClass("active");
    expect(screen.getByRole("link", { name: "Admins" })).not.toHaveClass("active");
    expect(screen.getByRole("link", { name: "Runners" })).not.toHaveClass("active");

    // 라우트 변경 → active 도 따라 이동.
    locStore.set("/admin/admins");
    await Promise.resolve();
    await rerender({});
    expect(screen.getByRole("link", { name: "Admins" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Users" })).not.toHaveClass("active");
  });
});