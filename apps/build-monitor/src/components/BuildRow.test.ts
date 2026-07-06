import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/svelte";
import BuildRow from "./BuildRow.svelte";
import type { BuildSummary } from "../lib/api";

afterEach(() => {
  cleanup();
});

const sample: BuildSummary = {
  buildId: "11111111-1111-1111-1111-111111111111",
  appName: "demo-frontend",
  status: "BUILDING",
  // lifecycleStatus (TASK-052) — canonical 12-state union 의 optional field.
  // StatusPill 이 lifecycleStatus 를 우선 표시 (PR #14 follow-up 보완).
  lifecycleStatus: "PREPARING_SOURCE",
  phase: "DOCKER_BUILD_STARTED",
  previewStatus: "NOT_REQUESTED",
  previewUrl: null,
  createdAt: new Date(Date.now() - 60_000).toISOString(),
  updatedAt: new Date(Date.now() - 60_000).toISOString()
};

const sampleLegacyStatusOnly: BuildSummary = {
  // lifecycleStatus 가 없는 (legacy server 응답만) 케이스 — StatusPill 이
  // legacy `status` 로 fallback 하는 경로를 검증.
  buildId: "22222222-2222-2222-2222-222222222222",
  appName: "legacy-app",
  status: "BUILDING",
  lifecycleStatus: undefined,
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
    // StatusPill 이 lifecycleStatus (canonical PREPARING_SOURCE) 를 우선 표시.
    expect(
      screen.getByRole("status", { name: /Status: PREPARING_SOURCE/i })
    ).toBeInTheDocument();
    // appName 노출 (legacy projectId/repositoryId 컬럼은 더 이상 렌더 안 함)
    expect(screen.getByText("demo-frontend")).toBeInTheDocument();
    // buildId prefix (앞 8자)
    expect(screen.getByText("11111111")).toBeInTheDocument();
  });

  it("falls back to legacy status when lifecycleStatus is absent", () => {
    render(BuildRow, { build: sampleLegacyStatusOnly });
    expect(
      screen.getByRole("status", { name: /Status: BUILDING/i })
    ).toBeInTheDocument();
  });
});
