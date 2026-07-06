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

  // TASK-070 (PR #23): recent builds panel 이 BuildRow 컴포넌트로
  // 교체되었으므로 BuildRow 의 data-testid 와 canonical 컬럼 노출을 검증한다.
  it("renders the recent builds panel via the BuildRow component", async () => {
    localStorage.setItem("adminId", "admin");
    listAdminUsersMock.mockResolvedValue({
      users: [
        { userId: "alice", buildCount: 1, lastBuildAt: "2026-07-03T00:00:00.000Z" }
      ]
    });
    listAdminBuildsMock.mockResolvedValue({
      builds: [
        {
          buildId: "00000000-0000-0000-0000-000000000001",
          appName: "alice-app",
          status: "COMPLETED",
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
    // BuildRow 가 recent builds panel 안에 1 row 렌더.
    await waitFor(() =>
      expect(screen.getAllByTestId("build-row")).toHaveLength(1)
    );
    // BuildRow 의 StatusPill 이 canonical lifecycleStatus 를 표시.
    expect(
      screen.getByRole("status", { name: /Status: COMPLETED/i })
    ).toBeInTheDocument();
    // BuildRow 의 meta-cell 이 appName 을 표시.
    expect(screen.getByText("alice-app")).toBeInTheDocument();
    // BuildRow 의 id-cell 이 buildId prefix (앞 8자) link.
    const buildLink = screen.getByText("00000000");
    expect(buildLink).toBeInTheDocument();
    expect(buildLink.tagName).toBe("A");
    // owner cell 은 requestedBy 미전달이라 렌더되지 않는다 — BuildRow 의
    // `{#if build.requestedBy}` 가드가 효과적인지 검증.
    // (AdminUsers recent builds 는 동일 user 의 inline expansion 이라 owner
    //  컬럼이 시각 노이즈가 되어 의도적으로 생략.)
    expect(document.querySelector(".owner-cell")).toBeNull();
  });

  // TASK-070 (PR #23): admin 이 close 버튼으로 expansion 을 닫을 때
  // BuildRow 도 함께 unmount 되는지 검증.
  it("closes the recent builds panel when the Close button is clicked", async () => {
    localStorage.setItem("adminId", "admin");
    listAdminUsersMock.mockResolvedValue({
      users: [
        { userId: "alice", buildCount: 1, lastBuildAt: "2026-07-03T00:00:00.000Z" }
      ]
    });
    listAdminBuildsMock.mockResolvedValue({
      builds: [
        {
          buildId: "00000000-0000-0000-0000-000000000001",
          appName: "alice-app",
          status: "COMPLETED",
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
      expect(screen.getAllByTestId("build-row")).toHaveLength(1)
    );
    await fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("build-row")).toBeNull());
  });
});
