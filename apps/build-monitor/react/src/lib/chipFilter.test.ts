import { describe, expect, it } from "vitest";

import { matchesChip } from "@/lib/chipFilter";

describe("matchesChip", () => {
  it("includes canonical COMPLETED lifecycle rows in the Completed filter", () => {
    expect(matchesChip({ status: "COMPLETED", lifecycleStatus: "COMPLETED" }, "COMPLETED")).toBe(true);
  });

  it("keeps failed rows out of the Completed filter", () => {
    expect(matchesChip({ status: "FAILED", lifecycleStatus: "FAILED" }, "COMPLETED")).toBe(false);
  });
});
