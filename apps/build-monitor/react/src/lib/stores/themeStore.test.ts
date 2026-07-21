// TASK-136: themeStore 테스트.
//
// 테마 상태를 ThemeToggle 지역 state 에서 store 로 끌어올리면서, 그동안
// 컴포넌트 테스트에 얹혀 있던 동작들(저장값 복원 / 시스템 선호 fallback /
// DOM 반영)을 store 레벨에서 직접 고정한다.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readInitialMode, useThemeStore } from "./themeStore";

function resetEnvironment(): void {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  useThemeStore.setState({ mode: "dark" });
}

beforeEach(resetEnvironment);
afterEach(() => {
  resetEnvironment();
  vi.unstubAllGlobals();
});

describe("readInitialMode", () => {
  it("저장값이 있으면 그것을 쓴다", () => {
    localStorage.setItem("theme", "light");
    expect(readInitialMode()).toBe("light");
  });

  it("저장값이 우선한다 — 시스템이 light 여도 저장값 dark 를 따른다", () => {
    localStorage.setItem("theme", "dark");
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(readInitialMode()).toBe("dark");
  });

  it("저장값이 없으면 시스템 선호를 따른다", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(readInitialMode()).toBe("light");
  });

  it("저장값도 matchMedia 도 없으면 dark", () => {
    // 기본값이 dark 인 것은 의도된 제품 결정이다. TASK-132 의 P0 가 오래
    // 잠복한 이유이기도 하므로 명시적으로 고정한다.
    expect(readInitialMode()).toBe("dark");
  });

  it("알 수 없는 저장값은 무시한다", () => {
    localStorage.setItem("theme", "sepia");
    expect(readInitialMode()).toBe("dark");
  });
});

describe("themeStore", () => {
  it("init 이 저장값을 복원하고 DOM 에 반영한다", () => {
    localStorage.setItem("theme", "light");
    useThemeStore.getState().init();

    expect(useThemeStore.getState().mode).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("setMode(dark) 는 data-theme 속성을 제거한다", () => {
    // 다크는 tokens.css 의 `:root` 기본값이므로 속성이 **없는** 것이 정상이다.
    // 속성을 "dark" 로 붙이면 light cascade 선택자와 어긋난다.
    useThemeStore.getState().setMode("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    useThemeStore.getState().setMode("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("setMode 가 localStorage 에 영속화한다", () => {
    useThemeStore.getState().setMode("light");
    expect(localStorage.getItem("theme")).toBe("light");

    useThemeStore.getState().setMode("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("toggle 이 두 모드를 왕복한다", () => {
    expect(useThemeStore.getState().mode).toBe("dark");

    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().mode).toBe("light");

    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().mode).toBe("dark");
  });

  it("localStorage 저장 실패가 테마 전환을 막지 않는다", () => {
    // Safari private mode 등에서 setItem 이 던진다. 저장은 실패해도 이번
    // 세션 동안의 테마 전환은 정상 동작해야 한다.
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    expect(() => useThemeStore.getState().setMode("light")).not.toThrow();
    expect(useThemeStore.getState().mode).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    setItem.mockRestore();
  });
});
