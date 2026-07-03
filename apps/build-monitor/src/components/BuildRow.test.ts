import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/svelte";
import BuildRow from "./BuildRow.svelte";
import type { BuildSummary } from "../lib/api";

afterEach(() => {
  cleanup();
});

const sample: BuildSummary = {
  buildId: "11111111-1111-1111-1111-111111111111",
  projectId: "demo-frontend",
  repositoryId: "ykylee/demo-frontend",
  status: "BUILDING",
  phase: "DOCKER_BUILD_STARTED",
  previewStatus: "NOT_REQUESTED",
  previewUrl: null,
  createdAt: new Date(Date.now() - 60_000).toISOString(),
  updatedAt: new Date(Date.now() - 60_000).toISOString()
};

describe("BuildRow", () => {
  it("renders status pill, project, repository, and short buildId link", () => {
    render(BuildRow, { build: sample });
    const row = screen.getByTestId("build-row");
    expect(row).toBeInTheDocument();
    // StatusPill 이 aria-label 로 노출
    expect(
      screen.getByRole("status", { name: /Build status: BUILDING/i })
    ).toBeInTheDocument();
    // project / repository 노출
    expect(screen.getByText("demo-frontend")).toBeInTheDocument();
    expect(screen.getByText("ykylee/demo-frontend")).toBeInTheDocument();
    // buildId prefix (앞 8자)
    expect(screen.getByText("11111111")).toBeInTheDocument();
  });
});
