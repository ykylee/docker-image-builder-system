// TASK-091: BuildDetail (React) 테스트.
//
// RTL + MemoryRouter + vi.mock api.ts 정합 검증. 8 케이스:
//   - loading state ("Loading build <id>…")
//   - error state (getBuild throw)
//   - not-found state (build null)
//   - 4 block (lifecycle / test / deploy / resultDelivery) + meta header
//   - PhaseTimeline mount + 11 phase list (TASK-150: shared-contract 와 정합)
//   - LogStream mount + entries
//   - Container test block 의 Runtime URL 노출 (TASK-160: legacy preview block 제거)
//   - BuildSummary lifecycleStatus 우선 표시
//
// getBuildLogs 실패는 .catch(() => null) 로 silent — LogStream entries 빈
// 배열 fallback 정합 검증.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { BuildDetail } from "@/routes/BuildDetail";
import * as api from "@/lib/api";
import { useBuildDetailStore } from "@/lib/stores/buildDetailStore";

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
    runtimeUrl: "http://127.0.0.1:32770/health",
    createdAt: "2026-07-08T10:00:00.000Z",
    updatedAt: "2026-07-08T10:05:00.000Z"
  },
  lastError: null,
  phaseHistory: [
    { phase: "REQUEST_ACCEPTED", completedAt: "2026-07-08T10:00:01.000Z" },
    { phase: "QUEUE_CLAIMED", completedAt: "2026-07-08T10:00:30.000Z" },
    { phase: "SOURCE_PREPARED", completedAt: "2026-07-08T10:01:00.000Z" },
    { phase: "DOCKER_BUILD_STARTED", completedAt: "2026-07-08T10:01:30.000Z" },
    { phase: "DOCKER_BUILD_COMPLETED", completedAt: "2026-07-08T10:04:00.000Z" }
  ],
  currentPhase: {
    phase: "CONTAINER_TEST_STARTED",
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
  // TASK-092: store 가 페이지 lifecycle 외부에 살아있으므로 매 테스트마다
  // reset 으로 이전 테스트의 build / logs / loading / error 격리.
  useBuildDetailStore.getState().reset();
});

afterEach(() => {
  cleanup();
  useBuildDetailStore.getState().reset();
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
    // CONTAINER_TEST_STARTED current 단계 라벨과 별개. within(detail) 로 scope.
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

  it("mounts PhaseTimeline with 11 phases", async () => {
    vi.mocked(api.getBuild).mockResolvedValue(MOCK_BUILD);
    vi.mocked(api.getBuildLogs).mockResolvedValue(MOCK_LOGS);

    renderAt("test-build-0001-1111-2222-333344445555");

    await waitFor(() => {
      expect(screen.getByTestId("phase-timeline")).toBeInTheDocument();
    });

    // 11 phases 모두 노출 (5 completed + 1 current + 5 pending) — PhaseTimeline
    // 내부에서만 매칭되도록 within 으로 scope 좁힘. TASK-150: drift 수정으로
    // canonical phases 가 9 → 11 (DEPLOYMENT_STARTED / DEPLOYMENT_COMPLETED
    // 추가, shared-contract 의 buildPhases 가 단일 출처). PhaseTimeline 은
    // shared-contract 의 buildPhases 를 import 해서 표시 목록을 그 배열 그대로
    // 쓴다 — 9 phase 하드코딩 시절의 잔재.
    const timeline = screen.getByTestId("phase-timeline");
    expect(within(timeline).getByText("REQUEST_ACCEPTED")).toBeInTheDocument();
    expect(within(timeline).getByText("DOCKER_BUILD_COMPLETED")).toBeInTheDocument();
    expect(within(timeline).getByText("CONTAINER_TEST_STARTED")).toBeInTheDocument();
    // 11 phase canonical 목록에 새로 추가된 DEPLOYMENT_* 가 노출되는지.
    expect(within(timeline).getByText("DEPLOYMENT_STARTED")).toBeInTheDocument();
    expect(within(timeline).getByText("DEPLOYMENT_COMPLETED")).toBeInTheDocument();
    expect(within(timeline).getByText("COMPLETED")).toBeInTheDocument();
    expect(within(timeline).getByText("FAILED")).toBeInTheDocument();
    // 5 completed (REQUEST_ACCEPTED, QUEUE_CLAIMED, SOURCE_PREPARED,
    // DOCKER_BUILD_STARTED, DOCKER_BUILD_COMPLETED) + 1 current
    // (CONTAINER_TEST_STARTED) + 5 pending (CONTAINER_TEST_PASSED, DEPLOYMENT_STARTED,
    // DEPLOYMENT_COMPLETED, COMPLETED, FAILED).
    expect(timeline.querySelectorAll('[data-status="completed"]')).toHaveLength(5);
    expect(timeline.querySelectorAll('[data-status="current"]')).toHaveLength(1);
    expect(timeline.querySelectorAll('[data-status="pending"]')).toHaveLength(5);
  });

  it("mounts LogStream with entries", async () => {
    vi.mocked(api.getBuild).mockResolvedValue(MOCK_BUILD);
    vi.mocked(api.getBuildLogs).mockResolvedValue(MOCK_LOGS);

    renderAt("test-build-0001-1111-2222-333344445555");

    await waitFor(() => {
      expect(screen.getByTestId("log-stream")).toBeInTheDocument();
    });

    // TASK-140: LogStream 이 Astryx CodeBlock 으로 바뀌면서 엔트리별 요소
    // (`data-testid="log-entry"`) 가 사라지고 한 덩어리 코드 문자열이 됐다.
    // 검증 의도(두 엔트리가 렌더된다)는 그대로 두고 대상만 바꾼다.
    const pre = screen.getByTestId("log-stream-pre");
    expect(pre.textContent).toContain("Build request accepted");
    expect(pre.textContent).toContain("docker build started");
    expect(pre.textContent).toContain("[REQUEST_ACCEPTED]");
  });

  it("tolerates getBuildLogs failure (renders empty LogStream)", async () => {
    vi.mocked(api.getBuild).mockResolvedValue(MOCK_BUILD);
    vi.mocked(api.getBuildLogs).mockRejectedValue(new Error("LOGS_NOT_FOUND"));

    renderAt("test-build-0001-1111-2222-333344445555");

    await waitFor(() => {
      expect(screen.getByTestId("log-stream")).toBeInTheDocument();
    });
    // TASK-140: 이전 단언 `queryAllByTestId("log-entry")).toHaveLength(0)` 은
    // CodeBlock 이관 후 **실패할 수 없는 단언**이 됐다 — log-entry 요소 자체가
    // 더는 존재하지 않으므로 로그가 렌더되든 말든 항상 0 이다. 실제로 비어
    // 있는지를 보도록 바꾼다.
    // CodeBlock 은 비어도 **line number + 보이지 않는 문자** 한두 글자를
    // 렌더한다 (현재 jsdom 환경에서는 "1" + U+200B = 2자). 사용자 가시
    // 텍스트가 0 이라는 계약만 보존하므로 숫자도 같이 걷는다 — Astryx 가
    // 렌더 경로/카운터 표시를 바꿔도 견디게.
    const emptyPre = screen.getByTestId("log-stream-pre");
    expect(emptyPre.textContent?.replace(/[\d\s\u200B-\u200D\uFEFF]/g, "")).toBe("");
  });

  it("Container test 블록이 런타임 URL 을 노출한다 (TASK-160)", async () => {
    // deprecated "Legacy preview" 섹션을 제거하면서 런타임 URL 을 canonical
    // Container test 블록으로 옮겼다. previewStatus 는 test.status 가 대신한다.
    vi.mocked(api.getBuild).mockResolvedValue(MOCK_BUILD);
    vi.mocked(api.getBuildLogs).mockResolvedValue(MOCK_LOGS);

    renderAt("test-build-0001-1111-2222-333344445555");

    await waitFor(() => {
      expect(screen.getByTestId("block-test")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("block-legacy-preview")).not.toBeInTheDocument();
    expect(screen.getByText("Runtime URL")).toBeInTheDocument();
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

  // TASK-163 (P2-M4): 실패 이유 배너.
  //
  // `lastError` 는 P2-M3(TASK-162) 전까지 항상 null 이었다 — 서버가
  // last_error_code/message 를 한 번도 쓰지 않았기 때문이다. 이제 실제로
  // 채워지므로 실패한 빌드에서 상단에 노출되어야 한다.
  it("실패 이유가 있으면 상단 배너로 노출된다", async () => {
    vi.mocked(api.getBuild).mockResolvedValue({
      ...MOCK_BUILD,
      build: { ...MOCK_BUILD.build, status: "FAILED", phase: "FAILED" },
      lastError: {
        code: "CONTAINER_TEST_FAILED",
        message: "container healthcheck timed out"
      }
    });
    vi.mocked(api.getBuildLogs).mockResolvedValue(MOCK_LOGS);

    renderAt("test-build-0001-1111-2222-333344445555");

    const banner = await screen.findByTestId("build-last-error");
    expect(banner).toHaveTextContent("CONTAINER_TEST_FAILED");
    expect(banner).toHaveTextContent("container healthcheck timed out");
    // 스크린리더가 즉시 읽도록 alert role.
    expect(banner).toHaveAttribute("role", "alert");
  });

  it("실패 이유가 없으면 배너를 렌더하지 않는다", async () => {
    vi.mocked(api.getBuild).mockResolvedValue(MOCK_BUILD);
    vi.mocked(api.getBuildLogs).mockResolvedValue(MOCK_LOGS);

    renderAt("test-build-0001-1111-2222-333344445555");

    await waitFor(() => {
      expect(screen.getByTestId("build-detail")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("build-last-error")).not.toBeInTheDocument();
  });
});
