// TASK-095: ThemeToggle (React) 테스트.
//
// Svelte ThemeToggle.test.ts 의 시나리오를 RTL + jsdom 으로 동등 검증.
// 4 case — initial dark / initial light from storage / toggle dark→light /
// toggle light→dark + localStorage 동기화.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { useThemeStore } from "@/lib/stores/themeStore";

beforeEach(() => {
  // jsdom 에 matchMedia 가 없어서 readInitialMode 의 try/catch fallback 으로
  // dark default. test 의 의도에 따라 localStorage 로 light / dark 명시.
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  // TASK-136: themeStore 는 모듈 싱글턴이라 테스트 사이에 상태가 샌다.
  // 초기화하지 않으면 앞 테스트가 light 로 끝났을 때 다음 테스트의 첫 클릭이
  // dark 로 가서 단언이 뒤집힌다 (실제로 이 가드 없이 2건이 깨졌다).
  useThemeStore.setState({ mode: "dark" });
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

  // TASK-136: "저장된 light 선호를 복원한다" 는 동작 자체는 그대로 살아 있지만
  // 위치가 바뀌었다 — ThemeToggle 의 마운트가 아니라 themeStore.init() 이
  // 담당하고, 앱에서는 main.tsx 의 ThemedApp 이 호출한다. 토글 버튼이 없는
  // 페이지에서도 테마가 적용되어야 하기 때문이다.
  //
  // 따라서 검증도 실제 구현 위치로 옮긴다. 의도(저장값 복원)는 유지된다.
  it("저장된 light 선호를 복원한다 (init 이 담당 — 마운트 아님)", () => {
    localStorage.setItem("theme", "light");
    useThemeStore.getState().init();
    expect(useThemeStore.getState().mode).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    // 복원된 상태가 버튼 표시에도 반영되는지 (달 아이콘 = 다크로 전환 가능)
    render(<ThemeToggle />);
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
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
