// TASK-096: StatusPill (React) 테스트.
//
// Svelte StatusPill.test.ts 의 11 케이스를 RTL + jsdom 으로 동등 검증.
// TASK-090 self-review 의 디자인 강화분 (size-sm / padding 6px / alpha 20%) 을
// 본 TASK 에서 Svelte baseline (size-xs / padding 4px / alpha 15%) 으로
// 통일 — 양쪽 모두 의미상 1:1 정합.
//
// 11 케이스 —
//   1-9: canonical / legacy preview / RunnerStatus 의 colorFor 매핑
//  10: empty status → UNKNOWN fallback
//  11: lifecycleStatus 우선

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { StatusPill } from "@/components/StatusPill";

afterEach(() => {
  cleanup();
});

describe("StatusPill (TASK-096)", () => {
  it.each([
    // Canonical lifecycle (TASK-052)
    ["RECEIVED", "var(--dib-color-text-secondary)"],
    ["QUEUED", "var(--dib-color-text-secondary)"],
    ["PREPARING_SOURCE", "var(--dib-color-accent-warning)"],
    ["BUILDING", "var(--dib-color-accent-warning)"],
    ["BUILD_SUCCESS", "var(--dib-color-accent-success)"],
    ["TEST_SUCCESS", "var(--dib-color-accent-success)"],
    ["DEPLOY_SUCCESS", "var(--dib-color-accent-success)"],
    ["COMPLETED", "var(--dib-color-accent-success)"],
    ["TESTING", "var(--dib-color-accent-info)"],
    ["DEPLOYING", "var(--dib-color-accent-info)"],
    ["FAILED", "var(--dib-color-accent-danger)"],
    ["CANCELLED", "var(--dib-color-text-secondary)"],
    // Legacy preview-era (migration shim)
    ["CLAIMED", "var(--dib-color-accent-info)"],
    ["TEST_READY", "var(--dib-color-accent-info)"],
    ["PROVISIONING", "var(--dib-color-accent-info)"],
    ["PREVIEW_QUEUED", "var(--dib-color-accent-info)"],
    ["PREVIEW_READY", "var(--dib-color-accent-info)"],
    // EXPIRED: TASK-046 — secondary for contrast on light mode
    ["EXPIRED", "var(--dib-color-text-secondary)"],
    // RunnerStatus (TASK-072)
    ["ACTIVE", "var(--dib-color-accent-success)"],
    ["DISABLED", "var(--dib-color-accent-danger)"]
  ])("status %s maps to %s", (status, expectedColor) => {
    render(<StatusPill status={status} />);
    const pill = screen.getByRole("status");
    // TASK-072: aria-label "Build status:" → "Status:" general.
    expect(pill).toHaveAttribute("aria-label", `Status: ${status}`);
    expect((pill as HTMLElement).style.getPropertyValue("--dib-pill-color")).toBe(
      expectedColor
    );
  });

  it("falls back to UNKNOWN color for empty status", () => {
    render(<StatusPill status="" />);
    const pill = screen.getByRole("status");
    expect(pill).toHaveAttribute("aria-label", "Status: UNKNOWN");
    expect((pill as HTMLElement).style.getPropertyValue("--dib-pill-color")).toBe(
      "var(--dib-color-text-secondary)"
    );
  });

  it("lifecycleStatus takes precedence over legacy status (TASK-060/072)", () => {
    render(<StatusPill status="BUILDING" lifecycleStatus="ACTIVE" />);
    const pill = screen.getByRole("status");
    expect(pill).toHaveAttribute("aria-label", "Status: ACTIVE");
    expect((pill as HTMLElement).style.getPropertyValue("--dib-pill-color")).toBe(
      "var(--dib-color-accent-success)"
    );
  });

  // TASK-096: 디자인 토큰 baseline 정합 — React 측 size-xs / padding 4px /
  // alpha 15% 가 Svelte StatusPill 과 의미상 동일.
  it("renders with baseline design tokens (size-xs / padding 4px / alpha 15%)", () => {
    render(<StatusPill status="COMPLETED" />);
    const pill = screen.getByRole("status");
    expect(pill.style.padding).toContain("4px");
    expect(pill.style.padding).toContain("var(--dib-space-md)");
    expect(pill.style.fontSize).toBe("var(--dib-size-xs)");
    expect(pill.style.background).toContain("15%");
    expect(pill.style.border).toContain("30%");
    expect(pill.style.boxShadow).toContain("8px");
    expect(pill.style.boxShadow).toContain("15%");
  });
});
