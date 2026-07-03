import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import ThemeToggle from "./ThemeToggle.svelte";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  // matchMedia 기본값: dark preference
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    })
  });
});

afterEach(() => {
  cleanup();
});

describe("ThemeToggle", () => {
  it("renders the sun icon by default (dark mode)", () => {
    render(ThemeToggle);
    // 기본은 dark → sun icon 이 보임 (클릭 시 light 로 전환)
    expect(screen.getByRole("button", { name: /toggle theme/i })).toBeInTheDocument();
  });

  it("toggles to light mode and persists choice", async () => {
    render(ThemeToggle);
    const btn = screen.getByRole("button", { name: /toggle theme/i });
    await fireEvent.click(btn);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("toggles back to dark and removes the attribute", async () => {
    localStorage.setItem("theme", "light");
    document.documentElement.setAttribute("data-theme", "light");
    render(ThemeToggle);
    const btn = screen.getByRole("button", { name: /toggle theme/i });
    await fireEvent.click(btn);
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("restores stored light preference on mount", () => {
    localStorage.setItem("theme", "light");
    render(ThemeToggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
  // TASK-046: color-scheme 가 document root 에 적용되어야 native form
  // 컨트롤 (input, select, scrollbar) 이 현재 테마와 자연스럽게 어울린다.
  it("sets color-scheme=dark on document root in default (dark) mode", () => {
    render(ThemeToggle);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("sets color-scheme=light on document root after toggling to light", async () => {
    render(ThemeToggle);
    const btn = screen.getByRole("button", { name: /toggle theme/i });
    await fireEvent.click(btn);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
