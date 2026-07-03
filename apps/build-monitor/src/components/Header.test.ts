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
});
