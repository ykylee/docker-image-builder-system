import { describe, it, expect } from "vitest";
import {
  matchesChip,
  CANONICAL_SUCCESS_STATUSES,
  type ChipFilterable
} from "./chipFilter.js";

const sample = (
  status: string,
  lifecycleStatus?: string
): ChipFilterable => ({ status, lifecycleStatus });

describe("matchesChip", () => {
  it("returns true for ALL regardless of fields", () => {
    expect(matchesChip(sample("BUILDING"), "ALL")).toBe(true);
    expect(matchesChip(sample("FAILED"), "ALL")).toBe(true);
    expect(matchesChip(sample("UNKNOWN", "DEPLOYING"), "ALL")).toBe(true);
  });

  it("matches by legacy status alone", () => {
    expect(matchesChip(sample("BUILDING"), "BUILDING")).toBe(true);
    expect(matchesChip(sample("FAILED"), "FAILED")).toBe(true);
  });

  it("matches by canonical lifecycleStatus", () => {
    expect(matchesChip(sample("UNKNOWN", "DEPLOYING"), "BUILDING")).toBe(false);
    expect(matchesChip(sample("UNKNOWN", "BUILDING"), "BUILDING")).toBe(true);
  });

  it("BUILDING chip excludes canonical success (migrated to COMPLETED)", () => {
    for (const success of CANONICAL_SUCCESS_STATUSES) {
      // legacy status 는 BUILDING 이지만 canonical 이 success 면
      // BUILDING chip 에선 빠지고 COMPLETED chip 으로 분류.
      expect(matchesChip(sample("BUILDING", success), "BUILDING")).toBe(false);
    }
  });

  it("COMPLETED chip matches any canonical success status", () => {
    for (const success of CANONICAL_SUCCESS_STATUSES) {
      expect(matchesChip(sample("BUILDING", success), "COMPLETED")).toBe(true);
      // legacy status 만 있을 때는 매칭 안 됨 — canonical 표면이 SSOT.
      expect(matchesChip(sample(success), "COMPLETED")).toBe(false);
    }
  });

  it("FAILED chip matches by either legacy or canonical", () => {
    expect(matchesChip(sample("FAILED", "BUILDING"), "FAILED")).toBe(true);
    expect(matchesChip(sample("BUILDING", "FAILED"), "FAILED")).toBe(true);
  });
});