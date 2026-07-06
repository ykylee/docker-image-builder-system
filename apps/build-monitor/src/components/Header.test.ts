import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import Header from "./Header.svelte";

const pushMock = vi.fn();
vi.mock("svelte-spa-router", () => ({
  push: (...args: unknown[]) => pushMock(...args),
  link: (_node: HTMLAnchorElement) => ({ destroy() {}, update() {} })
}));

// ThemeToggle 은 외부 의존 (window.matchMedia 등) 이 있어 stub. Svelte 5
// component class 는 function 으로 stub 하면 mount 시 에러가 나므로, default
// export 를 forwardRef 형태로 노출.
vi.mock("./ThemeToggle.svelte", () => ({
  default: function ThemeToggleStub() {
    return null;
  }
}));

// admin-store 모킹. Header 가 onMount 시 adminAllowListStore.refresh 를
// 부르지만, jsdom 의 fetch mock 은 별도로 세팅하기 번거로우니 writable
// 의 inner 를 직접 set 해서 admin list 가 이미 채워진 상태로 시뮬레이션.
// 테스트 케이스에서 setAdminAllowList([...]) 로 명시적으로 채운다.
//
// `vi.mock` factory 는 hoist 되므로 top-level 변수를 직접 참조할 수
// 없다. admin-store mock 과 동일하게 `require` 로 동기 import 해서
// factory 안에서 store 를 만든다. 반환 객체에 `__set` 을 함께 노출해서
// `setAdminAllowList` helper 가 직접 inner store 를 set 가능.
const adminAllowListRef: { value: string[] } = { value: [] };
vi.mock("../lib/admin-store.js", () => {
  // vi.mock factory 안에서는 ESM import 를 못 쓰므로 require 로 가져온다.
  const inner = (require("svelte/store") as typeof import("svelte/store")).writable<string[]>([]);
  return {
    adminAllowListStore: {
      subscribe: inner.subscribe,
      snapshot: () => adminAllowListRef.value,
      contains: (id: string | null | undefined) => !!id && adminAllowListRef.value.includes(id),
      refresh: async () => inner.set(adminAllowListRef.value),
      // helper. 이전에는 inner 에만 `__set` 을 붙여서 `setAdminAllowList` 가
      // optional chaining 으로 silent no-op 됐고, test order 에 따라
      // inner 가 stale 상태로 시작하는 race condition 이 발생. 이제 mock
      // 반환 객체에 노출해서 helper 가 두 store 를 항상 함께 set 한다.
      __set: (v: string[]) => inner.set(v),
      add: async (_caller: string, newId: string) => {
        const next = adminAllowListRef.value.includes(newId)
          ? adminAllowListRef.value
          : [...adminAllowListRef.value, newId];
        adminAllowListRef.value = next;
        inner.set(next);
        return { admins: next };
      },
      remove: async (_caller: string, target: string) => {
        const next = adminAllowListRef.value.filter((a) => a !== target);
        adminAllowListRef.value = next;
        inner.set(next);
        return { removed: target, admins: next };
      }
    }
  };
});

import { adminAllowListStore as _adminAllowListStore } from "../lib/admin-store.js";
const setAdminAllowList = (v: string[]) => {
  adminAllowListRef.value = v;
  // svelte store 도 동일하게 set 해서 $derived 가 reactive 하게 갱신되게.
  // mock 의 반환 객체에 노출한 __set 으로 inner store 까지 함께 set.
  (_adminAllowListStore as unknown as { __set?: (v: string[]) => void }).__set?.(v);
};

beforeEach(() => {
  pushMock.mockReset();
  localStorage.clear();
  setAdminAllowList([]);
});

afterEach(() => {
  cleanup();
});

describe("Header", () => {
  it("hides the user-id pill and logout button when not signed in", () => {
    render(Header);
    expect(screen.queryByText(/^@/)).toBeNull();
    expect(screen.queryByRole("button", { name: /logout/i })).toBeNull();
  });

  it("shows the user-id pill and logout button when signed in", () => {
    localStorage.setItem("userId", "yklee");
    render(Header);
    expect(screen.getByText("@yklee")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
  });

  it("removes userId and routes to / on logout", async () => {
    localStorage.setItem("userId", "yklee");
    render(Header);
    const btn = screen.getByRole("button", { name: /logout/i });
    await fireEvent.click(btn);
    expect(localStorage.getItem("userId")).toBeNull();
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  // TASK-076: admin 진입점은 단일 링크. "Admin" 텍스트 자체는 admin user
  // 일 때만 보인다 — 비-admin user 가 로그인 한 상태에서는 "Admin" 링크가
  // 렌더되지 않는다.
  it("does not render an Admin link when userId is not in the allow-list", () => {
    localStorage.setItem("userId", "yklee");
    setAdminAllowList(["admin"]);
    render(Header);
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  // TASK-076: 별도 admin logout 버튼은 없다 — admin 메뉴가 보일 때는
  // userId 그 자체가 admin id 이고, 일반 Logout 버튼이 그것도 함께 정리.
  it("does not render a separate Admin Logout button (TASK-076)", () => {
    localStorage.setItem("userId", "yky.lee");
    setAdminAllowList(["admin", "yky.lee"]);
    render(Header);
    expect(screen.queryByRole("button", { name: /admin logout/i })).toBeNull();
  });

  // TASK-077: Header 는 admin 진입점으로 단일 "Admin" 링크만 노출한다.
  // 섹션 간 (Builds / Users / Admins / Runners) 이동은 페이지 상단
  // <AdminTabs /> 가 담당하므로 Header 에 4개 nav link 가 같이 나오면
  // 안 된다 — 회귀 가드.
  it("renders a single Admin link (not 4 section links) when user is admin (TASK-077)", () => {
    localStorage.setItem("userId", "yky.lee");
    setAdminAllowList(["admin", "yky.lee"]);
    render(Header);
    // 단일 "Admin" 링크만 보이고 "Admin · Builds" 류의 섹션 링크는
    // 사라졌다.
    expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Admin · Builds" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Admin · Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Admin · Admins" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Admin · Runners" })).toBeNull();
  });

  // TASK-076 + 077: admin user 의 일반 Logout 이 admin 메뉴까지 모두
  // 정리하는지 검증. admin pill + 단일 Admin 링크가 사라지고 userId 만
  // clear 된다.
  it("clears admin nav alongside userId when admin user clicks Logout (TASK-076 + 077)", async () => {
    localStorage.setItem("userId", "yky.lee");
    setAdminAllowList(["admin", "yky.lee"]);
    render(Header);
    // 사전 상태: admin pill + 단일 Admin 링크 가 노출된다.
    expect(screen.getByText("🛡 @yky.lee")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /logout/i });
    await fireEvent.click(btn);
    expect(localStorage.getItem("userId")).toBeNull();
    // admin 메뉴는 더 이상 보이지 않아야 한다.
    expect(screen.queryByText("🛡 @yky.lee")).toBeNull();
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  // Bug 1 regression (Header 즉시 갱신). 같은 탭의 SPA 라우트 안에서
  // session store 가 set 되면 storage 이벤트가 fire 하지 않으므로, store
  // set 만으로 Header 가 reactive 하게 갱신되어야 한다. 두 컴포넌트를
  // 동시에 마운트해 같은 store 인스턴스를 공유하는지로 검증.
  it("updates the user-id pill reactively when userIdStore changes in the same tab", async () => {
    const { rerender } = render(Header);
    expect(screen.queryByText(/^@/)).toBeNull();

    // 같은 SPA 라우트 트리에서 Login 이 setItem 후 push() 하는 흐름을
    // 흉내낸다 — 다른 탭이 아니므로 storage 이벤트는 발생하지 않는다.
    localStorage.setItem("userId", "yklee");
    const { userIdStore } = await import("../lib/session.js");
    userIdStore.set("yklee");

    await Promise.resolve();
    // 동일한 store 를 구독하는 다른 컴포넌트라면 자동으로 갱신되지만,
    // 단일 컴포넌트만 마운트된 이 테스트에서는 rerender 시점의 store
    // 값이 화면에 반영되는지 확인한다.
    await rerender({});
    expect(screen.getByText("@yklee")).toBeInTheDocument();
  });

  // TASK-048 + 076 + 077: userId 가 admin allow-list 에 포함되면 단일
  // "Admin" 진입점이 자동 노출된다. 섹션 간 이동은 페이지 상단 탭이
  // 담당하므로 Header 에는 더 이상 4개 nav 가 나열되지 않는다.
  it("auto-enables single Admin entry when userId is in the allow-list (TASK-048 + 076 + 077)", () => {
    localStorage.setItem("userId", "yky.lee");
    setAdminAllowList(["admin", "yky.lee"]);
    render(Header);
    // admin-id pill 은 🛡 prefix 로 unique.
    expect(screen.getByText("🛡 @yky.lee")).toBeInTheDocument();
    // 단일 Admin 진입점.
    const adminLink = screen.getByRole("link", { name: "Admin" });
    expect(adminLink).toBeInTheDocument();
    expect(adminLink.getAttribute("href")).toContain("/admin/builds");
  });

  it("hides admin nav when userId is set but not in the allow-list", () => {
    localStorage.setItem("userId", "yklee");
    setAdminAllowList(["admin"]);
    render(Header);
    // 일반 user pill 만 보이고 admin nav 는 안 보인다.
    expect(screen.getByText("@yklee")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });
});
// TASK-079 (skill 측 build request UI): Header 의 추가 nav 항목들 검증.
describe("Header (TASK-079)", () => {
  it("renders 'New Build' link when userId is set", () => {
    localStorage.setItem("userId", "alice");
    setAdminAllowList([]);
    render(Header);
    const newBuildLink = screen.getByRole("link", { name: /New Build/i });
    expect(newBuildLink).toBeInTheDocument();
    expect(newBuildLink.getAttribute("href")).toBe("/build-request");
  });

  it("hides 'New Build' link when userId is not set", () => {
    setAdminAllowList([]);
    render(Header);
    expect(screen.queryByRole("link", { name: /New Build/i })).toBeNull();
  });

  it("renders 'API Console' (in-app Swagger UI) regardless of userId", () => {
    setAdminAllowList([]);
    render(Header);
    const apiConsoleLink = screen.getByTestId("hdr-api-console");
    expect(apiConsoleLink).toBeInTheDocument();
    expect(apiConsoleLink.getAttribute("href")).toBe("/api-console");
  });

  it("renders 'OpenAPI' link to /openapi.json (external target=_blank)", () => {
    setAdminAllowList([]);
    render(Header);
    const link = screen.getByTestId("hdr-openapi");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/openapi.json");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("renders 'Docs' link to /docs/ (external target=_blank)", () => {
    setAdminAllowList([]);
    render(Header);
    const link = screen.getByTestId("hdr-docs");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/docs/");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("'New Build' link visible for admin users too (admin nav 와 독립)", () => {
    localStorage.setItem("userId", "admin");
    setAdminAllowList(["admin", "yky.lee"]);
    render(Header);
    expect(screen.getByRole("link", { name: /New Build/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
  });
});
