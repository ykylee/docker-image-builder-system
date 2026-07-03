import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/svelte";
import StatusPill from "./StatusPill.svelte";

afterEach(() => {
  cleanup();
});

describe("StatusPill", () => {
  it.each([
    ["QUEUED", "var(--color-text-secondary)"],
    ["BUILDING", "var(--color-accent-warning)"],
    ["COMPLETED", "var(--color-accent-success)"],
    ["FAILED", "var(--color-accent-danger)"],
    ["PREVIEW_READY", "var(--color-accent-info)"],
    ["EXPIRED", "var(--color-text-muted)"]
  ])("status %s maps to %s", (status, expectedColor) => {
    render(StatusPill, { status });
    const pill = screen.getByRole("status");
    expect(pill).toHaveAttribute("aria-label", `Build status: ${status}`);
    expect((pill as HTMLElement).style.getPropertyValue("--pill-color")).toBe(expectedColor);
  });

  it("falls back to UNKNOWN color for empty status", () => {
    render(StatusPill, { status: "" });
    const pill = screen.getByRole("status");
    expect(pill).toHaveAttribute("aria-label", "Build status: UNKNOWN");
    expect((pill as HTMLElement).style.getPropertyValue("--pill-color")).toBe(
      "var(--color-text-muted)"
    );
  });
});
