import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/svelte";
import AdminBuilds from "./AdminBuilds.svelte";

// TASK-077: AdminTabs 가 `$location` 을 구독하므로 mock store 가 필요.
// vi.mock factory 가 hoist 되므로 store 는 factory 안에서 만들어서
// closure 로 capture 한 뒤, 동시에 mock 반환 객체에도 노출한다. 테스트
// 케이스는 `_locationStore` 를 통해 같은 writable 인스턴스에 접근.
const { locStore } = vi.hoisted(() => ({
  locStore: (
    require("svelte/store") as typeof import("svelte/store")
  ).writable<string>("/admin/builds")
}));
const pushMock = vi.fn();
vi.mock("svelte-spa-router", () => ({
  push: (...args: unknown[]) => pushMock(...args),
  link: (_node: HTMLAnchorElement) => ({ destroy() {}, update() {} }),
  location: locStore
}));

const listAdminBuildsMock = vi.fn();
vi.mock("../lib/api", () => ({
  listAdminBuilds: (id: string, params: unknown) => listAdminBuildsMock(id, params)
}));

beforeEach(() => {
  pushMock.mockReset();
  listAdminBuildsMock.mockReset();
  localStorage.clear();
  locStore.set("/admin/builds");
});

afterEach(() => {
  cleanup();
});

const sample = (
  appName: string,
  status: string,
  requestedBy: string,
  lifecycleStatus?: string
) => ({
  buildId: "00000000-0000-0000-0000-" + appName.padStart(12, "0"),
  appName,
  status,
  // TASK-052 lifecycleStatus — canonical 12-state union optional.
  // AdminBuilds 의 <BuildRow> 가 lifecycleStatus 를 그대로 forwarding
  // 하므로 fixture 가 optional 으로 노출되는 케이스를 함께 검증.
  lifecycleStatus,
  phase: "REQUEST_ACCEPTED",
  previewStatus: "NOT_REQUESTED",
  previewUrl: null,
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z",
  requestedBy
});

describe("AdminBuilds", () => {
  // TASK-077: 페이지 상단에 admin 섹션 탭 (Builds / Users / Admins /
  // Runners) 이 항상 노출되어 admin 영역 안에서 자유롭게 이동 가능.
  it("renders the AdminTabs nav with all 4 sections", async () => {
    localStorage.setItem("userId", "admin");
    listAdminBuildsMock.mockResolvedValue({
      builds: [],
      nextCursor: null
    });
    render(AdminBuilds);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Builds" })).toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admins" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Runners" })).toBeInTheDocument();
  });

  // TASK-076: admin 진입점은 일반 Login 과 동일하다. userId 가 없으면
  // `/admin/login` 이 아닌 `/` (Login 페이지) 로 redirect.
  it("redirects to / when no userId is stored", async () => {
    render(AdminBuilds);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
    expect(listAdminBuildsMock).not.toHaveBeenCalled();
  });

  it("calls listAdminBuilds with userId (acting as admin id) and no owner filter by default", async () => {
    // TASK-076: admin 권한은 userId 그 자체. localStorage 의 userId 키가
    // 곧 admin id 이고, X-Admin-Id 헤더에도 그대로 실린다.
    localStorage.setItem("userId", "admin");
    listAdminBuildsMock.mockResolvedValue({
      builds: [sample("p-1", "QUEUED", "alice"), sample("p-2", "BUILDING", "bob")],
      nextCursor: null
    });
    render(AdminBuilds);
    await waitFor(() =>
      expect(listAdminBuildsMock).toHaveBeenCalledWith("admin", { requestedBy: undefined })
    );
    // Owner column must be present for both rows.
    await waitFor(() => expect(screen.getAllByTestId("build-row")).toHaveLength(2));
    expect(screen.getByText("@alice")).toBeTruthy();
    expect(screen.getByText("@bob")).toBeTruthy();
  });

  it("applies owner filter when Apply is clicked", async () => {
    localStorage.setItem("userId", "admin");
    listAdminBuildsMock.mockResolvedValue({
      builds: [sample("p-1", "QUEUED", "alice")],
      nextCursor: null
    });
    render(AdminBuilds);
    await waitFor(() => expect(listAdminBuildsMock).toHaveBeenCalledTimes(1));
    const input = screen.getByLabelText("Owner") as HTMLInputElement;
    input.value = "alice";
    await fireEvent.input(input);
    await fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(listAdminBuildsMock).toHaveBeenLastCalledWith("admin", { requestedBy: "alice" })
    );
  });

  it("shows an error banner when listAdminBuilds rejects", async () => {
    localStorage.setItem("userId", "admin");
    listAdminBuildsMock.mockRejectedValue(new Error("forbidden"));
    render(AdminBuilds);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/forbidden/);
  });
});