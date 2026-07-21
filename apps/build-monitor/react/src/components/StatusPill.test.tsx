// TASK-141: StatusPill 테스트 — Astryx `Badge` 이관 + 배지 정책 변경 반영.
//
// 이전 테스트(TASK-096)는 인라인 스타일 세부에 결합돼 있었다 —
// `--dib-pill-color` 값, `padding 4px`, `background ... 15%`, `border ... 30%`.
// 그 구현을 의도적으로 걷어냈으므로 그 단언들도 함께 사라진다.
//
// **지속되는 계약**만 여기서 고정한다:
//   1. `role="status"` + `aria-label="Status: <STATUS>"` — 배지든 평문이든 동일
//   2. 상태 → 심각도 매핑 (이제 "배지로 강조하는가 / 평문인가" 로 표현된다)
//   3. `lifecycleStatus` 가 legacy `status` 보다 우선
//   4. 빈 값 → `UNKNOWN`
//
// 정책(사용자 결정): **주의가 필요한 상태만 배지.** 정상 종료·대기는 평문.
// `success` variant 는 **어떤 상태에도 쓰지 않는다** — 성공은 기대되는
// 결과이므로 강조할 이유가 없고, 모든 행이 초록이면 실패가 묻힌다.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { StatusPill, attentionVariantFor } from "@/components/StatusPill";

afterEach(cleanup);

/** 배지로 렌더됐는지 — Astryx Badge 는 요소에 `astryx-badge` 클래스를 붙인다. */
function isBadge(el: HTMLElement): boolean {
  return el.className.includes("astryx-badge");
}

describe("StatusPill — a11y 계약 (배지/평문 무관)", () => {
  it.each([
    "RECEIVED",
    "QUEUED",
    "PREPARING_SOURCE",
    "BUILDING",
    "BUILD_SUCCESS",
    "COMPLETED",
    "TESTING",
    "DEPLOYING",
    "FAILED",
    "CANCELLED",
    "CLAIMED",
    "TEST_READY",
    "PROVISIONING",
    "PREVIEW_QUEUED",
    "PREVIEW_READY",
    "EXPIRED",
    "ACTIVE",
    "DISABLED"
  ])("%s — role=status + aria-label + 텍스트 노출", (status) => {
    render(<StatusPill status={status} />);
    const el = screen.getByRole("status");
    expect(el).toHaveAttribute("aria-label", `Status: ${status}`);
    // 평문으로 낮춘 상태도 텍스트는 반드시 보여야 한다.
    expect(el.textContent).toContain(status);
  });
});

describe("StatusPill — 배지 정책", () => {
  it.each([
    ["PREPARING_SOURCE", "warning"],
    ["BUILDING", "warning"],
    ["TESTING", "info"],
    ["DEPLOYING", "info"],
    ["CLAIMED", "info"],
    ["TEST_READY", "info"],
    ["PROVISIONING", "info"],
    ["PREVIEW_QUEUED", "info"],
    ["PREVIEW_READY", "info"],
    ["FAILED", "error"],
    ["DISABLED", "error"]
  ])("%s 는 %s 배지로 강조된다", (status, variant) => {
    expect(attentionVariantFor(status)).toBe(variant);
    render(<StatusPill status={status} />);
    expect(isBadge(screen.getByRole("status"))).toBe(true);
  });

  it.each([
    "RECEIVED",
    "QUEUED",
    "BUILD_SUCCESS",
    "TEST_SUCCESS",
    "DEPLOY_SUCCESS",
    "COMPLETED",
    "CANCELLED",
    "EXPIRED",
    "ACTIVE"
  ])("%s 는 평문이다 (배지 아님)", (status) => {
    expect(attentionVariantFor(status)).toBeNull();
    render(<StatusPill status={status} />);
    expect(isBadge(screen.getByRole("status"))).toBe(false);
  });

  it("success variant 는 어떤 상태에도 쓰이지 않는다", () => {
    // 이 정책의 핵심. 성공을 배지로 강조하기 시작하면 목록이 초록으로 덮이고
    // FAILED 가 묻힌다 — 그것이 이번 변경의 이유다.
    const all = [
      "RECEIVED", "QUEUED", "PREPARING_SOURCE", "BUILDING", "BUILD_SUCCESS",
      "TEST_SUCCESS", "DEPLOY_SUCCESS", "COMPLETED", "TESTING", "DEPLOYING",
      "FAILED", "CANCELLED", "CLAIMED", "TEST_READY", "PROVISIONING",
      "PREVIEW_QUEUED", "PREVIEW_READY", "EXPIRED", "ACTIVE", "DISABLED"
    ];
    expect(all.map(attentionVariantFor).filter((v) => v === "success")).toEqual([]);
  });

  it("FAILED 와 COMPLETED 는 시각적으로 구분된다", () => {
    // 정책이 뒤집혀 둘 다 평문이 되거나 둘 다 배지가 되면 목록의 스캔 목적이
    // 사라진다. 한쪽만 강조되는 상태를 고정한다.
    render(<StatusPill status="FAILED" />);
    const failed = isBadge(screen.getByRole("status"));
    cleanup();
    render(<StatusPill status="COMPLETED" />);
    const completed = isBadge(screen.getByRole("status"));

    expect(failed).toBe(true);
    expect(completed).toBe(false);
  });
});

describe("StatusPill — 상태 선택", () => {
  it("빈 status 는 UNKNOWN 으로 표시된다", () => {
    render(<StatusPill status="" />);
    const el = screen.getByRole("status");
    expect(el).toHaveAttribute("aria-label", "Status: UNKNOWN");
    expect(el.textContent).toContain("UNKNOWN");
    expect(isBadge(el)).toBe(false);
  });

  it("lifecycleStatus 가 legacy status 보다 우선한다", () => {
    render(<StatusPill status="BUILDING" lifecycleStatus="ACTIVE" />);
    const el = screen.getByRole("status");
    expect(el).toHaveAttribute("aria-label", "Status: ACTIVE");
    // BUILDING 이었다면 배지였겠지만 ACTIVE 가 이겨서 평문이다.
    expect(isBadge(el)).toBe(false);
  });

  it("알 수 없는 상태는 평문으로 떨어진다", () => {
    render(<StatusPill status="SOMETHING_NEW" />);
    const el = screen.getByRole("status");
    expect(el).toHaveAttribute("aria-label", "Status: SOMETHING_NEW");
    expect(isBadge(el)).toBe(false);
  });
});
