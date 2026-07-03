import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/svelte";
import AdminUsers from "./AdminUsers.svelte";

const pushMock = vi.fn();
vi.mock("svelte-spa-router", () => ({
  push: (...args: unknown[]) => pushMock(...args),
  link: (_node: HTMLAnchorElement) => ({ destroy() {}, update() {} })
}));

const listAdminUsersMock = vi.fn();
const listAdminBuildsMock = vi.fn();
vi.mock("../lib/api", () => ({
  listAdminUsers: (id: string) => listAdminUsersMock(id),
  listAdminBuilds: (id: string, params: unknown) => listAdminBuildsMock(id, params)
}));

beforeEach(() => {
  pushMock.mockReset();
  listAdminUsersMock.mockReset();
  listAdminBuildsMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("AdminUsers", () => {
  it("redirects to /admin/login when no adminId is stored", async () => {
    render(AdminUsers);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin/login"));
  });

  it("renders user rows with buildCount and lastBuildAt", async () => {
    localStorage.setItem("adminId", "admin");
    listAdminUsersMock.mockResolvedValue({
      users: [
        { userId: "alice", buildCount: 3, lastBuildAt: "2026-07-03T00:00:00.000Z" },
        { userId: "bob", buildCount: 1, lastBuildAt: "2026-07-02T00:00:00.000Z" }
      ]
    });
    render(AdminUsers);
    await waitFor(() => expect(screen.getByText("@alice")).toBeTruthy());
    expect(screen.getByText("@bob")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("opens a user's recent builds when the row is clicked", async () => {
    localStorage.setItem("adminId", "admin");
    listAdminUsersMock.mockResolvedValue({
      users: [
        { userId: "alice", buildCount: 2, lastBuildAt: "2026-07-03T00:00:00.000Z" }
      ]
    });
    listAdminBuildsMock.mockResolvedValue({
      builds: [
        {
          buildId: "00000000-0000-0000-0000-000000000001",
          appName: "alice-app",
          status: "COMPLETED",
          // TASK-052 lifecycleStatus — AdminUsers 의 recent builds 패널도
          // StatusPill 로 통일 (PR #15 follow-up). 동일값으로 canonical/legacy
          // 둘 다 emit.
          lifecycleStatus: "COMPLETED",
          phase: "DOCKER_BUILD_COMPLETED",
          previewStatus: "READY",
          previewUrl: null,
          createdAt: "2026-07-03T00:00:00.000Z",
          updatedAt: "2026-07-03T00:00:00.000Z",
          requestedBy: "alice"
        }
      ],
      nextCursor: null
    });
    render(AdminUsers);
    await waitFor(() => expect(screen.getByText("@alice")).toBeTruthy());
    await fireEvent.click(screen.getByRole("button", { name: /Open alice's builds/i }));
    await waitFor(() =>
      expect(listAdminBuildsMock).toHaveBeenCalledWith("admin", {
        requestedBy: "alice",
        limit: 50
      })
    );
    await waitFor(() => expect(screen.getByText("alice-app")).toBeTruthy());
  });
});
