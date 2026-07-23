// TASK-092: buildDetailStore unit tests.
//
// store 의 fetchBuild / reset / AbortSignal guard 동작 검증.
// 5 case — 초기 상태 / fetch success / fetch failure / getBuildLogs silent
// fallback / abort guard.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  useBuildDetailStore.getState().reset();
});

afterEach(() => {
  useBuildDetailStore.getState().reset();
});

const SAMPLE_BUILD: api.BuildStatusResponse = {
  build: {
    buildId: "test-build",
    appName: "test-app",
    status: "BUILD_SUCCESS",
    phase: "DOCKER_BUILD_COMPLETED",
    previewUrl: "http://localhost:32770/health",
    createdAt: "2026-07-08T10:00:00.000Z",
    updatedAt: "2026-07-08T10:05:00.000Z"
  },
  lastError: {
    code: "UNKNOWN_ERROR",
    message: ""
  },
  phaseHistory: [],
  currentPhase: null
};

const SAMPLE_LOGS: api.BuildLogsResponse = {
  buildId: "test-build",
  logs: []
};

describe("useBuildDetailStore", () => {
  it("starts in initial state", () => {
    const s = useBuildDetailStore.getState();
    expect(s.build).toBeNull();
    expect(s.logs).toBeNull();
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("fetchBuild populates build + logs on success", async () => {
    vi.mocked(api.getBuild).mockResolvedValue(SAMPLE_BUILD);
    vi.mocked(api.getBuildLogs).mockResolvedValue(SAMPLE_LOGS);

    await useBuildDetailStore
      .getState()
      .fetchBuild({ buildId: "test-build" });

    const s = useBuildDetailStore.getState();
    expect(s.build?.build.buildId).toBe("test-build");
    expect(s.logs?.buildId).toBe("test-build");
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("fetchBuild tolerates getBuildLogs failure (logs null fallback)", async () => {
    vi.mocked(api.getBuild).mockResolvedValue(SAMPLE_BUILD);
    vi.mocked(api.getBuildLogs).mockRejectedValue(
      new Error("LOGS_NOT_FOUND")
    );

    await useBuildDetailStore
      .getState()
      .fetchBuild({ buildId: "test-build" });

    const s = useBuildDetailStore.getState();
    expect(s.build?.build.buildId).toBe("test-build");
    expect(s.logs).toBeNull();
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("fetchBuild sets error when getBuild throws", async () => {
    vi.mocked(api.getBuild).mockRejectedValue(
      new Error("BUILD_NOT_FOUND")
    );
    vi.mocked(api.getBuildLogs).mockResolvedValue(SAMPLE_LOGS);

    await useBuildDetailStore
      .getState()
      .fetchBuild({ buildId: "missing" });

    const s = useBuildDetailStore.getState();
    expect(s.build).toBeNull();
    expect(s.loading).toBe(false);
    expect(s.error).toBe("BUILD_NOT_FOUND");
  });

  it("fetchBuild skips set when AbortSignal already aborted", async () => {
    let resolveBuild: (value: api.BuildStatusResponse) => void =
      () => undefined;
    vi.mocked(api.getBuild).mockImplementation(
      () =>
        new Promise<api.BuildStatusResponse>((resolve) => {
          resolveBuild = resolve;
        })
    );
    vi.mocked(api.getBuildLogs).mockResolvedValue(SAMPLE_LOGS);

    const controller = new AbortController();
    controller.abort();
    const fetchPromise = useBuildDetailStore
      .getState()
      .fetchBuild({ buildId: "test-build", signal: controller.signal });

    // microtask flush.
    await Promise.resolve();

    const s = useBuildDetailStore.getState();
    expect(s.loading).toBe(true);
    expect(s.build).toBeNull();

    // signal.aborted === true — set 호출 안 됨.
    resolveBuild(SAMPLE_BUILD);
    await fetchPromise;

    const s2 = useBuildDetailStore.getState();
    expect(s2.build).toBeNull();
    expect(s2.loading).toBe(true);
  });

  it("reset restores initial state", async () => {
    vi.mocked(api.getBuild).mockResolvedValue(SAMPLE_BUILD);
    vi.mocked(api.getBuildLogs).mockResolvedValue(SAMPLE_LOGS);

    await useBuildDetailStore
      .getState()
      .fetchBuild({ buildId: "test-build" });
    useBuildDetailStore.getState().reset();

    const s = useBuildDetailStore.getState();
    expect(s.build).toBeNull();
    expect(s.logs).toBeNull();
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });
});
