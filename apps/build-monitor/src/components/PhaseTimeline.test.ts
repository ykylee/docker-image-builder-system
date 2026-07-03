import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import PhaseTimeline from "./PhaseTimeline.svelte";

// aria-label 의 substring 매치를 피하기 위해 data-phase + class 로 직접
// selector 를 만든다. svelte 5 + vitest + jsdom 환경에서 getByLabelText
// 가 anchor-like substring 매치를 해서 status 가 같은 listitem 들이
// 다 잡히는 케이스가 있다 (예: "REQUEST_ACCEPTED — completed" 검색 시
// 다른 phase 의 aria-label 도 매치됨). 그래서 data attribute 기반
// selector 가 더 안전.

function itemsByStatus(container: HTMLElement) {
  const all = Array.from(container.querySelectorAll<HTMLElement>("li.step"));
  return {
    completed: all.filter((el) => el.classList.contains("completed")),
    current: all.filter((el) => el.classList.contains("current")),
    pending: all.filter((el) => el.classList.contains("pending"))
  };
}

describe("PhaseTimeline (TASK-050)", () => {
  it("renders all 9 canonical phases regardless of history length", () => {
    const { container } = render(PhaseTimeline, { phaseHistory: [], currentPhase: null });
    const all = container.querySelectorAll("li.step");
    expect(all).toHaveLength(9);
    const dataPhases = Array.from(all).map((el) => el.getAttribute("data-phase"));
    expect(dataPhases).toEqual([
      "REQUEST_ACCEPTED",
      "QUEUE_CLAIMED",
      "SOURCE_PREPARED",
      "DOCKER_BUILD_STARTED",
      "DOCKER_BUILD_COMPLETED",
      "PREVIEW_QUEUED",
      "PREVIEW_READY",
      "COMPLETED",
      "FAILED"
    ]);
  });

  it("marks completed phases with a timestamp and current with in-progress", () => {
    const { container } = render(PhaseTimeline, {
      phaseHistory: [
        { phase: "REQUEST_ACCEPTED", completedAt: "2026-07-03T08:00:00.000Z" },
        { phase: "QUEUE_CLAIMED", completedAt: "2026-07-03T08:00:05.000Z" },
        { phase: "SOURCE_PREPARED", completedAt: "2026-07-03T08:00:10.000Z" }
      ],
      currentPhase: { phase: "DOCKER_BUILD_STARTED", startedAt: "2026-07-03T08:00:15.000Z" }
    });
    const { completed, current, pending } = itemsByStatus(container);
    expect(completed).toHaveLength(3);
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("data-phase")).toBe("DOCKER_BUILD_STARTED");
    expect(current[0].textContent).toContain("in-progress");
    expect(pending).toHaveLength(5);
  });

  it("renders the completed timestamp for each completed phase", () => {
    const { container } = render(PhaseTimeline, {
      phaseHistory: [
        { phase: "REQUEST_ACCEPTED", completedAt: "2026-07-03T08:00:00.000Z" }
      ],
      currentPhase: null
    });
    const completed = container.querySelector("li.step.completed");
    expect(completed).not.toBeNull();
    // toLocaleString 결과는 locale-dependent. 어떤 형식이라도 시간이
    // 들어갔는지만 확인. "2026" 또는 "08:00" 이 text 안에 있어야 함.
    expect(completed?.textContent).toMatch(/2026|08:00/);
  });

  it("treats null currentPhase as terminal — all history entries completed, no current", () => {
    const { container } = render(PhaseTimeline, {
      phaseHistory: [
        { phase: "REQUEST_ACCEPTED", completedAt: "2026-07-03T08:00:00.000Z" },
        { phase: "DOCKER_BUILD_STARTED", completedAt: "2026-07-03T08:00:15.000Z" },
        { phase: "COMPLETED", completedAt: "2026-07-03T08:01:00.000Z" }
      ],
      currentPhase: null
    });
    const { completed, current } = itemsByStatus(container);
    expect(completed).toHaveLength(3);
    expect(current).toHaveLength(0);
  });

  it("ignores phaseHistory entries with phases outside the canonical 9", () => {
    const { container } = render(PhaseTimeline, {
      phaseHistory: [
        { phase: "REQUEST_ACCEPTED", completedAt: "2026-07-03T08:00:00.000Z" },
        { phase: "WHATEVER_NEW_PHASE", completedAt: "2026-07-03T08:00:05.000Z" }
      ],
      currentPhase: null
    });
    const { completed } = itemsByStatus(container);
    // WHATEVER_NEW_PHASE 는 canonical 9 phases list 에 안 들어가서
    // DOM 에도 안 등장. REQUEST_ACCEPTED 만 completed.
    expect(completed).toHaveLength(1);
    const allDataPhases = Array.from(
      container.querySelectorAll("li.step")
    ).map((el) => el.getAttribute("data-phase"));
    expect(allDataPhases).not.toContain("WHATEVER_NEW_PHASE");
  });
});
