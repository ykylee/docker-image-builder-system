import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/svelte";
import AdminUsers from "./AdminUsers.svelte";

// TASK-077: AdminTabs 가 `$location` 을 구독하므로 mock store 가 필요.
// vi.hoisted 로 묶어서 hoist-safe 한 writable store 생성.
const { locStore } = vi.hoisted(() => ({
  locStore: (
    require("svelte/store") as typeof import("svelte/store")
  ).writable<string>("/admin/users")
}));
const pushMock = vi.fn();
vi.mock("svelte-spa-router", () => ({
  push: (...args: unknown[]) => pushMock(...args),
  link: (_node: HTMLAnchorElement) => ({ destroy() {}, update() {} }),
  location: locStore
}));

const listAdminUsersMock = vi.fn();
const listAdminBuildsMock = vi.fn();
// TASK-084: ensureAdminAccess 기본 mock — 기본값은 isAdmin=true (admin 통과).
// 비-admin 케이스 테스트가 필요한 describe 블록에서 mockResolvedValueOnce 로
// override 한다. helper 가 호출되었는지 자체는 호출 횟수 / 호출 id 로 검증.
const ensureAdminAccessMock = vi.fn();
vi.mock("../lib/api", () => ({
  listAdminUsers: (id: string) => listAdminUsersMock(id),
  listAdminBuilds: (id: string, params: unknown) => listAdminBuildsMock(id, params)
}));
vi.mock("../lib/admin-guard.js", () => ({
  ensureAdminAccess: (callerId: string) => ensureAdminAccessMock(callerId)
}));

beforeEach(() => {
  pushMock.mockReset();
  listAdminUsersMock.mockReset();
  listAdminBuildsMock.mockReset();
  ensureAdminAccessMock.mockReset();
  // 기본값: admin 으로 인정. 비-admin 케이스 테스트는 mockResolvedValueOnce 로 override.
  ensureAdminAccessMock.mockResolvedValue({
    isAdmin: true,
    allowList: ["admin"],
    reason: "NOT_IN_ALLOW_LIST"
  });
  localStorage.clear();
  locStore.set("/admin/users");
});

afterEach(() => {
  cleanup();
});

describe("AdminUsers", () => {
  // TASK-077: 페이지 상단에 admin 섹션 탭이 노출된다.
  it("renders the AdminTabs nav with all 4 sections", async () => {
    localStorage.setItem("userId", "admin");
    listAdminUsersMock.mockResolvedValue({ users: [] });
    render(AdminUsers);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Builds" })).toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admins" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Runners" })).toBeInTheDocument();
  });

  // TASK-076: userId 가 없으면 Login 페이지(`/`) 로 redirect.
  it("redirects to / when no userId is stored", async () => {
    render(AdminUsers);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
  });

  it("renders user rows with buildCount and lastBuildAt", async () => {
    // TASK-076: admin 권한은 userId 그 자체.
    localStorage.setItem("userId", "admin");
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
    localStorage.setItem("userId", "admin");
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
    localStorage.setItem("userId", "admin");
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
    localStorage.setItem("userId", "admin");
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

  // TASK-084: 비-admin user 의 deep link 진입 시 backend 호출 없이
  // frontend 에서 거부 → AdminAccessDenied 패널 노출 + listAdminUsers
  // 호출되지 않음. raw 403 envelope 대신 친절한 메시지가 화면에 떠야 한다.
  it("shows AdminAccessDenied panel when caller is not in the admin allow-list", async () => {
    localStorage.setItem("userId", "alice");
    ensureAdminAccessMock.mockResolvedValueOnce({
      isAdmin: false,
      allowList: ["admin", "yky.lee"],
      reason: "NOT_IN_ALLOW_LIST"
    });
    render(AdminUsers);
    // listAdminUsers 가 호출되지 않아야 한다 (frontend 가드).
    await waitFor(() =>
      expect(screen.getByText(/Admin access required/i)).toBeInTheDocument()
    );
    expect(listAdminUsersMock).not.toHaveBeenCalled();
    expect(listAdminBuildsMock).not.toHaveBeenCalled();
    // bodyMessage 가 userId 를 포함하여 무엇이 잘못됐는지 직관.
    // ("@alice" 가 bodyMessage + card-body 2 군데 나오므로 더 구체적으로 매칭.)
    expect(
      screen.getByText(/@alice is not on the current admin allow-list/)
    ).toBeInTheDocument();
    // 두 액션 모두 렌더.
    expect(screen.getByTestId("admin-denied-go-builds")).toBeInTheDocument();
    expect(screen.getByTestId("admin-denied-switch-user")).toBeInTheDocument();
  });

  // TASK-084: ensureAdminAccess 가 backend 403 으로 거절된 케이스
  // (가장 흔한 deep link 시나리오) — reason=FORBIDDEN 으로 reason-aware
  // 메시지가 노출된다.
  it("surfaces FORBIDDEN reason when the backend rejects the admin guard", async () => {
    localStorage.setItem("userId", "alice");
    ensureAdminAccessMock.mockResolvedValueOnce({
      isAdmin: false,
      allowList: [],
      reason: "FORBIDDEN"
    });
    render(AdminUsers);
    await waitFor(() =>
      expect(screen.getByText(/is not authorized to view admin sections/i)).toBeInTheDocument()
    );
    expect(listAdminUsersMock).not.toHaveBeenCalled();
  });
});
