import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/svelte";
import BuildsList from "./BuildsList.svelte";

const pushMock = vi.fn();
vi.mock("svelte-spa-router", () => ({
  push: (...args: unknown[]) => pushMock(...args),
  link: (_node: HTMLAnchorElement) => ({ destroy() {}, update() {} })
}));

const listBuildsMock = vi.fn();
vi.mock("../lib/api", () => ({
  listBuilds: (params: unknown) => listBuildsMock(params)
}));

// BuildRow 는 실제로 mount. router store 가 svelte-spa-router 모듈에서
// 함께 export 되므로 위 push/link mock 으로도 충분.

beforeEach(() => {
  pushMock.mockReset();
  listBuildsMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

const sample = (projectId: string, status: string) => ({
  buildId: "00000000-0000-0000-0000-" + projectId.padStart(12, "0"),
  projectId,
  repositoryId: "r-" + projectId,
  status,
  phase: "REQUEST_ACCEPTED",
  previewStatus: "NOT_REQUESTED",
  previewUrl: null,
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z"
});

describe("BuildsList", () => {
  it("redirects to / when no userId is stored and skips listBuilds", async () => {
    render(BuildsList);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
    expect(listBuildsMock).not.toHaveBeenCalled();
  });

  it("passes requestedBy to listBuilds when signed in", async () => {
    localStorage.setItem("userId", "yklee");
    listBuildsMock.mockResolvedValue({
      builds: [sample("p-1", "QUEUED"), sample("p-2", "BUILDING")],
      nextCursor: null
    });
    render(BuildsList);
    await waitFor(() => expect(listBuildsMock).toHaveBeenCalledWith({ requestedBy: "yklee" }));
  });

  it("shows an error banner when listBuilds rejects", async () => {
    localStorage.setItem("userId", "yklee");
    listBuildsMock.mockRejectedValue(new Error("boom"));
    render(BuildsList);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/boom/);
  });

  it("filters visible builds by status chip", async () => {
    localStorage.setItem("userId", "yklee");
    listBuildsMock.mockResolvedValue({
      builds: [sample("p-1", "QUEUED"), sample("p-2", "BUILDING"), sample("p-3", "FAILED")],
      nextCursor: null
    });
    render(BuildsList);
    // 기본 ALL → 3건 렌더
    await waitFor(() => expect(screen.getAllByTestId("build-row")).toHaveLength(3));
    // BUILDING chip 클릭 → 1건만
    await fireEvent.click(screen.getByRole("button", { name: "BUILDING" }));
    await waitFor(() => expect(screen.getAllByTestId("build-row")).toHaveLength(1));
    // FAILED chip 클릭 → 1건만
    await fireEvent.click(screen.getByRole("button", { name: "FAILED" }));
    await waitFor(() => expect(screen.getAllByTestId("build-row")).toHaveLength(1));
    // ALL 복귀 → 3건
    await fireEvent.click(screen.getByRole("button", { name: "ALL" }));
    await waitFor(() => expect(screen.getAllByTestId("build-row")).toHaveLength(3));
  });
});
