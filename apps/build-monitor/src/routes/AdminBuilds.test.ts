import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/svelte";
import AdminBuilds from "./AdminBuilds.svelte";

const pushMock = vi.fn();
vi.mock("svelte-spa-router", () => ({
  push: (...args: unknown[]) => pushMock(...args),
  link: (_node: HTMLAnchorElement) => ({ destroy() {}, update() {} })
}));

const listAdminBuildsMock = vi.fn();
vi.mock("../lib/api", () => ({
  listAdminBuilds: (id: string, params: unknown) => listAdminBuildsMock(id, params)
}));

beforeEach(() => {
  pushMock.mockReset();
  listAdminBuildsMock.mockReset();
  localStorage.clear();
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
  it("redirects to /admin/login when no adminId is stored", async () => {
    render(AdminBuilds);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin/login"));
    expect(listAdminBuildsMock).not.toHaveBeenCalled();
  });

  it("calls listAdminBuilds with admin id and no owner filter by default", async () => {
    localStorage.setItem("adminId", "admin");
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
    localStorage.setItem("adminId", "admin");
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
    localStorage.setItem("adminId", "admin");
    listAdminBuildsMock.mockRejectedValue(new Error("forbidden"));
    render(AdminBuilds);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/forbidden/);
  });
});
