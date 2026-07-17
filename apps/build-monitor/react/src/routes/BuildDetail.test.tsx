// TASK-091: BuildDetail (React) 테스트.
//
// RTL + MemoryRouter + vi.mock api.ts 정합 검증. 8 케이스:
//   - loading state ("Loading build <id>…")
//   - error state (getBuild throw)
//   - not-found state (build null)
//   - 4 block (lifecycle / test / deploy / resultDelivery) + meta header
//   - PhaseTimeline mount + 9 phase list
//   - LogStream mount + entries
//   - Legacy preview block (deprecated badge + previewStatus/previewUrl)
//   - BuildSummary lifecycleStatus 우선 표시
//
// getBuildLogs 실패는 .catch(() => null) 로 silent — LogStream entries 빈
// 배열 fallback 정합 검증.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { BuildDetail } from "@/routes/BuildDetail";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getBuild: vi.fn(),
    getBuildLogs: vi.fn()
  };
});

const MOCK_BUILD: api.BuildStatusResponse = {
  build: {
    buildId: "test-build-0001-1111-2222-333344445555",
    appName: "test-app-detail",
    status: "BUILD_SUCCESS",
    phase: "DOCKER_BUILD_COMPLETED",
    lifecycleStatus: "TESTING",
    previewStatus: "READY",
    previewUrl: "http://127.0.0.1:32770/health",
    createdAt: "2026-07-08T10:00:00.000Z",
    updatedAt: "2026-07-08T10:05:00.000Z"
  },
  lastError: {
    code: "UNKNOWN_ERROR",
    message: ""
  },
  phaseHistory: [
    { phase: "REQUEST_ACCEPTED", completedAt: "2026-07-08T10:00:01.000Z" },
    { phase: "QUEUE_CLAIMED", completedAt: "2026-07-08T10:00:30.000Z" },
    { phase: "SOURCE_PREPARED", completedAt: "2026-07-08T10:01:00.000Z" },
    { phase: "DOCKER_BUILD_STARTED", completedAt: "2026-07-08T10:01:30.000Z" },
    { phase: "DOCKER_BUILD_COMPLETED", completedAt: "2026-07-08T10:04:00.000Z" }
  ],
  currentPhase: {
    phase: "PREVIEW_QUEUED",
    startedAt: "2026-07-08T10:04:30.000Z"
  },
  lifecycle: {
    status: "BUILDING",
    startedAt: "2026-07-08T10:00:01.000Z",
    finishedAt: null
  },
  test: {
    status: "IN_PROGRESS",
    containerRunning: true,
    healthCheckPassed: null,
    portOpen: null,
    stabilityWindowPassed: null
  },
  deploy: {
    status: "NOT_STARTED",
    targetType: null,
    resultRef: null
  },
  resultDelivery: {
    status: "NOT_STARTED",
    mode: null,
    deliveredAt: null
  }
};

const MOCK_LOGS: api.BuildLogsResponse = {
  buildId: "test-build-0001-1111-2222-333344445555",
  logs: [
    {
      id: "log-1",
      buildId: "test-build-0001-1111-2222-333344445555",
      phase: "REQUEST_ACCEPTED",
      message: "Build request accepted",
      createdAt: "2026-07-08T10:00:01.000Z"
    },
    {
      id: "log-2",
      buildId: "test-build-0001-1111-2222-333344445555",
      phase: "DOCKER_BUILD_STARTED",
      message: "docker build started",
      createdAt: "2026-07-08T10:01:30.000Z"
    }
  ]
};

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/builds/${id}`]}>
      <Routes>
        <Route path="/builds" element={<div>Builds list page</div>} />
        <Route path="/builds/:buildId" element={<BuildDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(api.getBuild).mockReset();
  vi.mocked(api.getBuildLogs).mockReset();
});

afterEach(() => {
  cleanup();
});

describe("BuildDetail", () => {
  it("renders loading state initially", () => {
    vi.mocked(api.getBuild).mockImplementation(
      () => new Promise(() => undefined) as Promise<api.BuildStatusResponse>
    );
    vi.mocked(api.getBuildLogs).mockImplementation(
      () => new Promise(() => undefined) as Promise<api.BuildLogsResponse>
    );

    renderAt("test-build-0001-1111-2222-333344445555");

    expect(screen.getByTestId("build-detail-loading")).toBeInTheDocument();
    expect(screen.getByText(/Loading build/)).toBeInTheDocument();
  });

  it("renders error state when getBuild throws", async () => {
    vi.mocked(api.getBuild).mockRejectedValue(new Error("BUILD_NOT_FOUND"));
    vi.mocked(api.getBuildLogs).mockResolvedValue(MOCK_LOGS);

    renderAt("missing-build");

    await waitFor(() => {
      expect(screen.getByTestId("build-detail-error")).toBeInTheDocument();
    });
    expect(screen.getByText(/BUILD_NOT_FOUND/)).toBeInTheDocument();
    expect(screen.getByTestId("back-to-builds")).toBeInTheDocument();
  });

  it("renders canonical 4 block + meta when build loads", async () => {
    vi.mocked(api.getBuild).mockResolvedValue(MOCK_BUILD);
    vi.mocked(api.getBuildLogs).mockResolvedValue(MOCK_LOGS);

    renderAt("test-build-0001-1111-2222-333344445555");

    await waitFor(() => {
      expect(screen.getByTestId("build-detail")).toBeInTheDocument();
    });

    // meta header
    expect(screen.getByText("test-app-detail")).toBeInTheDocument();
    // build.phase "DOCKER_BUILD_COMPLETED" 가 meta 와 PhaseTimeline 양쪽에
    // 노출되므로 within(data-testid="build-detail") scope 로 좁힘.
    const detail = screen.getByTestId("build-detail");
    expect(within(detail).getAllByText("DOCKER_BUILD_COMPLETED").length).toBeGreaterThan(0);
    // lifecycleStatus "TESTING" — StatusPill 의 aria-label "Status: TESTING" 이
    // 매칭되지만 meta 의 Lifecycle dd 안에도 노출. PhaseTimeline 의
    // PREVIEW_QUEUED current 단계 라벨과 별개. within(detail) 로 scope.
    expect(within(detail).getAllByText("TESTING").length).toBeGreaterThan(0);
    // StatusPill 의 lifecycleStatus 우선 표시 검증.
    expect(
      screen.getByRole("status", { name: "Status: TESTING" })
    ).toBeInTheDocument();

    // 4 block
    expect(screen.getByTestId("block-lifecycle")).toBeInTheDocument();
    expect(screen.getByTestId("block-test")).toBeInTheDocument();
    expect(screen.getByTestId("block-deploy")).toBeInTheDocument();
    expect(screen.getByTestId("block-result-delivery")).toBeInTheDocument();
    // test.status "IN_PROGRESS" — test block 만 매칭하도록 within.
    const testBlock = screen.getByTestId("block-test");
    expect(within(testBlock).getByText("IN_PROGRESS")).toBeInTheDocument();
    // deploy.status / resultDelivery.status "NOT_STARTED" — 각각의 block 안에서만.
    const deployBlock = screen.getByTestId("block-deploy");
    expect(within(deployBlock).getByText("NOT_STARTED")).toBeInTheDocument();
    const resultDeliveryBlock = screen.getByTestId("block-result-delivery");
    expect(
      within(resultDeliveryBlock).getByText("NOT_STARTED")
    ).toBeInTheDocument();
  });

  it("mounts PhaseTimeline with 9 phases", async () => {
    vi.mocked(api.getBuild).mockResolvedValue(MOCK_BUILD);
    vi.mocked(api.getBuildLogs).mockResolvedValue(MOCK_LOGS);

    renderAt("test-build-0001-1111-2222-333344445555");

    await waitFor(() => {
      expect(screen.getByTestId("phase-timeline")).toBeInTheDocument();
    });

    // 9 phases 모두 노출 (5 completed + 1 current + 3 pending) — PhaseTimeline
    // 내부에서만 매칭되도록 within 으로 scope 좁힘.
    const timeline = screen.getByTestId("phase-timeline");
    expect(within(timeline).getByText("REQUEST_ACCEPTED")).toBeInTheDocument();
    expect(within(timeline).getByText("DOCKER_BUILD_COMPLETED")).toBeInTheDocument();
    expect(within(timeline).getByText("PREVIEW_QUEUED")).toBeInTheDocument();
    expect(within(timeline).getByText("COMPLETED")).toBeInTheDocument();
    expect(within(timeline).getByText("FAILED")).toBeInTheDocument();
    // 5 completed (REQUEST_ACCEPTED, QUEUE_CLAIMED, SOURCE_PREPARED,
    // DOCKER_BUILD_STARTED, DOCKER_BUILD_COMPLETED) + 1 current
    // (PREVIEW_QUEUED) + 3 pending (PREVIEW_READY, COMPLETED, FAILED).
    expect(timeline.querySelectorAll('[data-status="completed"]')).toHaveLength(5);
    expect(timeline.querySelectorAll('[data-status="current"]')).toHaveLength(1);
    expect(timeline.querySelectorAll('[data-status="pending"]')).toHaveLength(3);
  });

  it("mounts LogStream with entries", async () => {
    vi.mocked(api.getBuild).mockResolvedValue(MOCK_BUILD);
    vi.mocked(api.getBuildLogs).mockResolvedValue(MOCK_LOGS);

    renderAt("test-build-0001-1111-2222-333344445555");

    await waitFor(() => {
      expect(screen.getByTestId("log-stream")).toBeInTheDocument();
    });

    const entries = screen.getAllByTestId("log-entry");
    expect(entries).toHaveLength(2);
    expect(screen.getByText("Build request accepted")).toBeInTheDocument();
    expect(screen.getByText("docker build started")).toBeInTheDocument();
  });

  it("tolerates getBuildLogs failure (renders empty LogStream)", async () => {
    vi.mocked(api.getBuild).mockResolvedValue(MOCK_BUILD);
    vi.mocked(api.getBuildLogs).mockRejectedValue(new Error("LOGS_NOT_FOUND"));

    renderAt("test-build-0001-1111-2222-333344445555");

    await waitFor(() => {
      expect(screen.getByTestId("log-stream")).toBeInTheDocument();
    });
    expect(screen.queryAllByTestId("log-entry")).toHaveLength(0);
  });

  it("renders Legacy preview block with deprecated badge + preview fields", async () => {
    vi.mocked(api.getBuild).mockResolvedValue(MOCK_BUILD);
    vi.mocked(api.getBuildLogs).mockResolvedValue(MOCK_LOGS);

    renderAt("test-build-0001-1111-2222-333344445555");

    await waitFor(() => {
      expect(screen.getByTestId("block-legacy-preview")).toBeInTheDocument();
    });

    expect(screen.getByText(/Legacy preview/)).toBeInTheDocument();
    expect(screen.getByText("deprecated")).toBeInTheDocument();
    expect(screen.getByText("READY")).toBeInTheDocument(); // previewStatus
    expect(
      screen.getByText("http://127.0.0.1:32770/health")
    ).toBeInTheDocument();
  });

  it("uses lifecycleStatus over status for StatusPill label", async () => {
    vi.mocked(api.getBuild).mockResolvedValue(MOCK_BUILD);
    vi.mocked(api.getBuildLogs).mockResolvedValue(MOCK_LOGS);

    renderAt("test-build-0001-1111-2222-333344445555");

    await waitFor(() => {
      expect(screen.getByTestId("build-detail")).toBeInTheDocument();
    });

    // StatusPill 의 aria-label "Status: TESTING" — lifecycleStatus 가
    // build.status (BUILD_SUCCESS) 를 override.
    expect(
      screen.getByRole("status", { name: "Status: TESTING" })
    ).toBeInTheDocument();
  });
});
