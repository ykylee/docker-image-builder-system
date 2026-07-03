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
    // TASK-046: EXPIRED 는 light 모드 에서 --color-text-muted 가 canvas
    // 위 15% alpha-mix 시 거의 invisible. secondary 로 올려서 contrast
    // 확보. (dark 모드 에선 둘 다 충분한 contrast.)
    ["EXPIRED", "var(--color-text-secondary)"]
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
    // TASK-046: UNKNOWN fallback 도 secondary (위 EXPIRED 변경과 동기).
    expect((pill as HTMLElement).style.getPropertyValue("--pill-color")).toBe(
      "var(--color-text-secondary)"
    );
  });
});
