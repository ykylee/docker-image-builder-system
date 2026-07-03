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
});
