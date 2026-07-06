import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import FilterChips from "./FilterChips.svelte";

describe("FilterChips (TASK-083 — admin UI visual + nav 정합)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders one button per option", () => {
    render(FilterChips, {
      options: ["ALL", "BUILDING", "FAILED"],
      selected: "ALL",
      onSelect: () => {}
    });
    expect(screen.getByRole("button", { name: "ALL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "BUILDING" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "FAILED" })).toBeInTheDocument();
  });

  it("applies aria-pressed=true only to the selected option", () => {
    render(FilterChips, {
      options: ["ALL", "BUILDING", "FAILED"],
      selected: "BUILDING",
      onSelect: () => {}
    });
    expect(screen.getByRole("button", { name: "ALL" }).getAttribute("aria-pressed"))
      .toBe("false");
    expect(screen.getByRole("button", { name: "BUILDING" }).getAttribute("aria-pressed"))
      .toBe("true");
    expect(screen.getByRole("button", { name: "FAILED" }).getAttribute("aria-pressed"))
      .toBe("false");
  });

  it("applies .chip to every button and .active only to the selected", () => {
    render(FilterChips, {
      options: ["ALL", "BUILDING"],
      selected: "BUILDING",
      onSelect: () => {}
    });
    expect(screen.getByRole("button", { name: "BUILDING" })).toHaveClass("chip");
    expect(screen.getByRole("button", { name: "BUILDING" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "ALL" })).toHaveClass("chip");
    expect(screen.getByRole("button", { name: "ALL" })).not.toHaveClass("active");
  });

  it("forwards the clicked chip's value to onSelect", async () => {
    const onSelect = vi.fn();
    render(FilterChips, {
      options: ["ALL", "ACTIVE", "DISABLED"],
      selected: "ALL",
      onSelect
    });
    await fireEvent.click(screen.getByRole("button", { name: "DISABLED" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("DISABLED");
  });

  it("exposes a labelled role=group matching the given ariaLabel", () => {
    render(FilterChips, {
      options: ["ALL"],
      selected: "ALL",
      onSelect: () => {},
      ariaLabel: "Status filter"
    });
    expect(screen.getByRole("group", { name: "Status filter" })).toBeInTheDocument();
  });

  it("falls back to 'Filter options' when ariaLabel is omitted", () => {
    render(FilterChips, {
      options: ["ALL"],
      selected: "ALL",
      onSelect: () => {}
    });
    expect(screen.getByRole("group", { name: "Filter options" })).toBeInTheDocument();
  });

  // TASK-083 디자인 토큰 가드: chip.active 의 box-shadow 가 디자인 토큰
  // `--shadow-glow` 를 사용해야 dark / light 모드별 자동 follow 가 가능.
  // happy-dom 의 document.styleSheets 가 svelte 컴파일된 scoped css 를
  // 인식하지 못하는 환경 의존성 때문에 source-level 회귀 가드로 검증.
  // raw rgba 잔재 (`rgba(99, 102, 241, ...)`) 가 `.chip.active` 박스
  // 그림자에 남아 있지 않은지도 동시에 회귀 가드.
  it("chip.active 의 box-shadow 가 디자인 토큰 `--shadow-glow` 를 사용한다", () => {
    const src = readFileSync(
      resolve(__dirname, "./FilterChips.svelte"),
      "utf-8"
    );
    const styleMatch = src.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    expect(styleMatch).not.toBeNull();
    // 코멘트(/* ... */) 제거 — 모범 사례 문구 안의 `rgba(99,102,241,...)`
    // 언급이 raw rgba 잔재 가드를 오탐하지 않도록.
    const css = styleMatch![1].replace(/\/\*[\s\S]*?\*\//g, "");
    // chip.active 가 디자인 토큰 var(--shadow-glow) 를 사용하는지 검증.
    const usesToken = /\.chip\.active\s*\{[^}]*box-shadow\s*:\s*var\(--shadow-glow\)/.test(
      css
    );
    // raw rgba 잔재 (TASK-083 봉인 대상) 가 chip.active 의 box-shadow
    // 안에 다시 등장하면 fail.
    const chipActiveBlock = css.match(
      /\.chip\.active\s*\{([^}]*)\}/,
    );
    const usesRawRgba =
      !!chipActiveBlock &&
      /rgba\(99,\s*102,\s*241/.test(chipActiveBlock[1] ?? "");
    expect(usesToken).toBe(true);
    expect(usesRawRgba).toBe(false);
  });
});
