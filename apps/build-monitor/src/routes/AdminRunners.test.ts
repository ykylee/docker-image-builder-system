import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/svelte";

import AdminRunners from "./AdminRunners.svelte";

// TASK-077: AdminTabs 가 `$location` 을 구독하므로 mock store 가 필요.
// vi.hoisted 로 묶어서 hoist-safe 한 writable store 생성.
const { locStore } = vi.hoisted(() => ({
  locStore: (
    require("svelte/store") as typeof import("svelte/store")
  ).writable<string>("/admin/runners")
}));
const pushMock = vi.fn();
vi.mock("svelte-spa-router", () => ({
  push: (...args: unknown[]) => pushMock(...args),
  link: (_node: HTMLAnchorElement) => ({ destroy() {}, update() {} }),
  location: locStore
}));

const listAdminRunnersMock = vi.fn();
const patchMock = vi.fn();
const deleteMock = vi.fn();

// session.js 의 userIdStore 는 Svelte writable 이라서 실제 import 한 뒤
// localStorage pre-fill 로 잡는 게 가장 자연스럽다. 어차피 vitest 의
// beforeEach 가 setup.ts 보다 먼저 실행되므로 먼저 localStorage 를 set
// 한 뒤 import 가 unwrap 되도록 한다.
//
// TASK-076: adminIdStore 가 사라졌다. userId 가 곧 admin id 이고
// `X-Admin-Id` 헤더에도 그대로 실린다.
vi.mock("../lib/api.js", () => ({
  listAdminRunners: (adminId: string) => listAdminRunnersMock(adminId),
  patchAdminRunnerStatus: (adminId: string, runnerId: string, status: string) =>
    patchMock(adminId, runnerId, status),
  deleteAdminRunner: (adminId: string, runnerId: string) =>
    deleteMock(adminId, runnerId)
}));
// TASK-084: ensureAdminAccess mock — 기본값은 admin 통과.
const ensureAdminAccessMock = vi.fn();
vi.mock("../lib/admin-guard.js", () => ({
  ensureAdminAccess: (callerId: string) => ensureAdminAccessMock(callerId)
}));

beforeEach(() => {
  pushMock.mockReset();
  listAdminRunnersMock.mockReset();
  patchMock.mockReset();
  deleteMock.mockReset();
  ensureAdminAccessMock.mockReset();
  ensureAdminAccessMock.mockResolvedValue({
    isAdmin: true,
    allowList: ["admin"],
    reason: "NOT_IN_ALLOW_LIST"
  });
  localStorage.clear();
  locStore.set("/admin/runners");
});

afterEach(() => {
  cleanup();
});

const fixture = {
  runners: [
    {
      runnerId: "runner-A",
      status: "ACTIVE" as const,
      firstSeenAt: "2026-07-05T00:00:00.000Z",
      lastSeenAt: new Date(Date.now() - 30_000).toISOString(),
      buildsClaimed: 3,
      buildsCompleted: 2,
      currentBuildId: null,
      lastError: null
    },
    {
      runnerId: "runner-B",
      status: "DISABLED" as const,
      firstSeenAt: "2026-07-04T00:00:00.000Z",
      lastSeenAt: new Date(Date.now() - 600_000).toISOString(),
      buildsClaimed: 7,
      buildsCompleted: 6,
      currentBuildId: "fca34b67-3fc6-4ac2-8550-43a3f8cde67c",
      lastError: "boom"
    }
  ]
};

describe("AdminRunners page (TASK-069 + TASK-076 + TASK-077)", () => {
  // TASK-077: 페이지 상단에 admin 섹션 탭이 노출된다.
  it("renders the AdminTabs nav with all 4 sections", async () => {
    localStorage.setItem("userId", "admin");
    listAdminRunnersMock.mockResolvedValueOnce({ runners: [] });
    render(AdminRunners);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Builds" })).toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admins" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Runners" })).toBeInTheDocument();
  });

  // TASK-076: userId 가 없으면 Login 페이지(`/`) 로 redirect.
  it("redirects to / when no userId is stored", async () => {
    // localStorage.clear() 가 이미 호출된 상태 (beforeEach). userId 없음.
    render(AdminRunners);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
  });

  it("renders the registry snapshot after mount", async () => {
    // TASK-076: admin 권한은 userId 그 자체. localStorage 의 userId 가 곧
    // admin id 이고 X-Admin-Id 헤더에도 그대로 실린다.
    localStorage.setItem("userId", "admin");
    listAdminRunnersMock.mockResolvedValueOnce(fixture);
    render(AdminRunners);
    await waitFor(() => {
      expect(screen.getByText("runner-A")).toBeTruthy();
      expect(screen.getByText("runner-B")).toBeTruthy();
    });
    // ACTIVE / DISABLED pill 텍스트.
    expect(screen.getAllByText("ACTIVE").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("DISABLED").length).toBeGreaterThanOrEqual(1);
  });

  it("exposes registry mutating handlers as buttons per row", async () => {
    localStorage.setItem("userId", "admin");
    listAdminRunnersMock.mockResolvedValueOnce(fixture);
    render(AdminRunners);
    await waitFor(() => expect(screen.getByText("runner-A")).toBeTruthy());
    // ACTIVE row → "Disable" 버튼, DISABLED row → "Reactivate" 버튼.
    expect(screen.getAllByText("Disable").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Reactivate").length).toBeGreaterThanOrEqual(1);
    // 모든 row 에 Delete 버튼.
    expect(screen.getAllByText("Delete").length).toBeGreaterThanOrEqual(2);
  });

  it("shows an empty-state hint when the registry has zero entries", async () => {
    localStorage.setItem("userId", "admin");
    listAdminRunnersMock.mockResolvedValueOnce({ runners: [] });
    render(AdminRunners);
    await waitFor(() => {
      expect(screen.getByText(/No runners registered yet/)).toBeTruthy();
    });
  });

  // TASK-070 (PR #23) + TASK-072 (PR #25) 회귀 가드. v1 (PR #23) 의
  // inline `<span class="pill active/off">` 가 canonical `<StatusPill>`
  // 컴포넌트로 승격됨. StatusPill 의 colorFor 매핑에 RunnerStatus
  // (ACTIVE / DISABLED) 가 추가되어 (TASK-072) 디자인 토큰 정렬 + semantic
  // 색상이 그대로 승계된다.
  it("renders ACTIVE / DISABLED runner status via canonical StatusPill with semantic tokens", async () => {
    localStorage.setItem("userId", "admin");
    listAdminRunnersMock.mockResolvedValueOnce(fixture);
    render(AdminRunners);
    await waitFor(() => expect(screen.getByText("runner-A")).toBeTruthy());

    // ACTIVE runner 의 StatusPill 이 "Status: ACTIVE" aria-label 로 노출.
    const activePill = screen.getByRole("status", { name: "Status: ACTIVE" });
    expect(activePill).toBeInTheDocument();
    // inline `--pill-color` 가 canonical success 토큰.
    expect((activePill as HTMLElement).style.getPropertyValue("--pill-color")).toBe(
      "var(--color-accent-success)"
    );

    // DISABLED runner 의 StatusPill 이 "Status: DISABLED" aria-label 로 노출.
    const disabledPill = screen.getByRole("status", { name: "Status: DISABLED" });
    expect(disabledPill).toBeInTheDocument();
    // inline `--pill-color` 가 canonical danger 토큰.
    expect((disabledPill as HTMLElement).style.getPropertyValue("--pill-color")).toBe(
      "var(--color-accent-danger)"
    );

    // 두 StatusPill 이 disjoint (서로 다른 element).
    expect(activePill).not.toBe(disabledPill);
  });

  // TASK-072 회귀 가드: inline `.pill` 클래스 (raw rgb 디자인) 가 더는
  // 노출되지 않음 — canonical StatusPill 으로 전면 전환된 결과.
  // (이전 PR #23 의 `.pill.active` / `.pill.off` 셀렉터는 StatusPill 의
  // component-scoped `.pill` (hashed) 와 매치 안 되므로 회귀가드 의미
  // 자체가 canonical 승격으로 무효화됨.)
  it("no longer exposes inline pill.active / pill.off raw-rgb design", async () => {
    localStorage.setItem("userId", "admin");
    listAdminRunnersMock.mockResolvedValueOnce(fixture);
    render(AdminRunners);
    await waitFor(() => expect(screen.getByText("runner-A")).toBeTruthy());

    // inline `.pill.active` / `.pill.off` (raw rgb 디자인) 가 더는 매치 안 됨.
    // 모든 StatusPill 의 .pill (component-scoped, hashed) 만 존재.
    expect(document.querySelectorAll(".pill.active").length).toBe(0);
    expect(document.querySelectorAll(".pill.off").length).toBe(0);
  });

  // TASK-084: 비-admin user 의 deep link 진입 시 backend 호출 없이
  // frontend 에서 거부 → AdminAccessDenied 패널 노출.
  it("shows AdminAccessDenied panel when caller is not in the admin allow-list", async () => {
    localStorage.setItem("userId", "alice");
    ensureAdminAccessMock.mockResolvedValueOnce({
      isAdmin: false,
      allowList: ["admin", "yky.lee"],
      reason: "NOT_IN_ALLOW_LIST"
    });
    render(AdminRunners);
    await waitFor(() =>
      expect(screen.getByText(/Admin access required/i)).toBeInTheDocument()
    );
    expect(listAdminRunnersMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("admin-denied-go-builds")).toBeInTheDocument();
  });
});
