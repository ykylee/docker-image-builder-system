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
    ["EXPIRED", "var(--color-text-secondary)"],
    // TASK-072: RunnerStatus 매핑. AdminRunners 가 canonical StatusPill
    // 을 쓰도록 승격하면서 ACTIVE / DISABLED 가 semantic 색상 (success /
    // danger) 으로 노출. BuildSummary 의 COMPLETED / FAILED 와 같은
    // 색상 의미론 유지 — 운영자가 두 화면을 번갈아 봐도 직관적.
    ["ACTIVE", "var(--color-accent-success)"],
    ["DISABLED", "var(--color-accent-danger)"]
  ])("status %s maps to %s", (status, expectedColor) => {
    render(StatusPill, { status });
    const pill = screen.getByRole("status");
    // TASK-072: aria-label "Build status:" → "Status:" 로 일반화 —
    // BuildSummary / RunnerStatus / 미래 추가 kind 모두 자연스러운 label.
    expect(pill).toHaveAttribute("aria-label", `Status: ${status}`);
    expect((pill as HTMLElement).style.getPropertyValue("--pill-color")).toBe(expectedColor);
  });

  it("falls back to UNKNOWN color for empty status", () => {
    render(StatusPill, { status: "" });
    const pill = screen.getByRole("status");
    // TASK-072: 동일 general label 변경.
    expect(pill).toHaveAttribute("aria-label", "Status: UNKNOWN");
    // TASK-046: UNKNOWN fallback 도 secondary (위 EXPIRED 변경과 동기).
    expect((pill as HTMLElement).style.getPropertyValue("--pill-color")).toBe(
      "var(--color-text-secondary)"
    );
  });

  // TASK-072: lifecycleStatus (canonical) 가 전달되면 그 값을 우선 사용.
  // ACTIVE 가 lifecycleStatus 로 들어와도 같은 success 매핑인지 확인.
  it("lifecycleStatus takes precedence over legacy status", () => {
    render(StatusPill, { status: "BUILDING", lifecycleStatus: "ACTIVE" });
    const pill = screen.getByRole("status");
    expect(pill).toHaveAttribute("aria-label", "Status: ACTIVE");
    expect((pill as HTMLElement).style.getPropertyValue("--pill-color")).toBe(
      "var(--color-accent-success)"
    );
  });
});
