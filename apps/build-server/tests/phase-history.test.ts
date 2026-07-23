import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { BuildSummary } from "@docker-image-builder-system/shared-contract";

import {
  advancePhaseHistory,
  isTerminalBuildPhase,
  normalizePhaseHistory,
  toPhaseTimeline
} from "../src/repositories/phase-history.js";

function buildSummary(overrides: Partial<BuildSummary> = {}): BuildSummary {
  return {
    buildId: "00000000-0000-0000-0000-000000000001",
    appName: "app-1",
    status: "QUEUED",
    phase: "REQUEST_ACCEPTED",
    previewUrl: null,
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
    ...overrides
  };
}

describe("phase-history helpers", () => {
  it("normalizePhaseHistory filters malformed entries", () => {
    const normalized = normalizePhaseHistory([
      { phase: "REQUEST_ACCEPTED", completedAt: "2026-07-03T00:00:01.000Z" },
      { phase: 123, completedAt: "x" },
      null
    ]);

    assert.deepEqual(normalized, [
      { phase: "REQUEST_ACCEPTED", completedAt: "2026-07-03T00:00:01.000Z" }
    ]);
  });

  it("advancePhaseHistory appends previous phase and terminal phase", () => {
    const advanced = advancePhaseHistory(
      [],
      "DOCKER_BUILD_COMPLETED",
      "FAILED",
      "2026-07-03T00:00:03.000Z"
    );

    assert.deepEqual(advanced, [
      { phase: "DOCKER_BUILD_COMPLETED", completedAt: "2026-07-03T00:00:03.000Z" },
      { phase: "FAILED", completedAt: "2026-07-03T00:00:03.000Z" }
    ]);
  });

  it("toPhaseTimeline derives currentPhase startedAt from latest completed transition", () => {
    const summary = buildSummary({
      status: "BUILDING",
      phase: "SOURCE_PREPARED",
      updatedAt: "2026-07-03T00:00:02.000Z"
    });

    const timeline = toPhaseTimeline(summary, [
      { phase: "REQUEST_ACCEPTED", completedAt: "2026-07-03T00:00:01.000Z" },
      { phase: "QUEUE_CLAIMED", completedAt: "2026-07-03T00:00:02.000Z" }
    ]);

    assert.deepEqual(timeline.currentPhase, {
      phase: "SOURCE_PREPARED",
      startedAt: "2026-07-03T00:00:02.000Z"
    });
  });

  it("toPhaseTimeline returns null currentPhase for terminal phase", () => {
    const summary = buildSummary({
      status: "FAILED",
      phase: "FAILED",
      updatedAt: "2026-07-03T00:00:03.000Z"
    });

    const timeline = toPhaseTimeline(summary, [
      { phase: "REQUEST_ACCEPTED", completedAt: "2026-07-03T00:00:01.000Z" },
      { phase: "FAILED", completedAt: "2026-07-03T00:00:03.000Z" }
    ]);

    assert.equal(timeline.currentPhase, null);
    assert.equal(isTerminalBuildPhase(summary.phase), true);
  });
});
