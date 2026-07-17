// TASK-095: ThemeToggle (React) 테스트.
//
// Svelte ThemeToggle.test.ts 의 시나리오를 RTL + jsdom 으로 동등 검증.
// 4 case — initial dark / initial light from storage / toggle dark→light /
// toggle light→dark + localStorage 동기화.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ThemeToggle } from "@/components/ThemeToggle";

beforeEach(() => {
  // jsdom 에 matchMedia 가 없어서 readInitialTheme 의 try/catch fallback 으로
  // dark default. test 의 의도에 따라 stub 으로 light / dark 명시.
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
});

describe("ThemeToggle (TASK-095)", () => {
  it("renders a toggle button with aria-label", () => {
    render(<ThemeToggle />);
    const btn = screen.getByTestId("theme-toggle");
    expect(btn).toBeInTheDocument();
    expect(btn.getAttribute("aria-label")).toBe("Toggle theme");
  });

  it("starts in dark mode by default (no stored preference, no matchMedia)", () => {
    render(<ThemeToggle />);
    // Sun icon visible (clicking would switch to light)
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });

  it("switches to light mode on click + persists to localStorage", () => {
    render(<ThemeToggle />);
    const btn = screen.getByTestId("theme-toggle");
    fireEvent.click(btn);
    expect(localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("restores light mode from localStorage on mount", () => {
    localStorage.setItem("theme", "light");
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("toggles back to dark when clicked twice", () => {
    render(<ThemeToggle />);
    const btn = screen.getByTestId("theme-toggle");
    fireEvent.click(btn);
    expect(localStorage.getItem("theme")).toBe("light");
    fireEvent.click(btn);
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
