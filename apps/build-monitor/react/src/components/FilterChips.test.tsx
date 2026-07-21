// TASK-095: FilterChips (React) 테스트.
//
// Svelte FilterChips.test.ts 의 시나리오를 RTL + jsdom 으로 동등 검증.
// 6 case — 렌더링 / aria-pressed / onSelect / active style / hover style /
// default aria-label.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { FilterChips } from "@/components/FilterChips";

afterEach(() => {
  cleanup();
});

describe("FilterChips (TASK-095)", () => {
  it("renders one button per option", () => {
    render(
      <FilterChips
        options={["ALL", "BUILDING", "COMPLETED", "FAILED"]}
        selected="ALL"
        onSelect={() => undefined}
      />
    );
    expect(screen.getByTestId("filter-chip-ALL")).toBeInTheDocument();
    expect(screen.getByTestId("filter-chip-BUILDING")).toBeInTheDocument();
    expect(screen.getByTestId("filter-chip-COMPLETED")).toBeInTheDocument();
    expect(screen.getByTestId("filter-chip-FAILED")).toBeInTheDocument();
  });

  it("marks selected option aria-pressed=true", () => {
    render(
      <FilterChips
        options={["ALL", "BUILDING"]}
        selected="BUILDING"
        onSelect={() => undefined}
      />
    );
    expect(screen.getByTestId("filter-chip-ALL")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByTestId("filter-chip-BUILDING")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("calls onSelect with clicked value", () => {
    const onSelect = vi.fn();
    render(
      <FilterChips
        options={["ALL", "BUILDING", "FAILED"]}
        selected="ALL"
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByTestId("filter-chip-BUILDING"));
    expect(onSelect).toHaveBeenCalledWith("BUILDING");
  });

  it("uses default aria-label 'Filter options' on group", () => {
    render(
      <FilterChips
        options={["ALL"]}
        selected="ALL"
        onSelect={() => undefined}
      />
    );
    expect(screen.getByRole("group")).toHaveAttribute(
      "aria-label",
      "Filter options"
    );
  });

  it("uses custom aria-label on group", () => {
    render(
      <FilterChips
        options={["ALL"]}
        selected="ALL"
        onSelect={() => undefined}
        ariaLabel="Status filter"
      />
    );
    expect(screen.getByRole("group")).toHaveAttribute(
      "aria-label",
      "Status filter"
    );
  });

  it("active chip renders with primary background + glow shadow (design token)", () => {
    render(
      <FilterChips
        options={["ALL", "BUILDING"]}
        selected="BUILDING"
        onSelect={() => undefined}
      />
    );
    const active = screen.getByTestId("filter-chip-BUILDING");
    expect(active.style.background).toContain("var(--dib-color-accent-primary)");
    expect(active.style.boxShadow).toContain("var(--dib-shadow-glow)");
  });

  it("inactive chip renders without primary background", () => {
    render(
      <FilterChips
        options={["ALL", "BUILDING"]}
        selected="BUILDING"
        onSelect={() => undefined}
      />
    );
    const inactive = screen.getByTestId("filter-chip-ALL");
    expect(inactive.style.background).toBe("transparent");
  });
});
