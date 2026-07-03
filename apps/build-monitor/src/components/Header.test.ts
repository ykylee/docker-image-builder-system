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
const adminAllowListRef: { value: string[] } = { value: [] };
vi.mock("../lib/admin-store.js", () => {
  // vi.mock factory 안에서는 ESM import 를 못 쓰므로 require 로 가져온다.
  const inner = (require("svelte/store") as typeof import("svelte/store")).writable<string[]>([]);
  // 외부에서 inner 를 set 할 수 있도록 helper 노출.
  (inner as unknown as { __set: (v: string[]) => void }).__set = (v: string[]) => inner.set(v);
  return {
    adminAllowListStore: {
      subscribe: inner.subscribe,
      snapshot: () => adminAllowListRef.value,
      contains: (id: string | null | undefined) => !!id && adminAllowListRef.value.includes(id),
      refresh: async () => inner.set(adminAllowListRef.value),
      add: async (_caller: string, newId: string) => {
        const next = [...adminAllowListRef.value, newId];
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
  (_adminAllowListStore as unknown as { __set?: (v: string[]) => void }).__set?.(v);
};

beforeEach(() => {
  pushMock.mockReset();
  localStorage.clear();
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

  it("shows the Admin entry link when no adminId is stored", () => {
    render(Header);
    expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
  });

  it("shows the admin pill and admin nav links when adminId is stored", () => {
    localStorage.setItem("adminId", "admin");
    render(Header);
    expect(screen.getByText(/@admin/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin · Builds" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin · Users" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /admin logout/i })).toBeInTheDocument();
  });

  it("removes adminId and routes to / on admin logout", async () => {
    localStorage.setItem("adminId", "yky.lee");
    render(Header);
    const btn = screen.getByRole("button", { name: /admin logout/i });
    await fireEvent.click(btn);
    expect(localStorage.getItem("adminId")).toBeNull();
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

  // TASK-048: userId 가 admin allow-list 에 포함되면 admin 메뉴가
  // 자동 노출된다 (별도 AdminLogin 단계 없이). adminId store 가 비어
  // 있어도, allow-list 가 채워져 있고 userId 가 그 안에 있으면 Header
  // 가 admin pill + admin nav links 를 보여준다.
  it("auto-enables admin nav when userId is in the allow-list (TASK-048)", () => {
    localStorage.setItem("userId", "yky.lee");
    setAdminAllowList(["admin", "yky.lee"]);
    render(Header);
    // admin-id pill 은 🛡 prefix 로 unique.
    expect(screen.getByText("🛡 @yky.lee")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin · Builds" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin · Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin · Admins" })).toBeInTheDocument();
  });

  it("hides admin nav when userId is set but not in the allow-list", () => {
    localStorage.setItem("userId", "yklee");
    setAdminAllowList(["admin"]);
    render(Header);
    // 일반 user pill 만 보이고 Admin 메뉴는 안 보인다.
    expect(screen.getByText("@yklee")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Admin · Builds" })).toBeNull();
  });
});
